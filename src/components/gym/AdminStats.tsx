import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/components/gym/format";
import { supabase } from "@/integrations/supabase/client";

// The generated Supabase types are loose here (same approach as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type SessionStat = {
  id: number; title: string; trainer: string; category: string; start: string;
  price: number; deposit: number; capacity: number;
  booked: number; cancelled: number; fill: number; revenue: number;
};
type TrainerStat = {
  id: number; name: string; sessions: number; booked: number; capacity: number;
  fill: number; revenue: number; avgPrice: number;
};
type SortKey = "booked" | "price" | "fill" | "revenue";

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

// CSV that opens correctly in Excel (BOM for Cyrillic names, "sep=;" for RU/KZ regional settings)
function toCsv(rows: (string | number)[][]) {
  const cell = (c: string | number) => {
    const s = String(c ?? "");
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿sep=;\r\n" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminStats() {
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<Row[]>([]);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [trainers, setTrainers] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("booked");

  useEffect(() => {
    (async () => {
      const [w, b, t] = await Promise.all([
        db.from("workouts").select("*"),
        db.from("bookings").select("booking_id, workout_id, status, deposit_paid"),
        db.from("trainers").select("trainer_id, full_name"),
      ]);
      if (w.error) toast.error(w.error.message); else setWorkouts(w.data ?? []);
      if (b.error) toast.error(b.error.message); else setBookings(b.data ?? []);
      if (t.error) toast.error(t.error.message); else setTrainers(t.data ?? []);
      setLoading(false);
    })();
  }, []);

  // One row per session: how many people booked, fill rate, deposits collected
  const sessions = useMemo<SessionStat[]>(() => {
    const per = new Map<number, { booked: number; cancelled: number; revenue: number }>();
    for (const b of bookings) {
      const s = per.get(b.workout_id) ?? { booked: 0, cancelled: 0, revenue: 0 };
      if (b.status === "cancelled") s.cancelled += 1;
      else { s.booked += 1; s.revenue += Number(b.deposit_paid ?? 0); }
      per.set(b.workout_id, s);
    }
    const names = new Map<number, string>(trainers.map((t) => [t.trainer_id, t.full_name]));
    return workouts
      .filter((w) => !w.cancelled_at)
      .map((w) => {
        const s = per.get(w.workout_id) ?? { booked: 0, cancelled: 0, revenue: 0 };
        const capacity = Number(w.capacity ?? 0);
        return {
          id: w.workout_id,
          title: w.title ?? w.name ?? w.class_name ?? `Workout #${w.workout_id}`,
          trainer: names.get(w.trainer_id) ?? `Trainer ${w.trainer_id}`,
          category: w.category ?? "",
          start: w.start_time,
          price: Number(w.price ?? 0),
          deposit: Number(w.deposit_amount ?? 0),
          capacity,
          booked: s.booked,
          cancelled: s.cancelled,
          fill: capacity > 0 ? s.booked / capacity : 0,
          revenue: s.revenue,
        };
      });
  }, [workouts, bookings, trainers]);

  // One row per trainer, built from the session rows
  const trainerStats = useMemo<TrainerStat[]>(() => {
    const m = new Map<number, TrainerStat & { priceSum: number }>();
    for (const w of workouts.filter((x) => !x.cancelled_at)) {
      const s = sessions.find((x) => x.id === w.workout_id);
      if (!s) continue;
      const t = m.get(w.trainer_id) ?? {
        id: w.trainer_id, name: s.trainer, sessions: 0, booked: 0, capacity: 0,
        fill: 0, revenue: 0, avgPrice: 0, priceSum: 0,
      };
      t.sessions += 1;
      t.booked += s.booked;
      t.capacity += s.capacity;
      t.revenue += s.revenue;
      t.priceSum += s.price;
      m.set(w.trainer_id, t);
    }
    return [...m.values()]
      .map((t) => ({
        ...t,
        fill: t.capacity > 0 ? t.booked / t.capacity : 0,
        avgPrice: t.sessions > 0 ? t.priceSum / t.sessions : 0,
      }))
      .sort((a, b) => b.booked - a.booked);
  }, [workouts, sessions]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b[sortKey] - a[sortKey]),
    [sessions, sortKey],
  );

  const totalBooked = sessions.reduce((n, s) => n + s.booked, 0);
  const totalCancelled = sessions.reduce((n, s) => n + s.cancelled, 0);
  const totalRevenue = sessions.reduce((n, s) => n + s.revenue, 0);
  const totalCapacity = sessions.reduce((n, s) => n + s.capacity, 0);
  const avgFill = totalCapacity > 0 ? totalBooked / totalCapacity : 0;

  const topSession = [...sessions].sort((a, b) => b.booked - a.booked)[0];
  const priciest = [...sessions].sort((a, b) => b.price - a.price)[0];
  const topTrainer = trainerStats[0];
  const topEarner = [...trainerStats].sort((a, b) => b.revenue - a.revenue)[0];

  const stamp = new Date().toISOString().slice(0, 10);
  const downloadSessions = () =>
    download(
      `gymflow-sessions-report-${stamp}.csv`,
      toCsv([
        ["Session", "Trainer", "Type", "Start", "Price", "Deposit", "Capacity", "Booked", "Cancelled", "Fill rate", "Deposits collected"],
        ...sortedSessions.map((s) => [
          s.title, s.trainer, s.category, s.start ? new Date(s.start).toLocaleString() : "",
          s.price.toFixed(2), s.deposit.toFixed(2), s.capacity, s.booked, s.cancelled,
          pct(s.fill), s.revenue.toFixed(2),
        ]),
      ]),
    );
  const downloadTrainers = () =>
    download(
      `gymflow-trainers-report-${stamp}.csv`,
      toCsv([
        ["Trainer", "Sessions", "Bookings", "Capacity", "Fill rate", "Average price", "Deposits collected"],
        ...trainerStats.map((t) => [
          t.name, t.sessions, t.booked, t.capacity, pct(t.fill), t.avgPrice.toFixed(2), t.revenue.toFixed(2),
        ]),
      ]),
    );

  if (loading) return <p className="mb-8 text-muted-foreground">Loading statistics…</p>;

  const card = "rounded-2xl border border-border bg-card p-4";
  const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
  const td = "px-3 py-2 text-sm";

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Statistics</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={downloadSessions} disabled={sessions.length === 0}>
            Download sessions report (CSV)
          </Button>
          <Button size="sm" variant="outline" onClick={downloadTrainers} disabled={trainerStats.length === 0}>
            Download trainers report (CSV)
          </Button>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}><p className="text-xs text-muted-foreground">Sessions</p><p className="text-2xl font-bold">{sessions.length}</p></div>
        <div className={card}><p className="text-xs text-muted-foreground">Active bookings</p><p className="text-2xl font-bold">{totalBooked}</p><p className="text-xs text-muted-foreground">{totalCancelled} cancelled</p></div>
        <div className={card}><p className="text-xs text-muted-foreground">Average fill rate</p><p className="text-2xl font-bold">{pct(avgFill)}</p></div>
        <div className={card}><p className="text-xs text-muted-foreground">Deposits collected</p><p className="text-2xl font-bold">{money(totalRevenue)}</p></div>
      </div>

      {/* Highlights */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <p className="text-xs text-muted-foreground">Most popular session</p>
          <p className="font-semibold">{topSession && topSession.booked > 0 ? topSession.title : "—"}</p>
          {topSession && topSession.booked > 0 && <p className="text-xs text-muted-foreground">{topSession.booked} bookings</p>}
        </div>
        <div className={card}>
          <p className="text-xs text-muted-foreground">Most expensive session</p>
          <p className="font-semibold">{priciest ? priciest.title : "—"}</p>
          {priciest && <p className="text-xs text-muted-foreground">{money(priciest.price)}</p>}
        </div>
        <div className={card}>
          <p className="text-xs text-muted-foreground">Most popular trainer</p>
          <p className="font-semibold">{topTrainer && topTrainer.booked > 0 ? topTrainer.name : "—"}</p>
          {topTrainer && topTrainer.booked > 0 && <p className="text-xs text-muted-foreground">{topTrainer.booked} bookings</p>}
        </div>
        <div className={card}>
          <p className="text-xs text-muted-foreground">Top earning trainer</p>
          <p className="font-semibold">{topEarner && topEarner.revenue > 0 ? topEarner.name : "—"}</p>
          {topEarner && topEarner.revenue > 0 && <p className="text-xs text-muted-foreground">{money(topEarner.revenue)} deposits</p>}
        </div>
      </div>

      {/* Trainers table */}
      <h3 className="mb-2 text-lg font-bold">Trainers</h3>
      <div className="mb-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[560px]">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Trainer</th><th className={th}>Sessions</th><th className={th}>Bookings</th>
              <th className={th}>Fill rate</th><th className={th}>Avg price</th><th className={th}>Deposits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trainerStats.length === 0 && <tr><td className={td} colSpan={6}>No data yet.</td></tr>}
            {trainerStats.map((t) => (
              <tr key={t.id}>
                <td className={`${td} font-semibold`}>{t.name}</td>
                <td className={td}>{t.sessions}</td>
                <td className={td}>{t.booked}</td>
                <td className={td}>{pct(t.fill)}</td>
                <td className={td}>{money(t.avgPrice)}</td>
                <td className={td}>{money(t.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sessions table */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Sessions</h3>
        <label className="flex items-center gap-2 text-sm">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="booked">Most popular (bookings)</option>
            <option value="fill">Highest fill rate</option>
            <option value="price">Most expensive</option>
            <option value="revenue">Most deposits collected</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Session</th><th className={th}>Trainer</th><th className={th}>Start</th>
              <th className={th}>Price</th><th className={th}>Booked</th><th className={th}>Fill rate</th><th className={th}>Deposits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedSessions.length === 0 && <tr><td className={td} colSpan={7}>No sessions yet.</td></tr>}
            {sortedSessions.map((s) => (
              <tr key={s.id}>
                <td className={`${td} font-semibold`}>{s.title}</td>
                <td className={td}>{s.trainer}</td>
                <td className={td}>{s.start ? fmtDate(s.start) : "—"}</td>
                <td className={td}>{money(s.price)}</td>
                <td className={td}>{s.booked} / {s.capacity}</td>
                <td className={td}>{pct(s.fill)}</td>
                <td className={td}>{money(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        “Deposits collected” = deposits of active (not cancelled) bookings. Cancelled sessions are not counted.
      </p>
    </section>
  );
}
