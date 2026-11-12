# Flex Booking Club

Build a responsive gym booking website called GymFlow. Implement only the customer-facing interface. Do not build an admin dashboard, receptionist interface, trainer portal, or backend management system.



Create a functional, interactive prototype with a modern fitness design, using dark navy, white, and lime-green accents.



1. Home / Dashboard



- Welcome message.

- Display the customer's wallet balance.

- Show upcoming bookings.

- Add a prominent "Book a Workout" button.

- Show a few popular workout classes.



2. Browse Workouts



Display available workout sessions as cards. Include:



- Workout name and type (Group Class or Personal Training).

- Trainer name.

- Date, time, and duration.

- Total price.

- Available spots.

- Required deposit.



Allow filtering by workout type and date. Disable booking when a session is full.



3. Booking and Payment



When a customer selects a session:



- Show the workout details and payment breakdown.

- Calculate the required deposit and remaining payment.

- Let the customer confirm the booking.



Payment rules:



- Deduct only the required deposit from the customer's virtual wallet.

- If the balance is insufficient, display "Insufficient funds. Please top up your wallet."

- If funds are insufficient, do not deduct money, create a booking, or reserve a spot.

- If funds are sufficient and a spot is available, deduct the deposit and confirm the booking.

- Prevent duplicate bookings and overbooking.

- Display a confirmation message after successful booking.



Use demo wallet balances and simulated payments only.



4. My Bookings



Create a page displaying upcoming, completed, and cancelled bookings.



For each booking, show:



- Workout name.

- Date and time.

- Trainer.

- Total price.

- Deposit paid.

- Remaining amount due at the gym reception.

- Booking status.



Allow the customer to cancel a booking before the cancellation deadline. When a booking is cancelled, release its reserved spot. Keep the cancellation policy simple and clearly displayed.



5. QR Code



After a successful booking, generate a unique QR code for that booking.



Display the QR code on the booking details page, together with:



- Booking ID.

- Workout information.

- Date and time.

- Deposit paid.

- Remaining amount to pay at reception.



The QR code will be shown to reception staff when the customer arrives. Do not build the scanning or receptionist interface.



6. Wallet



Create a wallet page displaying:



- Current balance.

- A demo "Top Up" button.

- Transaction history.

- Deposit payments and refunds.



Update the balance and transaction history after each successful operation.



7. Navigation



Use a simple customer-facing navigation bar:



- Home

- Workouts

- My Bookings

- Wallet

- Profile



8. Technical and Design Requirements



- Build only the customer-facing website.

- Use reusable components and a clean project structure.

- Make the interface responsive on mobile and desktop.

- Use realistic demo data for workouts, available spots, wallet balances, and bookings.

- Use a QR code library to generate booking QR codes.

- Ensure buttons, filters, navigation, booking, cancellation, and wallet interactions work.

- Persist demo data across refreshes using browser storage if a backend is unavailable.

- Keep the implementation simple and token-efficient.

- Do not add unnecessary features, complex animations, real payment integrations, or unrelated pages.



Priority: Complete the core booking flow first: browse workouts → select a session → validate wallet balance and availability → pay deposit → confirm booking → display QR code.



Deliver a working prototype rather than a static design.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://flex-booking-club.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c4ecb8b0-7601-5b2b-8e0e-bbddfa0ecb8d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
