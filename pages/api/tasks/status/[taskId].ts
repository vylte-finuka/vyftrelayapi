// pages/api/tasks/status/[taskId].ts
// Runtime Node.js (pas edge) : même raison que call-with-sync-fee (fetch edge incompatible avec ethers).
import type { NextApiRequest, NextApiResponse } from 'next';
import { gelato } from '../../../../lib/gelatoReplica';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.taskId;
  const taskId = (Array.isArray(raw) ? raw[0] : raw) || "";

  console.log(`📡 [Gelato Status] Requête pour taskId: ${taskId}`);

  try {
    const status = await gelato.getTaskStatus(taskId);
    const now = new Date().toISOString();

    return res.status(200).json({
      task: {
        chainId: 45057,
        taskId,
        taskState: status.taskState,
        creationDate: now,
        lastCheckDate: now,
        lastCheckMessage: status.message,
        transactionHash: status.transactionHash,
        executionDate: status.blockNumber ? now : undefined,
        blockNumber: status.blockNumber,
      }
    });
  } catch (error: any) {
    const message = error?.shortMessage || error?.message || "Erreur inconnue";
    console.error("❌ Status Error:", message);
    return res.status(502).json({ error: message });
  }
}
