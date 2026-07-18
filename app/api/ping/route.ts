// Verifies OpenAI + ElevenLabs keys are present and valid.
export async function GET() {
  const [openai, elevenlabs] = await Promise.all([
    check('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    }, !!process.env.OPENAI_API_KEY),
    // /v1/models works with scope-restricted keys; /v1/user needs user_read
    check('https://api.elevenlabs.io/v1/models', {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
    }, !!process.env.ELEVENLABS_API_KEY),
  ]);
  return Response.json({ openai, elevenlabs, demoMode: process.env.DEMO_MODE === 'true' });
}

async function check(url: string, headers: Record<string, string>, hasKey: boolean) {
  if (!hasKey) return 'missing key';
  try {
    const res = await fetch(url, { headers });
    return res.ok ? 'ok' : `error ${res.status}`;
  } catch {
    return 'unreachable';
  }
}
