<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Money/booking changes go only through database functions (book_session, cancel_booking, top_up_wallet); tables are read-only to the app — keeps each change atomic and blocks direct balance edits. The Book button uses book_session (locks the workout row FOR UPDATE, raises SESSION_FULL / INSUFFICIENT_BALANCE); book_workout is its legacy equivalent, kept for compatibility.
- Auth is email/password via Supabase; members.user_id links to auth.users, and a trigger on auth.users creates the members row + default 'member' role on signup. src/lib/store.ts resolves the current member from the session; route guards live in src/routes/__root.tsx (client-side, redirects to /login).
- Spots-left counts come from the security-definer workout_booked_counts() because RLS limits bookings rows to the caller's own.
- Trainer profiles extend existing trainer rows; sessions carry trainer IDs and slugs for links without matching display names.
- News uses read-only authenticated RLS and informational workout references; announcements never mutate workouts, bookings or wallets.
- Catalog routes use client-only Query loaders under the existing login shell because member sessions are browser-held; Home news is a noncritical cached read.
- Reviews: one per booking, written only through the security-definer submit_review() (own booking, session finished, not cancelled, rating 1-5, feedback up to 500 chars); the table is read-only to the app. Course ratings are computed by workout_rating_summary() (same title + trainer) and never stored; other members' reviews come from workout_reviews() with first names only. Workouts carry a description column shown on cards and booking pages.
