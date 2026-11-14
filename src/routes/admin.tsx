import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading, Page, fmtDate } from "@/components/gym/format";
import { supabase } from "@/integrations/supabase/client";
import { refreshGym } from "@/lib/store";
 
export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — GymFlow" }] }),
  component: AdminPage,
});
 
// The generated Supabase types don't know about the new admin_* functions yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
 
function workoutLabel(w: Row | null | undefined, id: number) {
  return w?.title ?? w?.name ?? w?.class_name ?? `Workout #${id}`;
}
 
function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [waitlist, setWaitlist] = useState<Row[]>([]);
  const [log, setLog] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
 
  const load = useCallback(async () => {
    const [b, w, l] = await Promise.all([
      db
        .from("bookings")
        .select("*, members(full_name,email), workouts(*)")
        .eq("status", "upcoming")
        .order("booked_at", { ascending: false }),
      db
        .from("waitlist")
        .select("*, members(full_name,email), workouts(*)")
        .order("created_at", { ascending: true }),
      db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    if (b.error) toast.error(b.error.message); else setBookings(b.data ?? []);
    if (w.error) toast.error(w.error.message); else setWaitlist(w.data ?? []);
    if (l.error) toast.error(l.error.message); else setLog(l.data ?? []);
  }, []);
 
  useEffect(() => {
    (async () => {
      const { data, error } = await db.rpc("is_admin");
      const ok = !error && data === true;
      setAllowed(ok);
      if (ok) await load();
    })();
  }, [load]);
 
  const run = async (call: () => Promise<{ error: { message: string } | null }>, okMsg: string) => {
    setBusy(true);
    try {
      const { error } = await call();
      if (error) toast.error(error.message);
      else toast.success(okMsg);
      await load();
    } finally {
      setBusy(false);
    }
  };
 
  if (allowed === null) return <Loading />;
  if (!allowed) {
    return (
      <Page title="Admin">
        <p className="text-muted-foreground">Access denied. This page is for administrators only.</p>
      </Page>
    );
  }
 
  // Group the waitlist by workout; position = order of created_at
  const groups = new Map<number, Row[]>();
  for (const w of waitlist) {
    const list = groups.get(w.workout_id) ?? [];
    list.push(w);
    groups.set(w.workout_id, list);
  }
 
  return (
    <Page title="Admin">
      <div className="mb-8">
        {showForm ? (
          <NewSessionForm onDone={() => setShowForm(false)} />
        ) : (
          <Button onClick={() => setShowForm(true)}>+ Create session</Button>
        )}
      </div>
 
      <h2 className="mb-3 text-xl font-bold">Waitlist</h2>
      {groups.size === 0 && <p className="mb-8 text-muted-foreground">Waitlist is empty.</p>}
      <div className="mb-8 space-y-4">
        {[...groups.entries()].map(([workoutId, entries]) => (
          <div key={workoutId} className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <p className="font-semibold">{workoutLabel(entries[0]?.workouts, workoutId)}</p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => db.rpc("admin_promote_waitlist", { p_workout_id: workoutId }),
                    "Promotion run finished.",
                  )
                }
              >
                Promote now
              </Button>
            </div>
            <div className="divide-y divide-border">
              {entries.map((e, i) => (
                <div key={e.waitlist_id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">
                      #{i + 1} · {e.members?.full_name ?? `Member ${e.member_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.members?.email} · joined {fmtDate(e.created_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => db.rpc("admin_remove_from_waitlist", { p_waitlist_id: e.waitlist_id }),
                        "Removed from waitlist.",
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
 
      <h2 className="mb-3 text-xl font-bold">Upcoming bookings</h2>
      {bookings.length === 0 && <p className="mb-8 text-muted-foreground">No upcoming bookings.</p>}
      <div className="mb-8 divide-y divide-border rounded-2xl border border-border bg-card">
        {bookings.map((b) => (
          <div key={b.booking_id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">{workoutLabel(b.workouts, b.workout_id)}</p>
              <p className="text-xs text-muted-foreground">
                {b.members?.full_name ?? `Member ${b.member_id}`} · {b.members?.email} · booked{" "}
                {fmtDate(b.booked_at)}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Cancel this booking and refund the member?")) return;
                run(
                  () => db.rpc("admin_cancel_booking", { p_booking_id: b.booking_id }),
                  "Booking cancelled. Next person on the waitlist was promoted if possible.",
                );
              }}
            >
              Cancel
            </Button>
          </div>
        ))}
      </div>
 
      <h2 className="mb-3 text-xl font-bold">Recent activity</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {log.map((l) => (
          <div key={l.log_id} className="p-4">
            <p className="font-semibold">{l.action}</p>
            <p className="text-xs text-muted-foreground">
              {l.details} · {fmtDate(l.created_at)}
            </p>
          </div>
        ))}
      </div>
    </Page>
  );
}
 
const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";
 
function Field({ label, id, wide, children }: { label: string; id: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      {children}
    </div>
  );
}
 
function NewSessionForm({ onDone }: { onDone: () => void }) {
  const [trainers, setTrainers] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    trainerId: "", title: "", category: "Group Class", start: "",
    duration: "60", capacity: "1", price: "10", deposit: "5", description: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
 
  useEffect(() => {
    (async () => {
      const { data, error } = await db.from("trainers").select("trainer_id, full_name").order("full_name");
      if (error) { toast.error(error.message); return; }
      setTrainers(data ?? []);
      if (data?.length) setF((p) => ({ ...p, trainerId: String(data[0].trainer_id) }));
    })();
  }, []);
 
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.start) { toast.error("Pick a start date and time."); return; }
    setBusy(true);
    try {
      const { error } = await db.rpc("admin_create_workout", {
        p_trainer_id: Number(f.trainerId), p_title: f.title, p_category: f.category,
        p_start: new Date(f.start).toISOString(), p_duration: Number(f.duration),
        p_capacity: Number(f.capacity), p_price: Number(f.price), p_deposit: Number(f.deposit),
        p_description: f.description || null,
      });
      if (error) throw new Error(error.message);
      await refreshGym(); // so the new session shows up on the Workouts page
      toast.success("Session created.");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
 
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
      <Field label="Title" id="s-title">
        <input id="s-title" className={inputCls} value={f.title} onChange={set("title")} placeholder="Morning HIIT" required />
      </Field>
      <Field label="Trainer" id="s-trainer">
        <select id="s-trainer" className={inputCls} value={f.trainerId} onChange={set("trainerId")} required>
          {trainers.map((t) => (
            <option key={t.trainer_id} value={t.trainer_id}>{t.full_name}</option>
          ))}
        </select>
      </Field>
      <Field label="Type" id="s-cat">
        <select id="s-cat" className={inputCls} value={f.category} onChange={set("category")}>
          <option>Group Class</option>
          <option>Personal Training</option>
        </select>
      </Field>
      <Field label="Start" id="s-start">
        <input id="s-start" type="datetime-local" className={inputCls} value={f.start} onChange={set("start")} required />
      </Field>
      <Field label="Duration (minutes)" id="s-dur">
        <input id="s-dur" type="number" min={15} max={240} className={inputCls} value={f.duration} onChange={set("duration")} />
      </Field>
      <Field label="Capacity (spots)" id="s-cap">
        <input id="s-cap" type="number" min={1} max={50} className={inputCls} value={f.capacity} onChange={set("capacity")} />
      </Field>
      <Field label="Price ($)" id="s-price">
        <input id="s-price" type="number" min={1} step="0.5" className={inputCls} value={f.price} onChange={set("price")} />
      </Field>
      <Field label="Deposit ($)" id="s-dep">
        <input id="s-dep" type="number" min={0} step="0.5" className={inputCls} value={f.deposit} onChange={set("deposit")} />
      </Field>
      <Field label="Description (optional)" id="s-desc" wide>
        <textarea id="s-desc" rows={2} maxLength={500} className={inputCls} value={f.description} onChange={set("description")} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create session"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
 