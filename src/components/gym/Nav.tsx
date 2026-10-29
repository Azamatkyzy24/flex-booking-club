import { Link } from "@tanstack/react-router";
import { Home, Dumbbell, CalendarCheck, Wallet, User } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/bookings", label: "My Bookings", icon: CalendarCheck },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function Nav() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-display text-xl font-bold">
            Gym<span className="text-primary">Flow</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {items.map((i) => (
              <Link key={i.to} to={i.to} activeOptions={{ exact: i.to === "/" }}
                className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-primary" }}>
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card md:hidden">
        {items.map((i) => (
          <Link key={i.to} to={i.to} activeOptions={{ exact: i.to === "/" }}
            className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold text-muted-foreground"
            activeProps={{ className: "!text-primary" }}>
            <i.icon className="h-5 w-5" />
            {i.label.replace("My ", "")}
          </Link>
        ))}
      </nav>
    </>
  );
}
