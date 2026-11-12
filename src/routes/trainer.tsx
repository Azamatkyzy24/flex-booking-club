import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, ChevronUp, Clock, ExternalLink, ListChecks, Plus, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, Page, fmtDate } from "@/components/gym/format";
import { RatingValue, StarsStatic } from "@/components/gym/Stars";
import { TrainerPortrait } from "@/components/gym/TrainerLink";
import { StatCard, ratingOf } from "@/components/gym/trainer-ui";
import { trainersQuery, trainerPath, type Trainer } from "@/lib/catalog";
import { money, spotsLeft, type Session } from "@/lib/gym";
import { useGym } from "@/lib/store";
import {
  createTrainerWorkout, rosterQuery, trainerReviewsQuery, trainerStatsQuery, updateTrainerProfile,
  useTrainerId, type WorkoutStat,
} from "@/lib/trainer";

export const Route = createFileRoute("/trainer")({
  head: () => ({ meta: [{ title: "Trainer dashboard — GymFlow" }] }),
  component: TrainerPage,
});

const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";
const TABS = ["Overview", "Schedule", "Reviews", "Profile"] as const;
type Tab = typeof TABS[number];

function TrainerPage() {
  const { trainerId, isPending } = useTrainerId();
  if (isPending) return <Loading />;
  if (trainerId === null) {
    return <Page title="Trainer dashboard">
      <p className="text-muted-foreground">Access denied. This page is for trainer accounts only.</p>
    </Page>;
  }
  return <Dashboard trainerId={trainerId} />;
}

function Dashboard({ trainerId }: { trainerId: number }) {
  const g = useGym();
  const { data: trainers } = useSuspenseQuery(trainersQuery);
  const stats = useQuery(trainerStatsQuery(trainerId));
  const [tab, setTab] = useState<Tab>("Overview");
  const t = trainers.find((x) => x.trainer_id === trainerId);
  if (!g || !t) return <Loading />;

  const now = Date.now();
  const mine = g.sessions.filter((s) => s.trainerId === trainerId);
  const upcoming = mine.filter((s) => new Date(s.start).getTime() > now).sort((a, b) => a.start.localeCompare(b.start));
  const past = mine.filter((s) => new Date(s.start).getTime() <= now).sort((a, b) => b.start.localeCompare(a.start));
  const statOf = (id: string) => stats.data?.find((x) => x.workoutId === id);
  const rating = ratingOf(g.sessions, trainerId);
  const booked = upcoming.reduce((n, s) => n + (statOf(s.id)?.booked ?? s.booked), 0);
  const waiting = upcoming.reduce((n, s) => n + (statOf(s.id)?.waitlisted ?? 0), 0);
  const firstName = t.full_name.split(" ")[0];

  return <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-12">
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <TrainerPortrait trainer={t} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary">Trainer dashboard</p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Welcome back, {firstName}</h1>
          <p className="mt-1 text-muted-foreground">{t.professional_title ?? t.specialty}</p>
        </div>
        <Button asChild variant="outline"><Link to="/trainers/$slug" params={{ slug: trainerPath(t.trainer_id, t.slug) }}>
          View public profile <ExternalLink className="h-4 w-4" aria-hidden /></Link></Button>
      </div>
    </section>

    <div role="tablist" aria-label="Trainer sections" className="mt-6 flex flex-wrap gap-2">
      {TABS.map((x) => <Button key={x} role="tab" aria-selected={tab === x} size="sm" variant={tab === x ? "default" : "outline"}
        className="rounded-full" onClick={() => setTab(x)}>{x}</Button>)}
    </div>

    <div className="mt-6">
      {tab === "Overview" && <Overview upcoming={upcoming} statOf={statOf} booked={booked} waiting={waiting}
        rating={rating} statsError={stats.isError} />}
      {tab === "Schedule" && <Schedule upcoming={upcoming} past={past} statOf={statOf} trainerId={trainerId} />}
      {tab === "Reviews" && <Reviews trainerId={trainerId} rating={rating} />}
      {tab === "Profile" && <ProfileForm key={t.trainer_id} trainer={t} />}
    </div>
  </main>;
}

/* ---------- Overview ---------- */
function Overview({ upcoming, statOf, booked, waiting, rating, statsError }: {
  upcoming: Session[]; statOf: (id: string) => WorkoutStat | undefined; booked: number; waiting: number;
  rating: { rating: number; count: number } | null; statsError: boolean;
}) {
  const next = upcoming[0];
  const today = upcoming.filter((s) => new Date(s.start).toDateString() === new Date().toDateString());
  return <div className="space-y-8">
    <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={CalendarDays} value={upcoming.length} label="Upcoming workouts" />
      <StatCard icon={Users} value={booked} label="Members booked" />
      <StatCard icon={ListChecks} value={waiting} label="On waitlists" />
      <StatCard icon={Star} value={rating ? rating.rating.toFixed(1) : "New"} label={rating ? `${rating.count} review${rating.count === 1 ? "" : "s"}` : "No reviews yet"} />
    </section>
    {statsError && <p className="text-sm text-destructive">Could not load booking numbers. Has the 0012 database update been run?</p>}

    {next ? <section className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Next workout</p>
      <h2 className="mt-1 text-xl font-bold">{next.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-4 w-4" aria-hidden />{fmtDate(next.start)} · {next.duration} min</p>
      <ClassRow s={next} stat={statOf(next.id)} defaultOpen bare />
    </section> : <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="font-bold">No upcoming workouts</p>
      <p className="mt-1 text-sm text-muted-foreground">Open the Schedule tab to add your next class.</p>
    </div>}

    <section>
      <h2 className="mb-3 text-xl font-bold">Today</h2>
      {today.length ? <div className="space-y-3">{today.map((s) => <ClassRow key={s.id} s={s} stat={statOf(s.id)} />)}</div>
        : <p className="text-muted-foreground">Nothing scheduled for today.</p>}
    </section>
  </div>;
}

/* ---------- Schedule ---------- */
function Schedule({ upcoming, past, statOf, trainerId }: {
  upcoming: Session[]; past: Session[]; statOf: (id: string) => WorkoutStat | undefined; trainerId: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showPast, setShowPast] = useState(false);
  return <div className="space-y-8">
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Upcoming workouts</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}><Plus className="h-4 w-4" aria-hidden /> New workout</Button>
      </div>
      {showForm && <NewWorkoutForm trainerId={trainerId} onDone={() => setShowForm(false)} />}
      {upcoming.length ? <div className="space-y-3">{upcoming.map((s) => <ClassRow key={s.id} s={s} stat={statOf(s.id)} />)}</div>
        : <p className="text-muted-foreground">No upcoming workouts yet.</p>}
    </section>
    {past.length > 0 && <section>
      <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
        Past workouts ({past.length}) {showPast ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
      </Button>
      {showPast && <div className="mt-3 space-y-3">{past.slice(0, 15).map((s) => <ClassRow key={s.id} s={s} stat={statOf(s.id)} />)}</div>}
    </section>}
  </div>;
}

function ClassRow({ s, stat, defaultOpen = false, bare = false }: { s: Session; stat?: WorkoutStat; defaultOpen?: boolean; bare?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const booked = stat?.booked ?? s.booked;
  const pct = Math.min(100, Math.round((booked / Math.max(1, s.capacity)) * 100));
  const body = <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {!bare && <><p className="font-bold">{s.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{fmtDate(s.start)} · {s.duration} min</p></>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={s.type === "Group Class" ? "secondary" : "default"}>{s.type}</Badge>
        {(stat?.waitlisted ?? 0) > 0 && <Badge variant="outline">{stat?.waitlisted} waiting</Badge>}
        {spotsLeft(s) <= 0 && <Badge variant="destructive">Full</Badge>}
      </div>
    </div>
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{booked} / {s.capacity} booked</span>
        {stat && <span>{money(stat.deposits)} in deposits</span>}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Class fill">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
    <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      {open ? "Hide" : "Show"} attendees {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
    </Button>
    {open && <Roster workoutId={s.id} />}
  </>;
  return bare ? <div className="mt-2">{body}</div> : <div className="rounded-2xl border border-border bg-card p-4">{body}</div>;
}

function Roster({ workoutId }: { workoutId: string }) {
  const { data, isPending, isError } = useQuery(rosterQuery(workoutId));
  if (isPending) return <p className="text-sm text-muted-foreground">Loading attendees…</p>;
  if (isError) return <p className="text-sm text-muted-foreground">Attendees are not available right now.</p>;
  if (!data.length) return <p className="text-sm text-muted-foreground">Nobody has booked yet.</p>;
  return <ul className="divide-y divide-border rounded-xl border border-border bg-background/40">
    {data.map((r, i) => <li key={r.bookingId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span><span className="mr-2 text-muted-foreground">{i + 1}.</span>{r.name}</span>
      <span className="text-xs text-muted-foreground">booked {fmtDate(r.bookedAt)}</span>
    </li>)}
  </ul>;
}

function NewWorkoutForm({ trainerId, onDone }: { trainerId: number; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", category: "Group Class" as "Group Class" | "Personal Training", start: "",
    duration: "60", capacity: "12", price: "15", deposit: "5", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.start) { toast.error("Pick a start date and time."); return; }
    setBusy(true);
    try {
      await createTrainerWorkout({
        title: f.title, category: f.category, startIso: new Date(f.start).toISOString(), duration: Number(f.duration),
        capacity: Number(f.capacity), price: Number(f.price), deposit: Number(f.deposit), description: f.description,
      });
      await qc.invalidateQueries({ queryKey: ["trainer-stats", trainerId] });
      toast.success("Workout scheduled.");
      onDone();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  };

  return <form onSubmit={submit} className="mb-5 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
    <Field label="Title" id="w-title"><input id="w-title" className={inputCls} value={f.title} onChange={set("title")} placeholder="Morning HIIT" required /></Field>
    <Field label="Type" id="w-cat"><select id="w-cat" className={inputCls} value={f.category} onChange={set("category")}>
      <option>Group Class</option><option>Personal Training</option></select></Field>
    <Field label="Start" id="w-start"><input id="w-start" type="datetime-local" className={inputCls} value={f.start} onChange={set("start")} required /></Field>
    <Field label="Duration (minutes)" id="w-dur"><input id="w-dur" type="number" min={15} max={240} className={inputCls} value={f.duration} onChange={set("duration")} /></Field>
    <Field label="Capacity" id="w-cap"><input id="w-cap" type="number" min={1} max={50} className={inputCls} value={f.capacity} onChange={set("capacity")} /></Field>
    <Field label="Price ($)" id="w-price"><input id="w-price" type="number" min={1} step="0.5" className={inputCls} value={f.price} onChange={set("price")} /></Field>
    <Field label="Deposit ($)" id="w-dep"><input id="w-dep" type="number" min={0} step="0.5" className={inputCls} value={f.deposit} onChange={set("deposit")} /></Field>
    <Field label="Description (optional)" id="w-desc" wide><textarea id="w-desc" rows={2} maxLength={500} className={inputCls} value={f.description} onChange={set("description")} /></Field>
    <div className="flex gap-2 sm:col-span-2">
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Schedule workout"}</Button>
      <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
    </div>
  </form>;
}

function Field({ label, id, wide, children }: { label: string; id: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={wide ? "sm:col-span-2" : ""}><label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>{children}</div>;
}

/* ---------- Reviews ---------- */
function Reviews({ trainerId, rating }: { trainerId: number; rating: { rating: number; count: number } | null }) {
  const { data, isPending, isError } = useQuery(trainerReviewsQuery(trainerId));
  return <section>
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-xl font-bold">What members say</h2>
      {rating && <RatingValue rating={rating.rating} count={rating.count} />}
    </div>
    {isPending ? <p className="text-muted-foreground">Loading reviews…</p>
      : isError ? <p className="text-muted-foreground">Reviews are not available right now.</p>
      : data.length === 0 ? <p className="text-muted-foreground">No reviews yet. They appear after members finish your classes.</p>
      : <ul className="grid gap-3 md:grid-cols-2">{data.map((r) => <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2"><StarsStatic value={r.rating} />
          <span className="text-xs text-muted-foreground">{r.reviewer} · {fmtDate(r.createdAt)}</span></div>
        <p className="mt-1 text-xs font-semibold text-primary">{r.workout}</p>
        {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
      </li>)}</ul>}
  </section>;
}

/* ---------- Profile ---------- */
function ProfileForm({ trainer }: { trainer: Trainer }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: trainer.professional_title ?? "", biography: trainer.biography ?? "", philosophy: trainer.philosophy ?? "",
    expertise: (trainer.expertise ?? []).join(", "), certifications: (trainer.certifications ?? []).join("\n"), photoUrl: trainer.photo_url ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateTrainerProfile({
        title: f.title, biography: f.biography, philosophy: f.philosophy, photoUrl: f.photoUrl,
        expertise: f.expertise.split(",").map((x) => x.trim()).filter(Boolean),
        certifications: f.certifications.split("\n").map((x) => x.trim()).filter(Boolean),
      });
      await qc.invalidateQueries({ queryKey: ["trainers"] });
      toast.success("Profile saved.");
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  };

  return <form onSubmit={save} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
    <p className="text-sm text-muted-foreground sm:col-span-2">This is what members see on your public profile.</p>
    <Field label="Professional title" id="p-title"><input id="p-title" className={inputCls} maxLength={80} value={f.title} onChange={set("title")} /></Field>
    <Field label="Photo link (https://… or /trainers/photo.svg)" id="p-photo"><input id="p-photo" className={inputCls} value={f.photoUrl} onChange={set("photoUrl")} /></Field>
    <Field label="About you" id="p-bio" wide><textarea id="p-bio" rows={4} maxLength={1000} className={inputCls} value={f.biography} onChange={set("biography")} /></Field>
    <Field label="Training philosophy" id="p-phil" wide><textarea id="p-phil" rows={2} maxLength={300} className={inputCls} value={f.philosophy} onChange={set("philosophy")} /></Field>
    <Field label="Areas of expertise (comma separated, up to 8)" id="p-exp"><input id="p-exp" className={inputCls} value={f.expertise} onChange={set("expertise")} /></Field>
    <Field label="Certifications (one per line, up to 8)" id="p-cert"><textarea id="p-cert" rows={3} className={inputCls} value={f.certifications} onChange={set("certifications")} /></Field>
    <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button></div>
  </form>;
}
