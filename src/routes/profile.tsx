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
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loading, Page, Row } from "@/components/gym/format";
import { changePassword, signOut, updateMemberProfile, useGym } from "@/lib/store";
import { cleanName, validateMemberName, validatePassword, PASSWORD_MIN } from "@/lib/profile";
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
  const [editing, setEditing] = useState(false);

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

        {editing ? (
          <EditProfileForm name={g.name} onDone={() => setEditing(false)} />
        ) : (
          <>
            <Row k="Name" v={g.name} />
            <Row k="Email" v={g.email} />
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Edit profile
            </Button>
          </>
        )}

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

        <ChangePasswordForm />

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
const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/* ---------- Edit name ---------- */
function EditProfileForm({ name, onDone }: { name: string; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateMemberName(value);
    if (problem) { setError(problem); return; }
    if (cleanName(value) === name) { onDone(); return; }
    setSaving(true);
    try {
      await updateMemberProfile(value);
      toast.success("Profile saved.");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <label htmlFor="profile-name" className="block text-sm font-semibold">Full name</label>
      <input id="profile-name" className={inputCls} value={value} maxLength={60}
        onChange={(e) => { setValue(e.target.value); setError(null); }} aria-invalid={!!error} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Email is your login and cannot be changed here.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}

/* ---------- Change password ---------- */
function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => { setOpen(false); setPw(""); setConfirm(""); setError(null); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(pw, confirm);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      await changePassword(pw);
      toast.success("Password changed.");
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-2 px-0 text-muted-foreground" onClick={() => setOpen(true)}>
        Change password
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 border-t border-border pt-4">
      <h2 className="text-sm font-bold">Change password</h2>
      <input type="password" autoComplete="new-password" placeholder={`New password (min ${PASSWORD_MIN})`}
        aria-label="New password" className={inputCls} value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} />
      <input type="password" autoComplete="new-password" placeholder="Repeat new password"
        aria-label="Repeat new password" className={inputCls} value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Change password"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={close} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
