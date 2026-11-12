import { createFileRoute, Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading, Page, Row, StatusBadge, fmtDate } from "@/components/gym/format";
import { cancelBookingDb, useGym } from "@/lib/store";
import { canCancel, canReview, money, reviewOf, statusOf, CANCEL_HOURS } from "@/lib/gym";
import { TrainerLink } from "@/components/gym/TrainerLink";
import { MyReview, ReviewForm } from "@/components/gym/ReviewForm";
import { RatingValue } from "@/components/gym/Stars";

export const Route = createFileRoute("/bookings/$id")({
  head: () => ({ meta: [
    { title: "Booking Details — GymFlow" },
    { name: "description", content: "Your booking QR code and payment details for reception." },
    { property: "og:title", content: "Booking Details — GymFlow" },
    { property: "og:description", content: "Show this QR code at GymFlow reception." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const g = useGym();
  if (!g) return <Loading />;
  const b = g.bookings.find((x) => x.id === id);
  const s = b && g.sessions.find((x) => x.id === b.sessionId);
  if (!b || !s) return <Page title="Booking not found"><Link to="/bookings" className="text-primary">Back to bookings</Link></Page>;
  const st = statusOf(b, s);
  const review = reviewOf(g, b.id);

  const cancel = async () => {
    try {
      await cancelBookingDb(b.id);
      toast.success(`Booking cancelled. ${money(b.deposit)} refunded to your wallet.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not cancel."); }
  };

  return (
    <Page title="Booking details">
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-6">
          <div className={`rounded-xl bg-foreground p-4 ${st !== "upcoming" ? "opacity-40" : ""}`}>
            <QRCodeSVG value={b.code} size={200} />
          </div>
          <p className="mt-3 font-mono text-sm font-bold">BK-{b.id}</p>
          <p className="text-xs text-muted-foreground">Show this at reception</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-2xl font-bold">{s.name}</h2>
            <StatusBadge status={st} />
          </div>
          {s.description && <p className="mb-2 text-muted-foreground">{s.description}</p>}
          <Row k="Booking ID" v={`BK-${b.id}`} />
          <Row k="Type" v={s.type} />
          <Row k="Trainer" v={<TrainerLink session={s} />} />
          <Row k="Date & time" v={`${fmtDate(s.start)} · ${s.duration} min`} />
          <Row k="Total price" v={money(b.total)} />
          <Row k="Deposit paid" v={money(b.deposit)} />
          <Row k="Remaining at reception" v={money(b.total - b.deposit)} strong />
          {s.rating != null && !!s.reviewCount && <Row k="Course rating" v={<RatingValue rating={s.rating} count={s.reviewCount} />} />}
          {st === "upcoming" && (
            canCancel(b, s) ? (
              <Button variant="destructive" className="mt-4" onClick={cancel}>Cancel booking</Button>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Cancellation deadline ({CANCEL_HOURS}h before start) has passed.</p>
            )
          )}
          {review ? <MyReview review={review} />
            : canReview(b, s, false) && <ReviewForm bookingId={b.id} sessionName={s.name} />}
        </div>
      </div>
    </Page>
  );
}
