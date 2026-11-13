import { useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/components/gym/format";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/gym";
import { refreshGym, useGym } from "@/lib/store";

// The generated Supabase types don't know about member_notifications yet (same as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Notice {
  id: string; kind: "workout_cancelled" | "waitlist_cancelled"; title: string; workoutStart: string;
  trainer: string | null; refund: number; reason: string | null;
}

interface NoticeDb {
  notification_id: number; kind: Notice["kind"]; workout_title: string; workout_start: string;
  trainer_name: string | null; refund_amount: number | null; reason: string | null;
}

export const noticesQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async (): Promise<Notice[]> => {
    const { data, error } = await db.from("member_notifications")
      .select("notification_id, kind, workout_title, workout_start, trainer_name, refund_amount, reason")
      .is("read_at", null).order("created_at", { ascending: false }).limit(5);
    if (error) return []; // e.g. database update 0014 not applied yet: just show nothing
    return ((data ?? []) as NoticeDb[]).map((r) => ({
      id: String(r.notification_id), kind: r.kind, title: String(r.workout_title),
      workoutStart: String(r.workout_start), trainer: r.trainer_name ?? null,
      refund: Number(r.refund_amount ?? 0), reason: r.reason ?? null,
    }));
  },
  staleTime: 15_000,
  refetchInterval: 60_000, // a cancellation shows up within a minute, no page reload needed
});

export function noticeText(n: Notice) {
  const when = fmtDate(n.workoutStart);
  const by = n.trainer ? ` with ${n.trainer}` : "";
  const note = n.reason ? ` Note from your trainer: “${n.reason}”` : "";
  if (n.kind === "waitlist_cancelled") {
    return `“${n.title}” (${when})${by} was cancelled, so you have been removed from its waitlist. We're sorry!${note}`;
  }
  return `Your class “${n.title}” (${when})${by} was cancelled. We're sorry! ${n.refund > 0
    ? `Your deposit of ${money(n.refund)} has been refunded to your wallet.`
    : "You were not charged for it."}${note}`;
}

/** Cancellation messages at the top of every page until the member dismisses them. */
export function NotificationBanner() {
  const g = useGym();
  const qc = useQueryClient();
  const { data } = useQuery({ ...noticesQuery, enabled: !!g });
  const seen = useRef<Set<string> | null>(null);

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

  if (!data?.length) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-2 px-4 pt-3" role="region" aria-label="Notifications">
      {data.map((n) => (
        <div key={n.id} role="status" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-bold">{n.kind === "waitlist_cancelled" ? "Waitlisted class cancelled" : "Class cancelled"}</p>
            <p className="mt-0.5 text-muted-foreground">{noticeText(n)}</p>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0" aria-label="Dismiss message" onClick={() => void dismiss(n.id)}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
      {data.length > 1 && <div className="text-right"><Button variant="ghost" size="sm" onClick={() => void dismissAll()}>Dismiss all</Button></div>}
    </div>
  );
}
