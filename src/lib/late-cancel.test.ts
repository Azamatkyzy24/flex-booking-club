import { describe, it, expect } from "vitest";
import { makeSeed, bookSession, cancelBooking, isRefundable } from "./gym";

const H = 3600000;

describe("late cancellation (Task 10)", () => {
  const seed = makeSeed(Date.now());
  const s1 = seed.sessions.find((x) => x.id === "s1")!;
  const start = new Date(s1.start).getTime();

  it("cancel 13h before start refunds the deposit", () => {
    const now = start - 13 * H;
    const booked = bookSession(seed, "s1", now);
    if (!booked.ok) throw new Error(booked.error);
    const after = cancelBooking(booked.state, booked.bookingId, now)!;
    expect(after.balance).toBe(seed.balance);
  });

  it("cancel 6h before start works but keeps the deposit", () => {
    const now = start - 6 * H;
    const booked = bookSession(seed, "s1", now);
    if (!booked.ok) throw new Error(booked.error);
    const after = cancelBooking(booked.state, booked.bookingId, now)!;
    expect(after).not.toBeNull();
    expect(after.balance).toBe(booked.state.balance);
    expect(after.bookings.find((b) => b.id === booked.bookingId)!.cancelled).toBe(true);
    expect(after.sessions.find((x) => x.id === "s1")!.booked).toBe(s1.booked);
    expect(after.txs).toHaveLength(booked.state.txs.length);
  });

  it("cannot cancel after the session has started", () => {
    const booked = bookSession(seed, "s1", start - 6 * H);
    if (!booked.ok) throw new Error(booked.error);
    expect(cancelBooking(booked.state, booked.bookingId, start + 60000)).toBeNull();
  });

  it("exactly 12h is not refundable, 12h + 1 min is", () => {
    const booked = bookSession(seed, "s1", start - 20 * H);
    if (!booked.ok) throw new Error(booked.error);
    const bk = booked.state.bookings[0]!;
    expect(isRefundable(bk, s1, start - 12 * H)).toBe(false);
    expect(isRefundable(bk, s1, start - 12 * H - 60000)).toBe(true);
  });

  it("rejects booking when the balance is lower than the deposit", () => {
    const poor = { ...seed, balance: 1 };
    const res = bookSession(poor, "s1", start - 20 * H);
    expect(res.ok).toBe(false);
  });
});