// lib/gelatoReplica.ts
import { ethers } from 'ethers';

const RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC!;
const RELAY_ADDRESS = "0x5cbAb3a8db98Bd35e49334a87D8FE98D283d6c66"; // VyftRelayTarget (à redéployer)

const provider = new ethers.JsonRpcProvider(RPC_URL);
const sponsorWallet = new ethers.Wallet(process.env.PRIVATE_KEY_SPONSOR!, provider);

const relayInterface = new ethers.Interface([
  "function execute(address target, bytes data) payable returns (bool success, bytes returnData)",
  "function executeBatch((address target, uint256 value, uint256 gasLimit, bytes data)[] calls, bool atomic) payable returns ((bool success, bytes returnData)[])",
  "event Executed(bytes32 indexed id, address indexed relayer, address indexed target, uint256 value, bool success, bytes32 dataHash, bytes returnData)",
  "event BatchExecuted(bytes32 indexed batchId, address indexed relayer, uint256 total, uint256 failed)"
]);

export interface CallWithSyncFeeRequest {
  chainId: number;
  target: string;
  data: string;
}

export interface BatchCall {
  target: string;
  data: string;
  value?: bigint;
  gasLimit?: bigint;
}

export interface TaskStatus {
  taskState: "CheckPending" | "ExecPending" | "ExecSuccess" | "ExecReverted" | "NotFound";
  transactionHash?: string;
  blockNumber?: number;
  message?: string;
}

export interface RelayResult {
  taskId: string;
  txHash: string;
  status: "pending" | "success" | "reverted";
  innerSuccess?: boolean;
  message?: string;
}

// taskId = "self-relay-" + hash complet (sans 0x) : le hash est ainsi retrouvable pour /api/tasks/status.
// (L'ancien format tronqué à 16 caractères ne permettait pas de retrouver la tx → 502.)
export function makeTaskId(txHash: string): string {
  return `self-relay-${txHash.slice(2)}`;
}

export function parseTaskId(taskId: string): string | null {
  const m = /^self-relay-([0-9a-fA-F]{64})$/.exec(taskId);
  return m ? `0x${m[1].toLowerCase()}` : null;
}

// File d'attente : évite que deux requêtes simultanées lisent le même nonce.
let sendQueue: Promise<unknown> = Promise.resolve();
function send(callData: string, gasLimit = 15_000_000n): Promise<RelayResult> {
  const run = sendQueue.then(() => sendUnqueued(callData, gasLimit));
  sendQueue = run.catch(() => undefined);
  return run;
}

async function sendUnqueued(callData: string, gasLimit: bigint): Promise<RelayResult> {
  const nonce = await sponsorWallet.getNonce("pending");
  const { chainId } = await provider.getNetwork();

  const tx = {
    to: RELAY_ADDRESS,
    data: callData,
    value: 0n,
    gasLimit,
    maxFeePerGas: ethers.parseUnits("10", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    nonce,
    chainId,
    type: 2,
  };

  const signedTx = await sponsorWallet.signTransaction(tx);
  // Le hash est déterministe : on l'a AVANT l'envoi, donc jamais de "warning" sans hash.
  const txHash = ethers.keccak256(signedTx);

  try {
    await provider.send("eth_sendRawTransaction", [signedTx]);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // tx déjà connue du nœud => elle est bien en route, le hash reste valide
    if (!/already known|known transaction|already imported/i.test(msg)) {
      const seen = await provider.getTransaction(txHash).catch(() => null);
      if (!seen) {
        console.error("❌ Envoi refusé par le nœud :", msg);
        return { taskId: makeTaskId(txHash), txHash, status: "reverted", message: msg };
      }
    }
  }

  console.log("✅ Transaction envoyée via VyftRelayTarget. Hash :", txHash);
  return { taskId: makeTaskId(txHash), txHash, status: "pending" };
}

export class GelatoReplica {
  async callWithSyncFee(request: CallWithSyncFeeRequest): Promise<RelayResult> {
    const callData = relayInterface.encodeFunctionData("execute", [request.target, request.data]);
    return send(callData);
  }

  async callBatch(calls: BatchCall[], atomic = false): Promise<RelayResult> {
    const payload = calls.map(c => ({
      target: c.target,
      value: c.value ?? 0n,
      gasLimit: c.gasLimit ?? 0n,
      data: c.data,
    }));
    const callData = relayInterface.encodeFunctionData("executeBatch", [payload, atomic]);
    return send(callData, 30_000_000n);
  }

  /** Statut Gelato-like d'une tâche, sans attendre : lit reçu + events Executed. */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const txHash = parseTaskId(taskId);
    if (!txHash) {
      return { taskState: "NotFound", message: "taskId invalide (format attendu : self-relay-<hash 64 hex>)" };
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      const tx = await provider.getTransaction(txHash);
      return tx
        ? { taskState: "ExecPending", transactionHash: txHash, message: "Transaction en attente de minage" }
        : { taskState: "CheckPending", transactionHash: txHash, message: "Transaction pas encore visible sur le nœud" };
    }

    if (receipt.status !== 1) {
      return {
        taskState: "ExecReverted",
        transactionHash: txHash,
        blockNumber: receipt.blockNumber,
        message: "Transaction relais revertée",
      };
    }

    let failed = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = relayInterface.parseLog(log);
        if (parsed?.name === "Executed" && !parsed.args.success) failed++;
      } catch { /* log étranger */ }
    }

    return failed
      ? {
          taskState: "ExecReverted",
          transactionHash: txHash,
          blockNumber: receipt.blockNumber,
          message: `${failed} appel(s) interne(s) en échec (voir events Executed)`,
        }
      : { taskState: "ExecSuccess", transactionHash: txHash, blockNumber: receipt.blockNumber };
  }

  /** Attend le minage et lit le vrai résultat interne depuis les events. */
  async waitForResult(txHash: string): Promise<RelayResult> {
    const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
    if (!receipt) return { taskId: makeTaskId(txHash), txHash, status: "pending" };

    let failed = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = relayInterface.parseLog(log);
        if (parsed?.name === "Executed" && !parsed.args.success) failed++;
      } catch { /* log étranger */ }
    }
    return {
      taskId: makeTaskId(txHash),
      txHash,
      status: receipt.status === 1 ? "success" : "reverted",
      innerSuccess: receipt.status === 1 && failed === 0,
      message: failed ? `${failed} appel(s) interne(s) en échec (voir events Executed)` : undefined,
    };
  }
}

export const gelato = new GelatoReplica();
