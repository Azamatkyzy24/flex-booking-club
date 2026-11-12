import { Link } from "@tanstack/react-router";
import { trainerPath, type Trainer } from "@/lib/catalog";
import type { Session } from "@/lib/gym";

export function TrainerLink({ session }: { session: Session }) {
  return <Link to="/trainers/$slug" params={{ slug: trainerPath(session.trainerId ?? session.trainer.toLowerCase().replace(/[^a-z0-9]+/g, "-"), session.trainerSlug) }}
    className="transition-colors hover:text-primary hover:underline focus-visible:text-primary">{session.trainer}</Link>;
}

export function TrainerPortrait({ trainer, large = false }: { trainer: Trainer; large?: boolean }) {
  const size = large ? "h-32 w-32 text-4xl" : "h-20 w-20 text-2xl";
  return trainer.photo_url
    ? <img src={trainer.photo_url} alt={trainer.full_name} className={`${size} shrink-0 rounded-full object-cover`} />
    : <div role="img" aria-label={`${trainer.full_name} initials portrait`} className={`${size} flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-display font-bold text-primary`}>
      {trainer.full_name.split(" ").map((n) => n[0]).join("")}
    </div>;
}