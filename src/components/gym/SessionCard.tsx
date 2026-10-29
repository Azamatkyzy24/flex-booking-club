import { Link } from "@tanstack/react-router";
import { Clock, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { depositOf, money, spotsLeft, type Session } from "@/lib/gym";
import { fmtDate } from "./format";

export function SessionCard({ s, booked }: { s: Session; booked?: boolean }) {
  const left = spotsLeft(s);
  const full = left <= 0;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={s.type === "Group Class" ? "secondary" : "default"}>{s.type}</Badge>
        <span className={`text-xs font-bold ${full ? "text-destructive" : "text-primary"}`}>
          {full ? "FULL" : `${left} spot${left > 1 ? "s" : ""} left`}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-bold">{s.name}</h3>
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-2"><User className="h-4 w-4" />{s.trainer}</p>
        <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{fmtDate(s.start)} · {s.duration} min</p>
        <p className="flex items-center gap-2"><Users className="h-4 w-4" />{s.booked}/{s.capacity} booked</p>
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
        <div>
          <p className="text-2xl font-bold">{money(s.price)}</p>
          <p className="text-xs text-muted-foreground">Deposit {money(depositOf(s))}</p>
        </div>
        {booked ? (
          <Button disabled variant="secondary">Booked</Button>
        ) : full ? (
          <Button disabled variant="secondary">Full</Button>
        ) : (
          <Button asChild><Link to="/book/$id" params={{ id: s.id }}>Book</Link></Button>
        )}
      </div>
    </div>
  );
}
