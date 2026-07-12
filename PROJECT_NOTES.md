# Family Scorekeeper — Project Notes

A living reference for this project. Keep it updated as things change — both for your own memory and for
bootstrapping a fresh Claude conversation quickly. If starting a new chat, paste this whole file in first,
then describe what you want to do next.

## What this is
A local-first, offline-capable PWA for tracking scores in family card games. No server, no accounts —
everything (players, house rules, game history) lives in the browser's localStorage on whichever device
opened it. Hosted for free on GitHub Pages. Built entirely in vanilla JS — no framework, no build step —
specifically so it can be deployed by just pushing files, and so it's easy to read/debug without tooling.

**Status as of this packaging**: `test/smoke.js` has 175 passing assertions, `sw.js` is at
`scorekeeper-v27`, and every file below reflects everything covered in this note — this is a clean,
fully-verified baseline, not a partial/in-progress state.

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
  (ends when someone finishes Phase 10 — an actual rule, not a stand-in round count) and win/loss games
  (Sequence, Backwards 8, Custom Game's Win/Loss-only mode) — these always finish after exactly one hand
  (see the "win/loss games finish immediately" bullet further down), so `endCondition` is stored on them
  mostly for shape-consistency and isn't actually consulted by `Play.saveWinLoss()`.
- **House Rules editing** is deliberately buried (Rules screen → pick game → small "Edit house rules"
  link at the bottom, not a prominent button) so nobody changes scoring by accident mid-game-night.

## The 9 games currently built
| Game | entryType | Notes |
|---|---|---|
| Rook | `rook` | Forced 2v2 teams. Bid/trump/points-captured, 100-pt-per-hand auto-complement (enter one team's captured points, other gets the rest). Individual bidder tracked (grouped by team in dropdown), team scores. |
| Hand & Foot | `handfoot` | Solo or teams. Family house rules (not the standard published version) — card values, book bonuses all editable. Entry screen has an open-ended **Bonus** field (any signed number) for a went-out-first bonus, a bonus for pulling exactly the 26 cards needed for hand+foot from the community pile, or any other house-rule bonus/penalty — see "Other notable features" below. Rising minimum opening meld is 50/100/150/200 (flat +50 per hand), informational only, not wired to any editable field. |
| Phase 10 | `phase10` | Individual. Card-quantity steppers, consolidated into a single "1 through 9" stepper (all worth a flat 5 points each per the real rulebook — face value was a bug, fixed). 10/11/12 = 10pts, Skip = 15pts (was wrongly 10), Wild = 25pts. **Winner is whoever actually completes Phase 10**, regardless of score — not whoever has the lowest total (that was a bug; see "Other notable features"). If multiple finish in the same final hand, lowest score among just them wins. If the game is ended early before anyone finishes, furthest phase progress wins, ties on phase broken by lowest score. |
| Gnoming A Round | `simple` | (Note: officially "Gnoming A Round," not "Gnoming Around" — a Grandpa Beck's game.) Individual, 3 rounds default (adjustable), lowest wins. Score can legitimately go negative (three-of-a-kind subtraction rule) — this is intentional, not a bug, and the entry field is never blocked from negative for this reason. |
| Sequence | `winloss` | Board game, just a win/loss tracker + teams. Finishes immediately after logging the winner (see "Other notable features"). |
| Backwards 8 | `winloss` | Family's own game, no real ruleset yet — win/loss only. Same immediate-finish behavior as Sequence. |
| Reign of Dragoness | `simple` | Grandpa Beck's. 5 rounds default (adjustable), rank-based points (3/2/1/0), high score wins. |
| 3-2-1 Countdown | `simple` | Grandpa Beck's. Same shape as Dragoness, with a +1 "Countdown" bonus folded into the entered number. |
| Skull King | `skullking` | Grandpa Beck's. 10 rounds default (adjustable), bid/tricks/bonus fields. Scoring constants (20/trick, -10 penalty, etc.) are editable in House Rules — this is the "classic" scoring from the actual rulebook photos, not the newer "Rascal Scoring" variant. Bid/tricks can't exceed the round's card count (round N deals N cards) *or* go negative; bonus (special-card captures) can't go negative either — all three reject inline rather than silently clamping. |
| Whoa There Cowboy | `whoacowboy` | Grandpa Beck's. Simple Tokens (already-summed point value, left flexible/unguarded — no fixed ruleset) + Cards Left fields (can't go negative). |

All games also support a **manual override toggle** ("just type the total instead") on their entry screen,
regardless of how structured the entry normally is. Manual-override fields intentionally allow negative
numbers on every game (Rook, Hand & Foot, Skull King) since a bad-enough hand can legitimately score
negative under each game's real formula — only the *structured* per-field inputs got negative-number guards,
not the manual fallback.

## Other notable features already built
- Undo Last Hand (removes + lets you re-enter, rather than a full field-by-field edit) — plus a per-hand
  delete button on any hand in the running history (`Play.deleteHand()`), not just the most recent one.
  Both share `Play.recomputeLastRookInfo()` so Rook's "last hand's bid" panel stays correct either way.
  **Also reachable from the Results screen** (`Play.undoLastFromResults()`) for whichever hand just
  finished the game — otherwise there was no way to fix a mis-entered final hand once a game auto-ended
  (hit its target/hand-count, or a win/loss game logging its one deciding hand), since the button only
  existed on the Play screen. Reverses the player-stat bump and history entry `finishGame()` applied,
  restores the game to active with that hand removed, and drops you back on the Play screen to redo it.
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
- **Win/loss games (Sequence, Backwards 8, and Custom Game's Win/Loss-only mode) finish immediately
  after logging one hand** — `Play.saveWinLoss()` always calls `finishGame()` directly, bypassing
  Fixed Hands/Target/Manual entirely. These are a single complete game with one outcome (you play a full
  game of Sequence, log who won, done), not a running tally across repeated rounds like the other games.
  Because of this, the "How should this game end?" Setup card is hidden for Sequence/Backwards 8 (always
  was, via their hardcoded `manual` endCondition) and for custom Win/Loss-only games (hidden explicitly,
  since `customEndType`/`endValue` are no longer meaningful once this mode is picked).
- **Custom Game supports Win/Loss-only scoring**, not just point totals — pick "Win/Loss only" at setup
  and it behaves exactly like Sequence/Backwards 8 (`winMode: "winloss"`, `entryType: "winloss"`, tap who
  won and the game finishes immediately, per the bullet above). Useful for games families track as a
  simple win tally rather than points (Uno was the example that came up — worth noting its *official*
  rules actually do use point scoring based on cards left in opponents' hands, so this is for however a
  given family actually plays it, not a claim about the official rules). Both "Target Score" and the
  whole end-condition card are hidden in this mode — see `Setup.setCustomScoreMode()` in controllers.js.
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
- **Win/loss entry screen has no pre-selected winner** — it used to default to the first unit, so a rushed
  tap of "Log Winner" could silently log the wrong winner. `Play.winLossForm()` no longer defaults
  `entryDraft.winnerId`, and the "Log Winner" button stays disabled until someone actually taps a name.
- **Phase 10 scoring bug fix**: cards numbered 1-9 were scoring their *face value* (a "7" scored 7 points)
  instead of the rulebook's flat 5 points each, and Skip was scoring 10 instead of 15 — confirmed against
  an actual rulebook photo. Fixed in `Play.phase10Form()`'s `cardVals` array, and consolidated the nine
  separate 1-9 steppers into one "1 through 9" stepper (they're all worth the same now, so tracking exact
  numbers added nothing) — this also removes the possibility of the face-value bug ever recurring.
- **Phase 10 winner-determination bug fix**: `Engine.determineWinner()` used to just pick whoever had the
  lowest score overall, completely ignoring who'd actually completed Phase 10 — someone still stuck on
  Phase 6 with a lucky low score could "win" over the real Phase 10 finisher. Also confirmed against the
  rulebook. Fixed to: (1) the sole Phase 10 finisher wins outright regardless of score, (2) if multiple
  finish in the same final hand, lowest score among just those tied finishers wins, (3) if the game is
  ended early via "End Game Now" before anyone finishes (not a scenario the official rules cover at all),
  furthest phase progress wins first, with lowest score only as a tiebreak among players on the same phase.
  A genuine points tie among simultaneous finishers is a documented gap (same treatment as 3-2-1
  Countdown/Skull King ties) — the rulebook has them replay Phase 10, which the app doesn't automate.
- **Negative-number guards audited across every game** — added where a negative value can't mean anything
  real (Skull King bid/tricks/bonus — reject inline, same pattern as the existing round-limit check; Hand &
  Foot's books/meld/stuck and Phase 10's manual override and Whoa There Cowboy's cards-left — silently
  clamp to 0). Deliberately left alone: Gnoming/Dragoness/Countdown321's total field (must allow negative —
  Gnoming's three-of-a-kind rule), Hand & Foot's Bonus field (open-ended on purpose), every manual-override
  field on every game (each game's real formula can legitimately produce a negative hand score), and Whoa
  There Cowboy's tokens field (no fixed ruleset for that one). Rook's bid/captured-points were already
  fully guarded before this pass (min/max clamped).

## Known open items / possible next steps
- Whoa There Cowboy and Skull King came from photographed rulebooks — if the user later gets different
  editions with different scoring, the constants are editable in House Rules already for Skull King;
  Whoa There Cowboy's formula is hardcoded in `Engine.whoacowboy()` (simple enough it wasn't made editable).
- **Phase 10's scoring and winner-determination rules were both verified against an actual rulebook photo**
  and both had bugs (see "Other notable features" above) — worth keeping in mind that other games' rules
  were built from memory/research rather than a photographed source, so if something seems off, checking
  against a real rulebook photo (like these two) is the fastest way to confirm and fix it precisely.
- Not yet built (discussed, declined, or deferred): data export/backup (declined — user isn't worried
  about losing stats), family stats/leaderboard screen (declined — feels redundant with existing history).
- **Deliberate scope decision on hand-fixing**: `Play.deleteHand()` only removes a past hand, it doesn't
  let you edit one in place. A true in-place editor would need every entryType (rook, skullking, phase10,
  handfoot, whoacowboy) to store its raw per-field inputs alongside the computed score, plus a dedicated
  edit form per type — a much bigger, riskier change. Delete-and-re-enter covers the common case (typo a
  few hands back) without that. Worth revisiting if it turns out to be annoying in practice.
- User was warned that having two chats/browser tabs edit files "at once" caused at least one real bug
  (Skull King's engine function had a signature mismatch) — stick to one active conversation for edits.
- Current `sw.js` cache version: `scorekeeper-v27`.

## If you're a new Claude conversation reading this
Ask the user to paste or upload the current project files (or just the ones relevant to the task) so you're
working from ground truth rather than this summary. This document should get you oriented on *why* things
are built the way they are, but the actual files are always the source of truth for *what's* currently there.
