import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading, Page, Row } from "@/components/gym/format";
import { signOut, useGym } from "@/lib/store";
import { money } from "@/lib/gym";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [
    { title: "Profile — GymFlow" },
    { name: "description", content: "Your GymFlow member profile." },
    { property: "og:title", content: "Profile — GymFlow" },
    { property: "og:description", content: "Your GymFlow member profile." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Profile,
});

function Profile() {
  const g = useGym();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!g) return <Loading />;

  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
      navigate({ to: "/login", replace: true });
    } catch {
      toast.error("Could not log out. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Page title="Profile">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {g.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <Row k="Name" v={g.name} />
        <Row k="Email" v={g.email} />
        <Row k="Membership" v="Flex (pay per session)" />
        <Row k="Wallet" v={money(g.balance)} />
        <Row k="Bookings" v={String(g.bookings.length)} />
        <Button variant="outline" onClick={logout} disabled={busy}
          className="mt-6 w-full border-destructive/40 text-destructive hover:bg-destructive/10">
          {busy ? "Logging out…" : "Log out"}
        </Button>
      </div>
    </Page>
  );
}
