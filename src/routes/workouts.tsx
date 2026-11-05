import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SessionCard } from "@/components/gym/SessionCard";
import { Loading, Page } from "@/components/gym/format";
import { useGym } from "@/lib/store";

export const Route = createFileRoute("/workouts")({
  head: () => ({ meta: [
    { title: "Browse Workouts — GymFlow" },
    { name: "description", content: "Browse group classes and personal training sessions and book a spot." },
    { property: "og:title", content: "Browse Workouts — GymFlow" },
    { property: "og:description", content: "Find and book your next workout session." },
  ] }),
  component: Workouts,
});

const chip = (on: boolean) =>
  `rounded-full border px-4 py-1.5 text-sm font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;

function Workouts() {
  const g = useGym();
  const [type, setType] = useState("All");
  const [date, setDate] = useState("All");
  if (!g) return <Loading />;
  const now = Date.now();
  const future = g.sessions.filter((s) => new Date(s.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const days = [...new Set(future.map((s) => dayKey(s.start)))];
  const list = future.filter((s) => (type === "All" || s.type === type) && (date === "All" || dayKey(s.start) === date));
  return (
    <Page title="Browse Workouts">
      <div className="mb-3 flex flex-wrap gap-2">
        {["All", "Group Class", "Personal Training"].map((t) => (
          <button key={t} className={chip(type === t)} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {["All", ...days].map((d) => (
          <button key={d} className={`${chip(date === d)} shrink-0`} onClick={() => setDate(d)}>
            {d === "All" ? "Any date" : new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-muted-foreground">No sessions match these filters.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => <SessionCard key={s.id} s={s}
            booked={g.bookings.some((b) => b.sessionId === s.id && !b.cancelled)}
            waitlisted={g.waitlist?.includes(s.id) ?? false} />)}
        </div>
      )}
    </Page>
  );
}
