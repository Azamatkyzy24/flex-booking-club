export type WorkoutType = "Group Class" | "Personal Training";
export interface Session {
  id: string; name: string; type: WorkoutType; trainer: string; trainerId?: number; trainerSlug?: string | null;
  start: string; duration: number; price: number; depositPct: number;
  capacity: number; booked: number; deposit?: number;
  /** What the course is about; null when no description was written. */
  description?: string | null;
  /** Average rating (1-5) of this course and how many reviews it is based on. */
  rating?: number | null; reviewCount?: number;
  /** True when the trainer cancelled this workout (bookings were refunded). */
  cancelled?: boolean;
}
export type BookingStatus = "upcoming" | "completed" | "cancelled";
/** "single" = разовое посещение (deposit now, rest at reception); "membership" = a visit from a membership (абонемент). */
export type VisitType = "single" | "membership";
export interface Booking {
  id: string; sessionId: string; cancelled: boolean; total: number;
  deposit: number; createdAt: string; code: string;
  visitType?: VisitType; membershipId?: string | null;
  refundLocked?: boolean;
}
export interface Tx { id: string; type: "topup" | "deposit" | "refund" | "membership"; amount: number; date: string; label: string }
/** A plan the gym sells: `visits` group-class visits within `days` days for `price`. */
export interface Plan { id: string; name: string; visits: number; days: number; price: number }
/** A membership the member bought. Visits used are counted from bookings, never stored. */
export interface Membership { id: string; planName: string; visits: number; price: number; startsAt: string; expiresAt: string }
/** The signed-in member's own review of a finished booking. */
export interface Review { bookingId: string; rating: number; comment: string | null; createdAt: string }
/** A review of a course written by any member (first name only). */
export interface CourseReview { id: string; rating: number; comment: string | null; createdAt: string; reviewer: string }
export interface GymState { name: string; email: string; balance: number; sessions: Session[]; bookings: Booking[]; txs: Tx[]; waitlist?: string[]; reviews?: Review[]; plans?: Plan[]; memberships?: Membership[] }

/** Cancellation allowed until this many hours before start; deposit refunded in full. */
export const CANCEL_HOURS = 12;

export const depositOf = (s: Pick<Session, "price" | "depositPct" | "deposit">) => s.deposit ?? Math.round(s.price * s.depositPct) / 100;
export const spotsLeft = (s: Session) => s.capacity - s.booked;
export const money = (n: number) => `$${n.toFixed(2)}`;

export function statusOf(b: Booking, s: Session, now = Date.now()): BookingStatus {
  if (b.cancelled) return "cancelled";
  return new Date(s.start).getTime() + s.duration * 60000 < now ? "completed" : "upcoming";
}
/** true = more than CANCEL_HOURS before start, so the deposit is refunded. */
export const canCancel = (b: Booking, s: Session, now = Date.now()) =>
  !b.cancelled && !b.refundLocked && new Date(s.start).getTime() - now > CANCEL_HOURS * 3600000;

// Restored from the late-cancellation work (commit 90af289), which a later commit removed by accident
// while src/lib/late-cancel.test.ts still needs it.
export const isRefundable = (b: Booking, s: Session, now = Date.now()) => canCancel(b, s, now);
/** A booking can be cancelled at any time before the session starts. */
export const canCancelAnytime = (b: Booking, s: Session, now = Date.now()) =>
  !b.cancelled && new Date(s.start).getTime() > now;

/** Reviews are limited to this many characters (same limit as the database). */
export const REVIEW_MAX_LENGTH = 500;
export const hasEnded = (s: Session, now = Date.now()) => new Date(s.start).getTime() + s.duration * 60000 <= now;
export const reviewOf = (g: Pick<GymState, "reviews">, bookingId: string) => g.reviews?.find((r) => r.bookingId === bookingId);
/** A member can review a booking once, after the session has finished, unless it was cancelled. */
export const canReview = (b: Booking, s: Session, reviewed: boolean, now = Date.now()) =>
  !b.cancelled && !reviewed && hasEnded(s, now);

/** Visits of a membership that are in use: every booking made with it that is not cancelled. */
export const visitsUsed = (g: Pick<GymState, "bookings">, membershipId: string) =>
  g.bookings.filter((b) => b.membershipId === membershipId && !b.cancelled).length;
export const visitsLeft = (g: Pick<GymState, "bookings">, m: Membership) => Math.max(0, m.visits - visitsUsed(g, m.id));
/** The membership that is valid right now (a member can own only one at a time), or null. */
export const activeMembership = (g: Pick<GymState, "memberships">, now = Date.now()): Membership | null =>
  g.memberships?.find((m) => new Date(m.startsAt).getTime() <= now && new Date(m.expiresAt).getTime() > now) ?? null;
/** Upgrade rules, the same as upgrade_membership() in the database: the new plan must give more visits AND cost more. */
export const canUpgradeTo = (current: Membership, plan: Plan) => plan.visits > current.visits && plan.price > current.price;
/** What the member pays for an upgrade: the new plan price minus what the current membership cost. */
export const upgradeCost = (current: Membership, plan: Plan) => Math.round((plan.price - current.price) * 100) / 100;
export type MembershipCheck = { ok: true; membership: Membership } | { ok: false; reason: string };
/** Can this session be booked with the member's membership? Mirrors the checks in the database function book_session. */
export function membershipFor(g: GymState, s: Session, now = Date.now()): MembershipCheck {
  if (s.type !== "Group Class") return { ok: false, reason: "Memberships cover group classes only. Personal training is a single visit." };
  const m = activeMembership(g, now);
  if (!m) return { ok: false, reason: "You have no active membership." };
  if (new Date(s.start).getTime() > new Date(m.expiresAt).getTime()) return { ok: false, reason: "Your membership expires before this class." };
  if (visitsLeft(g, m) <= 0) return { ok: false, reason: "No visits left on your membership." };
  return { ok: true, membership: m };
}

const uid = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;

export type BookResult = { ok: true; state: GymState; bookingId: string } | { ok: false; error: string };

export function bookSession(state: GymState, sessionId: string, now = Date.now(), useMembership = false): BookResult {
  const s = state.sessions.find((x) => x.id === sessionId);
  if (!s) return { ok: false, error: "Session not found." };
  if (new Date(s.start).getTime() <= now) return { ok: false, error: "This session has already started." };
  if (state.bookings.some((b) => b.sessionId === s.id && !b.cancelled))
    return { ok: false, error: "You have already booked this session." };
  if (spotsLeft(s) <= 0) return { ok: false, error: "This session is full." };
  const id = uid("BK");
  const date = new Date(now).toISOString();
  if (useMembership) {
    const chk = membershipFor(state, s, now);
    if (!chk.ok) return { ok: false, error: chk.reason };
    return {
      ok: true, bookingId: id,
      state: {
        ...state,
        sessions: state.sessions.map((x) => (x.id === s.id ? { ...x, booked: x.booked + 1 } : x)),
        bookings: [{ id, sessionId: s.id, cancelled: false, total: s.price, deposit: 0, createdAt: date, code: `GYMFLOW:${id}:${s.id}`, visitType: "membership", membershipId: chk.membership.id }, ...state.bookings],
      },
    };
  }
  const deposit = depositOf(s);
  if (state.balance < deposit) return { ok: false, error: "Insufficient funds. Please top up your wallet." };
  return {
    ok: true, bookingId: id,
    state: {
      ...state,
      balance: Math.round((state.balance - deposit) * 100) / 100,
      sessions: state.sessions.map((x) => (x.id === s.id ? { ...x, booked: x.booked + 1 } : x)),
      bookings: [{ id, sessionId: s.id, cancelled: false, total: s.price, deposit, createdAt: date, code: `GYMFLOW:${id}:${s.id}`, visitType: "single", membershipId: null }, ...state.bookings],
      txs: [{ id: uid("TX"), type: "deposit", amount: -deposit, date, label: `Deposit · ${s.name}` }, ...state.txs],
    },
  };
}

/** Late cancellation (12h or less) is allowed and releases the spot, but the deposit is kept.
 *  A membership visit has no deposit: cancelling simply gives the visit back. */
export function cancelBooking(state: GymState, bookingId: string, now = Date.now()): GymState | null {
  const b = state.bookings.find((x) => x.id === bookingId);
  const s = b && state.sessions.find((x) => x.id === b.sessionId);
  if (!b || !s || !canCancelAnytime(b, s, now)) return null;
  const refund = isRefundable(b, s, now) && b.deposit > 0;
  return {
    ...state,
    balance: refund ? Math.round((state.balance + b.deposit) * 100) / 100 : state.balance,
    sessions: state.sessions.map((x) => (x.id === s.id ? { ...x, booked: Math.max(0, x.booked - 1) } : x)),
    bookings: state.bookings.map((x) => (x.id === b.id ? { ...x, cancelled: true } : x)),
    txs: refund
      ? [{ id: uid("TX"), type: "refund", amount: b.deposit, date: new Date(now).toISOString(), label: `Refund · ${s.name}` }, ...state.txs]
      : state.txs,
  };
}

export function topUp(state: GymState, amount: number): GymState {
  return {
    ...state, balance: Math.round((state.balance + amount) * 100) / 100,
    txs: [{ id: uid("TX"), type: "topup", amount, date: new Date().toISOString(), label: "Wallet top up (demo)" }, ...state.txs],
  };
}

export function makeSeed(now = Date.now()): GymState {
  const day = (d: number, h: number, m = 0) => { const t = new Date(now); t.setDate(t.getDate() + d); t.setHours(h, m, 0, 0); return t.toISOString(); };
  const S = (id: string, name: string, type: WorkoutType, trainer: string, start: string, duration: number, price: number, depositPct: number, capacity: number, booked: number): Session =>
    ({ id, name, type, trainer, start, duration, price, depositPct, capacity, booked });
  const sessions = [
    S("s1", "HIIT Burn", "Group Class", "Maya Torres", day(1, 7), 45, 20, 25, 16, 11),
    S("s2", "Power Yoga", "Group Class", "Liam Chen", day(1, 18, 30), 60, 18, 25, 20, 20),
    S("s3", "Strength 1:1", "Personal Training", "Jordan Blake", day(2, 9), 60, 70, 30, 1, 0),
    S("s4", "Spin Cycle", "Group Class", "Ava Patel", day(2, 19), 45, 16, 25, 24, 17),
    S("s5", "Boxing Fundamentals", "Group Class", "Marcus Reed", day(3, 18), 60, 22, 25, 14, 6),
    S("s6", "Mobility & Recovery", "Personal Training", "Sofia Grant", day(4, 10), 45, 55, 30, 1, 0),
    S("s7", "CrossFit WOD", "Group Class", "Maya Torres", day(5, 7, 30), 60, 25, 25, 12, 12),
    S("s8", "Pilates Core", "Group Class", "Liam Chen", day(6, 17), 50, 19, 25, 15, 4),
    S("s9", "Fat Loss Coaching", "Personal Training", "Jordan Blake", day(7, 8), 60, 75, 30, 1, 0),
    S("p1", "Spin Cycle", "Group Class", "Ava Patel", day(-3, 19), 45, 16, 25, 24, 22),
    S("p2", "Power Yoga", "Group Class", "Liam Chen", day(-6, 18), 60, 18, 25, 20, 18),
  ];
  sessions[3]!.booked++; // seeded upcoming booking on s4
  const mk = (id: string, sid: string, cancelled: boolean, ago: number): Booking => {
    const s = sessions.find((x) => x.id === sid)!;
    return { id, sessionId: sid, cancelled, total: s.price, deposit: depositOf(s), createdAt: day(-ago, 12), code: `GYMFLOW:${id}:${sid}` };
  };
  return {
    name: "Alex Morgan", email: "alex.morgan@example.com", balance: 85,
    sessions,
    bookings: [mk("BK-4F2A1", "s4", false, 1), mk("BK-3C9D7", "p1", false, 5), mk("BK-2B8E4", "p2", true, 8)],
    txs: [
      { id: "TX-4", type: "deposit", amount: -4, date: day(-1, 12), label: "Deposit · Spin Cycle" },
      { id: "TX-3", type: "refund", amount: 4.5, date: day(-7, 9), label: "Refund · Power Yoga" },
      { id: "TX-2", type: "deposit", amount: -4.5, date: day(-8, 12), label: "Deposit · Power Yoga" },
      { id: "TX-1", type: "topup", amount: 100, date: day(-10, 10), label: "Wallet top up (demo)" },
    ],
  };
}