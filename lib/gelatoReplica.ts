// lib/gelatoReplica.ts
import { ethers } from 'ethers';

const RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC!;
const RELAY_ADDRESS = "0xAe28cFF3aB71b25d07b57fB071cF137fAde75988";   // VyftRelayTarget

const provider = new ethers.JsonRpcProvider(RPC_URL);
const sponsorWallet = new ethers.Wallet(process.env.PRIVATE_KEY_SPONSOR!, provider);

export interface CallWithSyncFeeRequest {
  chainId: number;
  target: string;
  data: string;
}

export class GelatoReplica {
  async callWithSyncFee(request: CallWithSyncFeeRequest) {
    const { target, data } = request;

    console.log("[GelatoReplica] Target →", target);
    console.log("[GelatoReplica] Calldata length →", data);

    try {
      // Interface pour la fonction execute du VyftRelayTarget
      const relayInterface = new ethers.Interface([
        "function execute(address target, bytes calldata data) external payable"
      ]);

      // Encode l'appel à execute() avec le target et data fournis
      const callData = relayInterface.encodeFunctionData("execute", [
        target,
        data
      ]);

      const rawTx = {
        to: RELAY_ADDRESS,
        data: callData,
        value: "0x0",
        gasLimit: ethers.toBeHex(15_000_000),
        maxFeePerGas: ethers.toBeHex(ethers.parseUnits("10", "gwei")),
        maxPriorityFeePerGas: ethers.toBeHex(ethers.parseUnits("2", "gwei")),
        nonce: await sponsorWallet.getNonce(),
        chainId: (await provider.getNetwork()).chainId,
        type: 2
      };

      const signedTx = await sponsorWallet.signTransaction(rawTx);
      const txHash = await provider.send("eth_sendRawTransaction", [signedTx]);

      console.log("✅ Transaction envoyée via execute() ! Hash :", txHash);

      return {
        taskId: `self-relay-${txHash.slice(2, 20)}`,
        txHash: txHash,
        status: "pending"
      };

    } catch (error: any) {
      console.error("❌ Erreur :", error.message);
      return { taskId: "self-relay-warning", status: "warning", message: error.message };
    }
  }
}

export const gelato = new GelatoReplica();