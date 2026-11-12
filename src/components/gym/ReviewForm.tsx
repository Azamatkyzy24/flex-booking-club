import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_MAX_LENGTH, type Review } from "@/lib/gym";
import { submitReview } from "@/lib/store";
import { StarPicker, StarsStatic } from "./Stars";
import { fmtDate } from "./format";

/** Rating and feedback form for a finished booking. */
export function ReviewForm({ bookingId, sessionName }: { bookingId: string; sessionName: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    try {
      await submitReview(bookingId, rating, comment);
      void qc.invalidateQueries({ queryKey: ["course-reviews"] });
      toast.success("Thanks for your feedback!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your review.");
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 border-t border-border pt-5" aria-labelledby="review-heading">
      <h3 id="review-heading" className="font-bold">How was {sessionName}?</h3>
      <p className="mt-1 text-sm text-muted-foreground">Rate the session and leave feedback for other members.</p>
      <div className="mt-3"><StarPicker value={rating} onChange={setRating} disabled={busy} /></div>
      <Textarea className="mt-3" rows={3} maxLength={REVIEW_MAX_LENGTH} value={comment} disabled={busy}
        onChange={(e) => setComment(e.target.value)} placeholder="Share your feedback (optional)" aria-label="Feedback" />
      <p className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/{REVIEW_MAX_LENGTH}</p>
      <Button className="mt-2" onClick={submit} disabled={busy || rating === 0}>Submit review</Button>
    </section>
  );
}

/** The member's own saved review. */
export function MyReview({ review }: { review: Review }) {
  return (
    <section className="mt-6 border-t border-border pt-5" aria-labelledby="my-review-heading">
      <h3 id="my-review-heading" className="font-bold">Your review</h3>
      <div className="mt-2 flex items-center gap-3"><StarsStatic value={review.rating} /><span className="text-xs text-muted-foreground">{fmtDate(review.createdAt)}</span></div>
      {review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}
    </section>
  );
}
