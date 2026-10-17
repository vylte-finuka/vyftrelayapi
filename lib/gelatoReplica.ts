// lib/gelatoReplica.ts
import { ethers } from 'ethers';

const RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC!;

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Créé à la demande : une clé absente doit produire une erreur lisible, pas un crash au chargement
function getSponsorWallet(): ethers.Wallet {
  const key = process.env.PRIVATE_KEY_SPONSOR;
  if (!key) throw new Error("PRIVATE_KEY_SPONSOR manquant dans l'environnement du relais");
  if (!RPC_URL) throw new Error("NEXT_PUBLIC_SLURA_RPC manquant dans l'environnement du relais");
  return new ethers.Wallet(key, provider);
}

export interface CallWithSyncFeeRequest {
  chainId: number;
  target: string;
  data: string;
}

export interface CallWithSyncFeeResult {
  taskId: string;
  txHash: string;
}

export type RelayTaskState = "CheckPending" | "ExecSuccess" | "ExecReverted";

export interface RelayTaskStatus {
  taskState: RelayTaskState;
  transactionHash: string;
  blockNumber: number;
  message: string;
}

export class GelatoReplica {
  /**
   * Comme Gelato callWithSyncFee : la transaction est envoyée directement à `target`
   * avec `data`, signée par le sponsor. Le taskId est le hash de la transaction.
   * Lève une erreur (avec la raison) si l'appel échouerait ou si l'envoi échoue.
   */
  async callWithSyncFee(request: CallWithSyncFeeRequest): Promise<CallWithSyncFeeResult> {
    const { target, data } = request;
    const sponsorWallet = getSponsorWallet();

    console.log("[GelatoReplica] Target →", target);
    console.log("[GelatoReplica] Calldata →", data.slice(0, 10), `(${data.length} car.)`);

    // Simulation : un revert du contrat (ex. "Unauthorized access") est signalé avant tout envoi
    const gasEstimate = await provider.estimateGas({
      from: sponsorWallet.address,
      to: target,
      data,
    });

    const rawTx = {
      to: target,
      data,
      value: "0x0",
      // Marge de 20 % + 21 000 sur l'estimation (BigInt() : cible de compilation < ES2020)
      gasLimit: ethers.toBeHex((gasEstimate * BigInt(12)) / BigInt(10) + BigInt(21000)),
      maxFeePerGas: ethers.toBeHex(ethers.parseUnits("10", "gwei")),
      maxPriorityFeePerGas: ethers.toBeHex(ethers.parseUnits("2", "gwei")),
      nonce: await sponsorWallet.getNonce("pending"),
      chainId: (await provider.getNetwork()).chainId,
      type: 2,
    };

    const signedTx = await sponsorWallet.signTransaction(rawTx);
    const txHash: string = await provider.send("eth_sendRawTransaction", [signedTx]);

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error(`Hash de transaction invalide renvoyé par le RPC : ${txHash}`);
    }

    console.log("✅ Transaction envoyée à", target, "— Hash :", txHash);
    return { taskId: txHash, txHash };
  }

  /** Statut réel d'une tâche (taskId = hash de transaction) lu sur la chaîne. */
  async getTaskStatus(taskId: string): Promise<RelayTaskStatus> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(taskId)) {
      return {
        taskState: "ExecReverted",
        transactionHash: taskId,
        blockNumber: 0,
        message: "taskId inconnu (pas un hash de transaction)",
      };
    }
    const receipt = await provider.getTransactionReceipt(taskId);
    if (!receipt) {
      return {
        taskState: "CheckPending",
        transactionHash: taskId,
        blockNumber: 0,
        message: "Transaction en attente de minage",
      };
    }
    return {
      taskState: receipt.status === 1 ? "ExecSuccess" : "ExecReverted",
      transactionHash: taskId,
      blockNumber: receipt.blockNumber,
      message: receipt.status === 1 ? "Transaction exécutée" : "Transaction annulée par le contrat (revert)",
    };
  }
}

export const gelato = new GelatoReplica();
