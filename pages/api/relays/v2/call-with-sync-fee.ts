// pages/api/relays/v2/call-with-sync-fee.ts
// Runtime Node.js (pas edge) : ethers y utilise le module https de Node au lieu de fetch,
// dont l'implémentation edge refusait ses requêtes (fetch failed, UND_ERR_INVALID_ARG).
import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { gelato } from '../../../../lib/gelatoReplica';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body?.target || !body?.data) {
      return res.status(400).json({ error: "target and data are required" });
    }
    if (!ethers.isAddress(body.target)) {
      return res.status(400).json({ error: "target must be a valid address" });
    }
    if (!ethers.isHexString(body.data)) {
      return res.status(400).json({ error: "data must be a 0x-prefixed hex string" });
    }

    console.log("➡️ [Relay] Réception callWithSyncFee - Target:", body.target);

    const result = await gelato.callWithSyncFee({
      chainId: body.chainId,
      target: body.target,
      data: body.data,
    });

    // Le relais ne throw plus quand le nœud refuse la tx : il renvoie status "reverted" + hash.
    // Il ne faut donc pas répondre 201 dans ce cas (faux succès).
    if (result.status === "reverted") {
      console.error("❌ [Relay] Tx refusée - Hash :", result.txHash, "-", result.message);
      return res.status(422).json({
        taskId: result.taskId,
        taskState: "Failed",
        transactionHash: result.txHash,
        message: result.message ?? "Transaction refusée par le nœud",
        warning: true,
      });
    }

    console.log("✅ [Relay] Transaction soumise - Hash :", result.txHash);

    // Comme Gelato : la tâche est soumise, son exécution se suit via /api/tasks/status/{taskId}
    return res.status(201).json({
      taskId: result.taskId,
      taskState: "CheckPending",
      transactionHash: result.txHash,
      status: "submitted",
    });

  } catch (error: any) {
    const base = error?.shortMessage || error?.reason || error?.message || "Erreur inconnue";
    // "fetch failed" seul ne dit rien : préciser le RPC appelé et la cause réseau (ENOTFOUND, ECONNREFUSED…)
    const cause = error?.cause?.code || error?.cause?.message || error?.error?.cause?.code;
    let rpcHost = "non défini";
    try {
      rpcHost = new URL(process.env.NEXT_PUBLIC_SLURA_RPC || "").host || rpcHost;
    } catch { /* RPC absent ou invalide */ }
    const message = `${base}${cause ? ` (${cause})` : ""} — RPC : ${rpcHost}`;
    console.error("❌ Relay Error:", message);

    // Échec réel : jamais de faux succès (le client ne doit pas croire à une exécution)
    return res.status(422).json({
      taskId: "",
      taskState: "Failed",
      transactionHash: "",
      message,
      warning: true,
    });
  }
}
