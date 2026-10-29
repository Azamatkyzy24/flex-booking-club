import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loading, Page, StatusBadge, fmtDate } from "@/components/gym/format";
import { useGym } from "@/lib/store";
import { money, statusOf, CANCEL_HOURS, type BookingStatus } from "@/lib/gym";

export const Route = createFileRoute("/bookings/")({
  head: () => ({ meta: [
    { title: "My Bookings — GymFlow" },
    { name: "description", content: "Your upcoming, completed and cancelled GymFlow bookings." },
    { property: "og:title", content: "My Bookings — GymFlow" },
    { property: "og:description", content: "Manage your GymFlow bookings." },
  ] }),
  component: Bookings,
});

function Bookings() {
  const g = useGym();
  const [tab, setTab] = useState<BookingStatus>("upcoming");
  if (!g) return <Loading />;
  const rows = g.bookings.map((b) => {
    const s = g.sessions.find((x) => x.id === b.sessionId)!;
    return { b, s, st: statusOf(b, s) };
  });
  const list = rows.filter((r) => r.st === tab);
  return (
    <Page title="My Bookings">
      <p className="mb-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
        <b className="text-foreground">Cancellation policy:</b> cancel up to {CANCEL_HOURS} hours before the session for a full deposit refund. After that, the deposit is non-refundable.
      </p>
      <div className="mb-4 flex gap-2">
        {(["upcoming", "completed", "cancelled"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {t} ({rows.filter((r) => r.st === t).length})
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-muted-foreground">No {tab} bookings.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(({ b, s, st }) => (
            <Link key={b.id} to="/bookings/$id" params={{ id: b.id }}
              className="rounded-2xl border border-border bg-card p-5 hover:border-primary">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{fmtDate(s.start)} · {s.trainer}</p>
                </div>
                <StatusBadge status={st} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-muted-foreground">Total</p><p className="font-bold">{money(b.total)}</p></div>
                <div><p className="text-muted-foreground">Deposit paid</p><p className="font-bold">{money(b.deposit)}</p></div>
                <div><p className="text-muted-foreground">Due at gym</p><p className="font-bold text-primary">{money(b.total - b.deposit)}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
