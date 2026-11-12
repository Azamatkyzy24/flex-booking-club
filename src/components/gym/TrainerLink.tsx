import { Link } from "@tanstack/react-router";
import { trainerPath, type Trainer } from "@/lib/catalog";
import type { Session } from "@/lib/gym";

export function TrainerLink({ session }: { session: Session }) {
  return <Link to="/trainers/$slug" params={{ slug: trainerPath(session.trainerId ?? session.trainer.toLowerCase().replace(/[^a-z0-9]+/g, "-"), session.trainerSlug) }}
    className="transition-colors hover:text-primary hover:underline focus-visible:text-primary">{session.trainer}</Link>;
}

export function TrainerPortrait({ trainer, large = false }: { trainer: Trainer; large?: boolean }) {
  const size = large ? "h-32 w-32 text-5xl sm:h-40 sm:w-40" : "h-20 w-20 text-2xl";
  const ring = "ring-4 ring-primary/30";
  if (trainer.photo_url) {
    return <img src={trainer.photo_url} alt={trainer.full_name} className={`${size} ${ring} shrink-0 rounded-full object-cover`} />;
  }
  // No photo yet: gradient avatar, a slightly different shade for every trainer.
  const hue = 200 + ((trainer.trainer_id * 47) % 120);
  const initials = trainer.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <div role="img" aria-label={`${trainer.full_name} initials portrait`}
      style={{ backgroundImage: `linear-gradient(135deg, oklch(0.89 0.21 128), oklch(0.62 0.16 ${hue}))` }}
      className={`${size} ${ring} flex shrink-0 items-center justify-center rounded-full font-display font-bold text-primary-foreground`}>
      {initials}
    </div>
  );
}
