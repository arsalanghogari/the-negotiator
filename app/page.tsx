export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">The Negotiator</h1>
      <p className="text-muted-foreground">
        Same move, $1,158–$6,506. An AI agent that calls, compares, and negotiates for you.
      </p>
      <a
        href="/intake"
        className="rounded-md bg-foreground px-6 py-2 font-medium text-background hover:opacity-90"
      >
        Start intake
      </a>
    </main>
  );
}
