import { createFileRoute } from "@tanstack/react-router";
import { Loading, Page, Row } from "@/components/gym/format";
import { useGym } from "@/lib/store";
import { money } from "@/lib/gym";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [
    { title: "Profile — GymFlow" },
    { name: "description", content: "Your GymFlow member profile." },
    { property: "og:title", content: "Profile — GymFlow" },
    { property: "og:description", content: "Your GymFlow member profile." },
  ] }),
  component: Profile,
});

function Profile() {
  const g = useGym();
  if (!g) return <Loading />;
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
      </div>
    </Page>
  );
}
