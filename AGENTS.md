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

- Money/booking changes go only through database functions (book_workout, cancel_booking, top_up_wallet); tables are read-only to the app — keeps each change atomic and blocks direct balance edits.
- No sign-in yet: the app acts as the seeded demo member by email (src/lib/store.ts) — prototype scope.
