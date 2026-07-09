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
dom.window.confirm = () => true;
dom.window.alert = (msg) => console.log("ALERT:", msg);
dom.window.prompt = () => "Guest Gary";

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  dom.window.eval(code);
}

load("js/config.js");
load("js/storage.js");
load("js/engine.js");
load("js/controllers.js");
load("js/app.js");

const { App, Storage, Players, Setup, Play, RulesEdit, Screens, Engine, DEFAULT_RULES, GameOrder, GAME_ORDER } = dom.window;

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK: " + msg);
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
  b.querySelector(".hf-stuck").value = "30";
});
Play.saveHandfoot();
const hfTotals = Engine.runningTotals(App.state.game);
const expected = 500 + 300 + 200 - 30;
Object.values(hfTotals).forEach(v => assert(v === expected, `hand & foot score computed correctly (${v} === ${expected})`));

// House rules edit flow (snapshot check: editing rules mid-game shouldn't affect active game)
App.state.rulesViewKey = "handfoot";
RulesEdit.startEdit("handfoot");
RulesEdit.setNested("bonuses", "cleanBook", "999");
RulesEdit.save();
const newRules = Storage.getRules();
console.log("DEBUG cleanBook after edit:", newRules.handfoot.bonuses.cleanBook, "rulesViewKey:", App.state.rulesViewKey, "buffer:", RulesEdit.buffer);
assert(newRules.handfoot.bonuses.cleanBook === 999, "house rule edit persisted");
assert(App.state.game.rulesSnapshot.bonuses.cleanBook === 500, "in-progress game keeps its original rules snapshot");

Play.finishGame(App.state.game);

// 6. Phase 10 completion detection (via manual entries) + a quantity-stepper check
Setup.pick("phase10");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;

// First, verify the quantity stepper itself can represent multiple of the same card
App.render();
let firstBlock = document.querySelector(".entry-unit-block");
let eightRow = Array.from(firstBlock.querySelectorAll(".cardqty-row")).find(r => r.dataset.points === "8");
Play.stepCardQty(eightRow.querySelector(".qty-stepper button:last-child"), 1);
Play.stepCardQty(eightRow.querySelector(".qty-stepper button:last-child"), 1);
Play.stepCardQty(eightRow.querySelector(".qty-stepper button:last-child"), 1); // three 8s = 24 pts
assert(eightRow.querySelector(".qty-val").textContent === "3", "stepper can hold multiple of the same card value");

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

// 7. Sequence (win/loss tracker)
Setup.pick("sequence");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
App.render();
Play.pickWinner(game.units[0].id);
Play.saveWinLoss();
assert(App.state.screen === "play", "sequence does not auto-end (manual end condition)");
Play.endWithWinner(); // uses new 3-way flow directly
assert(App.state.screen === "results", "sequence ends manually via End Game -> Declare Winner");

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
const resetPlayer = Storage.getPlayers().find(p => p.id === players[0].id);
assert(resetPlayer.wins === 0 && resetPlayer.gamesPlayed === 0, "player stats reset to zero");

// 10. History persisted (gnoming, rook, handfoot, phase10, sequence = 5; abandoned game does NOT count)
const history = Storage.getHistory();
assert(history.length === 5, "5 completed games recorded in history (abandoned game excluded): " + history.length);

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

// 14. Final history count: 5 originally + 1 new gnoming game played out for the rematch test = 6
const finalHistory = Storage.getHistory();
assert(finalHistory.length === 6, "6 completed games recorded in history overall: " + finalHistory.length);

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

// 17. 3-2-1 Countdown — same shape, quick sanity check
Setup.pick("countdown321");
Setup.togglePlayer(players[0].id);
Setup.togglePlayer(players[1].id);
Setup.start();
game = App.state.game;
assert(game.winMode === "high" && game.endCondition.value === 5, "3-2-1 Countdown set up as high-score, 5 fixed rounds");
for (let i = 0; i < 5; i++) {
  App.render();
  if (App.state.screen !== "play") break;
  fillSimple([4, 1]); // simulates a correct Countdown call (3 + 1 bonus) each round
}
assert(App.state.screen === "results", "3-2-1 Countdown auto-ends after 5 rounds");

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

// 24. Newly-added target/hands choice works for the other score-accumulating games too
Setup.pick("gnoming");
assert(App.state.setup.endType === "hands", "Gnoming A Round defaults to fixed hands");
Setup.setEndType("target");
assert(App.state.setup.endType === "target", "Gnoming A Round can now be switched to target score");
Setup.setEndType("hands"); // switch back so nothing downstream is affected

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

console.log("\\nALL SMOKE TESTS PASSED");
