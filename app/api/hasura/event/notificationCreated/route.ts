import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const event = await req.json();
  console.log('Received notification event trigger', JSON.stringify(event, null, 2));
  return NextResponse.json({ success: true });
}
