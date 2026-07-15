# Family Scorekeeper — Project Notes

A living reference for this project. Keep it updated as things change — both for your own memory and for
bootstrapping a fresh Claude conversation quickly. If starting a new chat, paste this whole file in first,
then describe what you want to do next.

**This file was trimmed on 2026-07-13** — it had grown into a session-by-session diary (310 lines,
~30KB) that every fresh Claude had to read in full before doing anything. See "Efficiency notes" at the
bottom for what changed and why. Keep entries here to durable facts and current state, not a narrated
history of how each bug was found and fixed — that's what git history is for.

## Usage-efficiency expectations for Claude
- **Assume the code in this conversation is current** unless told otherwise. Don't re-pull the full
  repo/tarball if it's already been fetched this session — re-fetch only when told something changed
  outside the conversation, or at the very start of a new session.
- **Pull or view only what the task touches.** Grep for the specific function/selector/section first,
  then view a targeted range — don't read whole files (or the whole repo) to make a small, well-scoped
  change.
- **Match verification effort to the change.** Only run the test suite (or extend it) when a change
  touches actual logic. Skip it for CSS, copy, layout, or other changes it can't meaningfully verify.
- **Don't build throwaway tooling** (scratch repro files, sandboxes, etc.) to double-check something
  reasoning from the code and docs can already answer — only build a repro when there's a real, otherwise
  unresolvable uncertainty.
- **Keep this file itself lean.** Record current state and the *why* behind decisions, not a
  session-by-session diary of how each bug was found and fixed — that history belongs in git commits, not
  here. If this file starts creeping back up in size, trim it rather than let it compound.
- **Deliver only the files that actually changed**, not a full re-zip of the project.
- **Check in before packaging/shipping** — confirm the plan or show the diff before finalizing files,
  even for a single-file change, unless clearly told to just go ahead.
- **Batch related changes** into one pass rather than iterating file-by-file across separate turns when
  the scope is already clear.

## What this is
A local-first, offline-capable PWA for tracking scores in family card games. No server, no accounts —
everything (players, house rules, game history) lives in the browser's localStorage on whichever device
opened it. Hosted for free on GitHub Pages. Built entirely in vanilla JS — no framework, no build step —
specifically so it can be deployed by just pushing files, and so it's easy to read/debug without tooling.

**Status**: `test/smoke.js` has 221 passing assertions, `sw.js` is at `scorekeeper-v33`. Clean, verified
baseline.

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
test/smoke.js         — jsdom-based test suite covering every game type end-to-end (one continuous
                        script with shared state across sections — not independent per-game tests, see
                        "Efficiency notes" before splitting or restructuring it)
```

Every screen is a function that returns an HTML string; every action is a plain function that mutates
state and re-renders. No JSX, no virtual DOM, no component lifecycle — deliberately simple so it's easy
to open cold and trace top-to-bottom.

## Critical workflow conventions (please keep doing these)
1. **Bump `CACHE_NAME` in `sw.js` on every change**, even CSS-only ones. The service worker caches
   aggressively; without a version bump, browsers keep serving old files indefinitely after an update.
2. **Deliver only the files that actually changed**, not the whole project — the user applies them by
   hand and doesn't want to hunt through a full re-zip every time.
3. **Only run/extend `test/smoke.js` when a change touches actual logic** — `js/engine.js`, a
   `DEFAULT_RULES` *value* in `config.js`, or winner/end-condition determination in `controllers.js`.
   Skip it for CSS, copy, or layout-only changes — jsdom can't catch those anyway, so running it just
   burns tool calls for no signal. When you do need to extend it: `grep -n "^// [0-9]" test/smoke.js` to
   find the numbered section list, then `view` just the relevant range rather than the whole 1,100+ line
   file. Install jsdom (`npm install jsdom`), run `node test/smoke.js`, then `rm -rf node_modules
   package*.json` before copying files out.
4. **Check in before packaging/shipping** — the user explicitly wants to review/iterate before files are
   finalized, not have them pushed automatically after every small change.
5. The user deploys via **VS Code's Source Control panel** and tests locally with `py -m http.server
   8000` (their machine only has the `py` launcher, not `python`).
6. **If you add a new `js/*.js` file, it must go in three places**: the `<script>` tag order in
   `index.html`, the `ASSETS` array in `sw.js` (or it silently won't be cached offline), and the `load()`
   calls at the top of `test/smoke.js`. The gap only shows up offline or in a fresh install.
7. **If you change the VALUE of an existing `DEFAULT_RULES` field in `config.js`** (not just add a new
   one), that change alone will NOT reach anyone who already has a copy of the rules saved in
   localStorage — see "Rules-healing" below. Don't assume a `config.js` edit alone verifies a fix; check
   whether `storage.js`'s healing logic covers the field you changed.
8. **When testing a fix that touches `DEFAULT_RULES`, always start a brand-new game**, not an
   already-in-progress one. `rulesSnapshot` is a deep copy taken at game-creation time, so an old
   in-progress game keeps showing old behavior forever, even after the fix is deployed.
9. User was warned that two chats/browser tabs editing files "at once" caused a real bug (a signature
   mismatch) — stick to one active conversation for edits.

## Data model essentials
- A **game** has `units` (players or teams), `hands` (array of rounds played), an `endCondition`
  (`target` / `hands` / `manual` / `phase`), and a `rulesSnapshot` — a **deep copy** of that game's rules
  taken at start time, so editing house rules mid-game-night never affects a game already in progress.
- **End conditions**: games whose ending is just a round/score counter support all three choices —
  Target Score / Fixed Hands / End on Cue — via `allowChoice: true` in config: Rook, Hand & Foot,
  Gnoming A Round, Reign of Dragoness, 3-2-1 Countdown, Skull King, Whoa There Cowboy. "Target Score" is
  hidden on Setup for low-score-wins games (currently just Gnoming) — see the `winMode === "high"` check
  in `Screens.setup()`. Two exceptions: Phase 10 (ends when someone finishes Phase 10 — a real rule) and
  win/loss games (Sequence, Backwards 8, Custom Game's Win/Loss-only mode), which always finish after
  exactly one hand and don't actually consult `endCondition` in `Play.saveWinLoss()`.
- **House Rules editing** is deliberately buried (Rules screen → pick game → small "Edit house rules"
  link) so nobody changes scoring by accident mid-game-night.
- **Rules-healing in `storage.js` has two layers.** `_mergeMissing()` fills in keys entirely *absent*
  from someone's saved rules (new field, new game). It can't fix a key that already *exists* with a
  stale value — which is what happens whenever a code update changes an existing field's value.
  `getRules()` also unconditionally re-syncs five specific fields — `entryType`, `info`, `label`,
  `winMode`, `teamMode` — from current `DEFAULT_RULES` on every load. Those five are safe to always
  overwrite because they're **never** user-editable through the Rules screen; `RulesEdit`/`setNested`/
  `setEndValue` only ever touch nested numeric fields (`endCondition`, `scoring`, `bonuses`,
  `cardValues`), which stay preserved via the merge-missing path. **If you add a new code-owned (never
  user-editable) field to a game's rules object, add it to this resync list too.**

## The 10 games currently built
| Game | entryType | Notes |
|---|---|---|
| Rook | `rook` | Forced 2v2 teams. Bid/trump/points-captured, 100-pt-per-hand auto-complement. Individual bidder tracked, team scores. Manual-fallback entry is per-player, not part of the compact/inline system — low-value, rarely used path, never brought into that system. |
| Hand & Foot | `handfoot` | Solo or teams. Family house rules — card values, book bonuses editable. Open-ended **Bonus** field (any signed number). Rising minimum opening meld (50/100/150/200) is informational only, not wired to an editable field. 5 fields per player — stays "tighten-only" compact, never single-row inline. |
| Phase 10 | `phase10` | Individual. Single "1 through 9" quantity stepper (all worth flat 5 pts). 10/11/12 = 10pts, Skip = 15pts, Wild = 25pts. Winner is whoever actually completes Phase 10, not lowest score; ties among simultaneous finishers broken by lowest score; early-ended games go by furthest phase then lowest score. Two toggles per player — stays tighten-only, never inline. |
| Gnoming A Round | `simple` | (Officially "Gnoming A Round" — Grandpa Beck's.) Individual, 3 rounds default, lowest wins. Score can legitimately go negative (three-of-a-kind rule) — intentional, never blocked. |
| Sequence | `winloss` | Board game, win/loss tracker + teams. Finishes immediately after logging the winner. |
| Backwards 8 | `winloss` | Family's own game, no real ruleset — win/loss only. Same immediate-finish behavior as Sequence. |
| Reign of Dragoness | `simple` | Grandpa Beck's. 5 rounds default, rank-based points (3/2/1/0), high score wins. |
| 3-2-1 Countdown | `countdown321` | Grandpa Beck's. Real declaration tracking: hand-total field plus "Countdown!"/"Blastoff!" checkboxes (mutually exclusive per round; Blastoff auto-locks total to 0). `Engine.countdown321()` computes scores in one shot (dense-ranked tiers, declarer bonus/tie/forfeit layered on top — verified against a rulebook photo, see function comments for the non-obvious rules). Small-group (2-3 player) games officially use "first to 3 round wins" instead of 5-round cumulative — documented in rules info text, not automated. |
| Skull King | `skullking` | Grandpa Beck's. 10 rounds default, bid/tricks/bonus fields. Scoring constants (20/trick, -10 penalty, etc.) editable in House Rules — this is "classic" scoring, not "Rascal Scoring." Bid/tricks can't exceed round's card count or go negative; bonus can't go negative — all reject inline. |
| Whoa There Cowboy | `whoacowboy` | Grandpa Beck's. Tokens (already-summed value, unguarded — no fixed ruleset) + Cards Left (can't go negative). |

All games support a **manual override toggle** ("just type the total instead"). Manual-override fields
allow negative numbers on every game (a bad-enough hand can legitimately score negative) — only the
*structured* per-field inputs got negative-number guards, not the manual fallback.

## Score-entry density system (Comfortable / Compact)
Global, app-wide preference, stored in `Storage.getSettings().scoreEntryDensity`. A small text toggle
sits at the top of every score-entry screen (`Density.toggleHtml()`), deliberately away from Save so it
can't be hit by accident.

**Auto-switch**: `Density.recordGameCompleted()` flips the default to Compact after 2 completed games
(never counts abandoned games), with a one-time modal explaining the switch. Skipped if the user already
found the toggle manually before hitting that threshold.

**Two compact treatments**, by field count:
- **Tighten-only** (Hand & Foot, Phase 10 — too many fields to inline): stays stacked, smaller
  padding/font, each toggle-row has its own explicit short label (`.toggle-label-short`).
- **True single-row inline** (`.inline-fields`, Compact mode only, ≤3-short-field games: Simple
  [Gnoming/Dragoness/Custom], Skull King, Whoa There Cowboy, 3-2-1 Countdown): whole player row on one
  line. `.entry-unit-block` becomes the flex row; field-grouping wrappers (`.structured-fields`,
  `.c321-fields`) use `display:contents` so children join the row directly. Labels are genuinely
  shortened text (`Play.fieldLabelText`), not just shrunk font. Manual-override becomes a bare "⋯" glyph
  with switch visuals stripped. Input widths are digit-count-aware (`2.6rem` default, `.digits-3` /
  `3.3rem` for fields that can run longer: Skull King Bonus, Cowboy Tokens, Countdown hand total).
  **Watch CSS specificity** when touching these rules — a legacy `.field-row input.input-compact` rule
  can tie with a less-specific inline-field rule; keep the inline selector unambiguously more specific.

**Collapsible player cards**: chevron next to name collapses to bare name, no re-render (pure CSS class
toggle). Rendered in Comfortable for every game, and in Compact only for tighten-only games (Hand &
Foot/Phase 10) — nothing to collapse on an already-minimal inline row.

**Enter-to-next-field** (`UI.enableEnterNavigation()`): Enter in any `.entry-grid` input/select moves to
the next one in DOM order across players. Scoped only to `.entry-grid`. Skips disabled, `.hidden`, and
collapsed-card fields (two different hiding mechanisms, both checked). On the last field, Enter just
blurs — never submits.

## Home screen leaderboard sort
`Players.leaderboardOrder()` sorts the Home screen's player list (Manage Players screen stays
insertion-order) by wins descending, tiebreak games-played ascending. 0-games players always sink to the
bottom, sorted alphabetically among themselves.

## Other notable features already built
- Undo Last Hand (`Play.undoLastHand()`, `Play.deleteHand()` for any past hand, `Play.undoLastFromResults()`
  for the hand that just finished a game) — all share `Play.recomputeLastRookInfo()` for Rook's bid panel.
- Play Again / Rematch (same players/teams/rules, skips setup)
- Abandon Game (no history entry, no stat changes, doesn't count toward density auto-switch)
- Player colors, Reset Stats (not delete-and-recreate). Duplicate-name add prompts for confirmation.
- Delete a single Game History entry (`Play.deleteHistoryEntry()`)
- Reorder Games screen (up/down, no drag-and-drop), "Reset to Alphabetical." New games auto-append
  rather than resetting a custom order (`GameOrder.getEffectiveOrder()`).
- Inline field-level validation (red border + message under the row) plus a toast on repeat failures.
- Win/loss games finish immediately after one hand (`Play.saveWinLoss()` calls `finishGame()` directly,
  bypassing Fixed Hands/Target/Manual) — the "How should this game end?" Setup card is hidden for these.
- Custom Game supports Win/Loss-only scoring (`winMode: "winloss"`) alongside point totals.
- Themed confirm/prompt/alert modals (`js/ui.js`) replace all native dialogs. `UI.alert()` has no caller
  yet but is tested and ready.
- Back button navigates in-app screens via the History API (`App.go()` pushes entries, `popstate`
  listener reads them back); a lingering modal force-closes on any popstate.
- "Update available" banner via `serviceWorker.controllerchange` (skipped on first install).
- Win/loss entry has no pre-selected winner — "Log Winner" stays disabled until someone taps a name.
- Negative-number guards audited across every game — rejected inline where negative can't mean anything
  real (Skull King bid/tricks/bonus), clamped to 0 elsewhere (Hand & Foot counts, Phase 10 manual
  override, Cowboy cards-left). Deliberately allowed: Gnoming/Dragoness totals and Countdown hand-totals
  (real negative rules), Hand & Foot Bonus (open-ended by design), all manual-override fields, Cowboy
  Tokens (no fixed ruleset).

## Known open items / possible next steps
- **Yahtzee not yet built.** Standard and Triple Yahtzee should be two separate game entries (own
  `entryType` each) — a real structural difference (13 categories vs. 39 slots across 3 columns with
  multipliers and a stricter Joker rule), not a Custom-Game-style toggle. Scorecard is naturally
  table-shaped; user wants it to "remain close to the actual game card," not bolted onto `.inline-fields`.
- Whoa There Cowboy and Skull King came from photographed rulebooks. Skull King's constants are editable
  in House Rules if the user gets a different edition; Cowboy's formula is hardcoded in
  `Engine.whoacowboy()` (simple enough it wasn't made editable).
- Phase 10's and 3-2-1 Countdown's rules were verified against actual rulebook photos (both had real bugs
  found this way). Other games' rules were built from memory/research — if something seems off there, a
  rulebook photo is the fastest way to confirm. When reading one, crop/zoom tightly on the relevant
  paragraph first; a full angled-photo read is low-confidence.
- Declined/deferred: data export/backup (user isn't worried about losing stats), a separate family
  stats/leaderboard screen (the Home screen sort covers this instead).
- **Deliberate scope decision**: `Play.deleteHand()` removes a past hand but doesn't edit one in place.
  A true in-place editor would need every entryType to store raw per-field inputs plus a dedicated edit
  form each — bigger, riskier change. Delete-and-re-enter covers the common case. Revisit if annoying.
- Current `sw.js` cache version: `scorekeeper-v33`.
- Rook's manual-fallback entry and primary bid-entry screen were never brought into the compact/inline
  system — low-value given how rarely the fallback is used.

## Efficiency notes
- **2026-07-13**: This file was trimmed from ~310 lines/30KB down to its current size. It had been
  accumulating a full narrated diary of each session's bugs and fixes on top of the durable facts a new
  Claude actually needs — bloat that every fresh conversation had to read in full. Going forward, record
  *current state and why*, not a play-by-play of how it got there.
- **Smoke-test discipline**: `test/smoke.js` is a single continuous script (shared players/state/history
  counts across ~40 numbered sections), not independent per-game tests — splitting it into per-game files
  was considered and rejected as a bigger, riskier change than the tokens it'd save. Instead: only run or
  extend it for changes that touch actual logic (see convention #3 above), and use `grep`/targeted `view`
  ranges instead of reading the whole file when extending it.
- If this file starts creeping back up in size, that's the signal to trim again rather than let it
  compound — a bloated notes file costs tokens on literally every new conversation, not just the one
  where the bloat was added.

## If you're a new Claude conversation reading this
Ask the user to paste or upload the current project files (or just the ones relevant to the task) so
you're working from ground truth rather than this summary. This document explains *why* things are built
the way they are; the actual files are the source of truth for *what's* currently there. Pull the user's
actual GitHub repo (`codeload.github.com/<user>/<repo>/tar.gz/refs/heads/main` via `bash_tool`, since
`web_fetch` is blocked by GitHub's robots.txt) rather than trusting a prior session's summary — but if the
task only touches a file or two, just read those, not the whole tarball. If a fix doesn't seem to have
taken effect, check whether it touches a `DEFAULT_RULES` field before assuming the code itself is wrong
— see convention #7 above.
