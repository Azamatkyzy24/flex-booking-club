import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/gym/format";
import { TrainerPortrait } from "@/components/gym/TrainerLink";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { trainersQuery, trainerPath, catalogHead } from "@/lib/catalog";

export const Route = createFileRoute("/trainers/")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(trainersQuery),
  head: () => catalogHead("Trainers", "Meet GymFlow’s coaches and explore their workout schedules."),
  component: Trainers,
  errorComponent: CatalogError,
  notFoundComponent: CatalogNotFound,
});

function Trainers() {
  const { data: trainers } = useSuspenseQuery(trainersQuery);
  return <Page title="Trainers">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trainers.map((t) => <article key={t.trainer_id} className="flex flex-col items-start rounded-2xl border border-border bg-card p-6">
        <TrainerPortrait trainer={t} />
        <h2 className="mt-4 text-xl font-bold"><Link to="/trainers/$slug" params={{ slug: trainerPath(t.trainer_id, t.slug) }} className="hover:text-primary">{t.full_name}</Link></h2>
        <p className="mt-1 text-sm text-primary">{t.specialty}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t.experience_years} years of experience{t.is_demo_profile ? " · Demo profile" : ""}</p>
        <Button asChild variant="outline" className="mt-5"><Link to="/trainers/$slug" params={{ slug: trainerPath(t.trainer_id, t.slug) }}>View Profile</Link></Button>
      </article>)}
    </div>
    {trainers.length === 0 && <p className="text-muted-foreground">No trainers available.</p>}
  </Page>;
}