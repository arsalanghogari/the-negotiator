// Speaks the simulated seller's reply on the listen-in call (the negotiator side is
// already live ElevenLabs voice over WebRTC).
const SELLER_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // "Adam" premade — distinct from the agent's voice

export const maxDuration = 30;

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text?: string };
  if (!text) return Response.json({ error: 'missing text' }, { status: 400 });
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${SELLER_VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
    }
  );
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: res.status });
  return new Response(res.body, { headers: { 'content-type': 'audio/mpeg' } });
}
