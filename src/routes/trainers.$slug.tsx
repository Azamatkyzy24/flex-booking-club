import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Award, BadgeCheck, CalendarDays, CalendarX, Clock, Dumbbell, Quote, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/components/gym/format";
import { SessionCard } from "@/components/gym/SessionCard";
import { CourseReviews } from "@/components/gym/CourseReviews";
import { RatingValue } from "@/components/gym/Stars";
import { TrainerPortrait } from "@/components/gym/TrainerLink";
import { StatCard, specialtyIcon, upcomingOf, ratingOf } from "@/components/gym/trainer-ui";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { trainersQuery, trainerPath, catalogHead } from "@/lib/catalog";
import { spotsLeft, type Session } from "@/lib/gym";
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

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

function ProfileSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-12">
      <Skeleton className="h-64 w-full rounded-3xl" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="mt-8 h-48 w-full rounded-2xl" />
    </main>
  );
}

function TrainerProfile() {
  const { slug } = Route.useParams();
  const { data: trainers } = useSuspenseQuery(trainersQuery);
  const g = useGym();
  const [filter, setFilter] = useState("All"); // hooks must stay above the early returns
  const t = trainers.find((x) => trainerPath(x.trainer_id, x.slug) === slug || String(x.trainer_id) === slug);
  if (!t) return <CatalogNotFound />;
  if (!g) return <ProfileSkeleton />;

  const sessions = upcomingOf(g.sessions, t.trainer_id);
  const next = sessions[0];
  const types = [...new Set(g.sessions.filter((s) => s.trainerId === t.trainer_id).map((s) => s.type))];
  const rating = ratingOf(g.sessions, t.trainer_id);
  const SpecialtyIcon = specialtyIcon(t.specialty);
  const firstName = t.full_name.split(" ")[0];

  // Workout filter chips + grouping by day
  const filters = ["All", ...new Set(sessions.map((s) => s.type))];
  const shown = filter === "All" ? sessions : sessions.filter((s) => s.type === filter);
  const days = new Map<string, Session[]>();
  for (const s of shown) {
    const k = dayLabel(s.start);
    days.set(k, [...(days.get(k) ?? []), s]);
  }

  // Ratings per course (each course once) + reviews of the most reviewed one
  const rated = [...new Map(g.sessions
    .filter((s) => s.trainerId === t.trainer_id && s.rating != null)
    .map((s) => [s.name, s])).values()];
  const topCourse = [...rated].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0];

  const others = trainers.filter((x) => x.trainer_id !== t.trainer_id).slice(0, 3);

  return <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-12">
    <Button asChild variant="ghost" className="mb-4"><Link to="/trainers"><ArrowLeft className="h-4 w-4" aria-hidden /> All trainers</Link></Button>

    {/* Hero */}
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-10">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
        <TrainerPortrait trainer={t} large />
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-5xl">{t.full_name}</h1>
          <p className="mt-2 text-lg font-semibold text-primary">{t.professional_title}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Badge className="gap-1.5 px-3 py-1"><SpecialtyIcon className="h-4 w-4" aria-hidden />{t.specialty}</Badge>
            {rating && <RatingValue rating={rating.rating} count={rating.count} />}
            {t.is_demo_profile && <Badge variant="secondary">Demo profile · qualifications unverified</Badge>}
          </div>
        </div>
      </div>
    </section>

    {/* Stats */}
    <section aria-label="Trainer stats" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={Award} value={`${t.experience_years ?? 0}+`} label="Years of experience" />
      <StatCard icon={CalendarDays} value={sessions.length} label="Upcoming workouts" />
      <StatCard icon={Star} value={rating ? rating.rating.toFixed(1) : "New"} label={rating ? `${rating.count} member review${rating.count === 1 ? "" : "s"}` : "No reviews yet"} />
      <StatCard icon={Dumbbell} value={types.length} label="Workout types" />
    </section>

    {/* Next workout */}
    {next && <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-primary/40 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Next workout</p>
        <p className="mt-1 text-lg font-bold">{next.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden />{fmtDate(next.start)}</span>
          <span>{Math.max(0, spotsLeft(next))} spots left</span>
        </p>
      </div>
      <Button asChild><Link to="/book/$id" params={{ id: next.id }}>{spotsLeft(next) > 0 ? "Book now" : "View details"} <ArrowRight className="h-4 w-4" aria-hidden /></Link></Button>
    </section>}

    {/* About + experience */}
    <div className="grid gap-8 py-8 md:grid-cols-2">
      <section>
        <h2 className="text-xl font-bold">About {firstName}</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">{t.biography}</p>
        {t.philosophy && <blockquote className="mt-6 border-l-4 border-primary pl-4">
          <Quote className="mb-2 h-5 w-5 text-primary" aria-hidden />
          <p className="font-display text-lg italic leading-snug">“{t.philosophy}”</p>
        </blockquote>}
      </section>
      <section>
        <h2 className="text-xl font-bold">Professional experience</h2>
        <h3 className="mt-3 font-semibold">Areas of expertise</h3>
        <div className="mt-2 flex flex-wrap gap-2">{t.expertise?.map((e) => <Badge key={e} variant="secondary" className="px-3 py-1 text-sm">{e}</Badge>)}</div>
        <h3 className="mt-5 font-semibold">Certifications & qualifications</h3>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {t.certifications?.map((c) => <li key={c} className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{c}</li>)}
        </ul>
        <h3 className="mt-5 font-semibold">Workout types</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {types.length ? types.map((x) => <Badge key={x} variant="outline">{x}</Badge>) : <p className="text-sm text-muted-foreground">Schedule coming soon</p>}
        </div>
      </section>
    </div>

    {/* Upcoming workouts */}
    <section className="border-t border-border pt-8" aria-labelledby="upcoming-heading">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="upcoming-heading" className="text-xl font-bold">Upcoming workouts</h2>
        {filters.length > 2 && <div className="flex flex-wrap gap-2" role="group" aria-label="Filter workouts by type">
          {filters.map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} aria-pressed={filter === f}
            onClick={() => setFilter(f)} className="rounded-full">{f}</Button>)}
        </div>}
      </div>
      {shown.length ? <div className="space-y-8">
        {[...days.entries()].map(([day, list]) => <div key={day}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">{day}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => <SessionCard key={s.id} s={s} bookLabel="Book Workout"
              booked={g.bookings.some((b) => b.sessionId === s.id && !b.cancelled)} waitlisted={g.waitlist?.includes(s.id) ?? false} />)}
          </div>
        </div>)}
      </div> : <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <CalendarX className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-bold">No upcoming workouts{filter !== "All" ? ` for ${filter}` : ""}</p>
        <p className="mt-1 text-sm text-muted-foreground">{firstName} hasn’t scheduled anything here yet. Check back soon or browse other workouts.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/workouts">Browse all workouts</Link></Button>
      </div>}
    </section>

    {/* Member ratings */}
    {topCourse && <section className="mt-10 border-t border-border pt-8" aria-labelledby="ratings-heading">
      <h2 id="ratings-heading" className="text-xl font-bold">Member ratings</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rated.map((s) => <li key={s.name} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
          <span>{s.name}</span><RatingValue rating={s.rating as number} count={s.reviewCount ?? 0} />
        </li>)}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">Latest reviews for {topCourse.name}</p>
      <CourseReviews workoutId={topCourse.id} />
    </section>}

    {/* Other trainers */}
    {others.length > 0 && <section className="mt-10 border-t border-border pt-8" aria-labelledby="others-heading">
      <h2 id="others-heading" className="mb-4 text-xl font-bold">Meet other coaches</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {others.map((o) => <Link key={o.trainer_id} to="/trainers/$slug" params={{ slug: trainerPath(o.trainer_id, o.slug) }}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50">
          <TrainerPortrait trainer={o} />
          <div><p className="font-bold group-hover:text-primary">{o.full_name}</p><p className="text-sm text-muted-foreground">{o.specialty}</p></div>
        </Link>)}
      </div>
    </section>}
  </main>;
}
