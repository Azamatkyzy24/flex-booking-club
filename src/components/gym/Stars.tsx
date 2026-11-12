import { Star } from "lucide-react";

/** Compact rating for cards: ★ 4.5 (12). */
export function RatingValue({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <Star className="h-4 w-4 fill-primary text-primary" aria-hidden />
      {rating.toFixed(1)}
      {count !== undefined && <span className="font-normal text-muted-foreground">({count})</span>}
    </span>
  );
}

/** Read-only row of five stars. */
export function StarsStatic({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} aria-hidden />
      ))}
    </span>
  );
}

/** Five clickable stars; the chosen value is announced as a radio group. */
export function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled} onClick={() => onChange(n)}
          className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          <Star className={`h-7 w-7 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} aria-hidden />
        </button>
      ))}
    </div>
  );
}
