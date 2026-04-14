// lib/gelatoReplica.ts
import { ethers } from 'ethers';

const RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC!;
const RELAY_ADDRESS = "0x4C81f49E31bdA0DD164192690EFC5A34FBe32AEc";   // ← Mets ici la nouvelle adresse

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
      const iface = new ethers.Interface([
        "function callWithSyncFeeV2(address _target, bytes calldata _data, bool, bytes32) external"
      ]);

      const callData = iface.encodeFunctionData("callWithSyncFeeV2", [
        target,
        data,
        true,
        ethers.keccak256(ethers.toUtf8Bytes("relay"))
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

      console.log("✅ Transaction envoyée via raw ! Hash :", txHash);

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