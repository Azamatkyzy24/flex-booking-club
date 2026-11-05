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
