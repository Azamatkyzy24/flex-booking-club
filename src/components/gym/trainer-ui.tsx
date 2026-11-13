import type { ReactNode } from "react";
import { Activity, Bike, Dumbbell, Flower2, Swords, Zap, type LucideIcon } from "lucide-react";
import type { Session } from "@/lib/gym";

/** Picks an icon that matches the trainer's specialty. */
export function specialtyIcon(specialty?: string | null): LucideIcon {
  const s = (specialty ?? "").toLowerCase();
  if (s.includes("cycl")) return Bike;
  if (s.includes("yoga") || s.includes("pilates")) return Flower2;
  if (s.includes("box")) return Swords;
  if (s.includes("strength") || s.includes("conditioning")) return Dumbbell;
  if (s.includes("mobil") || s.includes("recover")) return Activity;
  return Zap;
}

/** Future workouts of one trainer, earliest first. */
export const upcomingOf = (sessions: Session[], trainerId: number) =>
  sessions
    .filter((s) => s.trainerId === trainerId && !s.cancelled && new Date(s.start).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));

/** Average rating over all of the trainer's reviewed courses (each course counted once). */
export function ratingOf(sessions: Session[], trainerId: number) {
  const courses = new Map<string, Session>();
  for (const s of sessions) {
    if (s.trainerId === trainerId && s.rating != null && (s.reviewCount ?? 0) > 0) courses.set(s.name, s);
  }
  let total = 0;
  let count = 0;
  for (const s of courses.values()) {
    total += (s.rating as number) * (s.reviewCount as number);
    count += s.reviewCount as number;
  }
  return count ? { rating: total / count, count } : null;
}

export function StatCard({ icon: Icon, value, label }: { icon: LucideIcon; value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-4">
      <Icon className="h-5 w-5 text-primary" aria-hidden />
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
