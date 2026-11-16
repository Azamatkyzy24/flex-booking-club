import { describe, expect, it } from "vitest";
import { bookSession, cancelBooking, canReview, hasEnded, makeSeed, reviewOf, visitsLeft } from "./gym";

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

describe("membership and single visit", () => {
  const withMembership = (visits = 2) => {
    const st = makeSeed(now);
    return {
      ...st,
      memberships: [{ id: "M1", planName: "Starter", visits, price: 60, startsAt: new Date(now - 86400000).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString() }],
    };
  };
  it("a single visit still charges the deposit", () => {
    const r = bookSession(makeSeed(now), "s5", now);
    expect(r.ok && r.state.balance).toBe(79.5);
    expect(r.ok && r.state.bookings[0]!.visitType).toBe("single");
  });
  it("a membership visit costs nothing and uses one visit", () => {
    const st = withMembership();
    const r = bookSession(st, "s5", now, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.balance).toBe(85);
    expect(r.state.bookings[0]).toMatchObject({ visitType: "membership", membershipId: "M1", deposit: 0 });
    expect(visitsLeft(r.state, r.state.memberships![0]!)).toBe(1);
  });
  it("stops when no visits are left", () => {
    let st = withMembership(1);
    const first = bookSession(st, "s5", now, true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = bookSession(first.state, "s8", now, true);
    expect(second).toEqual({ ok: false, error: "No visits left on your membership." });
  });
  it("does not cover personal training or work without a membership", () => {
    expect(bookSession(withMembership(), "s3", now, true)).toEqual({ ok: false, error: "Memberships cover group classes only. Personal training is a single visit." });
    expect(bookSession(makeSeed(now), "s5", now, true)).toEqual({ ok: false, error: "You have no active membership." });
  });
  it("cancelling a membership booking gives the visit back and refunds no money", () => {
    const r = bookSession(withMembership(1), "s5", now, true);
    if (!r.ok) throw new Error("booking failed");
    const after = cancelBooking(r.state, r.bookingId, now)!;
    expect(after.balance).toBe(85);
    expect(after.txs.length).toBe(r.state.txs.length);
    expect(visitsLeft(after, after.memberships![0]!)).toBe(1);
  });
  it("a membership that ends before the class cannot be used", () => {
    const st = withMembership();
    st.memberships![0]!.expiresAt = new Date(now + 3600000).toISOString();
    expect(bookSession(st, "s5", now, true)).toEqual({ ok: false, error: "Your membership expires before this class." });
  });
});
