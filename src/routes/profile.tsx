import {
  createFileRoute,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  Ticket,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loading, Page, Row } from "@/components/gym/format";
import { signOut, useGym } from "@/lib/store";
import { activeMembership, money, visitsLeft } from "@/lib/gym";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — GymFlow" },
      {
        name: "description",
        content: "Your GymFlow member profile.",
      },
      {
        property: "og:title",
        content: "Profile — GymFlow",
      },
      {
        property: "og:description",
        content: "Your GymFlow member profile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const g = useGym();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!g) return <Loading />;

  const ms = activeMembership(g);

  const accountItems = [
    {
      to: "/bookings",
      label: "My Bookings",
      description: `${g.bookings.length} bookings`,
      icon: CalendarCheck,
    },
    {
      to: "/membership",
      label: "Membership",
      description: ms
        ? `${ms.planName} · ${visitsLeft(g, ms)} of ${ms.visits} visits left`
        : "Single visits (pay per session)",
      icon: Ticket,
    },
    {
      to: "/wallet",
      label: "Wallet",
      description: `${money(g.balance)} available balance`,
      icon: Wallet,
    },
  ] as const;

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

        {/* Personal information */}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {g.name.split(" ").map((n) => n[0]).join("")}
        </div>

        <Row k="Name" v={g.name} />
        <Row k="Email" v={g.email} />

        {/* Account navigation */}
        <div className="mt-6 border-t border-border pt-5">
          <h2 className="mb-3 text-sm font-bold text-muted-foreground">
            My Account
          </h2>

          <div className="space-y-3">
            {accountItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {item.label}
                  </p>

                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          onClick={logout}
          disabled={busy}
          className="mt-6 w-full border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          {busy ? "Logging out…" : "Log out"}
        </Button>

      </div>
    </Page>
  );
}