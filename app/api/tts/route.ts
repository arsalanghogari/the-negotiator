// Speaks a call turn out loud. Sellers get "Adam"; the negotiator voice matches the
// ElevenLabs agent's configured voice so Parley sounds the same on every call.
const VOICES = {
  seller: 'pNInz6obpgDQGcFmaJgB', // "Adam" premade — distinct from the agent's voice
  negotiator: 'cjVigY5qzO86Huf0OWal', // the negotiator agent's own voice (from its config)
};

export const maxDuration = 30;

export async function POST(req: Request) {
  const { text, voice = 'seller' } = (await req.json()) as { text?: string; voice?: keyof typeof VOICES };
  if (!text) return Response.json({ error: 'missing text' }, { status: 400 });
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voice] ?? VOICES.seller}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
    }
  );
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: res.status });
  return new Response(res.body, { headers: { 'content-type': 'audio/mpeg' } });
}
