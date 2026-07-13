# Family Scorekeeper — Project Notes

A living reference for this project. Keep it updated as things change — both for your own memory and for
bootstrapping a fresh Claude conversation quickly. If starting a new chat, paste this whole file in first,
then describe what you want to do next.

## What this is
A local-first, offline-capable PWA for tracking scores in family card games. No server, no accounts —
everything (players, house rules, game history) lives in the browser's localStorage on whichever device
opened it. Hosted for free on GitHub Pages. Built entirely in vanilla JS — no framework, no build step —
specifically so it can be deployed by just pushing files, and so it's easy to read/debug without tooling.

**Status as of this packaging**: `test/smoke.js` has 221 passing assertions, `sw.js` is at
`scorekeeper-v33`, and every file below reflects everything covered in this note — this is a clean,
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
                        + UI.enableEnterNavigation() for Enter-to-next-field in score entry
js/controllers.js    — Players/Setup/Play/RulesEdit/GameOrder/Density: all button/input handlers
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
   hand and doesn't want to hunt through a full re-zip every time.
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
7. **If you change the VALUE of an existing `DEFAULT_RULES` field in `config.js`** (not just add a new
   one), that change alone will NOT reach anyone who already has a copy of the rules saved in
   localStorage — see "Rules-healing" under Data model essentials below for exactly why, and the short
   list of fields this applies to. This bit us for real this session (3-2-1 Countdown's `entryType` fix
   silently didn't apply for over a day) — don't assume a `config.js` edit alone is enough to verify a
   fix; the healing logic in `storage.js` has to actually cover the field you changed.
8. **When testing a fix that touches `DEFAULT_RULES`, always start a brand-new game**, not an
   already-in-progress one. `rulesSnapshot` is a deep copy taken at game-creation time (deliberately, so
   mid-game house-rule edits don't retroactively change a game already underway) — an old in-progress
   game will keep showing old behavior forever, even after the underlying bug is fixed and deployed.

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
- **Rules-healing in `storage.js` has two layers, and they do different jobs.** `_mergeMissing()` fills
  in keys that are entirely *absent* from someone's saved rules (a new field, a new game added later) —
  it was always there. But it can't fix a key that already *exists* with a stale value, which is exactly
  what happens whenever a code update changes an existing field: the very first `getRules()` call ever
  made on a device already wrote the old value in, so it's "present" and never gets healed by
  `_mergeMissing` alone. `getRules()` now also unconditionally re-syncs five specific fields —
  `entryType`, `info`, `label`, `winMode`, `teamMode` — from the current `DEFAULT_RULES` on every load.
  Those five are safe to always overwrite because they're **never** user-editable through the Rules
  screen; `RulesEdit`/`setNested`/`setEndValue` only ever touch nested numeric fields (`endCondition`,
  `scoring`, `bonuses`, `cardValues`) which stay fully preserved via the existing merge-missing path.
  **If you ever add a new code-owned (never user-editable) field to a game's rules object, add it to this
  resync list too**, or it'll suffer the exact same silent-staleness bug 3-2-1 Countdown just had.

## The 10 games currently built
| Game | entryType | Notes |
|---|---|---|
| Rook | `rook` | Forced 2v2 teams. Bid/trump/points-captured, 100-pt-per-hand auto-complement (enter one team's captured points, other gets the rest). Individual bidder tracked (grouped by team in dropdown), team scores. Manual-fallback entry is per-player but not part of the compact/inline system below — low-value, rarely used path. |
| Hand & Foot | `handfoot` | Solo or teams. Family house rules (not the standard published version) — card values, book bonuses all editable. Entry screen has an open-ended **Bonus** field (any signed number) for a went-out-first bonus, a bonus for pulling exactly the 26 cards needed for hand+foot from the community pile, or any other house-rule bonus/penalty. Rising minimum opening meld is 50/100/150/200 (flat +50 per hand), informational only, not wired to any editable field. 5 fields per player — deliberately stays on the "tighten-only" compact treatment (see below), never goes single-row inline. |
| Phase 10 | `phase10` | Individual. Card-quantity steppers, consolidated into a single "1 through 9" stepper (all worth a flat 5 points each per the real rulebook — face value was a bug, fixed). 10/11/12 = 10pts, Skip = 15pts (was wrongly 10), Wild = 25pts. **Winner is whoever actually completes Phase 10**, regardless of score — not whoever has the lowest total (that was a bug; see "Other notable features"). If multiple finish in the same final hand, lowest score among just them wins. If the game is ended early before anyone finishes, furthest phase progress wins, ties on phase broken by lowest score. Two toggles per player (Completed this phase / manual override) — also stays tighten-only, never single-row inline, since two toggles plus 4 steppers is too tall to sensibly inline. |
| Gnoming A Round | `simple` | (Note: officially "Gnoming A Round," not "Gnoming Around" — a Grandpa Beck's game.) Individual, 3 rounds default (adjustable), lowest wins. Score can legitimately go negative (three-of-a-kind subtraction rule) — this is intentional, not a bug, and the entry field is never blocked from negative for this reason. |
| Sequence | `winloss` | Board game, just a win/loss tracker + teams. Finishes immediately after logging the winner (see "Other notable features"). |
| Backwards 8 | `winloss` | Family's own game, no real ruleset yet — win/loss only. Same immediate-finish behavior as Sequence. |
| Reign of Dragoness | `simple` | Grandpa Beck's. 5 rounds default (adjustable), rank-based points (3/2/1/0), high score wins. |
| 3-2-1 Countdown | `countdown321` | Grandpa Beck's. **Rebuilt this session with real declaration tracking** — was previously `entryType: "simple"`, where the player had to compute the entire 3/2/1/0 + bonus/tie/forfeit logic in their head and type in a single final number. Now: each player has a hand-total field plus two checkboxes ("Countdown!" / "Blastoff!"); checking one disables every other player's checkboxes (and the other checkbox on the same player) since only one person can declare per round, and checking Blastoff auto-locks that player's total to 0. `Engine.countdown321(entries, handMeta)` computes every participant's score in one shot (dense-ranked tiers by distinct hand-total value, with the declarer's bonus/tie/forfeit layered on top) — see the function's own comments for the exact rules, they were verified against an actual rulebook photo and are non-obvious (a wrong Countdown declaration forfeits to 0 even if the player's real hand would've naturally ranked 2nd or 3rd; a *tied* lowest declarer gets no bonus, only a *sole* lowest one does). Small-group (2-3 player) games officially use "first to win 3 rounds" instead of 5-round cumulative score — documented in the rules info text but not automated; the app's default end condition is still 5 fixed rounds regardless of player count. |
| Skull King | `skullking` | Grandpa Beck's. 10 rounds default (adjustable), bid/tricks/bonus fields. Scoring constants (20/trick, -10 penalty, etc.) are editable in House Rules — this is the "classic" scoring from the actual rulebook photos, not the newer "Rascal Scoring" variant. Bid/tricks can't exceed the round's card count (round N deals N cards) *or* go negative; bonus (special-card captures) can't go negative either — all three reject inline rather than silently clamping. |
| Whoa There Cowboy | `whoacowboy` | Grandpa Beck's. Simple Tokens (already-summed point value, left flexible/unguarded — no fixed ruleset) + Cards Left fields (can't go negative). |

All games also support a **manual override toggle** ("just type the total instead") on their entry screen,
regardless of how structured the entry normally is. Manual-override fields intentionally allow negative
numbers on every game (Rook, Hand & Foot, Skull King) since a bad-enough hand can legitimately score
negative under each game's real formula — only the *structured* per-field inputs got negative-number guards,
not the manual fallback.

## Score-entry density system (Comfortable / Compact) — built this session
A global, app-wide preference (not per-game), stored in `Storage.getSettings().scoreEntryDensity`
("comfortable" or "compact"). A small, quiet text toggle sits at the top of every score-entry screen
(`Density.toggleHtml()`, rendered from `Screens.play()`) — deliberately placed away from the player list
and Save button so it can't be hit by accident, and deliberately has no confirm step, since switching
density isn't destructive.

**Auto-switch**: `Density.recordGameCompleted()` (called from `finishGame()`, never from an abandoned
game — see `Storage.getSettings().gamesCompletedCount`) flips the default to Compact after 2 real
completed games, with a one-time modal (`Density.maybeShowIntroModal()`) explaining the switch and
offering an immediate "switch back" button. If someone's already found and used the toggle manually
before hitting that threshold, the modal never fires — see the `densityIntroSeen` flag logic.

**Two visually different compact treatments**, depending on how many fields a game has per player:
- **Tighten-only** (Hand & Foot, Phase 10 — too many fields/too tall to inline): stays stacked exactly
  like Comfortable, just smaller padding/font, hint text hidden, and each toggle-row shows an explicit
  short label (`.toggle-label-short`, e.g. "Done" / "Manual") next to a slightly shrunk switch. This
  used to be a single generic "⋯" via a CSS `::before` pseudo-element — that was a real bug (Phase 10 has
  *two* different toggles and both showed the same generic label, indistinguishable) — now each toggle
  has its own explicit, correct short text baked into the markup instead of a guessed-at CSS label.
- **True single-row inline** (`.inline-fields` class, added alongside `.is-compact` only in Compact mode
  for the games with ≤3 short fields: Simple [Gnoming/Dragoness/Custom Game], Skull King, Whoa There
  Cowboy, 3-2-1 Countdown): the whole player row — name, fields, manual-override — sits on one line,
  wrapping only if it doesn't fit. Mechanism: `.entry-unit-block` itself becomes the flex row (name
  included, not a separate line above it), and any wrapper div that exists only to group fields
  (`.structured-fields`, `.c321-fields`) switches to `display:contents` so its children join that same
  row directly instead of staying nested as one block-level item. Field labels are genuinely *shortened*
  text here (`Play.fieldLabelText(full, short)` — "Tricks won" → "Won", not just shrunk font-size on the
  long text, which was a real bug that caused the row to wrap to 2-3 lines). The manual-override control
  becomes a single small "⋯" glyph with the switch's track/knob visuals stripped entirely — matching a
  sandbox mockup that used a plain icon button, not an icon-plus-switch combo competing for space (also a
  real bug this session: an early version kept the full switch widget *and* added the ⋯, doubling the
  control for no reason). Input widths are digit-count-aware, not one blanket size — most fields assume 2
  digits (`2.6rem`), a few that can realistically run longer (Skull King's Bonus, Whoa Cowboy's Tokens,
  Countdown321's hand total) are tagged with a `.digits-3` class for `3.3rem`. **Watch for CSS
  specificity ties when touching these rules** — a legacy `.field-row input.input-compact` rule from
  before this system existed tied in specificity with an early, less-specific version of the inline-field
  width rule and silently won the cascade, and the fix (verified for real via jsdom's computed-style
  resolution, not just specificity arithmetic on paper) was making the new selector unambiguously more
  specific by explicitly including `.input-compact` rather than relying on source-order tiebreaking.

**Collapsible player cards**: a small chevron next to the name (`Play.unitLabelHtml()`,
`Play.toggleCollapse()`) collapses a player's card down to just the bare name — no total, no partial
entries peeking through. Only rendered where a card is still in stacked form: Comfortable mode for every
game, and Compact mode specifically for Hand & Foot/Phase 10 (the tighten-only games) — the single-row
inline games don't get it in Compact, since there's nothing left to collapse on an already-minimal row.
Pure CSS class toggle, no re-render, so nothing typed into other players' fields is lost.

**Enter-to-next-field** (`UI.enableEnterNavigation()`, registered once in `App.init()`): pressing Enter in
any `.entry-grid` input/select moves focus to the next one, in DOM order, spanning across players.
Deliberately scoped only to `.entry-grid` fields — separate from, and doesn't interfere with, the
player-name field's own Enter-to-add handler or the guest-name prompt modal's Enter-to-submit. Skips
disabled fields (e.g. a Blastoff-locked total), fields hidden via `.hidden` (e.g. a toggled-off manual
override), and fields inside a collapsed player card — that last one was a real bug caught during testing:
collapsing hides fields via a different mechanism (`.entry-unit-block.collapsed`) than `.hidden`, so the
navigation filter has to check both. On the very last field in the whole form, Enter just blurs — closes
the keyboard, never submits, never touches Save. That's deliberate: this feature exists specifically to
avoid an accidental Enter press ever submitting a round of unfinished data.

## Home screen leaderboard sort
`Players.leaderboardOrder()` sorts the Home screen's player list (not the Manage Players screen, which
stays insertion-order) by wins descending, tiebreaking by games played ascending (fewer games for the
same win count ranks higher — rewards efficiency). Anyone with 0 games played always sinks to the bottom
regardless of the wins/games comparison, sorted alphabetically among themselves, so a brand-new player
never outranks someone who's actually played and just hasn't won yet.

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
- Abandon Game (end without declaring a winner — no history entry, no stat changes, and does NOT count
  toward the density auto-switch threshold — see the density section above)
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
  clamp to 0). Deliberately left alone: Gnoming/Dragoness's total field and 3-2-1 Countdown's hand-total
  field (must allow negative — Gnoming's three-of-a-kind rule), Hand & Foot's Bonus field (open-ended on
  purpose), every manual-override field on every game (each game's real formula can legitimately produce
  a negative hand score), and Whoa There Cowboy's tokens field (no fixed ruleset for that one). Rook's
  bid/captured-points were already fully guarded before this pass (min/max clamped).
- **3-2-1 Countdown declaration tracking** — see the dedicated section above; was `entryType: "simple"`
  (manual mental math) as recently as this session, now has real per-player Countdown!/Blastoff!
  checkboxes and an engine function that computes every participant's score from actual hand totals.
- **Score-entry Comfortable/Compact density system, collapsible player cards, and Enter-to-next-field
  navigation** — see the dedicated sections above. All three are new this session.
- **Stale rules-field healing** — see "Rules-healing" under Data model essentials above. Fixes a real bug
  where a code change to `entryType`/`info`/`label`/`winMode`/`teamMode` silently never reached anyone
  with an existing localStorage rules copy, no matter how many times the underlying code got fixed.

## Known open items / possible next steps
- **Yahtzee not yet built.** Discussed at length: standard Yahtzee and Triple Yahtzee should be two
  separate game entries (own `entryType` each), not a toggle on one game — the difference is a real
  structural change (13 categories vs. 39 slots across 3 columns with column multipliers and a stricter
  Joker rule), closer to how Rook/Skull King each get their own dedicated entryType than to Custom Game's
  lightweight setup-time toggle. The scorecard is naturally table-shaped (categories × columns), which is
  why standard Yahtzee is expected to want its own careful, close-to-the-real-scorecard layout rather than
  reusing the compact/inline system built this session — flagged by the user as something that "needs to
  remain close to the actual game card to make sense of it," so don't just bolt it onto `.inline-fields`.
- Whoa There Cowboy and Skull King came from photographed rulebooks — if the user later gets different
  editions with different scoring, the constants are editable in House Rules already for Skull King;
  Whoa There Cowboy's formula is hardcoded in `Engine.whoacowboy()` (simple enough it wasn't made editable).
- **Phase 10's and 3-2-1 Countdown's scoring/winner-determination rules were both verified against actual
  rulebook photos** and both had real bugs found this way (see "Other notable features" above) — worth
  keeping in mind that other games' rules were built from memory/research rather than a photographed
  source, so if something seems off, checking against a real rulebook photo is the fastest way to confirm
  and fix it precisely. When reading a rulebook photo, crop/rotate/zoom tightly on just the relevant
  paragraph before transcribing — a full-page read of an angled phone photo is genuinely low-confidence
  and worth flagging as such rather than acting on it directly (this came up concretely with 3-2-1
  Countdown's scoring section this session).
- Not yet built (discussed, declined, or deferred): data export/backup (declined — user isn't worried
  about losing stats), family stats/leaderboard screen (declined as a separate screen — a lightweight
  version shipped instead as the Home screen sort, see above).
- **Deliberate scope decision on hand-fixing**: `Play.deleteHand()` only removes a past hand, it doesn't
  let you edit one in place. A true in-place editor would need every entryType (rook, skullking, phase10,
  handfoot, whoacowboy, countdown321) to store its raw per-field inputs alongside the computed score, plus
  a dedicated edit form per type — a much bigger, riskier change. Delete-and-re-enter covers the common
  case (typo a few hands back) without that. Worth revisiting if it turns out to be annoying in practice.
- User was warned that having two chats/browser tabs edit files "at once" caused at least one real bug
  (Skull King's engine function had a signature mismatch) — stick to one active conversation for edits.
- Current `sw.js` cache version: `scorekeeper-v33`.
- **Rook's manual-fallback entry** and the primary bid-entry screen were never brought into the
  compact/inline-fields system this session — low-value given how rarely the fallback is used, but worth
  a look if Rook's entry screen ever comes up for its own reasons.

## If you're a new Claude conversation reading this
Ask the user to paste or upload the current project files (or just the ones relevant to the task) so you're
working from ground truth rather than this summary. This document should get you oriented on *why* things
are built the way they are, but the actual files are always the source of truth for *what's* currently there.
Two things worth doing immediately in a fresh conversation, given what this session learned the hard way:
pull the user's actual GitHub repo (`codeload.github.com/<user>/<repo>/tar.gz/refs/heads/main` via
`bash_tool`, since `web_fetch` is blocked by GitHub's robots.txt) rather than trusting a prior session's
summary of what's deployed, and if a fix doesn't seem to have taken effect, check whether it touches a
`DEFAULT_RULES` field before assuming the code itself is wrong — see convention #7 above.
