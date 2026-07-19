// Proxies the ElevenLabs conversation audio (the showcase call recording) for the report page.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}/audio`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
  });
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: res.status });
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') ?? 'audio/mpeg' },
  });
}
