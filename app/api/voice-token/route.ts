import type { NextRequest } from 'next/server';

// Mints a WebRTC conversation token server-side so the API key never reaches the browser.
export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent') === 'negotiator' ? 'NEGOTIATOR' : 'INTAKE';
  const agentId = process.env[`ELEVENLABS_AGENT_ID_${agent}`];
  if (!agentId) return Response.json({ error: `ELEVENLABS_AGENT_ID_${agent} not set` }, { status: 500 });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' } }
  );
  if (!res.ok) return Response.json({ error: `token fetch failed: ${res.status}` }, { status: 502 });
  return Response.json(await res.json());
}
