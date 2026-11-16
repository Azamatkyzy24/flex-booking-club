import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, Page, Row, fmtDate } from "@/components/gym/format";
import { buyMembership, useGym } from "@/lib/store";
import { activeMembership, money, visitsLeft, visitsUsed, type Plan } from "@/lib/gym";

export const Route = createFileRoute("/membership")({
  head: () => ({ meta: [
    { title: "Membership — GymFlow" },
    { name: "description", content: "Buy a GymFlow membership (абонемент) or pay per visit." },
    { property: "og:title", content: "Membership — GymFlow" },
    { property: "og:description", content: "Choose a membership plan or book single visits." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MembershipPage,
});

function MembershipPage() {
  const g = useGym();
  const [busy, setBusy] = useState<string | null>(null);
  if (!g) return <Loading />;
  const current = activeMembership(g);
  const plans = g.plans ?? [];

  const buy = async (p: Plan) => {
    if (busy) return;
    setBusy(p.id);
    try {
      await buyMembership(p.id);
      toast.success(`${p.name} membership activated: ${p.visits} visits.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Purchase failed.";
      toast.error(msg.includes("INSUFFICIENT_BALANCE") ? "Insufficient funds. Please top up your wallet." : msg);
    } finally { setBusy(null); }
  };

  return (
    <Page title="Membership">
      {current ? (
        <div className="bg-hero mb-8 rounded-3xl border border-border p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-2xl font-bold">{current.planName} membership</h2>
            <Badge>Active</Badge>
          </div>
          <p className="mt-4 text-4xl font-bold">
            {visitsLeft(g, current)} <span className="text-lg font-semibold text-muted-foreground">of {current.visits} visits left</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar"
            aria-valuemin={0} aria-valuemax={current.visits} aria-valuenow={visitsUsed(g, current.id)} aria-label="Visits used">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (visitsUsed(g, current.id) / current.visits) * 100)}%` }} />
          </div>
          <Row k="Valid until" v={fmtDate(current.expiresAt)} />
          <Row k="Paid" v={money(current.price)} />
          <p className="mt-2 text-sm text-muted-foreground">
            Pick “Use my membership” when you book a group class. A cancelled booking gives the visit back.{" "}
            <Link to="/workouts" className="font-semibold text-primary">Browse workouts</Link>
          </p>
        </div>
      ) : (
        <p className="mb-8 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          You have no active membership. You can still book <b className="text-foreground">single visits</b> — pay a deposit now and the rest at reception.
        </p>
      )}

      <h2 className="mb-3 text-xl font-bold">Membership plans</h2>
      {plans.length === 0 ? (
        <p className="text-muted-foreground">No plans are available right now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const poor = g.balance < p.price;
            return (
              <article key={p.id} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="mt-2 text-3xl font-bold">{money(p.price)}</p>
                <p className="text-sm text-muted-foreground">{money(p.price / p.visits)} per visit</p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary" aria-hidden />{p.visits} group-class visits</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary" aria-hidden />Valid for {p.days} days</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary" aria-hidden />Nothing to pay at reception</li>
                </ul>
                <div className="mt-auto flex flex-col pt-5">
                  <Button className="w-full" disabled={!!current || poor || busy !== null} onClick={() => buy(p)}>
                    {current ? "Membership already active" : poor ? "Top up your wallet" : busy === p.id ? "Buying…" : `Buy for ${money(p.price)}`}
                  </Button>
                  {!current && poor && <Link to="/wallet" className="mt-2 text-center text-sm font-semibold text-primary">Top up wallet</Link>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-xl font-bold">Single visit</h2>
      <div className="rounded-2xl border border-border bg-card p-6">
        <p>No commitment: book any class (group or personal training) and pay <b>a deposit now</b> from your wallet; the rest is paid at reception.</p>
        <p className="mt-2 text-sm text-muted-foreground">Memberships cover group classes only. Personal training is always a single visit.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/workouts">Book a single visit</Link></Button>
      </div>
    </Page>
  );
}
