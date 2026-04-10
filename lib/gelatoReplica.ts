// lib/gelatoReplica.ts
import { ethers } from 'ethers';

const RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC!;
const RELAY_ADDRESS = "0x5C3C46Aa8A061153fA7C1F904B36d18Fc2E92E21"; // Ton GelatoRelay

const provider = new ethers.JsonRpcProvider(RPC_URL);
const sponsorWallet = new ethers.Wallet(process.env.PRIVATE_KEY_SPONSOR!, provider);

// ABI correspondant à ton contrat GelatoRelay (callWithSyncFeeV2)
const relayABI = [
  "function callWithSyncFeeV2(address _target, bytes calldata _data, bool _isRelayContext, bytes32 _correlationId) external"
];

const relayContract = new ethers.Contract(RELAY_ADDRESS, relayABI, sponsorWallet);

export interface CallWithSyncFeeRequest {
  chainId: number;
  target: string;
  data: string;
  feeToken?: string;
  maxFee?: string;
}

export class GelatoReplica {
  async callWithSyncFee(request: CallWithSyncFeeRequest) {
    const { target, data } = request;

    console.log("[GelatoReplica] Envoi callWithSyncFeeV2 vers target:", target);

    try {
      // On génère un correlationId stable (important pour le status)
      const correlationId = ethers.keccak256(ethers.toUtf8Bytes(Date.now().toString() + target));

      const tx = await relayContract.callWithSyncFeeV2(
        target,
        data,
        true,                    // _isRelayContext = true (recommandé)
        correlationId
      );

      console.log("Transaction envoyée, hash :", tx.hash);

      const receipt = await tx.wait();

      console.log("[GelatoReplica] Transaction confirmée ! Hash :", receipt.hash);

      return {
        taskId: `self-relay-${receipt.hash.slice(2, 18)}`,   // taskId stable et lisible
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: "success",
        correlationId: correlationId
      };

    } catch (error: any) {
      console.error("Erreur lors de l'appel callWithSyncFeeV2 :", error);

      // Fallback sécurisé
      return {
        taskId: "self-relay-warning",
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        status: "warning",
        message: error.message
      };
    }
  }
}

export const gelato = new GelatoReplica();