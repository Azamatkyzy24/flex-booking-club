import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/store";
import { fetchTrainerId } from "@/lib/trainer";
import { fetchIsAdmin } from "@/lib/useIsAdmin";
 
export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Log in — GymFlow" },
    { name: "description", content: "Log in to your GymFlow account." },
    { property: "og:title", content: "Log in — GymFlow" },
    { property: "og:description", content: "Log in to book classes and manage your wallet." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Login,
});
 
const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";
 
function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
 
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // Admins land on the admin page, trainers on their dashboard, everyone else on Home.
      if (await fetchIsAdmin()) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      const trainerId = await fetchTrainerId();
      navigate({ to: trainerId ? "/trainer" : "/", replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Login failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  };
 
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-12">
      <p className="font-display text-2xl font-bold">Gym<span className="text-primary">Flow</span></p>
      <h1 className="mt-6 text-3xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Log in to book classes and manage your wallet.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-semibold">Email</label>
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
        </div>
        {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-bold">
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link to="/register" className="font-semibold text-primary hover:underline">Create one</Link>
      </p>
    </main>
  );
}
