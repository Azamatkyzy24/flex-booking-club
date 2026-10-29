import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/gym";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Loading() {
  return <div className="py-24 text-center text-muted-foreground">Loading…</div>;
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const v = status === "upcoming" ? "default" : status === "cancelled" ? "destructive" : "secondary";
  return <Badge variant={v} className="capitalize">{status}</Badge>;
}

export function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? "font-bold" : "text-muted-foreground"}`}>
      <span>{k}</span><span className={strong ? "text-primary" : "text-foreground"}>{v}</span>
    </div>
  );
}

export const Page = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-12">
    <h1 className="mb-6 text-3xl font-bold">{title}</h1>
    {children}
  </main>
);
