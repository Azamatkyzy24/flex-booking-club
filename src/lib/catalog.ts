import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CourseReview } from "./gym";

export type Trainer = Database["public"]["Tables"]["trainers"]["Row"];
export type Announcement = Database["public"]["Tables"]["announcements"]["Row"];
export const newsCategories = ["Gym Updates", "Workout Cancellations", "Upcoming Events", "Special Offers"] as const;
export type NewsCategory = typeof newsCategories[number];

export const trainerPath = (id: number | string, slug?: string | null) => slug || String(id);
export function filterNews(items: Announcement[], category?: NewsCategory) {
  return items.filter((a) => !category || a.category === category)
    .sort((a, b) => b.publication_date.localeCompare(a.publication_date));
}
export const latestImportant = (items: Announcement[]) => filterNews(items).find((a) => a.is_important);

export const trainersQuery = queryOptions({
  queryKey: ["trainers"],
  queryFn: async () => {
    const { data, error } = await supabase.from("trainers").select("*").order("full_name");
    if (error) throw error;
    return data;
  },
});
export const newsQuery = queryOptions({
  queryKey: ["announcements"],
  queryFn: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return [];
    const result = await supabase.from("announcements").select("*")
      .eq("is_published", true).lte("publication_date", new Date().toISOString())
      .order("publication_date", { ascending: false });
    if (result.error) throw result.error;
    return result.data;
  },
  staleTime: 30_000,
});

/** Latest reviews of a course (same title and trainer), written by any member. */
export const courseReviewsQuery = (workoutId: string) => queryOptions({
  queryKey: ["course-reviews", workoutId],
  queryFn: async (): Promise<CourseReview[]> => {
    const { data, error } = await supabase.rpc("workout_reviews", { p_workout_id: Number(workoutId) });
    if (error) throw error;
    return data.map((r) => ({ id: String(r.review_id), rating: r.rating, comment: r.comment, createdAt: r.created_at, reviewer: r.reviewer }));
  },
  staleTime: 30_000,
});

export const catalogHead = (title: string, description: string) => ({ meta: [
  { title: `${title} — GymFlow` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} — GymFlow` },
  { property: "og:description", content: description },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" },
] });