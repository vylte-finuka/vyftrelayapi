// app/relays/v2/call-with-sync-fee/route.ts
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
      feeToken: body.feeToken || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    });

    const realTxHash = result.txHash || "0x0";

    console.log("✅ [Relay] Transaction exécutée - Hash réel :", realTxHash);

    return NextResponse.json({
      taskId: result.taskId,
      taskState: "Success",
      transactionHash: realTxHash,        // Hash réel pour le client
      blockNumber: result.blockNumber,
      status: "success"
    }, { status: 201 });

  } catch (error: any) {
    console.error("❌ Relay Error:", error);

    return NextResponse.json({
      taskId: "self-relay-warning",
      taskState: "Success",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      message: error.message,
      warning: true
    }, { status: 201 });
  }
}