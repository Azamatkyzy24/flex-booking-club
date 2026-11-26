import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshGym, useGym } from "@/lib/store";

// The generated Supabase types don't know about the trainer_* functions yet (same as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Shapes of the rows the trainer_* database functions return.
interface StatDb { workout_id: number; booked: number; waitlisted: number; deposits: number }
interface RosterDb { booking_id: number; member_name: string; booked_at: string; deposit_paid: number }
interface ReviewDb { review_id: number; workout_title: string; rating: number; comment: string | null; created_at: string; reviewer: string }
interface CancelDb { refunded?: number; total?: number; waitlist?: number }

export interface WorkoutStat { workoutId: string; booked: number; waitlisted: number; deposits: number }
export interface RosterRow { bookingId: string; name: string; bookedAt: string; deposit: number }
export interface TrainerReview { id: string; workout: string; rating: number; comment: string | null; createdAt: string; reviewer: string }
export interface NewWorkout {
  title: string; category: "Group Class" | "Personal Training"; startIso: string;
  duration: number; capacity: number; price: number; deposit: number; description: string;
}
export interface ProfileUpdate {
  title: string; biography: string; philosophy: string; expertise: string[]; certifications: string[]; photoUrl: string;
}

/** The trainer_id of the signed-in account, or null when the account is not a trainer
 *  (also null if the database update 0012 has not been applied yet). */
export async function fetchTrainerId(): Promise<number | null> {
  const { data, error } = await db.rpc("current_trainer_id");
  return error || data == null ? null : Number(data);
}

export const trainerIdQuery = (email?: string) => queryOptions({
  queryKey: ["trainer-me", email ?? ""],
  queryFn: fetchTrainerId,
  staleTime: 5 * 60_000,
});

/** null = not a trainer (or still loading). */
export function useTrainerId() {
  const g = useGym();
  const q = useQuery({ ...trainerIdQuery(g?.email), enabled: !!g });
  return { trainerId: q.data ?? null, isPending: !g || q.isPending };
}

export const trainerStatsQuery = (trainerId: number) => queryOptions({
  queryKey: ["trainer-stats", trainerId],
  queryFn: async (): Promise<WorkoutStat[]> => {
    const { data, error } = await db.rpc("trainer_workout_stats");
    if (error) throw new Error(error.message);
    return ((data ?? []) as StatDb[]).map((r) => ({
      workoutId: String(r.workout_id), booked: Number(r.booked), waitlisted: Number(r.waitlisted), deposits: Number(r.deposits),
    }));
  },
  staleTime: 15_000,
});

export const rosterQuery = (workoutId: string) => queryOptions({
  queryKey: ["trainer-roster", workoutId],
  queryFn: async (): Promise<RosterRow[]> => {
    const { data, error } = await db.rpc("trainer_roster", { p_workout_id: Number(workoutId) });
    if (error) throw new Error(error.message);
    return ((data ?? []) as RosterDb[]).map((r) => ({
      bookingId: String(r.booking_id), name: String(r.member_name), bookedAt: String(r.booked_at), deposit: Number(r.deposit_paid),
    }));
  },
  staleTime: 15_000,
});

export const trainerReviewsQuery = (trainerId: number) => queryOptions({
  queryKey: ["trainer-reviews", trainerId],
  queryFn: async (): Promise<TrainerReview[]> => {
    const { data, error } = await db.rpc("trainer_reviews");
    if (error) throw new Error(error.message);
    return ((data ?? []) as ReviewDb[]).map((r) => ({
      id: String(r.review_id), workout: String(r.workout_title), rating: Number(r.rating),
      comment: r.comment ?? null, createdAt: String(r.created_at), reviewer: String(r.reviewer),
    }));
  },
  staleTime: 30_000,
});

export async function createTrainerWorkout(w: NewWorkout) {
  const { error } = await db.rpc("trainer_create_workout", {
    p_title: w.title, p_category: w.category, p_start: w.startIso, p_duration: w.duration,
    p_capacity: w.capacity, p_price: w.price, p_deposit: w.deposit, p_description: w.description || null,
  });
  if (error) throw new Error(error.message);
  await refreshGym(); // so the new class shows up everywhere (workouts page, your public profile)
}

export interface CancelResult { refunded: number; total: number; waitlist: number }

/** Cancels one of the trainer's own workouts. The database refunds every booking, clears the waitlist
 *  and writes a message for each affected member, all in one step (or not at all). */
export async function cancelTrainerWorkout(workoutId: string, reason: string): Promise<CancelResult> {
  const { data, error } = await db.rpc("trainer_cancel_workout", { p_workout_id: Number(workoutId), p_reason: reason || null });
  if (error) throw new Error(error.message);
  await refreshGym(); // the class disappears from the lists
  const r = (data ?? {}) as CancelDb;
  return { refunded: Number(r.refunded ?? 0), total: Number(r.total ?? 0), waitlist: Number(r.waitlist ?? 0) };
}

/** The rules for rescheduling (the database enforces them too; these only drive the form). */
export const RESCHEDULE_MIN_NOTICE_HOURS = 48;
export const RESCHEDULE_MAX_DAYS = 7;

export interface RescheduleResult { notified: number; waitlist: number }

const pad = (n: number) => String(n).padStart(2, "0");
/** Value for an <input type="datetime-local"> in the browser's own time zone. */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The days a class may move to: from the next day up to 7 days after the current day (whole days). */
export function rescheduleWindow(startIso: string) {
  const start = new Date(startIso);
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0);
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + RESCHEDULE_MAX_DAYS, 23, 59);
  return { min: toLocalInput(first), max: toLocalInput(last), first, last };
}

/** True while there is still enough notice (48 hours) to reschedule. */
export const canReschedule = (startIso: string) =>
  new Date(startIso).getTime() - Date.now() >= RESCHEDULE_MIN_NOTICE_HOURS * 3600_000;

/** Moves one of the trainer's own workouts. Everyone booked keeps their spot for now and gets a message
 *  asking whether they want the new time or their deposit back; waitlisted people are removed and told. */
export async function rescheduleTrainerWorkout(workoutId: string, newStartIso: string, reason: string): Promise<RescheduleResult> {
  const { data, error } = await db.rpc("trainer_reschedule_workout", {
    p_workout_id: Number(workoutId), p_new_start: newStartIso, p_reason: reason || null,
  });
  if (error) throw new Error(error.message);
  await refreshGym(); // the class shows its new time everywhere
  const r = (data ?? {}) as { notified?: number; waitlist?: number };
  return { notified: Number(r.notified ?? 0), waitlist: Number(r.waitlist ?? 0) };
}

export async function updateTrainerProfile(p: ProfileUpdate) {
  const { error } = await db.rpc("trainer_update_profile", {
    p_professional_title: p.title, p_biography: p.biography, p_philosophy: p.philosophy,
    p_expertise: p.expertise, p_certifications: p.certifications, p_photo_url: p.photoUrl,
  });
  if (error) throw new Error(error.message);
}