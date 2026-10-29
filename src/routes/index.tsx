import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SessionCard } from "@/components/gym/SessionCard";
import { Loading, fmtDate, StatusBadge } from "@/components/gym/format";
import { useGym } from "@/lib/store";
import { money, statusOf } from "@/lib/gym";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "GymFlow — Book your next workout" },
    { name: "description", content: "Your GymFlow dashboard: wallet, upcoming bookings and popular classes." },
    { property: "og:title", content: "GymFlow — Book your next workout" },
    { property: "og:description", content: "Book group classes and personal training with GymFlow." },
  ] }),
  component: Home,
});

function Home() {
  const g = useGym();
  if (!g) return <Loading />;
  const now = Date.now();
  const upcoming = g.bookings.map((b) => ({ b, s: g.sessions.find((s) => s.id === b.sessionId)! }))
    .filter(({ b, s }) => statusOf(b, s, now) === "upcoming");
  const popular = g.sessions.filter((s) => new Date(s.start).getTime() > now)
    .sort((a, b) => b.booked / b.capacity - a.booked / a.capacity).slice(0, 3);
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-24 pt-6 md:pb-12">
      <section className="bg-hero rounded-3xl border border-border p-6 md:p-10">
        <p className="text-sm font-semibold text-primary">Welcome back</p>
        <h1 className="mt-1 text-3xl font-bold md:text-5xl">Hey {g.name.split(" ")[0]}, ready to move?</h1>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button asChild size="lg" className="h-12 px-8 text-base font-bold">
            <Link to="/workouts">Book a Workout</Link>
          </Button>
          <Link to="/wallet" className="rounded-xl bg-background/50 px-4 py-2">
            <span className="block text-xs text-muted-foreground">Wallet balance</span>
            <span className="text-xl font-bold">{money(g.balance)}</span>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Upcoming bookings</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">No upcoming bookings yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map(({ b, s }) => (
              <Link key={b.id} to="/bookings/$id" params={{ id: b.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary">
                <div>
                  <p className="font-bold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{fmtDate(s.start)} · {s.trainer}</p>
                </div>
                <StatusBadge status="upcoming" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Popular classes</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {popular.map((s) => <SessionCard key={s.id} s={s}
            booked={g.bookings.some((b) => b.sessionId === s.id && !b.cancelled)} />)}
        </div>
      </section>
    </main>
  );
}
