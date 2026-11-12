import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Page, Loading } from "@/components/gym/format";
import { SessionCard } from "@/components/gym/SessionCard";
import { TrainerPortrait } from "@/components/gym/TrainerLink";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { trainersQuery, trainerPath, catalogHead } from "@/lib/catalog";
import { useGym } from "@/lib/store";

export const Route = createFileRoute("/trainers/$slug")({
  ssr: false,
  loader: async ({ context, params }) => {
    const trainers = await context.queryClient.ensureQueryData(trainersQuery);
    const trainer = trainers.find((t) => trainerPath(t.trainer_id, t.slug) === params.slug || String(t.trainer_id) === params.slug);
    if (!trainer) throw notFound();
    return trainer;
  },
  head: ({ loaderData }) => catalogHead(loaderData?.full_name ?? "Trainer profile", "Explore your GymFlow trainer’s background and upcoming workouts."),
  component: TrainerProfile,
  errorComponent: CatalogError,
  notFoundComponent: CatalogNotFound,
});

function TrainerProfile() {
  const { slug } = Route.useParams();
  const { data: trainers } = useSuspenseQuery(trainersQuery);
  const g = useGym();
  const t = trainers.find((x) => trainerPath(x.trainer_id, x.slug) === slug || String(x.trainer_id) === slug);
  if (!t) return <CatalogNotFound />;
  if (!g) return <Loading />;
  const sessions = g.sessions.filter((s) => s.trainerId === t.trainer_id && new Date(s.start).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));
  const types = [...new Set(g.sessions.filter((s) => s.trainerId === t.trainer_id).map((s) => s.type))];
  return <Page title={t.full_name}>
    <Button asChild variant="ghost" className="mb-5"><Link to="/trainers">← All trainers</Link></Button>
    <section className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-center">
      <TrainerPortrait trainer={t} large />
      <div><p className="text-xl font-bold">{t.professional_title}</p><p className="mt-2 text-primary">{t.specialty}</p>
        <p className="mt-2 text-muted-foreground">{t.experience_years} years of professional experience</p>
        {t.is_demo_profile && <Badge variant="secondary" className="mt-3">Demo profile · qualifications unverified</Badge>}
      </div>
    </section>
    <div className="grid gap-8 py-8 md:grid-cols-2">
      <section><h2 className="text-xl font-bold">About {t.full_name.split(" ")[0]}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{t.biography}</p>
        <h3 className="mt-6 font-bold">Training philosophy</h3><p className="mt-2 text-muted-foreground">{t.philosophy}</p></section>
      <section><h2 className="text-xl font-bold">Professional experience</h2>
        <h3 className="mt-3 font-semibold">Areas of expertise</h3><div className="mt-2 flex flex-wrap gap-2">{t.expertise?.map((e) => <Badge key={e} variant="secondary">{e}</Badge>)}</div>
        <h3 className="mt-5 font-semibold">Certifications & qualifications</h3>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">{t.certifications?.map((c) => <li key={c}>{c}</li>)}</ul>
        <h3 className="mt-5 font-semibold">Workout types</h3><p className="mt-2 text-sm text-muted-foreground">{types.join(" · ") || "Schedule coming soon"}</p>
      </section>
    </div>
    <section className="border-t border-border pt-8"><h2 className="mb-4 text-xl font-bold">Upcoming workouts</h2>
      {sessions.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((s) => <SessionCard key={s.id} s={s} bookLabel="Book Workout"
        booked={g.bookings.some((b) => b.sessionId === s.id && !b.cancelled)} waitlisted={g.waitlist?.includes(s.id) ?? false} />)}</div>
        : <p className="text-muted-foreground">No upcoming workouts scheduled.</p>}
    </section>
  </Page>;
}