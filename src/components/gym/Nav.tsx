import { Link } from "@tanstack/react-router";
import { useGym } from "@/lib/store";
import { Home, Dumbbell, CalendarCheck, Wallet, User, Users, Newspaper } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/trainers", label: "Trainers", icon: Users },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/bookings", label: "My Bookings", icon: CalendarCheck },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function Nav() {
  const g = useGym();
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-display text-xl font-bold">
            Gym<span className="text-primary">Flow</span>
          </Link>
          <nav className="hidden gap-1 lg:flex">
            {items.map((i) => (
              <Link key={i.to} to={i.to} activeOptions={{ exact: i.to === "/" }}
                className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-primary" }}>
                {i.label}
              </Link>
            ))}
          </nav>
          {g && (
            <Link to="/profile" className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {g.name.split(" ").map((n) => n[0]).join("")}
              </span>
              <span className="hidden max-w-36 truncate xl:inline">{g.name}</span>
            </Link>
          )}
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-border bg-card lg:hidden">
        {items.map((i) => (
          <Link key={i.to} to={i.to} activeOptions={{ exact: i.to === "/" }}
            className="flex min-w-0 flex-col items-center gap-1 py-2 text-[10px] font-semibold text-muted-foreground"
            activeProps={{ className: "!text-primary" }}>
            <i.icon className="h-5 w-5" />
            {i.label.replace("My ", "")}
          </Link>
        ))}
      </nav>
    </>
  );
}
