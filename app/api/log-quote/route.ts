// Webhook target for the agent's log_quote tool on LIVE phone calls (client tools don't
// exist there). The ack is all the agent needs — the authoritative Quote always comes
// from transcript extraction after the call.
export async function POST() {
  return Response.json({ result: 'logged' });
}
