import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshGym, useGym } from "@/lib/store";

// The generated Supabase types don't know about the trainer_* functions yet (same as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

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
    return (data ?? []).map((r: Record<string, unknown>) => ({
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
    return (data ?? []).map((r: Record<string, unknown>) => ({
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
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.review_id), workout: String(r.workout_title), rating: Number(r.rating),
      comment: (r.comment as string | null) ?? null, createdAt: String(r.created_at), reviewer: String(r.reviewer),
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

export async function updateTrainerProfile(p: ProfileUpdate) {
  const { error } = await db.rpc("trainer_update_profile", {
    p_professional_title: p.title, p_biography: p.biography, p_philosophy: p.philosophy,
    p_expertise: p.expertise, p_certifications: p.certifications, p_photo_url: p.photoUrl,
  });
  if (error) throw new Error(error.message);
}