import type { Booking, GymState, Session } from "./gym";
import { spotsLeft, depositOf, CANCEL_HOURS } from "./gym";

// Check if the original workout can be rescheduled.
export function canReschedule(
  booking: Booking,
  session: Session,
  now = Date.now()
): boolean {
  return (
    !booking.cancelled &&
    !session.cancelled &&
    new Date(session.start).getTime() > now
  );
}

// Find available alternative workout sessions.
export function rescheduleOptions(
  state: GymState,
  booking: Booking,
  now = Date.now()
): Session[] {
  const current = state.sessions.find(
    (s) => s.id === booking.sessionId
  );

  if (!current || !canReschedule(booking, current, now)) {
    return [];
  }

  return state.sessions.filter((s) => {
    if (s.id === current.id) return false;
    if (s.cancelled) return false;
    if (s.name !== current.name) return false;
    if (s.type !== current.type) return false;
    if (new Date(s.start).getTime() <= now) return false;
    if (spotsLeft(s) <= 0) return false;

    const alreadyBooked = state.bookings.some(
      (b) => b.sessionId === s.id && !b.cancelled
    );

    if (alreadyBooked) return false;

    // Check membership validity.
    if (booking.visitType === "membership") {
      const membership = state.memberships?.find(
        (m) => m.id === booking.membershipId
      );

      if (!membership) return false;

      const start = new Date(s.start).getTime();

      if (start < new Date(membership.startsAt).getTime())
        return false;

      if (start >= new Date(membership.expiresAt).getTime())
        return false;
    }

    return true;
  });
}

// Preserve refund restrictions after late rescheduling.
export function willLockRefund(
  booking: Booking,
  currentSession: Session,
  now = Date.now()
): boolean {
  return (
    !!booking.refundLocked ||
    new Date(currentSession.start).getTime() - now <=
      CANCEL_HOURS * 3600000
  );
}

// Calculate payment or refund when changing sessions.
export function depositDifference(
  booking: Booking,
  newSession: Session,
  currentSession?: Session,
  now = Date.now()
): number {
  if (booking.visitType === "membership") return 0;

  const difference = Math.round(
    (depositOf(newSession) - booking.deposit) * 100
  ) / 100;

  const locked = booking.refundLocked ||
    (currentSession && willLockRefund(booking, currentSession, now));

  return locked ? Math.max(0, difference) : difference;
}