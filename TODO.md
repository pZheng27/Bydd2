# TODO.md — backlog of deferred ideas

Ideas captured mid-build to pick up later, once the current session's work is
done. Not yet slotted into a session in `SESSIONS.md`. Newest first.

## Routing — world coins  · future (2026-09-21)

Routing (Session 6) is tuned to U.S. series and the fixed dealer categories.
Doing it well for **world coins** will need a world coin catalog and richer
series/category signals, so the specialist/category prediction works outside
U.S. series. Raised by the founder while defining S6; revisit after the U.S.
routing pilot.

## Freeform sets — AI "Suggested" section  · not started (2026-09-18)

For a **freeform set** (a set built without a catalog template — the kind you
drop hand-picked coins into; see `app/(shop)/collection/`), add a **Suggested**
section that:

- infers likely **themes** from the coins already in the set — e.g. a shared
  series, mint, year, denomination, country, or subject/design; and
- suggests **possible missing pieces** that fit those themes — coins the
  collector might want to add or go looking for.

Advisory only: the AI *proposes*, the collector decides what to add. Powered by
Claude via the Anthropic SDK already in the app (`lib/anthropic.ts`). Series
(template) sets already show missing coins via the catalog checklist, so this is
specifically to give freeform sets a sense of completeness too.
