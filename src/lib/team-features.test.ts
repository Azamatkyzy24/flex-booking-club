import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSeed, bookSession, cancelBooking, isRefundable, hasEnded, visitsUsed, activeMembership,
  type Booking, type Session, type GymState,
} from "./gym";
import { filterNews, trainerPath, type Announcement } from "./catalog";
import { rescheduleOptions, depositDifference } from "./reschedule";

// The trainer page talks to Supabase. We replace the database with a fake one,
// so we can check what the page sends and how it handles the answer.
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/store", () => ({ refreshGym: vi.fn(async () => {}), useGym: () => null }));
import { cancelTrainerWorkout, createTrainerWorkout, fetchTrainerId } from "./trainer";

const H = 3600000;
const seed = makeSeed(Date.now());
const s1 = seed.sessions.find((s) => s.id === "s1")!; // HIIT Burn, price $20, deposit $5
const start = new Date(s1.start).getTime();

/** Books s1 at the given time and returns the new state and booking id. */
function bookS1(at: number, state: GymState = seed) {
  const r = bookSession(state, "s1", at);
  if (!r.ok) throw new Error(r.error);
  return r;
}

// ---------------------------------------------------------------
// 1. Late cancellation (12 hours) and payments
// ---------------------------------------------------------------
describe("12-hour cancellation rule", () => {
  it("TC01: cancel 24h before start -> deposit refunded and a refund transaction is added", () => {
    const b = bookS1(start - 30 * H);
    const after = cancelBooking(b.state, b.bookingId, start - 24 * H)!;
    expect(after.balance).toBe(seed.balance);
    expect(after.txs[0]).toMatchObject({ type: "refund", amount: 5 });
  });

  it("TC02: cancel 12h 1min before start -> still refunded", () => {
    const b = bookS1(start - 20 * H);
    const after = cancelBooking(b.state, b.bookingId, start - 12 * H - 60000)!;
    expect(after.balance).toBe(seed.balance);
  });

  it("TC03: cancel exactly 12h before start -> cancelled, deposit kept", () => {
    const b = bookS1(start - 20 * H);
    const after = cancelBooking(b.state, b.bookingId, start - 12 * H)!;
    expect(after.bookings.find((x) => x.id === b.bookingId)!.cancelled).toBe(true);
    expect(after.balance).toBe(b.state.balance);
  });

  it("TC04: cancel 1h before start -> spot is released but no money comes back", () => {
    const b = bookS1(start - 20 * H);
    const after = cancelBooking(b.state, b.bookingId, start - 1 * H)!;
    expect(after.sessions.find((s) => s.id === "s1")!.booked).toBe(s1.booked);
    expect(after.balance).toBe(seed.balance - 5);
    expect(after.txs).toHaveLength(b.state.txs.length); // no new refund transaction
  });

  it("TC05: cannot cancel after the session has started", () => {
    const b = bookS1(start - 20 * H);
    expect(cancelBooking(b.state, b.bookingId, start + 1000)).toBeNull();
  });

  it("TC06: cannot cancel the same booking twice (no double refund)", () => {
    const b = bookS1(start - 30 * H);
    const once = cancelBooking(b.state, b.bookingId, start - 24 * H)!;
    expect(cancelBooking(once, b.bookingId, start - 24 * H)).toBeNull();
  });

  it("TC07: refund is lost if the booking was moved late (refundLocked)", () => {
    const b = bookS1(start - 30 * H);
    const locked = { ...b.state, bookings: b.state.bookings.map((x) => ({ ...x, refundLocked: true })) };
    const after = cancelBooking(locked, b.bookingId, start - 24 * H)!;
    expect(after.balance).toBe(b.state.balance);
  });

  it("TC08: late cancel of a membership visit returns the visit, no money", () => {
    const withM: GymState = {
      ...seed,
      memberships: [{ id: "M1", planName: "Starter", visits: 4, price: 60, startsAt: new Date(start - 48 * H).toISOString(), expiresAt: new Date(start + 30 * 24 * H).toISOString() }],
    };
    const r = bookSession(withM, "s1", start - 20 * H, true);
    if (!r.ok) throw new Error(r.error);
    const after = cancelBooking(r.state, r.bookingId, start - 2 * H)!;
    expect(after.balance).toBe(seed.balance);
    expect(visitsUsed(after, "M1")).toBe(0);
  });
});

describe("Booking payments", () => {
  it("TC09: not enough money -> booking rejected and nothing changes", () => {
    const poor = { ...seed, balance: 4.99 };
    const r = bookSession(poor, "s1", start - 20 * H);
    expect(r.ok).toBe(false);
    expect(poor.bookings).toHaveLength(seed.bookings.length);
  });

  it("TC10: balance exactly equal to the deposit is enough, balance becomes 0", () => {
    const r = bookS1(start - 20 * H, { ...seed, balance: 5 });
    expect(r.state.balance).toBe(0);
  });
});

// ---------------------------------------------------------------
// 2. Akbota: membership (абонемент) / single visit, reviews
// ---------------------------------------------------------------
describe("Memberships and reviews (Akbota)", () => {
  it("TC11: an expired membership is not active", () => {
    const st = { memberships: [{ id: "M2", planName: "Old", visits: 8, price: 80, startsAt: "2026-01-01T00:00:00Z", expiresAt: "2026-02-01T00:00:00Z" }] };
    expect(activeMembership(st, Date.parse("2026-03-01T00:00:00Z"))).toBeNull();
  });

  it("TC12: a session counts as finished exactly at start + duration (reviews open then)", () => {
    expect(hasEnded(s1, start + s1.duration * 60000 - 1)).toBe(false);
    expect(hasEnded(s1, start + s1.duration * 60000)).toBe(true);
  });
});

// ---------------------------------------------------------------
// 3. Dilnaz: trainer profiles, news, swap (reschedule)
// ---------------------------------------------------------------
const news = (id: number, category: string, date: string): Announcement => ({
  id, category, publication_date: date, is_important: false, title: `N${id}`, description: "d", details: "d",
  created_at: date, event_date: null, image_url: null, is_demo: true, is_published: true, workout_id: null,
});

describe("Trainer profiles, news and swap (Dilnaz)", () => {
  it("TC13: news filter returns an empty list when a category has no news", () => {
    expect(filterNews([news(1, "Gym Updates", "2026-11-10T00:00:00Z")], "Special Offers")).toEqual([]);
  });

  it("TC14: trainer link uses the slug, or the id when there is no slug", () => {
    expect(trainerPath(5, "maya-torres")).toBe("maya-torres");
    expect(trainerPath(5, "")).toBe("5");
  });

  const now = Date.parse("2026-12-01T10:00:00Z");
  const base: Session = { id: "a", name: "Power Yoga", type: "Group Class", trainer: "Liam Chen", start: new Date(now + 2 * H).toISOString(), duration: 60, price: 20, depositPct: 25, deposit: 5, capacity: 10, booked: 3 };
  const bk: Booking = { id: "b1", sessionId: "a", cancelled: false, total: 20, deposit: 5, createdAt: new Date(now).toISOString(), code: "X", visitType: "single" };

  it("TC15: swap only offers the same class that is not full and not in the past", () => {
    const st: GymState = {
      name: "T", email: "t@t", balance: 50, txs: [], bookings: [bk],
      sessions: [
        base,
        { ...base, id: "ok", start: new Date(now + 48 * H).toISOString() },
        { ...base, id: "full", start: new Date(now + 48 * H).toISOString(), booked: 10 },
        { ...base, id: "past", start: new Date(now - H).toISOString() },
        { ...base, id: "other", name: "HIIT", start: new Date(now + 48 * H).toISOString() },
      ],
    };
    expect(rescheduleOptions(st, bk, now).map((s) => s.id)).toEqual(["ok"]);
  });

  it("TC16: swapping late (<12h) to a cheaper class gives no money back", () => {
    const cheaper = { ...base, id: "c", deposit: 3, start: new Date(now + 48 * H).toISOString() };
    expect(depositDifference(bk, cheaper, base, now)).toBe(0);
    expect(isRefundable(bk, base, now)).toBe(false);
  });
});

// ---------------------------------------------------------------
// 4. Trainer page (Aidana) + waitlist / sessions (Aktumar)
// ---------------------------------------------------------------
describe("Trainer page and waitlist (Aidana, Aktumar)", () => {
  beforeEach(() => rpc.mockReset());

  it("TC17: trainer cancels a workout -> sends id and reason, gets refunds and waitlist counts", async () => {
    rpc.mockResolvedValue({ data: { refunded: 3, total: 15, waitlist: 2 }, error: null });
    const res = await cancelTrainerWorkout("42", "Trainer is sick");
    expect(rpc).toHaveBeenCalledWith("trainer_cancel_workout", { p_workout_id: 42, p_reason: "Trainer is sick" });
    expect(res).toEqual({ refunded: 3, total: 15, waitlist: 2 });
  });

  it("TC18: if the database refuses, the trainer sees the error message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "You can only cancel your own workouts." } });
    await expect(cancelTrainerWorkout("42", "")).rejects.toThrow("You can only cancel your own workouts.");
  });

  it("TC19: creating a session sends all fields to the database", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await createTrainerWorkout({ title: "Boxing", category: "Group Class", startIso: "2026-12-05T18:00:00Z", duration: 60, capacity: 12, price: 22, deposit: 5.5, description: "" });
    expect(rpc).toHaveBeenCalledWith("trainer_create_workout", expect.objectContaining({ p_title: "Boxing", p_capacity: 12, p_deposit: 5.5, p_description: null }));
  });

  it("TC20: a normal member (not a trainer) gets no trainer page", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchTrainerId()).toBeNull();
  });
});
