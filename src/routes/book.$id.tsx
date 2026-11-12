import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, Page, Row, fmtDate } from "@/components/gym/format";
import { bookSession, refreshGym, useGym } from "@/lib/store";
import { depositOf, money, spotsLeft, CANCEL_HOURS } from "@/lib/gym";
import { TrainerLink } from "@/components/gym/TrainerLink";
import { CourseReviews } from "@/components/gym/CourseReviews";
import { RatingValue } from "@/components/gym/Stars";

export const Route = createFileRoute("/book/$id")({
  head: () => ({ meta: [
    { title: "Confirm Booking — GymFlow" },
    { name: "description", content: "Review workout details and pay your deposit to confirm." },
    { property: "og:title", content: "Confirm Booking — GymFlow" },
    { property: "og:description", content: "Review and confirm your GymFlow booking." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
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
      const bookingId = await bookSession(s.id);
      toast.success("Booking confirmed! Your QR code is ready.");
      nav({ to: "/bookings/$id", params: { id: String(bookingId) } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Booking failed.";
      if (msg.includes("SESSION_FULL")) {
        setError("Sorry, this class just filled up");
        void refreshGym(); // pull the fresh spots count
      } else if (msg.includes("INSUFFICIENT_BALANCE")) {
        setError("Insufficient funds. Please top up your wallet.");
      } else {
        setError(msg);
      }
    }
    finally { setBusy(false); }
  };

  return (
    <Page title="Confirm your booking">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <Badge>{s.type}</Badge>
          <h2 className="mt-3 text-2xl font-bold">{s.name}</h2>
          {s.description && <p className="mt-2 text-muted-foreground">{s.description}</p>}
          <Row k="Trainer" v={<TrainerLink session={s} />} />
          <Row k="Date & time" v={fmtDate(s.start)} />
          <Row k="Duration" v={`${s.duration} min`} />
          <Row k="Available spots" v={`${spotsLeft(s)} of ${s.capacity}`} />
          {s.rating != null && !!s.reviewCount && <Row k="Rating" v={<RatingValue rating={s.rating} count={s.reviewCount} />} />}
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
          <Button
            className="mt-4 h-12 w-full text-base font-bold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            onClick={confirm}
            disabled={busy || insufficient}
          >
            {insufficient ? "Top up your wallet to book" : `Pay ${money(dep)} deposit & confirm`}
          </Button>

          <p className="mt-3 text-xs text-muted-foreground">
            Free cancellation up to {CANCEL_HOURS} hours before start — deposit refunded to your wallet. Demo payment only.
          </p>
        </div>
      </div>
      <CourseReviews workoutId={s.id} />
    </Page>
  );
}
