import { useQuery } from "@tanstack/react-query";
import { courseReviewsQuery } from "@/lib/catalog";
import { StarsStatic } from "./Stars";
import { fmtDate } from "./format";

/** What members say about a course (reviews of earlier sessions with the same trainer). */
export function CourseReviews({ workoutId }: { workoutId: string }) {
  const { data, isPending, isError } = useQuery(courseReviewsQuery(workoutId));
  return (
    <section className="mt-8" aria-labelledby="course-reviews-heading">
      <h2 id="course-reviews-heading" className="mb-3 text-xl font-bold">What members say</h2>
      {isPending ? <p className="text-muted-foreground">Loading reviews…</p>
        : isError ? <p className="text-muted-foreground">Reviews are not available right now.</p>
        : data.length === 0 ? <p className="text-muted-foreground">No reviews yet. Reviews appear after members finish this class.</p>
        : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <StarsStatic value={r.rating} />
                  <span className="text-xs text-muted-foreground">{r.reviewer} · {fmtDate(r.createdAt)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
