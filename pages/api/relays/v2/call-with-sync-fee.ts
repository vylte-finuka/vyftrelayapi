// pages/api/relays/v2/call-with-sync-fee.ts
import { NextRequest, NextResponse } from 'next/server';
import { gelato } from '../../../../lib/gelatoReplica';

export const runtime = 'edge';

export default async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.target || !body.data) {
      return NextResponse.json({ error: "target and data are required" }, { status: 400 });
    }

    console.log("➡️ [Relay] Réception callWithSyncFee - Target:", body.target);

    const result = await gelato.callWithSyncFee({
      chainId: body.chainId,
      target: body.target,
      data: body.data,
    });

    console.log("✅ [Relay] Transaction soumise - Hash :", result.txHash);

    // Comme Gelato : la tâche est soumise, son exécution se suit via /api/tasks/status/{taskId}
    return NextResponse.json({
      taskId: result.taskId,
      taskState: "CheckPending",
      transactionHash: result.txHash,
      status: "submitted",
    }, { status: 201 });

  } catch (error: any) {
    const message = error?.shortMessage || error?.reason || error?.message || "Erreur inconnue";
    console.error("❌ Relay Error:", message);

    // Échec réel : jamais de faux succès (le client ne doit pas croire à une exécution)
    return NextResponse.json({
      taskId: "",
      taskState: "Failed",
      transactionHash: "",
      message,
      warning: true,
    }, { status: 422 });
  }
}
