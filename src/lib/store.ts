import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, GymState, Session, Tx } from "./gym";

/** Prototype has no sign-in yet: the app acts as the seeded demo member. */
export const DEMO_MEMBERS = [
  { email: "alex.morgan@example.com", name: "Alex" },
  { email: "sam.lee@example.com", name: "Sam" },
] as const;
const DEMO_KEY = "gymflow-demo-member";
let demoEmail: string = DEMO_MEMBERS[0].email;
export const getDemoEmail = () => demoEmail;
/** Demo tool: switch which seeded member the app acts as. */
export async function setDemoEmail(email: string) {
  demoEmail = email;
  try { localStorage.setItem(DEMO_KEY, email); } catch { /* ignore */ }
  await refreshGym();
}

let state: GymState | null = null;
let memberId: number | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function refreshGym() {
  const m = await supabase.from("members").select("*").eq("email", demoEmail).single();
  if (m.error) throw m.error;
  memberId = m.data.member_id;
  const [w, b, t, q] = await Promise.all([
    supabase.from("workouts").select("*, trainers(full_name)").order("start_time"),
    supabase.from("bookings").select("booking_id, member_id, workout_id, status, deposit_paid, booked_at"),
    supabase.from("wallet_transactions").select("*").eq("member_id", memberId).order("created_at", { ascending: false }),
    supabase.from("waitlist").select("workout_id").eq("member_id", memberId),
  ]);
  if (w.error || b.error || t.error || q.error) throw w.error ?? b.error ?? t.error ?? q.error;
  const sessions: Session[] = w.data.map((x) => ({
    id: String(x.workout_id), name: x.title, type: (x.category ?? "Group Class") as Session["type"],
    trainer: x.trainers?.full_name ?? "TBA", start: x.start_time, duration: x.duration_minutes,
    price: Number(x.price), depositPct: Math.round((Number(x.deposit_amount) / Number(x.price)) * 100),
    deposit: Number(x.deposit_amount), capacity: x.capacity,
    booked: b.data.filter((y) => y.workout_id === x.workout_id && y.status !== "cancelled").length,
  }));
  const bookings: Booking[] = b.data.filter((x) => x.member_id === memberId)
    .sort((a, c) => c.booked_at.localeCompare(a.booked_at))
    .map((x) => ({
      id: String(x.booking_id), sessionId: String(x.workout_id), cancelled: x.status === "cancelled",
      total: sessions.find((s) => s.id === String(x.workout_id))?.price ?? 0,
      deposit: Number(x.deposit_paid), createdAt: x.booked_at, code: `GYMFLOW:BK-${x.booking_id}:${x.workout_id}`,
    }));
  const txs: Tx[] = t.data.map((x) => {
    const s = sessions.find((y) => y.id === String(bookings.find((z) => z.id === String(x.booking_id))?.sessionId));
    const type = x.type === "top_up" ? "topup" : (x.type as Tx["type"]);
    const label = type === "topup" ? "Wallet top up (demo)" : `${type === "deposit" ? "Deposit" : "Refund"} · ${s?.name ?? "Booking"}`;
    return { id: String(x.transaction_id), type, amount: Number(x.amount), date: x.created_at, label };
  });
  state = { name: m.data.full_name, email: m.data.email, balance: Number(m.data.wallet_balance), sessions, bookings, txs, waitlist: q.data.map((x) => String(x.workout_id)) };
  emit();
}

function ensureLoaded() {
  try { const saved = localStorage.getItem(DEMO_KEY); if (saved && DEMO_MEMBERS.some((m) => m.email === saved)) demoEmail = saved; } catch { /* ignore */ }
  if (!loading) loading = refreshGym().catch((e) => { console.error(e); loading = null; });
}

async function rpcError<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  await refreshGym();
  return r.data;
}

export const bookWorkout = (workoutId: string) =>
  rpcError(supabase.rpc("book_workout", { p_member_id: memberId!, p_workout_id: Number(workoutId) }));
export const cancelBookingDb = (bookingId: string) =>
  rpcError(supabase.rpc("cancel_booking", { p_booking_id: Number(bookingId) }));
export const topUpWallet = (amount: number) =>
  rpcError(supabase.rpc("top_up_wallet", { p_member_id: memberId!, p_amount: amount }));

export const joinWaitlist = (workoutId: string) =>
  rpcError(supabase.rpc("join_waitlist", { p_member_id: memberId!, p_workout_id: Number(workoutId) }));

/** Returns null during SSR and until the database has loaded. */
export function useGym(): GymState | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); ensureLoaded(); return () => listeners.delete(l); },
    () => state,
    () => null,
  );
}
