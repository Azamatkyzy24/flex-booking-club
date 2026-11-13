import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Users, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { depositOf, money, spotsLeft, type Session } from "@/lib/gym";
import { joinWaitlist } from "@/lib/store";
import { fmtDate } from "./format";
import { TrainerLink } from "./TrainerLink";
import { RatingValue } from "./Stars";

export function SessionCard({ s, booked, waitlisted, bookLabel = "Book" }: { s: Session; booked?: boolean; waitlisted?: boolean; bookLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, spotsLeft(s));
  const full = left <= 0;
  const cancelled = !!s.cancelled;
  const spotOpened = waitlisted && !full && !booked && !cancelled;
  const join = async () => {
    setBusy(true);
    try { await joinWaitlist(s.id); toast.success("You're on the waitlist."); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-card p-5 ${cancelled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Badge variant={s.type === "Group Class" ? "secondary" : "default"}>{s.type}</Badge>
        {cancelled
          ? <span className="text-xs font-bold text-destructive">Cancelled</span>
          : <span className={`text-xs font-bold ${full ? "text-destructive" : "text-primary"}`}>
            {left} spot{left === 1 ? "" : "s"} left
          </span>}
      </div>
      <h3 className="mt-3 text-lg font-bold">{s.name}</h3>
      {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
      {spotOpened && (
        <p className="mt-2 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary">
          A spot opened up — book it before it's gone!
        </p>
      )}
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-2"><User className="h-4 w-4" /><TrainerLink session={s} /></p>
        <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{fmtDate(s.start)} · {s.duration} min</p>
        <p className="flex items-center gap-2"><Users className="h-4 w-4" />{s.booked}/{s.capacity} booked</p>
        {s.rating != null && !!s.reviewCount && (
          <p className="flex items-center gap-2"><RatingValue rating={s.rating} count={s.reviewCount} /></p>
        )}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
        <div>
          <p className="text-2xl font-bold">{money(s.price)}</p>
          <p className="text-xs text-muted-foreground">Deposit {money(depositOf(s))}</p>
        </div>
        {cancelled ? (
          <Button disabled variant="secondary">Cancelled</Button>
        ) : booked ? (
          <Button disabled variant="secondary">Booked</Button>
        ) : full ? (
          waitlisted
            ? <Button disabled variant="secondary">On waitlist</Button>
            : <Button variant="outline" disabled={busy} onClick={join}>Join waitlist</Button>
        ) : (
          <Button asChild><Link to="/book/$id" params={{ id: s.id }}>{bookLabel}</Link></Button>
        )}
      </div>
    </div>
  );
}
