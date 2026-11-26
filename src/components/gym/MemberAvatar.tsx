import { useState } from "react";
import { initialsOf } from "@/lib/profile";

/** The member's photo, or their initials when there is no photo (or it fails to load). */
export function MemberAvatar({ name, url, className = "h-16 w-16 text-2xl" }: { name: string; url?: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-primary-foreground ${className}`;
  if (url && !broken) {
    return <img src={url} alt={`${name} profile photo`} className={`${base} object-cover`} onError={() => setBroken(true)} />;
  }
  return <span className={base} aria-label={`${name} (no photo)`}>{initialsOf(name)}</span>;
}
