// app/relays/v2/route.ts
export const runtime = 'edge' // 'nodejs' (default) | 'edge'

import { NextResponse } from 'next/server';

export default async function GET() {
  return NextResponse.json({
    relays: ["45057"]
  });
}
