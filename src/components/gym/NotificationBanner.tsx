import { useEffect, useRef, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/components/gym/format";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/gym";
import { refreshGym, useGym } from "@/lib/store";

// The generated Supabase types don't know about member_notifications yet (same as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Notice {
  id: string; kind: "workout_cancelled" | "waitlist_cancelled" | "workout_rescheduled" | "waitlist_rescheduled";
  title: string; workoutStart: string; newStart: string | null;
  trainer: string | null; refund: number; reason: string | null;
}

interface NoticeDb {
  notification_id: number; kind: Notice["kind"]; workout_title: string; workout_start: string; new_start: string | null;
  trainer_name: string | null; refund_amount: number | null; reason: string | null;
}

export const noticesQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async (): Promise<Notice[]> => {
    const { data, error } = await db.from("member_notifications")
      .select("notification_id, kind, workout_title, workout_start, new_start, trainer_name, refund_amount, reason")
      .is("read_at", null).order("created_at", { ascending: false }).limit(5);
    if (error) return []; // e.g. database update 0014 not applied yet: just show nothing
    return ((data ?? []) as NoticeDb[]).map((r) => ({
      id: String(r.notification_id), kind: r.kind, title: String(r.workout_title),
      workoutStart: String(r.workout_start), newStart: r.new_start ?? null, trainer: r.trainer_name ?? null,
      refund: Number(r.refund_amount ?? 0), reason: r.reason ?? null,
    }));
  },
  staleTime: 15_000,
  refetchInterval: 60_000, // a cancellation or change shows up within a minute, no page reload needed
});

export function noticeText(n: Notice) {
  const when = fmtDate(n.workoutStart);
  const by = n.trainer ? ` with ${n.trainer}` : "";
  const note = n.reason ? ` Note from your trainer: “${n.reason}”` : "";
  const moved = n.newStart ? fmtDate(n.newStart) : "a new time";
  if (n.kind === "workout_rescheduled") {
    return `Your class “${n.title}”${by} (${when}) has been rescheduled to ${moved}. ${n.refund > 0
      ? `Would you like to come at the new time, or get your deposit of ${money(n.refund)} back?`
      : "Would you like to come at the new time, or give up your spot?"}${note}`;
  }
  if (n.kind === "waitlist_rescheduled") {
    return `“${n.title}”${by} (${when}) has been rescheduled to ${moved}. You were removed from its waitlist, so you will not be booked automatically. You are welcome to join the waitlist again for the new time.${note}`;
  }
  if (n.kind === "waitlist_cancelled") {
    return `“${n.title}” (${when})${by} was cancelled, so you have been removed from its waitlist. We're sorry!${note}`;
  }
  return `Your class “${n.title}” (${when})${by} was cancelled. We're sorry! ${n.refund > 0
    ? `Your deposit of ${money(n.refund)} has been refunded to your wallet.`
    : "You were not charged for it."}${note}`;
}

const heading = (k: Notice["kind"]) => ({
  workout_cancelled: "Class cancelled", waitlist_cancelled: "Waitlisted class cancelled",
  workout_rescheduled: "Class rescheduled", waitlist_rescheduled: "Waitlisted class rescheduled",
}[k]);

/** Cancellation and reschedule messages at the top of every page until the member answers or dismisses them. */
export function NotificationBanner() {
  const g = useGym();
  const qc = useQueryClient();
  const { data } = useQuery({ ...noticesQuery, enabled: !!g });
  const seen = useRef<Set<string> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // When a NEW message arrives while the member is online, reload wallet and bookings
  // so the refund and the cancelled booking show up straight away.
  useEffect(() => {
    if (!data) return;
    const known = seen.current;
    if (known && data.some((n) => !known.has(n.id))) void refreshGym().catch(() => {});
    seen.current = new Set(data.map((n) => n.id));
  }, [data]);

  const done = async (call: () => PromiseLike<unknown>) => {
    try { await call(); } finally { await qc.invalidateQueries({ queryKey: ["notifications"] }); }
  };
  const dismiss = (id: string) => done(() => db.rpc("dismiss_notification", { p_notification_id: Number(id) }));
  const dismissAll = () => done(() => db.rpc("dismiss_all_notifications"));

  // "Keep my spot" (keep = true) or "Refund me" (keep = false) on a rescheduled class
  const answer = async (n: Notice, keep: boolean) => {
    setBusyId(n.id);
    try {
      const { data: r, error } = await db.rpc("respond_to_reschedule", { p_notification_id: Number(n.id), p_keep: keep });
      if (error) throw new Error(error.message);
      if (keep) toast.success("Great, your spot is kept for the new time.");
      else if (r?.result === "refunded") toast.success(`Your booking was cancelled and ${money(Number(r.amount ?? 0))} was refunded to your wallet.`);
      else toast.message("This booking was already cancelled, so there is nothing to refund.");
      await refreshGym().catch(() => {});
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusyId(null); await qc.invalidateQueries({ queryKey: ["notifications"] }); }
  };

  if (!data?.length) return null;
  const hasQuestion = data.some((n) => n.kind === "workout_rescheduled");
  return (
    <div className="mx-auto max-w-6xl space-y-2 px-4 pt-3" role="region" aria-label="Notifications">
      {data.map((n) => {
        const question = n.kind === "workout_rescheduled";
        const moved = n.kind === "workout_rescheduled" || n.kind === "waitlist_rescheduled";
        const Icon = moved ? CalendarClock : Ban;
        return (
          <div key={n.id} role="status"
            className={`flex items-start gap-3 rounded-2xl border p-4 ${moved ? "border-primary/40 bg-primary/10" : "border-destructive/40 bg-destructive/10"}`}>
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${moved ? "text-primary" : "text-destructive"}`} aria-hidden />
            <div className="flex-1 text-sm">
              <p className="font-bold">{heading(n.kind)}</p>
              <p className="mt-0.5 text-muted-foreground">{noticeText(n)}</p>
              {question && <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busyId === n.id} onClick={() => void answer(n, true)}>Keep my spot</Button>
                <Button size="sm" variant="outline" disabled={busyId === n.id} onClick={() => void answer(n, false)}>
                  {n.refund > 0 ? `Refund ${money(n.refund)}` : "Cancel my spot"}
                </Button>
              </div>}
            </div>
            {!question && <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0" aria-label="Dismiss message" onClick={() => void dismiss(n.id)}>
              <X className="h-4 w-4" aria-hidden />
            </Button>}
          </div>
        );
      })}
      {/* "Dismiss all" would silently answer open questions with "keep", so it only shows when there are none */}
      {data.length > 1 && !hasQuestion && <div className="text-right"><Button variant="ghost" size="sm" onClick={() => void dismissAll()}>Dismiss all</Button></div>}
    </div>
  );
}