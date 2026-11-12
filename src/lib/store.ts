import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, GymState, Session, Tx } from "./gym";

let state: GymState | null = null;
let memberId: number | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function clearGym() {
  state = null;
  memberId = null;
  loading = null;
  emit();
}

export async function refreshGym() {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) { clearGym(); return; }
  const m = await supabase.from("members").select("*").eq("user_id", uid).single();
  if (m.error) throw m.error;
  memberId = m.data.member_id;
  const [w, b, t, q, c] = await Promise.all([
    supabase.from("workouts").select("*, trainers(full_name, slug)").order("start_time"),
    supabase.from("bookings").select("booking_id, member_id, workout_id, status, deposit_paid, booked_at"),
    supabase.from("wallet_transactions").select("*").eq("member_id", memberId).order("created_at", { ascending: false }),
    supabase.from("waitlist").select("workout_id").eq("member_id", memberId),
    supabase.rpc("workout_booked_counts"),
  ]);
  if (w.error || b.error || t.error || q.error || c.error) throw w.error ?? b.error ?? t.error ?? q.error ?? c.error;
  const counts = new Map(c.data.map((x) => [x.workout_id, Number(x.booked)]));
  const sessions: Session[] = w.data.map((x) => ({
    id: String(x.workout_id), name: x.title, type: (x.category ?? "Group Class") as Session["type"],
    trainer: x.trainers?.full_name ?? "TBA", trainerId: x.trainer_id, trainerSlug: x.trainers?.slug, start: x.start_time, duration: x.duration_minutes,
    price: Number(x.price), depositPct: Math.round((Number(x.deposit_amount) / Number(x.price)) * 100),
    deposit: Number(x.deposit_amount), capacity: x.capacity,
    booked: counts.get(x.workout_id) ?? 0,
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
  if (!loading) loading = refreshGym().catch((e) => { console.error(e); loading = null; });
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await refreshGym();
}

export async function register(fullName: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Account created. Please check your email to confirm it, then log in.");
  await refreshGym();
}

export async function signOut() {
  await supabase.auth.signOut();
  clearGym();
}

async function rpcError<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  await refreshGym();
  return r.data;
}

export const bookWorkout = (workoutId: string) =>
  rpcError(supabase.rpc("book_workout", { p_member_id: memberId!, p_workout_id: Number(workoutId) }));
/** Atomic booking: locks the workout row in the database so two simultaneous
 *  bookings cannot both take the last spot. Raises SESSION_FULL / INSUFFICIENT_BALANCE. */
export const bookSession = (workoutId: string) =>
  rpcError(supabase.rpc("book_session", { p_workout_id: Number(workoutId), p_member_id: memberId! }));
export const cancelBookingDb = (bookingId: string) =>
  rpcError(supabase.rpc("cancel_booking", { p_booking_id: Number(bookingId) }));
export const topUpWallet = (amount: number) =>
  rpcError(supabase.rpc("top_up_wallet", { p_member_id: memberId!, p_amount: amount }));

export const joinWaitlist = (workoutId: string) =>
  rpcError(supabase.rpc("join_waitlist", { p_member_id: memberId!, p_workout_id: Number(workoutId) }));

/** Returns null during SSR, while loading, and when signed out. */
export function useGym(): GymState | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); ensureLoaded(); return () => listeners.delete(l); },
    () => state,
    () => null,
  );
}
