import { useState, useEffect } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useGym, rescheduleBookingDb } from "@/lib/store";

import {
  canReschedule,
  rescheduleOptions,
  depositDifference,
  willLockRefund,
} from "@/lib/reschedule";

import { money, spotsLeft, depositOf } from "@/lib/gym";

type Props = {
  bookingId: string;
};

export function RescheduleDialog({ bookingId }: Props) {
  const state = useGym();

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!state) return null;

  const booking = state.bookings.find(
    (b) => b.id === bookingId
  );

  const currentSession = state.sessions.find(
    (s) => s.id === booking?.sessionId
  );

  if (!booking || !currentSession) return null;

  if (!canReschedule(booking, currentSession, now)) {
    return null;
  }

  const options = rescheduleOptions(state, booking, now);

  const selectedSession = options.find(
    (s) => s.id === selectedId
  );

  const difference = selectedSession
    ? depositDifference(booking, selectedSession, currentSession, now)
    : 0;

  const insufficientBalance = difference > state.balance;

  const refundLocked =
    booking.visitType !== "membership" &&
    willLockRefund(booking, currentSession, now);

  const retainedDeposit =
    refundLocked && selectedSession
      ? Math.max(0, booking.deposit - depositOf(selectedSession))
      : 0;

  async function handleReschedule() {
    if (!selectedSession || loading || insufficientBalance) {
      return;
    }

    setLoading(true);

    try {
      const newBookingId = await rescheduleBookingDb(
        bookingId,
        selectedId
      );

      toast.success("Workout successfully rescheduled!");

      setOpen(false);
      setSelectedId("");

      window.location.assign(
        `/bookings/${newBookingId}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to reschedule workout."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (loading) return;
        setOpen(value);
        setSelectedId("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <CalendarClock className="mr-2 h-4 w-4" />
          Reschedule workout
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule workout</DialogTitle>

          <DialogDescription>
            Choose another available time for your workout.
            Your deposit or membership visit will be transferred.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Current workout */}
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Current workout
            </p>

            <p className="font-semibold">
              {currentSession.name}
            </p>

            <p className="text-sm">
              {new Date(currentSession.start).toLocaleString()}
            </p>
          </div>

          {/* Available sessions */}
          <div className="space-y-2">

            <p className="font-medium">
              Available sessions
            </p>

            {options.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No alternative sessions are available at the moment.
              </p>
            )}

            {options.map((session) => (
              <button
                key={session.id}
                type="button"
                disabled={loading}
                onClick={() => setSelectedId(session.id)}
                className={`w-full rounded-lg border p-3 text-left ${
                  selectedId === session.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted"
                }`}
              >
                <p className="font-medium">
                  {session.name}
                </p>

                <p className="text-sm">
                  {new Date(session.start).toLocaleString()}
                </p>

                <p className="text-sm text-muted-foreground">
                  Trainer: {session.trainer}
                </p>

                <p className="text-sm text-muted-foreground">
                  {spotsLeft(session)} spots left
                </p>
              </button>
            ))}
          </div>

          {/* Payment information */}
          {selectedSession && (
            <div className="rounded-lg border p-4">

              <p className="font-medium">
                Payment summary
              </p>

              {booking.visitType === "membership" ? (
                <p className="text-sm">
                  Your membership visit will be transferred.
                  No additional payment is required.
                </p>
              ) : difference > 0 ? (
                <p className="text-sm">
                  Additional payment: {money(difference)}
                </p>
              ) : difference < 0 ? (
                <p className="text-sm">
                  Wallet refund: {money(Math.abs(difference))}
                </p>
              ) : (
                <p className="text-sm">
                  Your deposit will be transferred.
                  No additional payment is required.
                </p>
              )}

              {refundLocked && (
                <p className="mt-2 text-sm text-destructive">
                  Your deposit is non-refundable after this rescheduling.
                </p>
              )}

              {retainedDeposit > 0 && (
                <p className="mt-2 text-sm text-destructive">
                  The excess deposit of {money(retainedDeposit)}
                  will not be refunded.
                </p>
              )}

              {insufficientBalance && (
                <p className="mt-2 text-sm text-destructive">
                  Insufficient wallet balance.
                  Please top up your wallet.
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            disabled={
              !selectedSession ||
              loading ||
              insufficientBalance
            }
            onClick={handleReschedule}
          >
            {loading
              ? "Rescheduling..."
              : "Confirm rescheduling"}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
}