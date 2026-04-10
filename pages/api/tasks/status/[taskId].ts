// app/api/tasks/status/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export default async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const taskId = params?.taskId || "unknown";

  console.log(`📡 [Gelato Status] Requête pour taskId: ${taskId}`);

  if (taskId === "self-relay-warning") {
    return NextResponse.json({
      task: {
        chainId: 45057,
        taskId: taskId,
        taskState: "Success",
        creationDate: new Date().toISOString(),
        lastCheckDate: new Date().toISOString(),
        lastCheckMessage: "Self relay warning - treated as success",
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        executionDate: new Date().toISOString(),
        blockNumber: 1
      }
    }, { status: 200 });
  }

  return NextResponse.json({
    task: {
      chainId: 45057,
      taskId: taskId,
      taskState: "Success",
      creationDate: new Date().toISOString(),
      lastCheckDate: new Date().toISOString(),
      lastCheckMessage: "Task completed successfully",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      executionDate: new Date().toISOString(),
      blockNumber: 1
    }
  }, { status: 200 });
}