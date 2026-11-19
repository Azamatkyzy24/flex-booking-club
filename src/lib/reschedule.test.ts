import { describe, it, expect } from "vitest";
import type { Booking, Session, GymState } from "./gym";
import {
  canReschedule,
  rescheduleOptions,
  depositDifference,
} from "./reschedule";

const now = Date.parse("2026-12-01T10:00:00Z");

const session: Session = {
  id: "1",
  name: "Power Yoga",
  type: "Group Class",
  trainer: "Liam Chen",
  start: new Date(now + 3600000).toISOString(),
  duration: 60,
  price: 20,
  depositPct: 25,
  deposit: 5,
  capacity: 10,
  booked: 3,
};

const booking: Booking = {
  id: "1",
  sessionId: "1",
  cancelled: false,
  total: 20,
  deposit: 5,
  createdAt: new Date(now).toISOString(),
  code: "TEST-BOOKING",
  visitType: "single",
};

const alternative: Session = {
  ...session,
  id: "2",
  start: new Date(now + 86400000).toISOString(),
};

const state: GymState = {
  name: "Test Member",
  email: "test@example.com",
  balance: 50,
  sessions: [session, alternative],
  bookings: [booking],
  txs: [],
};

describe("Workout rescheduling", () => {
  it("allows rescheduling before the workout starts", () => {
    expect(canReschedule(booking, session, now)).toBe(true);
  });

  it("allows rescheduling one minute before start", () => {
    const time = new Date(session.start).getTime() - 60000;

    expect(canReschedule(booking, session, time)).toBe(true);
  });

  it("blocks rescheduling at the exact start time", () => {
    const time = new Date(session.start).getTime();

    expect(canReschedule(booking, session, time)).toBe(false);
  });

  it("blocks rescheduling after the workout starts", () => {
    const time = new Date(session.start).getTime() + 1000;

    expect(canReschedule(booking, session, time)).toBe(false);
  });

  it("blocks cancelled bookings", () => {
    expect(
      canReschedule({ ...booking, cancelled: true }, session, now)
    ).toBe(false);
  });

  it("finds available alternative sessions", () => {
    expect(rescheduleOptions(state, booking, now)).toEqual([
      alternative,
    ]);
  });

  it("excludes full sessions", () => {
    const fullSession = {
      ...alternative,
      booked: alternative.capacity,
    };

    expect(
      rescheduleOptions(
        { ...state, sessions: [session, fullSession] },
        booking,
        now
      )
    ).toEqual([]);
  });

  it("excludes cancelled sessions", () => {
    expect(
      rescheduleOptions(
        {
          ...state,
          sessions: [
            session,
            { ...alternative, cancelled: true },
          ],
        },
        booking,
        now
      )
    ).toEqual([]);
  });

  it("excludes different workout names", () => {
    expect(
      rescheduleOptions(
        {
          ...state,
          sessions: [
            session,
            { ...alternative, name: "Boxing" },
          ],
        },
        booking,
        now
      )
    ).toEqual([]);
  });

  it("excludes already booked sessions", () => {
    expect(
      rescheduleOptions(
        {
          ...state,
          bookings: [
            booking,
            { ...booking, id: "2", sessionId: "2" },
          ],
        },
        booking,
        now
      )
    ).toEqual([]);
  });

  it("requires no extra payment for equal deposits", () => {
    expect(depositDifference(booking, alternative)).toBe(0);
  });

  it("calculates additional payment", () => {
    expect(
      depositDifference(booking, {
        ...alternative,
        deposit: 8,
      })
    ).toBe(3);
  });

  it("calculates a wallet refund", () => {
    expect(
      depositDifference(booking, {
        ...alternative,
        deposit: 3,
      })
    ).toBe(-2);
  });

  it("requires no extra payment for membership visits", () => {
    expect(
      depositDifference(
        { ...booking, visitType: "membership", deposit: 0 },
        alternative
      )
    ).toBe(0);
  });
});