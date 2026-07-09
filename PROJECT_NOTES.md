# Family Scorekeeper — Project Notes

A living reference for this project. Keep it updated as things change — both for your own memory and for
bootstrapping a fresh Claude conversation quickly. If starting a new chat, paste this whole file in first,
then describe what you want to do next.

## What this is
A local-first, offline-capable PWA for tracking scores in family card games. No server, no accounts —
everything (players, house rules, game history) lives in the browser's localStorage on whichever device
opened it. Hosted for free on GitHub Pages. Built entirely in vanilla JS — no framework, no build step —
specifically so it can be deployed by just pushing files, and so it's easy to read/debug without tooling.

## Architecture
```
index.html          — app shell, loads scripts in order below
css/style.css        — all styling (felt-green/cream card-table theme)
js/config.js         — DEFAULT_RULES: every game's rules as data (labels, scoring, end conditions)
js/storage.js        — localStorage read/write, including self-healing of stale saved data
js/engine.js         — pure scoring math functions, one per game entryType
js/ui.js             — UI.confirm/prompt/alert (themed modal replacements for native browser dialogs)
                        + UI.showUpdateBanner() for the "new version ready" prompt
js/controllers.js    — Players/Setup/Play/RulesEdit/GameOrder: all button/input handlers
js/app.js            — Screens object (renders each screen) + App (state/router, History API back-button wiring)
manifest.json / sw.js — PWA install + offline caching
icons/                — home-screen icons (spade glyph, felt green)
test/smoke.js         — jsdom-based test suite covering every game type end-to-end
```

Every screen is a function that returns an HTML string; every action is a plain function that mutates
state and re-renders. No JSX, no virtual DOM, no component lifecycle — deliberately simple so it's easy
to open cold and trace top-to-bottom.

## Critical workflow conventions (please keep doing these)
1. **Bump `CACHE_NAME` in `sw.js` on every change**, even CSS-only ones. The service worker caches
   aggressively; without a version bump, browsers keep serving old files indefinitely after an update.
2. **Deliver only the files that actually changed**, not the whole project — the user applies them by
   hand in VS Code and doesn't want to hunt through a full re-zip every time.
3. **Run `test/smoke.js` before shipping anything.** It's a real jsdom-based suite, already present in
   the repo at `test/smoke.js` (not something to write from scratch) — it plays through every game
   end-to-end and has caught several real bugs before they shipped. Install jsdom
   (`npm install jsdom`), run `node test/smoke.js`, then `rm -rf node_modules package*.json` before
   copying files out (keeps delivered files clean of dev artifacts). **When you add or change a game's
   logic, extend this file with new test cases rather than treating it as read-only** — it should always
   reflect everything the app currently does.
4. **Check in before packaging/shipping** — the user explicitly wants to review/iterate before files are
   finalized, not have them pushed automatically after every small change.
5. The user deploys via **VS Code's Source Control panel** (Publish to GitHub was used for initial setup)
   and tests locally with `py -m http.server 8000` (their machine only has the `py` launcher, not `python`).
6. **If you add a new `js/*.js` file, it must go in three places**: the `<script>` tag order in
   `index.html`, the `ASSETS` array in `sw.js` (or it silently won't be cached offline), and the `load()`
   calls at the top of `test/smoke.js`. Easy to forget the last two since the app still works fine
   locally without them — the gap only shows up offline or in a fresh install.

## Data model essentials
- A **game** has `units` (players or teams), `hands` (array of rounds played), an `endCondition`
  (`target` / `hands` / `manual` / `phase`), and a `rulesSnapshot` — a **deep copy** of that game's rules
  taken at start time, so editing house rules mid-game-night never affects a game already in progress.
- **End conditions**: every game whose ending is just a round/score counter (not a real structural rule)
  now supports all three choices — Target Score / Fixed Hands / End on Cue — via `allowChoice: true` in
  config: Rook, Hand & Foot, Gnoming A Round, Reign of Dragoness, 3-2-1 Countdown, Skull King, and Whoa
  There Cowboy. "Target Score" is hidden from the Setup screen for low-score-wins games (currently just
  Gnoming) since "first to reach X" doesn't mean anything when lower is better — see the `winMode ===
  "high"` check around the segmented control in `Screens.setup()`. Two real exceptions remain: Phase 10
  (ends when someone finishes Phase 10 — an actual rule, not a stand-in round count) and Sequence/
  Backwards 8 (win/loss trackers with no round or score concept to choose between in the first place).
- **House Rules editing** is deliberately buried (Rules screen → pick game → small "Edit house rules"
  link at the bottom, not a prominent button) so nobody changes scoring by accident mid-game-night.

## The 9 games currently built
| Game | entryType | Notes |
|---|---|---|
| Rook | `rook` | Forced 2v2 teams. Bid/trump/points-captured, 100-pt-per-hand auto-complement (enter one team's captured points, other gets the rest). Individual bidder tracked (grouped by team in dropdown), team scores. |
| Hand & Foot | `handfoot` | Solo or teams. Family house rules (not the standard published version) — card values, book bonuses all editable. |
| Phase 10 | `phase10` | Individual. Card-quantity steppers (not single-select) so multiples of one value work. Lowest score wins once anyone finishes Phase 10, regardless of who. |
| Gnoming A Round | `simple` | (Note: officially "Gnoming A Round," not "Gnoming Around" — a Grandpa Beck's game.) Individual, 3 rounds default, lowest wins. |
| Sequence | `winloss` | Board game, just a win/loss tracker + teams. |
| Backwards 8 | `winloss` | Family's own game, no real ruleset yet — win/loss only. |
| Reign of Dragoness | `simple` | Grandpa Beck's. 5 rounds, rank-based points (3/2/1/0), high score wins. |
| 3-2-1 Countdown | `simple` | Grandpa Beck's. Same shape as Dragoness, with a +1 "Countdown" bonus folded into the entered number. |
| Skull King | `skullking` | Grandpa Beck's. 10 rounds, bid/tricks/bonus fields. Scoring constants (20/trick, -10 penalty, etc.) are editable in House Rules — this is the "classic" scoring from the actual rulebook photos, not the newer "Rascal Scoring" variant. |
| Whoa There Cowboy | `whoacowboy` | Grandpa Beck's. Simple Tokens (already-summed point value) + Cards Left fields. |

All games also support a **manual override toggle** ("just type the total instead") on their entry screen,
regardless of how structured the entry normally is.

## Other notable features already built
- Undo Last Hand (removes + lets you re-enter, rather than a full field-by-field edit) — plus a per-hand
  delete button on any hand in the running history (`Play.deleteHand()`), not just the most recent one.
  Both share `Play.recomputeLastRookInfo()` so Rook's "last hand's bid" panel stays correct either way.
- Play Again / Rematch (same players/teams/rules, skips setup)
- Abandon Game (end without declaring a winner — no history entry, no stat changes)
- Player colors, Reset Stats (not delete-and-recreate). Adding a player with a name that already exists
  now prompts for confirmation first (`Players.add()`'s duplicate-name guard) rather than silently
  creating two indistinguishable entries.
- Delete a single Game History entry (`Play.deleteHistoryEntry()`, button on the History Detail screen) —
  separate from the declined full export/backup feature below; this is just "undo a mis-recorded game."
- Reorder Games screen (up/down arrows, no drag-and-drop) — defaults to alphabetical, "Reset to
  Alphabetical" button clears any custom order. New games added later auto-append rather than
  resetting a user's custom order (see `GameOrder.getEffectiveOrder()` in controllers.js).
- Inline field-level validation (red border + message under the *row*, not squeezed next to the input)
  plus a cheeky toast ("Hey, you missed something!" → "Really...? Check the red one." on repeat fails)
- Rules-healing in `storage.js`: if a user's saved rules predate a config change (new field, new game),
  missing pieces get merged in automatically without touching their customizations.
- **Themed confirm/prompt/alert modals** (`js/ui.js`) replace every native `confirm()`/`prompt()`/`alert()`
  call in the app — those broke the felt-and-cream look with a jarring system dialog. `UI.alert()` has no
  caller yet but is there and tested for whenever one comes up.
- **Device/browser back button now navigates in-app screens** instead of closing the app outright. Every
  `App.go()` call pushes a `history` entry (with `screen`/`rulesViewKey`/`historyDetailId`); a `popstate`
  listener in `App.init()` reads it back on back-navigation. Previously the app never touched the History
  API at all, so an installed PWA's empty history stack meant the very first back-press exited entirely.
  A lingering modal is also force-closed on any popstate, so back-then-forward can't strand one on screen.
- **"Update available" banner**: since `sw.js` already does `skipWaiting()`/`clients.claim()`, a new
  version takes over in the background the moment it's deployed — but an already-open tab wouldn't know
  until a manual restart. `index.html` listens for `serviceWorker.controllerchange` and calls
  `UI.showUpdateBanner()` (skipped on first install, only shown for a genuine update over an existing
  controller) so people actually see new deploys land.

## Known open items / possible next steps
- Whoa There Cowboy and Skull King came from photographed rulebooks — if the user later gets different
  editions with different scoring, the constants are editable in House Rules already for Skull King;
  Whoa There Cowboy's formula is hardcoded in `Engine.whoacowboy()` (simple enough it wasn't made editable).
- Not yet built (discussed, declined, or deferred): data export/backup (declined — user isn't worried
  about losing stats), family stats/leaderboard screen (declined — feels redundant with existing history).
- **Deliberate scope decision on hand-fixing**: `Play.deleteHand()` only removes a past hand, it doesn't
  let you edit one in place. A true in-place editor would need every entryType (rook, skullking, phase10,
  handfoot, whoacowboy) to store its raw per-field inputs alongside the computed score, plus a dedicated
  edit form per type — a much bigger, riskier change. Delete-and-re-enter covers the common case (typo a
  few hands back) without that. Worth revisiting if it turns out to be annoying in practice.
- User was warned that having two chats/browser tabs edit files "at once" caused at least one real bug
  (Skull King's engine function had a signature mismatch) — stick to one active conversation for edits.
- Current `sw.js` cache version: `scorekeeper-v24`.

## If you're a new Claude conversation reading this
Ask the user to paste or upload the current project files (or just the ones relevant to the task) so you're
working from ground truth rather than this summary. This document should get you oriented on *why* things
are built the way they are, but the actual files are always the source of truth for *what's* currently there.
