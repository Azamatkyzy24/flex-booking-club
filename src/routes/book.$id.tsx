import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, Page, Row, fmtDate } from "@/components/gym/format";
import { bookSession, refreshGym, useGym } from "@/lib/store";
import { depositOf, money, spotsLeft, CANCEL_HOURS } from "@/lib/gym";

export const Route = createFileRoute("/book/$id")({
  head: () => ({ meta: [
    { title: "Confirm Booking — GymFlow" },
    { name: "description", content: "Review workout details and pay your deposit to confirm." },
    { property: "og:title", content: "Confirm Booking — GymFlow" },
    { property: "og:description", content: "Review and confirm your GymFlow booking." },
  ] }),
  component: Book,
});

function Book() {
  const { id } = Route.useParams();
  const g = useGym();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!g) return <Loading />;
  const s = g.sessions.find((x) => x.id === id);
  if (!s) return <Page title="Session not found"><Link to="/workouts" className="text-primary">Back to workouts</Link></Page>;
  const dep = depositOf(s);
  const insufficient = g.balance < dep;

  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const bookingId = await bookWorkout(s.id);
      toast.success("Booking confirmed! Your QR code is ready.");
      nav({ to: "/bookings/$id", params: { id: String(bookingId) } });
    } catch (e) { setError(e instanceof Error ? e.message : "Booking failed."); }
    finally { setBusy(false); }
  };

  return (
    <Page title="Confirm your booking">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <Badge>{s.type}</Badge>
          <h2 className="mt-3 text-2xl font-bold">{s.name}</h2>
          <Row k="Trainer" v={s.trainer} />
          <Row k="Date & time" v={fmtDate(s.start)} />
          <Row k="Duration" v={`${s.duration} min`} />
          <Row k="Available spots" v={`${spotsLeft(s)} of ${s.capacity}`} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-2 font-bold">Payment breakdown</h3>
          <Row k="Total price" v={money(s.price)} />
          <Row k={`Deposit (${s.depositPct}%) — paid now`} v={money(dep)} strong />
          <Row k="Remaining — pay at reception" v={money(s.price - dep)} />
          <div className="my-3 border-t border-border" />
          <Row k="Wallet balance" v={money(g.balance)} />
          <Row k="Balance after booking" v={insufficient ? "—" : money(g.balance - dep)} />
          {(error || insufficient) && (
            <p role="alert" className="mt-3 rounded-lg bg-destructive/15 p-3 text-sm font-semibold text-destructive">
              {error || "Insufficient funds. Please top up your wallet."}
              {(insufficient || error.startsWith("Insufficient")) && <> <Link to="/wallet" className="underline">Top up</Link></>}
            </p>
          )}
          <Button className="mt-4 h-12 w-full text-base font-bold" onClick={confirm} disabled={busy}>
            Pay {money(dep)} deposit & confirm
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Free cancellation up to {CANCEL_HOURS} hours before start — deposit refunded to your wallet. Demo payment only.
          </p>
        </div>
      </div>
    </Page>
  );
}
