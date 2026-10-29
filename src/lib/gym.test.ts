import { describe, expect, it } from "vitest";
import { bookSession, cancelBooking, makeSeed } from "./gym";

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
