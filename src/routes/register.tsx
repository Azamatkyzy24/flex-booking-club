import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { register } from "@/lib/store";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [
    { title: "Create account — GymFlow" },
    { name: "description", content: "Create your GymFlow member account." },
    { property: "og:title", content: "Create account — GymFlow" },
    { property: "og:description", content: "Join GymFlow to book classes and personal training." },
  ] }),
  component: Register,
});

const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";

function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) { setError("Enter your full name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await register(fullName.trim(), email.trim(), password);
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-12">
      <p className="font-display text-2xl font-bold">Gym<span className="text-primary">Flow</span></p>
      <h1 className="mt-6 text-3xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Flex membership — pay per session, no commitment.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-semibold">Full name</label>
          <input id="fullName" type="text" autoComplete="name" value={fullName}
            onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Alex Morgan" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-semibold">Email</label>
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold">Password</label>
          <input id="password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 6 characters" />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-semibold">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="Repeat your password" />
        </div>
        {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-bold">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary hover:underline">Log in</Link>
      </p>
    </main>
  );
}
