import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page, fmtDate } from "@/components/gym/format";
import { RatingValue } from "@/components/gym/Stars";
import { TrainerPortrait } from "@/components/gym/TrainerLink";
import { specialtyIcon, upcomingOf, ratingOf } from "@/components/gym/trainer-ui";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { trainersQuery, trainerPath, catalogHead } from "@/lib/catalog";
import { useGym } from "@/lib/store";

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
  const g = useGym(); // may be null while loading: cards then simply hide rating / next workout
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("All");

  const tags = ["All", ...new Set(trainers.flatMap((t) => t.expertise ?? []))];
  const q = query.trim().toLowerCase();
  const shown = trainers.filter((t) =>
    (tag === "All" || t.expertise?.includes(tag)) &&
    (!q || [t.full_name, t.specialty, t.professional_title].some((v) => v?.toLowerCase().includes(q))));

  return <Page title="Trainers">
    <p className="-mt-3 mb-6 max-w-2xl text-muted-foreground">Find the coach who fits your goals, then book straight from their schedule.</p>

    <div className="mb-6 space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or specialty" aria-label="Search trainers" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by expertise">
        {tags.map((x) => <Button key={x} size="sm" variant={tag === x ? "default" : "outline"} aria-pressed={tag === x}
          onClick={() => setTag(x)} className="rounded-full">{x}</Button>)}
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((t) => {
        const Icon = specialtyIcon(t.specialty);
        const rating = g ? ratingOf(g.sessions, t.trainer_id) : null;
        const next = g ? upcomingOf(g.sessions, t.trainer_id)[0] : undefined;
        return <article key={t.trainer_id} className="group relative flex flex-col items-start overflow-hidden rounded-2xl border border-border bg-card p-6 transition duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative flex w-full items-start justify-between">
            <TrainerPortrait trainer={t} />
            <span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
          </div>
          <h2 className="mt-4 text-xl font-bold"><Link to="/trainers/$slug" params={{ slug: trainerPath(t.trainer_id, t.slug) }} className="hover:text-primary">{t.full_name}</Link></h2>
          <p className="text-sm text-muted-foreground">{t.professional_title}</p>
          <p className="mt-1 text-sm text-primary">{t.specialty}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {rating ? <RatingValue rating={rating.rating} count={rating.count} /> : <span>New coach</span>}
            <span>{t.experience_years} yrs experience</span>
          </div>
          {next
            ? <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><Clock className="h-3.5 w-3.5" aria-hidden />Next: {fmtDate(next.start)}</p>
            : g && <p className="mt-3 text-xs text-muted-foreground">No upcoming workouts</p>}
          <Button asChild variant="outline" className="mt-5"><Link to="/trainers/$slug" params={{ slug: trainerPath(t.trainer_id, t.slug) }}>View Profile</Link></Button>
        </article>;
      })}
    </div>

    {trainers.length === 0 && <p className="text-muted-foreground">No trainers available.</p>}
    {trainers.length > 0 && shown.length === 0 && <div className="rounded-2xl border border-dashed border-border py-12 text-center">
      <p className="font-bold">No trainers match your search</p>
      <Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setTag("All"); }}>Clear filters</Button>
    </div>}
  </Page>;
}
