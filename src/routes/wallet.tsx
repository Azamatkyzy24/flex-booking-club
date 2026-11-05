import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading, Page, fmtDate } from "@/components/gym/format";
import { topUpWallet, useGym } from "@/lib/store";
import { money } from "@/lib/gym";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [
    { title: "Wallet — GymFlow" },
    { name: "description", content: "Your GymFlow wallet balance and transaction history." },
    { property: "og:title", content: "Wallet — GymFlow" },
    { property: "og:description", content: "Top up and track your GymFlow wallet." },
  ] }),
  component: WalletPage,
});

function WalletPage() {
  const g = useGym();
  if (!g) return <Loading />;
  const add = async (n: number) => {
    try { await topUpWallet(n); toast.success(`${money(n)} added (demo)`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Top up failed."); }
  };
  return (
    <Page title="Wallet">
      <div className="bg-hero mb-8 rounded-3xl border border-border p-6">
        <p className="text-sm text-muted-foreground">Current balance</p>
        <p className="text-4xl font-bold">{money(g.balance)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[20, 50, 100].map((n) => <Button key={n} onClick={() => add(n)}>Top Up {money(n)}</Button>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Demo top-up — no real payment is made.</p>
      </div>
      <h2 className="mb-3 text-xl font-bold">Transaction history</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {g.txs.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">{t.label}</p>
              <p className="text-xs capitalize text-muted-foreground">{t.type} · {fmtDate(t.date)}</p>
            </div>
            <p className={`font-bold ${t.amount < 0 ? "text-destructive" : "text-primary"}`}>
              {t.amount < 0 ? "−" : "+"}{money(Math.abs(t.amount))}
            </p>
          </div>
        ))}
      </div>
    </Page>
  );
}
