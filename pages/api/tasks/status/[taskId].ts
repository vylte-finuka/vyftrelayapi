// pages/api/tasks/status/[taskId].ts
import { NextRequest, NextResponse } from 'next/server';
import { gelato } from '../../../../lib/gelatoReplica';

export const runtime = 'edge';

export default async function GET(request: NextRequest) {
  // Route pages en runtime edge : pas de { params }, le taskId est lu dans l'URL
  const taskId =
    request.nextUrl.searchParams.get("taskId") ||
    decodeURIComponent(request.nextUrl.pathname.split("/").filter(Boolean).pop() || "");

  console.log(`📡 [Gelato Status] Requête pour taskId: ${taskId}`);

  try {
    const status = await gelato.getTaskStatus(taskId);
    const now = new Date().toISOString();

    return NextResponse.json({
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
    }, { status: 200 });
  } catch (error: any) {
    const message = error?.shortMessage || error?.message || "Erreur inconnue";
    console.error("❌ Status Error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
