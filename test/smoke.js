const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
// Native confirm/alert/prompt are no longer used anywhere in the app — every
// call site now goes through the themed UI.confirm/prompt/alert modals in
// js/ui.js, which the helpers below drive directly.

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  dom.window.eval(code);
}

load("js/config.js");
load("js/storage.js");
load("js/engine.js");
load("js/ui.js");
load("js/controllers.js");
load("js/app.js");

const { App, Storage, Players, Setup, Play, RulesEdit, Screens, Engine, UI, Density, DEFAULT_RULES, GameOrder, GAME_ORDER } = dom.window;

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK: " + msg);
}

// Clicks the confirm button on an open UI.confirm modal (throws if none is open).
function clickModalConfirm() {
  const btn = document.getElementById("uiConfirmYes");
  if (!btn) throw new Error("expected a confirm modal to be open");
  btn.click();
}

// Clicks cancel on an open UI.confirm modal.
function cancelModalConfirm() {
  const btn = document.getElementById("uiConfirmNo");
  if (!btn) throw new Error("expected a confirm modal to be open");
  btn.click();
}

// Fills and submits an open UI.prompt modal (throws if none is open).
function submitModalPrompt(value) {
  const input = document.getElementById("uiPromptInput");
  if (!input) throw new Error("expected a prompt modal to be open");
  input.value = value;
  document.getElementById("uiPromptOk").click();
}

// 1. Init app cold
App.init();
assert(App.state.screen === "home", "app initializes to home screen");

// 2. Add players
Players.add(); // no name entered yet, should no-op safely
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Brandon">';
Players.add();
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Katie">';
Players.add();
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Mom">';
Players.add();
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Dad">';
Players.add();
const players = Storage.getPlayers();
assert(players.length === 4, "4 players added");

// 3. Simple game: Gnoming Around, individual, 3 hands, low score wins
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.togglePlayer(players[2].id);
assert(Setup.validationMessage() === "", "gnoming setup valid with 3 players");
Setup.start();
assert(App.state.screen === "play", "moved to play screen after start");
let game = App.state.game;
assert(game.gameKey === "gnoming" && game.units.length === 3, "gnoming game created with 3 units");

// simulate entering 3 hands via direct DOM per unit
App.render();
function fillSimple(scoresByIndex) {
  App.render();
  const blocks = document.querySelectorAll(".entry-unit-block");
  blocks.forEach((b, i) => {
    b.querySelector(".simple-total").value = scoresByIndex[i];
  });
  Play.saveSimple();
}
fillSimple([10, 20, 5]);
fillSimple([8, 3, 15]);
fillSimple([12, 9, 2]);
assert(App.state.screen === "results", "gnoming auto-ended after 3 hands and reached results");
const finished = App.state.lastFinishedGame;
const totals = { };
finished.standings.forEach(s => totals[s.name] = s.value);
console.log("Gnoming totals:", totals);
assert(finished.winMode === "low", "gnoming is low-score-wins");

// 4. Rook game with bid logic (now requires exactly 4 players / 2v2, and 100-pt auto-complement)
Setup.pick("rook");
Setup.togglePlayer(players[0].id); // Brandon
Setup.togglePlayer(players[1].id); // Katie
Setup.togglePlayer(players[2].id); // Mom
Setup.togglePlayer(players[3].id); // Dad
Setup.assignTeam(players[0].id, 1);
Setup.assignTeam(players[1].id, 1);
Setup.assignTeam(players[2].id, 2);
Setup.assignTeam(players[3].id, 2);
assert(Setup.validationMessage() === "", "rook setup valid with exactly 2v2");
assert(App.state.setup.endType === "target", "rook defaults to target-score end condition");
Setup.setEndType("hands");
assert(App.state.setup.endType === "hands", "rook end condition can be switched to fixed hands");
Setup.setEndType("target"); // switch back so the rest of this test's target-based logic still applies

// sanity check the new 2v2 enforcement itself
Setup.assignTeam(players[3].id, 2); // unassign Dad (toggle off)
assert(Setup.validationMessage() !== "", "rook setup invalid with only 3 assigned players");
Setup.assignTeam(players[3].id, 2); // reassign Dad back to team 2

Setup.updateEndValue(1000); // high enough that this 2-hand test won't auto-end early
Setup.start();
game = App.state.game;
assert(game.units.length === 2, "rook created 2 team units");
assert(game.units[0].memberNames.length === 2, "rook units carry individual member names for the bidder dropdown");

App.render();
// Hand 1: Brandon (on team1) bids 30, bidder captures 40 (makes it) -> team1 +40, team2 auto = 60
document.getElementById("rookBidder").value = players[0].id; // Brandon
document.getElementById("rookBid").value = "30";
document.getElementById("rookTrump").value = "Red";
document.getElementById("rookCapturedBid").value = "40";
Play.saveRook();
let totalsRook = Engine.runningTotals(App.state.game || game);
console.log("Rook after hand 1:", totalsRook, "info:", App.state.game.lastRookInfo);
assert(totalsRook[game.units[0].id] === 40, "bidding team scores captured points when bid made");
assert(totalsRook[game.units[1].id] === 60, "non-bidding team auto-gets 100 minus captured");
assert(App.state.game.lastRookInfo.made === true, "persistent rook info records bid made");
assert(App.state.game.lastRookInfo.biddingPlayerName === "Brandon", "persistent rook info names the individual bidder, not just the team");

// Reject a bid over 100
App.render();
document.getElementById("rookBidder").value = players[0].id;
document.getElementById("rookBid").value = "150";
document.getElementById("rookTrump").value = "Red";
document.getElementById("rookCapturedBid").value = "40";
Play.saveRook();
assert(document.getElementById("rookBid").classList.contains("input-error") && App.state.game.hands.length === 1, "a bid over 100 is rejected inline and does not save a hand");
let toastEl = document.querySelector(".toast");
assert(toastEl && toastEl.textContent === "Hey, you missed something!", "first failed save shows the friendly toast message: " + (toastEl && toastEl.textContent));

// Try again without fixing anything — the toast should escalate
Play.saveRook();
toastEl = document.querySelector(".toast");
assert(toastEl && toastEl.textContent === "Really...? Check the red one.", "second consecutive failure escalates the toast message: " + (toastEl && toastEl.textContent));

// Reject an empty "points captured" field
App.render();
document.getElementById("rookBidder").value = players[0].id;
document.getElementById("rookBid").value = "30";
document.getElementById("rookTrump").value = "Red";
document.getElementById("rookCapturedBid").value = "";
Play.saveRook();
assert(document.getElementById("rookCapturedBid").classList.contains("input-error") && App.state.game.hands.length === 1, "an empty points-captured field is rejected inline and does not save a hand");

// Reject an unselected trump color (the new "must actively choose" guard)
App.render();
document.getElementById("rookBidder").value = players[0].id;
document.getElementById("rookBid").value = "30";
document.getElementById("rookCapturedBid").value = "40";
Play.saveRook(); // trump left on its default "Select color" placeholder
assert(document.getElementById("rookTrump").classList.contains("input-error") && App.state.game.hands.length === 1, "leaving trump unselected is rejected inline and does not save a hand");

// Hand 2 (the real one): Brandon bids 50 but only captures 20 (fails) -> -50; other team auto = 80
App.render();
document.getElementById("rookBidder").value = players[0].id;
document.getElementById("rookBid").value = "50";
document.getElementById("rookTrump").value = "Red";
document.getElementById("rookCapturedBid").value = "20";
Play.saveRook();
assert(Play._validationFailStreak === 0, "the fail streak resets back to zero after a successful save");
totalsRook = Engine.runningTotals(App.state.game || game);
console.log("Rook after hand 2:", totalsRook, "info:", App.state.game.lastRookInfo);
assert(totalsRook[game.units[0].id] === -10, "bidding team loses full bid amount when set (40 - 50)");
assert(totalsRook[game.units[1].id] === 140, "non-bidding team total accumulates (60 + 80)");
assert(App.state.game.lastRookInfo.made === false, "persistent rook info records bid set");

// End game manually since target not reached
Play.finishGame(App.state.game);
assert(App.state.screen === "results", "rook game finished manually");

// 5. Hand & Foot with house rules + edit flow
Setup.pick("handfoot");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
let blocks = document.querySelectorAll(".entry-unit-block");
blocks.forEach((b) => {
  b.querySelector(".hf-clean").value = "1";
  b.querySelector(".hf-dirty").value = "1";
  b.querySelector(".hf-meld").value = "200";
  b.querySelector(".hf-bonus").value = "100"; // e.g. a went-out-first bonus
  b.querySelector(".hf-stuck").value = "30";
});
Play.saveHandfoot();
const hfTotals = Engine.runningTotals(App.state.game);
const expected = 500 + 300 + 200 + 100 - 30;
Object.values(hfTotals).forEach(v => assert(v === expected, `hand & foot score computed correctly, including the open-ended bonus field (${v} === ${expected})`));

// 5b. The bonus field is genuinely open-ended — it can also be a penalty (negative).
// Played as a second hand in the same still-active game (rather than a fresh one),
// since the House Rules snapshot check right after this expects this game to still
// be in progress.
App.render();
let hfBlocks2 = document.querySelectorAll(".entry-unit-block");
hfBlocks2.forEach((b) => {
  b.querySelector(".hf-clean").value = "0";
  b.querySelector(".hf-dirty").value = "0";
  b.querySelector(".hf-meld").value = "50";
  b.querySelector(".hf-bonus").value = "-25"; // e.g. a house-rule penalty
  b.querySelector(".hf-stuck").value = "0";
});
Play.saveHandfoot();
const hfTotals2 = Engine.runningTotals(App.state.game);
const expected2 = expected + 25; // running total from the first hand, plus this hand's 50 + (-25) = 25
Object.values(hfTotals2).forEach(v => assert(v === expected2, `bonus field also works as a negative penalty (running total ${v} === ${expected2})`));

// House rules edit flow (snapshot check: editing rules mid-game shouldn't affect active game)
App.state.rulesViewKey = "handfoot";
RulesEdit.startEdit("handfoot");
RulesEdit.setNested("bonuses", "cleanBook", "999");
RulesEdit.save();
clickModalConfirm();
const newRules = Storage.getRules();
console.log("DEBUG cleanBook after edit:", newRules.handfoot.bonuses.cleanBook, "rulesViewKey:", App.state.rulesViewKey, "buffer:", RulesEdit.buffer);
assert(newRules.handfoot.bonuses.cleanBook === 999, "house rule edit persisted");
assert(App.state.game.rulesSnapshot.bonuses.cleanBook === 500, "in-progress game keeps its original rules snapshot");

Play.finishGame(App.state.game);

// 5c. Negative-number guards: Hand & Foot's counts/totals can't go negative, but the
// open-ended Bonus field still can (it's a deliberate exception, tested back in 5b).
Setup.pick("handfoot");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
let hfNegBlocks = document.querySelectorAll(".entry-unit-block");
hfNegBlocks.forEach((b) => {
  b.querySelector(".hf-clean").value = "-3";
  b.querySelector(".hf-dirty").value = "-1";
  b.querySelector(".hf-meld").value = "-50";
  b.querySelector(".hf-bonus").value = "0";
  b.querySelector(".hf-stuck").value = "-10";
});
Play.saveHandfoot();
const hfNegTotals = Engine.runningTotals(App.state.game);
Object.values(hfNegTotals).forEach(v => assert(v === 0, `Hand & Foot clamps negative counts/totals to 0 rather than letting them go negative (got ${v})`));
Play.abandonGame();

// 6. Phase 10 completion detection (via manual entries) + a quantity-stepper check
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;

// First, verify the quantity stepper itself can hold multiples, and that scoring matches
// the real rulebook: 1-9 are a flat 5 points each (not face value), Skip is 15 (not 10).
App.render();
let firstBlock = document.querySelector(".entry-unit-block");
let lowRow = Array.from(firstBlock.querySelectorAll(".cardqty-row")).find(r => r.dataset.points === "5");
assert(!!lowRow, "the 1-9 range now has a single consolidated stepper worth a flat 5 points, not 9 separate face-value ones");
Play.stepCardQty(lowRow.querySelector(".qty-stepper button:last-child"), 1);
Play.stepCardQty(lowRow.querySelector(".qty-stepper button:last-child"), 1);
Play.stepCardQty(lowRow.querySelector(".qty-stepper button:last-child"), 1); // three cards numbered 1-9 = 15 pts, regardless of which numbers
assert(lowRow.querySelector(".qty-val").textContent === "3", "stepper can hold multiple cards in the 1-9 range");
let skipRow = Array.from(firstBlock.querySelectorAll(".cardqty-row")).find(r => r.dataset.points === "15");
assert(!!skipRow, "Skip is correctly worth 15 points (the rulebook value), not the old buggy 10");
Play.stepCardQty(skipRow.querySelector(".qty-stepper button:last-child"), 1); // one Skip card = 15 pts
Play.savePhase10();
const p10FirstHand = App.state.game.hands[0].entries[game.units[0].id];
assert(p10FirstHand.score === 30, "Phase 10 scoring matches the rulebook: three cards numbered 1-9 (3x5=15pts) plus one Skip (15pts) = 30 total");

for (let i = 0; i < 10; i++) {
  App.render();
  const ublocks = document.querySelectorAll(".entry-unit-block");
  ublocks.forEach((b) => {
    b.querySelector(".phase-complete-switch").classList.add("on");
    b.querySelector(".p10-manual").value = "0";
    b.querySelector(".manual-fields").classList.remove("hidden");
    b.querySelector(".structured-fields").classList.add("hidden");
  });
  if (App.state.screen !== "play") break;
  Play.savePhase10();
}
assert(App.state.screen === "results", "phase 10 auto-ended once both players completed phase 10");

// 6b. Phase 10 winner rule (the real fix): whoever actually completes Phase 10
// wins outright, regardless of score — NOT whoever has the lowest score overall.
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
for (let i = 0; i < 10; i++) {
  App.render();
  const ublocks = document.querySelectorAll(".entry-unit-block");
  // Player 0 completes every phase and racks up a much higher score.
  ublocks[0].querySelector(".phase-complete-switch").classList.add("on");
  ublocks[0].querySelector(".p10-manual").value = "20";
  ublocks[0].querySelector(".manual-fields").classList.remove("hidden");
  ublocks[0].querySelector(".structured-fields").classList.add("hidden");
  // Player 1 never completes a single phase, but keeps a much lower score.
  ublocks[1].querySelector(".p10-manual").value = "1";
  ublocks[1].querySelector(".manual-fields").classList.remove("hidden");
  ublocks[1].querySelector(".structured-fields").classList.add("hidden");
  if (App.state.screen !== "play") break;
  Play.savePhase10();
}
assert(App.state.screen === "results", "phase 10 auto-ended once the one player completed phase 10");
const p10Standings = Play.standingsList(App.state.lastFinishedGame);
const p10Winner = p10Standings.find(s => s.id === game.units[0].id);
const p10Loser = p10Standings.find(s => s.id === game.units[1].id);
assert(p10Winner.value > p10Loser.value, "sanity check: the actual Phase 10 finisher really does have the worse (higher) score here, so this genuinely tests the fix");
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "Phase 10 winner is whoever actually completed Phase 10, even though the other player has a much lower score");

// 6c. When multiple players complete Phase 10 in the same final hand, the
// tiebreak is lowest score among just those finishers, per the rulebook.
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
for (let i = 0; i < 10; i++) {
  App.render();
  const ublocks = document.querySelectorAll(".entry-unit-block");
  ublocks.forEach((b, idx) => {
    b.querySelector(".phase-complete-switch").classList.add("on"); // both finish together
    b.querySelector(".p10-manual").value = idx === 0 ? "5" : "9"; // player 0 stays lower every hand
    b.querySelector(".manual-fields").classList.remove("hidden");
    b.querySelector(".structured-fields").classList.add("hidden");
  });
  if (App.state.screen !== "play") break;
  Play.savePhase10();
}
assert(App.state.screen === "results", "phase 10 auto-ended once both players completed phase 10 together");
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "when multiple players complete Phase 10 in the same hand, the one with fewer total points wins");

// 6d. Ending early ("End Game Now") before anyone completes Phase 10, with
// everyone on the same phase: falls back to lowest score, like any other
// low-score game.
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
let earlyEndBlocks = document.querySelectorAll(".entry-unit-block");
earlyEndBlocks[0].querySelector(".p10-manual").value = "5";
earlyEndBlocks[0].querySelector(".manual-fields").classList.remove("hidden");
earlyEndBlocks[0].querySelector(".structured-fields").classList.add("hidden");
earlyEndBlocks[1].querySelector(".p10-manual").value = "9";
earlyEndBlocks[1].querySelector(".manual-fields").classList.remove("hidden");
earlyEndBlocks[1].querySelector(".structured-fields").classList.add("hidden");
Play.savePhase10(); // one hand, nobody completes a phase — both still on phase 1
Play.endWithWinner(); // same as tapping "End Game Now" -> "Declare Winner"
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "ending early with everyone on the same phase falls back to lowest score");

// 6e. Ending early where players are on DIFFERENT phases: furthest phase
// progress wins even with a worse score — same priority the real rule
// gives phase completion over points, just applied to an early stop.
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
for (let i = 0; i < 2; i++) {
  App.render();
  const b2 = document.querySelectorAll(".entry-unit-block");
  b2[0].querySelector(".phase-complete-switch").classList.add("on"); // player 0 advances every hand...
  b2[0].querySelector(".p10-manual").value = "20"; // ...but scores worse
  b2[0].querySelector(".manual-fields").classList.remove("hidden");
  b2[0].querySelector(".structured-fields").classList.add("hidden");
  b2[1].querySelector(".p10-manual").value = "1"; // player 1 never advances, but scores better
  b2[1].querySelector(".manual-fields").classList.remove("hidden");
  b2[1].querySelector(".structured-fields").classList.add("hidden");
  Play.savePhase10();
}
const phasesBeforeEarlyEnd = Engine.phaseProgress(App.state.game);
assert(phasesBeforeEarlyEnd[game.units[0].id] > phasesBeforeEarlyEnd[game.units[1].id], "sanity check: player 0 really is further along on phases");
const totalsBeforeEarlyEnd = Engine.runningTotals(App.state.game);
assert(totalsBeforeEarlyEnd[game.units[0].id] > totalsBeforeEarlyEnd[game.units[1].id], "sanity check: player 0's score really is worse, so this genuinely tests the fix");
Play.endWithWinner(); // ended early before anyone reached Phase 10
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "ending early: furthest phase progress wins even with a worse score, not just lowest score overall");

// 6f. Phase 10's manual override can't go negative either — real Phase 10 hand
// scores are never negative under any known variant.
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
let p10NegBlocks = document.querySelectorAll(".entry-unit-block");
p10NegBlocks.forEach((b) => {
  b.querySelector(".phase-complete-switch"); // leave off
  b.querySelector(".p10-manual").value = "-15";
  b.querySelector(".manual-fields").classList.remove("hidden");
  b.querySelector(".structured-fields").classList.add("hidden");
});
Play.savePhase10();
const p10NegTotals = Engine.runningTotals(App.state.game);
Object.values(p10NegTotals).forEach(v => assert(v === 0, `Phase 10 manual override clamps negative totals to 0 (got ${v})`));
Play.abandonGame();

// 7. Sequence (win/loss tracker) — logging the winner now finishes the game immediately
Setup.pick("sequence");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
assert(App.state.entryDraft.winnerId === undefined, "no winner is pre-selected when entering a win/loss game's entry screen");
let winLossHtml = Screens.play();
assert(!winLossHtml.includes('class="winloss-pick sel"'), "no player/team is shown as pre-selected before anyone taps one");
assert(winLossHtml.includes('disabled onclick="Play.saveWinLoss()"'), "Log Winner is disabled until a winner is actually picked");
Play.saveWinLoss(); // should be a no-op — nothing picked yet
assert(App.state.screen === "play" && App.state.game.hands.length === 0, "saveWinLoss with no winner picked does nothing, doesn't log a hand or finish the game");
Play.pickWinner(game.units[0].id);
winLossHtml = Screens.play();
assert(!winLossHtml.includes('disabled onclick="Play.saveWinLoss()"'), "Log Winner becomes enabled once a winner is picked");
Play.saveWinLoss();
assert(App.state.screen === "results", "logging a winner in a win/loss game (Sequence) finishes it immediately — no separate End Game step needed");
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "the picked winner is recorded as the game's winner");

// 8. Abandon-game path: no history entry, no stat changes
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
const historyCountBefore = Storage.getHistory().length;
const statsBefore = JSON.stringify(Storage.getPlayers());
Play.abandonGame();
assert(App.state.screen === "home", "abandoning a game returns to home");
assert(Storage.getActiveGame() === null, "abandoned game is cleared from active storage");
assert(Storage.getHistory().length === historyCountBefore, "abandoning a game does not add a history entry");
assert(JSON.stringify(Storage.getPlayers()) === statsBefore, "abandoning a game does not change player stats");

// 9. Player color + reset stats
Players.setColor(players[0].id, "#4A6FA5");
assert(Storage.getPlayers().find(p => p.id === players[0].id).color === "#4A6FA5", "player color can be set");
Players.resetStats(players[0].id);
clickModalConfirm();
const resetPlayer = Storage.getPlayers().find(p => p.id === players[0].id);
assert(resetPlayer.wins === 0 && resetPlayer.gamesPlayed === 0, "player stats reset to zero");

// 10. History persisted (gnoming, rook, handfoot, phase10, phase10-winner-test, phase10-tie-test, phase10-earlyend-same-phase, phase10-earlyend-diff-phase, sequence = 9; abandoned game does NOT count)
const history = Storage.getHistory();
assert(history.length === 9, "9 completed games recorded in history (abandoned game excluded): " + history.length);

// 11. Undo last hand (simple game type)
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
fillSimple([10, 20]); // hand 1
fillSimple([5, 8]);   // hand 2
assert(App.state.game.hands.length === 2, "gnoming has 2 hands before undo");
Play.undoLastHand();
clickModalConfirm();
assert(App.state.game.hands.length === 1, "undo removes exactly the last hand");
let totalsAfterUndo = Engine.runningTotals(App.state.game);
assert(totalsAfterUndo[game.units[0].id] === 10 && totalsAfterUndo[game.units[1].id] === 20, "totals reflect only the remaining hand after undo");
Play.abandonGame(); // clean up without touching history/stats

// 12. Undo last hand with Rook's persistent bid panel correctly reconstructed
Setup.pick("rook");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.togglePlayer(players[2].id);
Setup.togglePlayer(players[3].id);
Setup.assignTeam(players[0].id, 1);
Setup.assignTeam(players[1].id, 1);
Setup.assignTeam(players[2].id, 2);
Setup.assignTeam(players[3].id, 2);
Setup.updateEndValue(1000);
Setup.start();
game = App.state.game;
App.render();
document.getElementById("rookBidder").value = players[0].id; // Brandon, hand 1, made bid
document.getElementById("rookBid").value = "30";
document.getElementById("rookTrump").value = "Green";
document.getElementById("rookCapturedBid").value = "40";
Play.saveRook();
App.render();
document.getElementById("rookBidder").value = players[1].id; // Katie, hand 2, sets the bid
document.getElementById("rookBid").value = "60";
document.getElementById("rookTrump").value = "Yellow";
document.getElementById("rookCapturedBid").value = "20";
Play.saveRook();
assert(App.state.game.lastRookInfo.biddingPlayerName === "Katie", "lastRookInfo reflects hand 2 before undo");
Play.undoLastHand();
clickModalConfirm();
assert(App.state.game.hands.length === 1, "rook undo removes exactly the last hand");
assert(App.state.game.lastRookInfo.biddingPlayerName === "Brandon", "undo correctly restores the previous hand's bid info");
assert(App.state.game.lastRookInfo.made === true, "restored bid info correctly shows hand 1 was made");
Play.abandonGame();

// 13. Rematch reuses the same players/teams/rules and starts a clean slate
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
fillSimple([10, 5]);
fillSimple([3, 9]);
fillSimple([1, 2]); // 3rd hand auto-ends gnoming
assert(App.state.screen === "results", "gnoming source game for rematch test finished");
const preRematchHistoryCount = Storage.getHistory().length;
Play.rematch();
assert(App.state.screen === "play", "rematch jumps straight back into play, skipping setup");
assert(App.state.game.hands.length === 0, "rematch starts with a clean slate of hands");
assert(App.state.game.units.length === 2 && App.state.game.gameKey === "gnoming", "rematch reuses the same game type and players");
assert(Storage.getHistory().length === preRematchHistoryCount, "starting a rematch itself doesn't add a history entry");
Play.abandonGame(); // don't actually play it out, just confirming the mechanics work

// 14. Final history count: 9 originally + 1 new gnoming game played out for the rematch test = 10
const finalHistory = Storage.getHistory();
assert(finalHistory.length === 10, "10 completed games recorded in history overall: " + finalHistory.length);

// 15. Stale saved rules (from before a config change) get healed, not stuck
const staleRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
delete staleRules.rook.endCondition.allowChoice; // simulate a copy saved before this field existed
staleRules.handfoot.bonuses.cleanBook = 777;      // simulate a real user customization
Storage.saveRules(staleRules);
const healedRules = Storage.getRules();
assert(healedRules.rook.endCondition.allowChoice === true, "a missing field from an older saved copy gets auto-filled in");
assert(healedRules.handfoot.bonuses.cleanBook === 777, "existing customizations survive the healing process untouched");

// 16. Reign of Dragoness — same "simple" entry engine as Gnoming Around, fixed 5 rounds, high score wins
Setup.pick("dragoness");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.togglePlayer(players[2].id);
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.endCondition.type === "hands" && game.endCondition.value === 5, "Reign of Dragoness set up as high-score, 5 fixed rounds");
for (let i = 0; i < 5; i++) {
  App.render();
  if (App.state.screen !== "play") break;
  fillSimple([3, 2, 1]);
}
assert(App.state.screen === "results", "Reign of Dragoness auto-ends after 5 rounds");
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "highest cumulative score wins Reign of Dragoness");

// 17. 3-2-1 Countdown — now has real tracking: declaration type, who
// declared, and per-player hand totals, scored by Engine.countdown321.
Setup.pick("countdown321");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.togglePlayer(players[2].id);
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.endCondition.value === 5, "3-2-1 Countdown set up as high-score, 5 fixed rounds");

function fillCountdown321(declType, declaredByIndex, totalsByIndex) {
  App.render();
  const g = App.state.game;
  const cb = document.getElementById(`c321-declare-${declType}-${g.units[declaredByIndex].id}`);
  cb.checked = true;
  Play.setCountdown321Declaration(cb);
  g.units.forEach((u, i) => {
    const input = document.getElementById(`c321-total-${u.id}`);
    if (!input.disabled) input.value = totalsByIndex[i];
  });
  Play.saveCountdown321();
}

// Round 1: player 0 declares Countdown and truly has the sole lowest hand -> 3+1 bonus.
fillCountdown321("countdown", 0, [2, 8, 6]);
let lastHand = App.state.game.hands[App.state.game.hands.length - 1];
assert(lastHand.entries[game.units[0].id].score === 4, "sole-lowest Countdown declarer scores 3+1 bonus");
assert(lastHand.entries[game.units[1].id].score === 1, "third-lowest (8) scores 1");
assert(lastHand.entries[game.units[2].id].score === 2, "second-lowest (6) scores 2");

// Round 2: player 1 declares Countdown but is wrong (player 2 is actually lower) -> forfeits to 0.
fillCountdown321("countdown", 1, [10, 5, 3]);
lastHand = App.state.game.hands[App.state.game.hands.length - 1];
assert(lastHand.entries[game.units[1].id].score === 0, "wrong Countdown declarer forfeits to 0, even though 5 would've been second-lowest");
assert(lastHand.entries[game.units[2].id].score === 3, "the real lowest hand (3) still scores 3 normally");
assert(lastHand.entries[game.units[0].id].score === 1, "hand of 10 is the third-lowest of these three distinct values, scoring 1 — not zeroed out just because the declarer next to it forfeited");

// Round 3: player 0 and player 2 tie for lowest when player 0 declares Countdown -> no bonus, just 3.
fillCountdown321("countdown", 0, [4, 9, 4]);
lastHand = App.state.game.hands[App.state.game.hands.length - 1];
assert(lastHand.entries[game.units[0].id].score === 3, "tied-for-lowest Countdown declarer gets normal 3, not the 4-point bonus");
assert(lastHand.entries[game.units[2].id].score === 3, "the other player tied at the same low value also gets 3");
assert(lastHand.entries[game.units[1].id].score === 2, "the lone higher hand (9) is the very next distinct value after the tied pair, so it's the second-lowest tier and scores 2 — the tie doesn't push it down to the third tier (1)");

// Round 4: player 2 declares Blastoff — hand total forced to 0, flat 3, no bonus.
fillCountdown321("blastoff", 2, [7, 5, 0]);
lastHand = App.state.game.hands[App.state.game.hands.length - 1];
assert(lastHand.entries[game.units[2].id].score === 3, "Blastoff declarer scores a flat 3, no +1 bonus");
assert(lastHand.entries[game.units[2].id].handTotal === 0, "Blastoff declarer's hand total is locked to 0 in the saved entry");
assert(lastHand.entries[game.units[1].id].score === 2, "remaining players still ranked normally for the second tier");
assert(lastHand.entries[game.units[0].id].score === 1, "remaining players still ranked normally for the third tier");

// Checkbox exclusivity: checking one player's Countdown box should disable
// every other declaration checkbox (any player, any type) AND the other
// checkbox on that same player — only one person can declare per round.
App.render();
game = App.state.game;
const cdBox0 = document.getElementById(`c321-declare-countdown-${game.units[0].id}`);
cdBox0.checked = true;
Play.setCountdown321Declaration(cdBox0);
assert(document.getElementById(`c321-declare-blastoff-${game.units[0].id}`).disabled === true, "the same player's other checkbox (Blastoff) disables once Countdown is checked");
assert(document.getElementById(`c321-declare-countdown-${game.units[1].id}`).disabled === true, "another player's Countdown checkbox disables once someone else has declared");
assert(document.getElementById(`c321-declare-blastoff-${game.units[1].id}`).disabled === true, "another player's Blastoff checkbox disables once someone else has declared");
assert(document.getElementById(`c321-total-${game.units[0].id}`).disabled === false, "Countdown (not Blastoff) leaves the declarer's own total field editable");
// Unchecking re-enables everything.
cdBox0.checked = false;
Play.setCountdown321Declaration(cdBox0);
assert(document.getElementById(`c321-declare-blastoff-${game.units[0].id}`).disabled === false, "unchecking the declaration re-enables the same player's other checkbox");
assert(document.getElementById(`c321-declare-countdown-${game.units[1].id}`).disabled === false, "unchecking the declaration re-enables other players' checkboxes too");

// Validation: saving with nobody checked should be rejected, not silently guessed.
game.units.forEach((u, i) => { document.getElementById(`c321-total-${u.id}`).value = [4, 9, 4][i]; });
Play.saveCountdown321();
assert(App.state.game.hands.length === 4, "saving with no declaration checkbox checked is rejected — no 5th hand was recorded yet");

// Round 5: validation — declaring Countdown with a hand total over 5 should be rejected, not silently accepted.
App.render();
const cdBox0b = document.getElementById(`c321-declare-countdown-${game.units[0].id}`);
cdBox0b.checked = true;
Play.setCountdown321Declaration(cdBox0b);
game.units.forEach((u, i) => { document.getElementById(`c321-total-${u.id}`).value = [9, 2, 3][i]; });
Play.saveCountdown321();
assert(App.state.game.hands.length === 4, "declaring Countdown with a hand total over 5 is rejected — no 5th hand was recorded yet");
fillCountdown321("countdown", 1, [9, 2, 3]);
assert(App.state.screen === "results", "3-2-1 Countdown auto-ends after 5 valid rounds");

// 18. Game ordering: alphabetical by default
Storage.clearGameOrder();
const alpha = GameOrder.getEffectiveOrder();
const expectedAlpha = [...GAME_ORDER].sort((a, b) => DEFAULT_RULES[a].label.localeCompare(DEFAULT_RULES[b].label));
assert(JSON.stringify(alpha) === JSON.stringify(expectedAlpha), "game order defaults to alphabetical with no custom order saved");

// 19. Reordering: move a game up/down, persists, resets cleanly
const firstGame = alpha[0];
const secondGame = alpha[1];
GameOrder.moveDown(firstGame);
let reordered = GameOrder.getEffectiveOrder();
assert(reordered[0] === secondGame && reordered[1] === firstGame, "moving a game down swaps it with the next one and persists");
assert(!!Storage.getGameOrder(), "a custom order is now saved after manually reordering");
GameOrder.resetToAlphabetical();
assert(!Storage.getGameOrder(), "reset clears the custom order");
assert(JSON.stringify(GameOrder.getEffectiveOrder()) === JSON.stringify(expectedAlpha), "order is back to alphabetical after reset");

// 20. Self-healing: a custom order saved before a new game existed still works, new game gets appended
const oldStyleOrder = GAME_ORDER.filter(k => k !== "countdown321"); // simulate order saved before this game existed
Storage.saveGameOrder(oldStyleOrder);
const healedOrder = GameOrder.getEffectiveOrder();
assert(healedOrder.includes("countdown321"), "a game added after a custom order was saved still shows up");
assert(healedOrder.length === GAME_ORDER.length, "healed order includes every known game, none lost");
Storage.clearGameOrder();

// 21. Skull King — exact scoring formula from the photographed rulebook
Setup.pick("skullking");
Setup.togglePlayer(players[0].id); // Brandon
Setup.togglePlayer(players[1].id); // Katie
Setup.togglePlayer(players[2].id); // Mom
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.endCondition.type === "hands" && game.endCondition.value === 10, "Skull King set up as high-score, 10 fixed rounds");

// Round 1 (1 card dealt, max bid/tricks = 1): Brandon bids 1 & takes 1 (made, +bonus 10) = 20*1+10=30
// Katie bids 0 & takes 0 (made) = 10*1 = 10. Mom bids 0 but takes 1 (missed) = -10*1 = -10
App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "1";
document.getElementById("sk-tricks-" + game.units[0].id).value = "1";
document.getElementById("sk-bonus-" + game.units[0].id).value = "10";
document.getElementById("sk-bid-" + game.units[1].id).value = "0";
document.getElementById("sk-tricks-" + game.units[1].id).value = "0";
document.getElementById("sk-bid-" + game.units[2].id).value = "0";
document.getElementById("sk-tricks-" + game.units[2].id).value = "1";
Play.saveSkullKing();
let skTotals = Engine.runningTotals(App.state.game);
console.log("Skull King round 1:", skTotals);
assert(skTotals[game.units[0].id] === 30, "exact bid scores 20/trick plus bonus (20*1 + 10 = 30)");
assert(skTotals[game.units[1].id] === 10, "zero bid + zero tricks scores 10 x round number");
assert(skTotals[game.units[2].id] === -10, "zero bid but took a trick loses 10 x round number");

// Reject a bid over the round's card count (round 2 now, max bid/tricks = 2)
App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "5";
document.getElementById("sk-tricks-" + game.units[0].id).value = "1";
Play.saveSkullKing();
assert(document.getElementById("sk-bid-" + game.units[0].id).classList.contains("input-error"), "a bid over the round's card count is rejected inline");
assert(App.state.game.hands.length === 1, "the over-limit bid did not save a new hand");

// Reject a negative bid, negative tricks, and negative bonus (still round 2, max bid/tricks = 2)
App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "-1";
document.getElementById("sk-tricks-" + game.units[0].id).value = "1";
document.getElementById("sk-bid-" + game.units[1].id).value = "0";
document.getElementById("sk-tricks-" + game.units[1].id).value = "0";
document.getElementById("sk-bid-" + game.units[2].id).value = "0";
document.getElementById("sk-tricks-" + game.units[2].id).value = "0";
Play.saveSkullKing();
assert(document.getElementById("sk-bid-" + game.units[0].id).classList.contains("input-error"), "a negative bid is rejected inline");
assert(App.state.game.hands.length === 1, "the negative bid did not save a new hand");

App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "1";
document.getElementById("sk-tricks-" + game.units[0].id).value = "-1";
document.getElementById("sk-bid-" + game.units[1].id).value = "0";
document.getElementById("sk-tricks-" + game.units[1].id).value = "0";
document.getElementById("sk-bid-" + game.units[2].id).value = "0";
document.getElementById("sk-tricks-" + game.units[2].id).value = "0";
Play.saveSkullKing();
assert(document.getElementById("sk-tricks-" + game.units[0].id).classList.contains("input-error"), "negative tricks won is rejected inline");
assert(App.state.game.hands.length === 1, "the negative tricks value did not save a new hand");

App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "1";
document.getElementById("sk-tricks-" + game.units[0].id).value = "1";
document.getElementById("sk-bonus-" + game.units[0].id).value = "-5";
document.getElementById("sk-bid-" + game.units[1].id).value = "0";
document.getElementById("sk-tricks-" + game.units[1].id).value = "0";
document.getElementById("sk-bid-" + game.units[2].id).value = "0";
document.getElementById("sk-tricks-" + game.units[2].id).value = "0";
Play.saveSkullKing();
assert(document.getElementById("sk-bonus-" + game.units[0].id).classList.contains("input-error"), "a negative bonus is rejected inline — it's only ever an addition for special captures");
assert(App.state.game.hands.length === 1, "the negative bonus did not save a new hand");

// Round 2 (2 cards dealt): Brandon bids 1, takes 2 (missed by 1) = -10*1 = -10
App.render();
document.getElementById("sk-bid-" + game.units[0].id).value = "1";
document.getElementById("sk-tricks-" + game.units[0].id).value = "2";
document.getElementById("sk-bid-" + game.units[1].id).value = "0";
document.getElementById("sk-tricks-" + game.units[1].id).value = "0";
document.getElementById("sk-bid-" + game.units[2].id).value = "0";
document.getElementById("sk-tricks-" + game.units[2].id).value = "0";
Play.saveSkullKing();
skTotals = Engine.runningTotals(App.state.game);
assert(skTotals[game.units[0].id] === 20, "missed bid loses 10 per trick off (30 - 10 = 20)");

// End manually and confirm winner
Play.finishGame(App.state.game);
assert(App.state.screen === "results", "Skull King game finished manually");

// 22. Skull King house rules are editable (e.g. switching toward Rascal Scoring values)
App.state.rulesViewKey = "skullking";
RulesEdit.startEdit("skullking");
RulesEdit.setNested("scoring", "perTrickMade", "10");
RulesEdit.save();
clickModalConfirm();
assert(Storage.getRules().skullking.scoring.perTrickMade === 10, "Skull King scoring constants are editable via House Rules");

// 23. Whoa There Cowboy — token-based scoring, fixed 3 rounds by default
Setup.pick("whoacowboy");
Setup.togglePlayer(players[0].id); // Brandon
Setup.togglePlayer(players[1].id); // Katie
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.endCondition.value === 3, "Whoa There Cowboy defaults to high-score, 3 rounds");

App.render();
document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .wtc-tokens`).value = "40"; // e.g. 2 tens + 1 twenty, already summed
document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .wtc-left`).value = "3";     // -3
document.querySelector(`.entry-unit-block[data-unit="${game.units[1].id}"] .wtc-tokens`).value = "0";
document.querySelector(`.entry-unit-block[data-unit="${game.units[1].id}"] .wtc-left`).value = "5";
Play.saveWhoaCowboy();
const wtcTotals = Engine.runningTotals(App.state.game);
assert(wtcTotals[game.units[0].id] === 37, "Whoa There Cowboy: 40 token points - 3 cards left = 37");
assert(wtcTotals[game.units[1].id] === -5, "Whoa There Cowboy: no tokens, 5 cards left = -5");
Play.abandonGame();

// 23b. Cards left in hand can't go negative either — tokens stays flexible since
// there's no fixed ruleset for that field.
Setup.pick("whoacowboy");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .wtc-tokens`).value = "10";
document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .wtc-left`).value = "-4";
document.querySelector(`.entry-unit-block[data-unit="${game.units[1].id}"] .wtc-tokens`).value = "0";
document.querySelector(`.entry-unit-block[data-unit="${game.units[1].id}"] .wtc-left`).value = "0";
Play.saveWhoaCowboy();
const wtcNegTotals = Engine.runningTotals(App.state.game);
assert(wtcNegTotals[game.units[0].id] === 10, "negative cards-left is clamped to 0 rather than boosting the score (10 tokens - 0 = 10, not 10 - -4 = 14)");
Play.abandonGame();
// 24. "End on cue" (and the other end-condition choices) rolled out to every game whose
// ending is just a round/score counter, not a real structural rule like Phase 10's.
["gnoming", "dragoness", "countdown321", "skullking", "whoacowboy"].forEach(key => {
  assert(DEFAULT_RULES[key].endCondition.allowChoice === true, `${key} now allows choosing how the game ends`);
});
assert(!DEFAULT_RULES.phase10.endCondition.allowChoice, "Phase 10 is correctly left out — its ending is a real rule (someone finishes Phase 10), not a stand-in round count");
assert(DEFAULT_RULES.sequence.endCondition.type === "manual" && !DEFAULT_RULES.sequence.endCondition.allowChoice, "Sequence stays manual-only (win/loss tracker, no round/score concept to choose between)");
assert(DEFAULT_RULES.backwards8.endCondition.type === "manual" && !DEFAULT_RULES.backwards8.endCondition.allowChoice, "Backwards 8 stays manual-only, same reason as Sequence");

Setup.pick("gnoming");
assert(App.state.setup.endType === "hands", "Gnoming A Round defaults to fixed hands");
let setupHtml = Screens.setup();
assert(!setupHtml.includes(">Target score<"), "Gnoming's setup screen hides Target Score — it's a low-score-wins game, so \"first to reach X\" doesn't apply");
assert(setupHtml.includes(">Fixed hands<") && setupHtml.includes(">End on cue<"), "Gnoming's setup screen still offers Fixed hands and End on cue");

Setup.pick("whoacowboy");
setupHtml = Screens.setup();
assert(setupHtml.includes(">Target score<") && setupHtml.includes(">Fixed hands<") && setupHtml.includes(">End on cue<"), "Whoa There Cowboy (high-score-wins) offers all three end-condition choices");

// 25. "End on cue" (manual) now works as a real third choice for preset games too, not just Custom
Setup.pick("dragoness");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.setEndType("manual");
Setup.start();
game = App.state.game;
assert(game.endCondition.type === "manual", "a preset game can now be set to open-ended play, same as Custom Game");
App.render();
fillSimple([5, 2]);
fillSimple([5, 2]);
fillSimple([5, 2]);
fillSimple([5, 2]);
fillSimple([5, 2]);
fillSimple([5, 2]); // 6 hands played — well past the game's normal 5-round default
assert(App.state.screen === "play", "manual end-condition never auto-ends, no matter how many hands are played");
Play.abandonGame();

// 25b. Whoa There Cowboy (a game explicitly called out as fine to keep going past its
// suggested length) can now also be set to fixed hands beyond its default of 3, or manual
Setup.pick("whoacowboy");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.setEndType("hands");
Setup.updateEndValue(6);
Setup.start();
game = App.state.game;
assert(game.endCondition.type === "hands" && game.endCondition.value === 6, "Whoa There Cowboy's fixed-hands length is no longer stuck at the suggested default of 3");
App.render();
for (let i = 0; i < 6; i++) {
  const blocks = document.querySelectorAll(".entry-unit-block");
  blocks.forEach((b) => {
    b.querySelector(".wtc-tokens").value = "10";
    b.querySelector(".wtc-left").value = "0";
  });
  if (App.state.screen !== "play") break;
  Play.saveWhoaCowboy();
  if (i < 5) App.render();
}
assert(App.state.screen === "results", "Whoa There Cowboy correctly auto-ends at the new, longer fixed-hands count (6), not the old default of 3");

// 26. Duplicate player name guard: adding a second "Brandon" opens a themed
// confirm modal instead of silently creating an indistinguishable duplicate.
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Brandon">';
Players.add();
assert(document.getElementById("uiConfirmYes") !== null, "adding a duplicate name opens a themed confirm modal");
assert(Storage.getPlayers().length === 4, "the duplicate isn't added until the modal is confirmed");
cancelModalConfirm();
assert(Storage.getPlayers().length === 4, "cancelling the duplicate-name modal adds no one");
document.body.innerHTML = '<div id="app"></div><input id="newPlayerName" value="Brandon">';
Players.add();
clickModalConfirm();
assert(Storage.getPlayers().length === 5, "confirming the duplicate-name modal does add the second Brandon");

// 27. Players.remove opens a themed confirm modal; cancel keeps the player, confirm removes them
const dupBrandon = Storage.getPlayers().find(p => p.name === "Brandon" && p.id !== players[0].id);
Players.remove(dupBrandon.id);
cancelModalConfirm();
assert(Storage.getPlayers().some(p => p.id === dupBrandon.id), "cancelling remove keeps the player");
Players.remove(dupBrandon.id);
clickModalConfirm();
assert(!Storage.getPlayers().some(p => p.id === dupBrandon.id), "confirming remove deletes the player");
assert(Storage.getPlayers().length === 4, "roster back to 4 after removing the duplicate");

// 28. Setup.addGuest uses a themed prompt modal instead of the native one
Setup.pick("gnoming");
Setup.addGuest();
assert(document.getElementById("uiPromptInput") !== null, "addGuest opens a themed prompt modal");
submitModalPrompt("Guest Gary");
assert(App.state.setup.guestPlayers.some(g => g.name === "Guest Gary"), "guest added via the prompt modal");
assert(App.state.setup.selectedPlayerIds.includes(App.state.setup.guestPlayers[0].id), "guest is auto-selected for this game");

// 29. Deleting an arbitrary (non-last) hand, not just the most recent one
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.setEndType("manual"); // gnoming defaults to a fixed 3 hands, which would auto-end the game right as we finish entering hand 3
Setup.start();
game = App.state.game;
fillSimple([10, 1]); // hand 1
fillSimple([20, 2]); // hand 2
fillSimple([30, 3]); // hand 3
assert(App.state.game.hands.length === 3, "3 hands played before deleting one");
Play.deleteHand(2); // delete the middle hand, not the last
clickModalConfirm();
assert(App.state.game.hands.length === 2, "deleteHand removes exactly one hand");
assert(App.state.game.hands[0].handNum === 1 && App.state.game.hands[1].handNum === 2, "remaining hands are renumbered contiguously");
const totalsAfterDelete = Engine.runningTotals(App.state.game);
assert(totalsAfterDelete[game.units[0].id] === 40, "totals reflect only the remaining hands (10 + 30, hand 2 removed)");
assert(totalsAfterDelete[game.units[1].id] === 4, "totals reflect only the remaining hands (1 + 3, hand 2 removed)");
Play.abandonGame();

// 30. Deleting a finished game from history
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
fillSimple([10, 20]);
fillSimple([5, 8]);
fillSimple([1, 2]); // 3rd hand auto-ends gnoming
assert(App.state.screen === "results", "game finished, ready to be deleted from history");
const historyCountBeforeDelete = Storage.getHistory().length;
const deletableId = Storage.getHistory()[0].id; // newest entry (unshift puts newest first)
Play.deleteHistoryEntry(deletableId);
clickModalConfirm();
assert(Storage.getHistory().length === historyCountBeforeDelete - 1, "deleting a history entry removes exactly one");
assert(!Storage.getHistory().some(e => e.id === deletableId), "the deleted entry is actually gone");

// 31. Back-button plumbing: each screen change pushes a history entry, and a
// popstate event restores the previous screen instead of exiting the app.
// (A real device back button is simulated by directly dispatching the same
// popstate event our listener handles, since jsdom's own history.back() is
// asynchronous and this suite runs synchronously top-to-bottom.)
App.go("home");
assert(window.history.state && window.history.state.screen === "home", "navigating pushes a history entry with the current screen");
App.go("picker");
assert(window.history.state.screen === "picker", "picker screen pushed its own history entry");
App.go("players");
assert(window.history.state.screen === "players", "players screen pushed its own history entry");
window.dispatchEvent(new window.PopStateEvent("popstate", { state: { screen: "picker", rulesViewKey: null, historyDetailId: null } }));
assert(App.state.screen === "picker", "a popstate event navigates back to the previous screen instead of exiting the app");

App.go("home");
UI.confirm("test", () => {});
assert(document.querySelector(".modal-overlay") !== null, "modal is open before the back navigation");
window.dispatchEvent(new window.PopStateEvent("popstate", { state: { screen: "home", rulesViewKey: null, historyDetailId: null } }));
assert(document.querySelector(".modal-overlay") === null, "popstate cleans up any lingering modal");

// 32. UI.alert (available for future use even though nothing calls it yet)
UI.alert("Test alert message");
assert(document.getElementById("uiAlertOk") !== null, "UI.alert opens a themed alert modal");
document.getElementById("uiAlertOk").click();
assert(document.querySelector(".modal-overlay") === null, "UI.alert modal dismisses on OK");

// 33. Update-available banner (the real trigger is a service worker
// controllerchange event, wired up in index.html — that part isn't
// exercised here, just the DOM behavior of the banner itself)
UI.showUpdateBanner();
assert(document.getElementById("updateBanner") !== null, "showUpdateBanner injects the banner");
UI.showUpdateBanner();
assert(document.querySelectorAll("#updateBanner").length === 1, "calling showUpdateBanner again doesn't duplicate it");
document.getElementById("updateBanner").remove();

// 34. Custom Game: point-totals mode (the pre-existing default) still works as before
Setup.pick("custom");
assert(App.state.setup.customScoreMode === "points", "Custom Game defaults to point totals");
Setup.updateCustomName("Custom Card Game");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.setCustomEndType("hands");
Setup.updateEndValue(2);
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.rulesSnapshot.entryType === "simple", "Custom Game in points mode builds a normal simple-scoring game, same as before this feature");
fillSimple([10, 5]);
fillSimple([3, 20]);
assert(App.state.screen === "results", "custom points game still auto-ends at its fixed hand count");

// 35. Custom Game: Win/Loss only mode (new) — for games like Uno that some families just track wins for
Setup.pick("custom");
Setup.updateCustomName("Uno");
Setup.setCustomScoreMode("winloss");
assert(App.state.setup.customScoreMode === "winloss", "Custom Game can be switched to win/loss-only scoring");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
const customSetupHtml = Screens.setup();
assert(!customSetupHtml.includes("Lower score wins"), "the win-low toggle is hidden once win/loss-only is selected — there's no score to compare");
assert(!customSetupHtml.includes("How should this game end?"), "the end-condition card is hidden entirely for win/loss-only custom games — it always finishes after one hand now");
Setup.start();
game = App.state.game;
assert(game.winMode === "winloss" && game.rulesSnapshot.entryType === "winloss", "a win/loss-only custom game builds like Sequence/Backwards 8 under the hood");
const playHtml = Screens.play();
assert(playHtml.includes("Who won this game?"), "entry screen is the win/loss picker, not a point-total form");
Play.pickWinner(game.units[0].id);
Play.saveWinLoss();
assert(App.state.screen === "results", "a custom win/loss game finishes immediately after logging the one deciding hand, same as Sequence/Backwards 8");
assert(App.state.lastFinishedGame.winnerId === game.units[0].id, "the picked winner is recorded correctly");

// 36. Undo Last Hand from the Results screen — recovers a mis-declared winner
// after a game has already auto-finished, which is otherwise unreachable
// since the Undo Last Hand button only exists on the Play screen.
const statsBeforeUndo = JSON.stringify(Storage.getPlayers());
const historyCountBeforeUndo = Storage.getHistory().length;
Play.undoLastFromResults();
clickModalConfirm();
assert(App.state.screen === "play", "undoing the last hand from Results returns to the Play screen");
assert(App.state.game.hands.length === 0, "the hand that finished the game was removed");
assert(Storage.getHistory().length === historyCountBeforeUndo - 1, "the history entry that was just added is removed too");
assert(JSON.stringify(Storage.getPlayers()) !== statsBeforeUndo, "player stats (wins/gamesPlayed) are reverted");
const revertedPlayer = Storage.getPlayers().find(p => p.id === players[0].id);
assert(revertedPlayer.gamesPlayed >= 0 && revertedPlayer.wins >= 0, "reverted stats never go negative");
// Now actually fix it — declare the other player the winner instead, and finish for real
Play.pickWinner(game.units[1].id);
Play.saveWinLoss();
assert(App.state.lastFinishedGame.winnerId === game.units[1].id, "after undoing, the corrected winner is recorded");
Play.undoLastFromResults();
cancelModalConfirm();
assert(App.state.screen === "results", "cancelling the undo-last-hand confirmation leaves the finished game alone");

// 37. The same Results-screen undo also works generically for a normal
// scoring game that auto-finished by hitting its hand/target limit, not
// just win/loss games — the gap was never really winloss-specific.
Setup.pick("gnoming");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
fillSimple([10, 20]);
fillSimple([5, 8]);
fillSimple([1, 2]); // 3rd hand hits gnoming's default 3-hand limit and auto-finishes
assert(App.state.screen === "results", "gnoming auto-finished at its hand limit");
Play.undoLastFromResults();
clickModalConfirm();
assert(App.state.screen === "play", "Undo Last Hand from Results works for a normal scoring game too, not just win/loss games");
assert(App.state.game.hands.length === 2, "only the final hand that triggered the finish was removed, the other 2 remain");
Play.abandonGame();

// 38. Enter-to-next-field in score entry — never a submit, scoped only to
// .entry-grid inputs, skips disabled/hidden fields, and blurs (doesn't
// submit) on the very last field.
UI.enableEnterNavigation();
function pressEnter(el) {
  el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}
Setup.pick("skullking");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
game = App.state.game;
let bidField = document.getElementById(`sk-bid-${game.units[0].id}`);
bidField.focus();
pressEnter(bidField);
assert(document.activeElement.id === `sk-tricks-${game.units[0].id}`, "Enter on Bid moves focus to Tricks, same player");
pressEnter(document.activeElement);
assert(document.activeElement.id === `sk-bonus-${game.units[0].id}`, "Enter on Tricks moves focus to Bonus, same player");
pressEnter(document.activeElement);
assert(document.activeElement.id === `sk-bid-${game.units[1].id}`, "Enter on the last field of player 1 moves to the first field of player 2, not off the form");
assert(App.state.game.hands.length === 0, "Enter navigation never submitted the round — no hand was recorded just from pressing Enter");

// Last field overall: Enter should blur, not submit and not error.
pressEnter(document.getElementById(`sk-tricks-${game.units[1].id}`));
let lastField = document.getElementById(`sk-bonus-${game.units[1].id}`);
lastField.focus();
pressEnter(lastField);
assert(App.state.game.hands.length === 0, "Enter on the very last field of the whole form still doesn't submit anything");

// Manual-override field is skipped while hidden, included once shown.
let manualToggle = document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .switch`);
Play.toggleManualSwitch(manualToggle);
let manualInput = document.querySelector(`.entry-unit-block[data-unit="${game.units[0].id}"] .manual-fields input`);
assert(manualInput.closest(".hidden") === null, "manual override field is now visible after toggling");
let p1Bonus = document.getElementById(`sk-bonus-${game.units[0].id}`);
assert(p1Bonus.closest(".hidden") !== null, "the structured Bonus field is now hidden, since manual override is on");
manualInput.focus();
pressEnter(manualInput);
assert(document.activeElement.id === `sk-bid-${game.units[1].id}`, "Enter from the now-visible manual field skips the now-hidden structured fields entirely, landing on the next player");
Play.toggleManualSwitch(manualToggle); // revert before the game gets abandoned, tidy state
Play.abandonGame();

// Enter outside any .entry-grid (e.g. the player-name field) is untouched —
// its own explicit handler still owns Enter there.
App.go("players");
App.render();
let nameField = document.getElementById("newPlayerName");
nameField.value = "Zeke";
nameField.focus();
pressEnter(nameField);
assert(Storage.getPlayers().some(p => p.name === "Zeke"), "Enter on the new-player name field still adds the player, unaffected by the new score-entry handler");

// 39. Collapsible player cards — only where a card is still stacked.
// Comfortable: every game gets the chevron. Compact: only Hand & Foot and
// Phase 10 (which never inline) get it; the inline-eligible games don't,
// since there's nothing left to collapse on an already-single-row card.
Density.set("comfortable");
Setup.pick("skullking");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
game = App.state.game;
assert(document.querySelector(".collapse-toggle") !== null, "Comfortable Skull King shows the collapse chevron");
Play.abandonGame();

Density.set("compact");
Setup.pick("skullking");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
assert(document.querySelector(".collapse-toggle") === null, "Compact Skull King (already single-row) shows no collapse chevron");
Play.abandonGame();

Setup.pick("handfoot");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
App.render();
game = App.state.game;
assert(document.querySelector(".collapse-toggle") !== null, "Compact Hand & Foot still shows the collapse chevron — it never inlines regardless of density");

// Collapsing actually hides the fields, and shows the bare name only.
const chevron = document.querySelector(".collapse-toggle");
const block = chevron.closest(".entry-unit-block");
const p0Id = block.dataset.unit;
const p1Id = game.units.find(u => u.id !== p0Id).id;
assert(!block.classList.contains("collapsed"), "player card starts expanded");
Play.toggleCollapse(chevron);
assert(block.classList.contains("collapsed"), "collapsing sets the collapsed class");
assert(block.querySelector(".unit-label-row") !== null, "the name row itself is never hidden");

// Enter-navigation must skip fields inside a collapsed card entirely,
// rather than trying (and silently failing) to focus a hidden field.
const p1Block = document.querySelector(`.entry-unit-block[data-unit="${p1Id}"]`);
const p1CleanField = p1Block.querySelector(".hf-clean");
p1CleanField.focus();
pressEnter(p1CleanField);
assert(document.activeElement.closest(".entry-unit-block") === p1Block, "Enter from the collapsed player's neighbor stays within the expanded player's own fields");
// Walk through the rest of player 1's fields — none of these Enters should
// ever land inside player 0's collapsed card.
["hf-dirty", "hf-meld", "hf-bonus", "hf-stuck"].forEach(cls => {
  pressEnter(document.activeElement);
  const landedBlock = document.activeElement.closest(".entry-unit-block");
  assert(landedBlock === null || landedBlock === p1Block, `Enter never lands inside the collapsed card while advancing through ${cls}`);
});

Play.toggleCollapse(chevron);
assert(!block.classList.contains("collapsed"), "toggling again re-expands the card");
Play.abandonGame();

// 40. Stale persisted rules healing. A device that opened the app before a
// code-owned field (entryType, info, label, winMode, teamMode) changed will
// have that OLD value permanently saved — _mergeMissing only fills in keys
// that are entirely absent, it can't fix one that already exists with a
// stale value. getRules() must re-sync those five specific fields from the
// current code on every load, while leaving anything actually
// user-customizable (endCondition, scoring, bonuses, cardValues) untouched.
const staleRulesForCodeFieldHeal = JSON.parse(JSON.stringify(DEFAULT_RULES));
staleRulesForCodeFieldHeal.countdown321.entryType = "simple"; // the exact real-world bug this fixes
staleRulesForCodeFieldHeal.countdown321.info = ["stale pre-fix scoring text"];
staleRulesForCodeFieldHeal.handfoot.endCondition.value = 7; // a genuine house-rule customization
window.localStorage.setItem("sk_rules", JSON.stringify(staleRulesForCodeFieldHeal));
const healed = Storage.getRules();
assert(healed.countdown321.entryType === "countdown321", "a stale entryType heals back to the current code value on load");
assert(JSON.stringify(healed.countdown321.info) === JSON.stringify(DEFAULT_RULES.countdown321.info), "stale info text heals to the current code value on load");
assert(healed.handfoot.endCondition.value === 7, "a genuine house-rule customization (endCondition.value) survives the heal");
const rawAfterHeal = JSON.parse(window.localStorage.getItem("sk_rules"));
assert(rawAfterHeal.countdown321.entryType === "countdown321", "the healed rules are persisted back to storage, not just healed in-memory for one call");

console.log("\\nALL SMOKE TESTS PASSED");
