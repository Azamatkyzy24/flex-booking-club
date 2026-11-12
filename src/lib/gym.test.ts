import { describe, expect, it } from "vitest";
import { bookSession, cancelBooking, canReview, hasEnded, makeSeed, reviewOf } from "./gym";

const now = Date.now();

describe("booking rules", () => {
  it("deducts only the deposit and reserves a spot", () => {
    const st = makeSeed(now);
    const r = bookSession(st, "s5", now); // $22 at 25% => $5.50
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.balance).toBe(79.5);
    expect(r.state.sessions.find((s) => s.id === "s5")!.booked).toBe(7);
  });
  it("rejects insufficient funds without changes", () => {
    const st = { ...makeSeed(now), balance: 1 };
    const r = bookSession(st, "s3", now);
    expect(r).toEqual({ ok: false, error: "Insufficient funds. Please top up your wallet." });
  });
  it("blocks full sessions and duplicates", () => {
    const st = makeSeed(now);
    expect(bookSession(st, "s2", now).ok).toBe(false);
    expect(bookSession(st, "s4", now).ok).toBe(false);
  });
  it("cancel refunds deposit and releases spot", () => {
    const st = makeSeed(now);
    const next = cancelBooking(st, "BK-4F2A1", now)!;
    expect(next.balance).toBe(89);
    expect(next.sessions.find((s) => s.id === "s4")!.booked).toBe(17);
  });
});

describe("reviews", () => {
  it("allows one review per booking, only after the session has finished", () => {
    const st = makeSeed(now);
    const done = st.bookings.find((b) => b.id === "BK-3C9D7")!; // completed Spin Cycle
    const done$ = st.sessions.find((s) => s.id === done.sessionId)!;
    const upcoming = st.bookings.find((b) => b.id === "BK-4F2A1")!;
    const upcoming$ = st.sessions.find((s) => s.id === upcoming.sessionId)!;
    expect(hasEnded(done$, now)).toBe(true);
    expect(canReview(done, done$, false, now)).toBe(true);
    expect(canReview(done, done$, true, now)).toBe(false); // already reviewed
    expect(canReview(upcoming, upcoming$, false, now)).toBe(false); // session not finished
  });
  it("does not allow reviewing a cancelled booking", () => {
    const st = makeSeed(now);
    const cancelled = st.bookings.find((b) => b.id === "BK-2B8E4")!;
    const s = st.sessions.find((x) => x.id === cancelled.sessionId)!;
    expect(canReview(cancelled, s, false, now)).toBe(false);
  });
  it("finds the member's own review by booking id", () => {
    const review = { bookingId: "7", rating: 4, comment: null, createdAt: new Date(now).toISOString() };
    expect(reviewOf({ reviews: [review] }, "7")).toEqual(review);
    expect(reviewOf({ reviews: [review] }, "8")).toBeUndefined();
    expect(reviewOf({}, "7")).toBeUndefined();
  });
});
