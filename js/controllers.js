// ============================================================
// CONTROLLERS — handle user actions. Split from rendering so
// each screen function in app.js stays focused on markup.
// ============================================================

var Players = {
  openColorId: null,

  add() {
    const input = document.getElementById("newPlayerName");
    if (!input) return;
    const name = (input.value || "").trim();
    if (!name) return;
    const players = Storage.getPlayers();
    const color = PLAYER_COLORS[players.length % PLAYER_COLORS.length];
    players.push({ id: Storage.uid(), name, wins: 0, gamesPlayed: 0, color });
    Storage.savePlayers(players);
    input.value = "";
    App.render();
  },
  remove(id) {
    if (!confirm("Remove this player? Their past game history stays, but they'll need to be re-added to play again.")) return;
    const players = Storage.getPlayers().filter(p => p.id !== id);
    Storage.savePlayers(players);
    App.render();
  },
  toggleColorPicker(id) {
    this.openColorId = this.openColorId === id ? null : id;
    App.render();
  },
  setColor(id, color) {
    const players = Storage.getPlayers();
    const p = players.find(pp => pp.id === id);
    if (p) p.color = color;
    Storage.savePlayers(players);
    App.render();
  },
  resetStats(id) {
    if (!confirm("Reset this player's wins and games-played count back to zero? This doesn't touch past game history.")) return;
    const players = Storage.getPlayers();
    const p = players.find(pp => pp.id === id);
    if (p) { p.wins = 0; p.gamesPlayed = 0; }
    Storage.savePlayers(players);
    App.render();
  }
};

var Setup = {
  begin() { App.go("picker"); },

  pick(gameKey) {
    const rules = Storage.getRules();
    const gr = gameKey === "custom" ? null : rules[gameKey];
    App.state.setup = {
      gameKey,
      selectedPlayerIds: [],
      guestPlayers: [],
      useTeams: gr ? gr.teamMode === "forced" : false,
      teamAssignments: {},
      endValue: gr && gr.endCondition && gr.endCondition.value ? gr.endCondition.value : 10,
      customName: "",
      customWinLow: false,
      customTeamMode: "choice",
      customEndType: "manual"
    };
    App.go("setup");
  },

  togglePlayer(id) {
    const s = App.state.setup;
    const idx = s.selectedPlayerIds.indexOf(id);
    if (idx >= 0) {
      s.selectedPlayerIds.splice(idx, 1);
      delete s.teamAssignments[id];
    } else {
      s.selectedPlayerIds.push(id);
    }
    App.render();
  },

  addGuest() {
    const name = prompt("Guest's name?");
    if (!name || !name.trim()) return;
    const s = App.state.setup;
    const id = "guest_" + Storage.uid();
    s.guestPlayers.push({ id, name: name.trim() });
    s.selectedPlayerIds.push(id);
    App.render();
  },

  guestById(id) {
    const s = App.state.setup;
    return s.guestPlayers.find(g => g.id === id) || { name: "Unknown" };
  },

  toggleTeams() {
    const s = App.state.setup;
    s.useTeams = !s.useTeams;
    if (!s.useTeams) s.teamAssignments = {};
    App.render();
  },

  assignTeam(playerId, num) {
    const s = App.state.setup;
    if (s.teamAssignments[playerId] === num) delete s.teamAssignments[playerId];
    else s.teamAssignments[playerId] = num;
    App.render();
  },

  updateEndValue(val) { App.state.setup.endValue = Number(val) || 0; },
  updateCustomName(val) { App.state.setup.customName = val; },
  toggleCustomWinLow() { App.state.setup.customWinLow = !App.state.setup.customWinLow; App.render(); },
  setCustomEndType(type) { App.state.setup.customEndType = type; App.render(); },

  allPlayersById(s) {
    const roster = Storage.getPlayers();
    const map = {};
    roster.forEach(p => (map[p.id] = p));
    s.guestPlayers.forEach(g => (map[g.id] = g));
    return map;
  },

  buildUnits(s) {
    const byId = this.allPlayersById(s);
    if (s.useTeams) {
      const t1 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 1);
      const t2 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 2);
      const units = [];
      if (t1.length) units.push({ id: "team1", name: "Team 1 (" + t1.map(id => byId[id].name).join(" & ") + ")", memberIds: t1 });
      if (t2.length) units.push({ id: "team2", name: "Team 2 (" + t2.map(id => byId[id].name).join(" & ") + ")", memberIds: t2 });
      return units;
    }
    return s.selectedPlayerIds.map(id => ({ id, name: byId[id].name, memberIds: [id] }));
  },

  validationMessage() {
    const s = App.state.setup;
    if (!s) return "";
    if (s.gameKey === "custom" && !s.customName.trim()) return "Give your custom game a name.";
    if (s.selectedPlayerIds.length < 2) return "Add at least 2 players to get started.";

    if (s.gameKey === "rook") {
      if (s.selectedPlayerIds.length !== 4) return "Rook needs exactly 4 players (2 vs 2).";
      const t1 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 1).length;
      const t2 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 2).length;
      if (t1 !== 2 || t2 !== 2) return "Rook needs exactly 2 players on each team.";
      return "";
    }

    if (s.useTeams) {
      const t1 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 1).length;
      const t2 = s.selectedPlayerIds.filter(id => s.teamAssignments[id] === 2).length;
      const unassigned = s.selectedPlayerIds.filter(id => !s.teamAssignments[id]).length;
      if (unassigned > 0) return "Assign every player to a team.";
      if (t1 === 0 || t2 === 0) return "Both teams need at least one player.";
    }
    if (s.gameKey === "custom" && s.customEndType !== "manual" && (!s.endValue || s.endValue <= 0)) return "Enter a valid number.";
    return "";
  },

  start() {
    if (this.validationMessage()) { alert(this.validationMessage()); return; }
    const s = App.state.setup;
    const units = this.buildUnits(s);
    let rulesSnapshot, winMode, endCondition, label;

    if (s.gameKey === "custom") {
      label = s.customName.trim();
      winMode = s.customWinLow ? "low" : "high";
      rulesSnapshot = { label, entryType: "simple", info: ["Custom game — plain point totals per hand."] };
      endCondition = s.customEndType === "manual" ? { type: "manual" } : { type: s.customEndType, value: s.endValue };
    } else {
      const rules = Storage.getRules();
      const gr = rules[s.gameKey];
      rulesSnapshot = JSON.parse(JSON.stringify(gr)); // SNAPSHOT — future rule edits won't affect this game
      winMode = gr.winMode;
      label = gr.label;
      if (gr.endCondition.type === "target" || gr.endCondition.type === "hands") {
        endCondition = { type: gr.endCondition.type, value: s.endValue };
      } else {
        endCondition = { type: gr.endCondition.type, value: gr.endCondition.value };
      }
    }

    const game = {
      id: Storage.uid(),
      gameKey: s.gameKey,
      customName: s.gameKey === "custom" ? label : undefined,
      units,
      participantIds: units.map(u => u.id),
      mode: s.useTeams ? "team" : "individual",
      winMode,
      rulesSnapshot,
      endCondition,
      hands: [],
      status: "active",
      createdAt: Date.now()
    };
    rulesSnapshot.label = label;
    Storage.saveActiveGame(game);
    App.state.game = game;
    App.state.setup = null;
    App.go("play");
  }
};

var Play = {
  scoreForm(game, entryType) {
    if (entryType === "rook") return this.rookForm(game);
    if (entryType === "handfoot") return this.handfootForm(game);
    if (entryType === "phase10") return this.phase10Form(game);
    return this.simpleForm(game);
  },

  simpleForm(game) {
    return `
      <h3 style="margin-bottom:10px;">Enter hand totals</h3>
      ${game.units.map(u => `
        <div class="entry-unit-block" data-unit="${u.id}">
          <div class="unit-label">${escapeHtml(u.name)}</div>
          <input class="num-input simple-total" type="number" placeholder="0" />
        </div>
      `).join("")}
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveSimple()">Save Hand &amp; Continue</button>
    `;
  },

  handfootForm(game) {
    return `
      <h3 style="margin-bottom:10px;">Enter this hand</h3>
      ${game.units.map(u => `
        <div class="entry-unit-block" data-unit="${u.id}">
          <div class="unit-label">${escapeHtml(u.name)}</div>
          <div class="toggle-row">
            <span>Just type the total instead</span>
            <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
          </div>
          <div class="structured-fields">
            <div class="field-row"><label>Clean books</label><input type="number" class="hf-clean" placeholder="0" /></div>
            <div class="field-row"><label>Dirty books</label><input type="number" class="hf-dirty" placeholder="0" /></div>
            <div class="field-row"><label>Meld total</label><input type="number" class="hf-meld" placeholder="0" /></div>
            <div class="field-row"><label>Stuck in hand/foot</label><input type="number" class="hf-stuck" placeholder="0" /></div>
          </div>
          <div class="manual-fields hidden">
            <input class="num-input hf-manual" type="number" placeholder="0" />
          </div>
        </div>
      `).join("")}
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveHandfoot()">Save Hand &amp; Continue</button>
    `;
  },

  rookForm(game) {
    return `
      <h3 style="margin-bottom:10px;">This hand's bid</h3>
      <div class="toggle-row">
        <span>Just type each team's total instead</span>
        <div class="switch" id="rookManualSwitch" onclick="Play.toggleRookManual(this)"><div class="knob"></div></div>
      </div>
      <div id="rookBidFields">
        <div class="field-row"><label>Winning bidder</label>
          <select id="rookBidder">${game.units.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select>
        </div>
        <div class="field-row"><label>Bid amount</label><input type="number" id="rookBid" placeholder="e.g. 120" /></div>
        <div class="field-row"><label>Trump color called</label>
          <select id="rookTrump"><option>Red</option><option>Green</option><option>Black</option><option>Yellow</option></select>
        </div>
        <div class="field-row"><label>Points captured by bidder</label><input type="number" id="rookCapturedBid" min="0" max="100" placeholder="0-100" /></div>
        <p class="hint-text">The other team automatically gets what's left out of 100.</p>
      </div>
      <div id="rookManualFields" class="hidden">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            <div class="unit-label">${escapeHtml(u.name)}</div>
            <input class="num-input rook-manual" type="number" placeholder="0" />
          </div>
        `).join("")}
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveRook()">Save Hand &amp; Continue</button>
    `;
  },

  phase10Form(game) {
    const phases = Engine.phaseProgress(game);
    const cardVals = [
      { label: "1", pts: 1 }, { label: "2", pts: 2 }, { label: "3", pts: 3 }, { label: "4", pts: 4 },
      { label: "5", pts: 5 }, { label: "6", pts: 6 }, { label: "7", pts: 7 }, { label: "8", pts: 8 },
      { label: "9", pts: 9 }, { label: "10/11/12", pts: 10 }, { label: "Skip", pts: 10 }, { label: "Wild", pts: 25 }
    ];
    return `
      <h3 style="margin-bottom:10px;">Enter this hand</h3>
      ${game.units.map(u => `
        <div class="entry-unit-block" data-unit="${u.id}">
          <div class="unit-label">${escapeHtml(u.name)} <span class="pill">${phases[u.id] > 10 ? "Complete!" : "Phase " + phases[u.id]}</span></div>
          <div class="toggle-row">
            <span>Completed this phase</span>
            <div class="switch phase-complete-switch" onclick="Play.toggleManualSwitch(this,true)"><div class="knob"></div></div>
          </div>
          <div class="toggle-row">
            <span>Just type the total instead</span>
            <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
          </div>
          <div class="structured-fields">
            <p class="hint-text">Tap + for every card of that value left in hand (you can have more than one of the same number).</p>
            ${cardVals.map(c => `
              <div class="cardqty-row" data-points="${c.pts}">
                <span class="cardqty-label">${c.label}<span class="pts">${c.pts}pt</span></span>
                <div class="qty-stepper">
                  <button type="button" onclick="Play.stepCardQty(this,-1)">&minus;</button>
                  <span class="qty-val">0</span>
                  <button type="button" onclick="Play.stepCardQty(this,1)">+</button>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="manual-fields hidden">
            <input class="num-input p10-manual" type="number" placeholder="0" />
          </div>
        </div>
      `).join("")}
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.savePhase10()">Save Hand &amp; Continue</button>
    `;
  },

  winLossForm(game) {
    if (!App.state.entryDraft.winnerId) App.state.entryDraft.winnerId = game.units[0].id;
    return `
      <h3 style="margin-bottom:10px;">Who won this game?</h3>
      ${game.units.map(u => `
        <div class="winloss-pick ${App.state.entryDraft.winnerId === u.id ? "sel" : ""}" onclick="Play.pickWinner('${u.id}')">
          <div class="avatar">${initials(u.name)}</div>
          <div class="player-name">${escapeHtml(u.name)}</div>
        </div>
      `).join("")}
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveWinLoss()">Log Winner</button>
    `;
  },

  pickWinner(unitId) {
    App.state.entryDraft.winnerId = unitId;
    App.render();
  },

  toggleManualSwitch(el, isPhaseComplete) {
    el.classList.toggle("on");
    if (isPhaseComplete) return; // just a flag, no field swap
    const block = el.closest(".entry-unit-block");
    const structured = block.querySelector(".structured-fields");
    const manual = block.querySelector(".manual-fields");
    structured.classList.toggle("hidden");
    manual.classList.toggle("hidden");
  },

  toggleRookManual(el) {
    el.classList.toggle("on");
    const on = el.classList.contains("on");
    document.getElementById("rookBidFields").classList.toggle("hidden", on);
    document.getElementById("rookManualFields").classList.toggle("hidden", !on);
  },

  saveSimple() {
    const game = App.state.game;
    const entries = {};
    game.units.forEach(u => {
      const block = document.querySelector(`.entry-unit-block[data-unit="${u.id}"]`);
      const total = Number(block.querySelector(".simple-total").value) || 0;
      entries[u.id] = { total, score: Engine.simple({ total }) };
    });
    this.commitHand(entries);
  },

  saveHandfoot() {
    const game = App.state.game;
    const rules = game.rulesSnapshot;
    const entries = {};
    game.units.forEach(u => {
      const block = document.querySelector(`.entry-unit-block[data-unit="${u.id}"]`);
      const manual = !block.querySelector(".manual-fields").classList.contains("hidden");
      const entry = manual
        ? { manual: true, manualTotal: Number(block.querySelector(".hf-manual").value) || 0 }
        : {
            manual: false,
            cleanBooks: Number(block.querySelector(".hf-clean").value) || 0,
            dirtyBooks: Number(block.querySelector(".hf-dirty").value) || 0,
            meldTotal: Number(block.querySelector(".hf-meld").value) || 0,
            stuckTotal: Number(block.querySelector(".hf-stuck").value) || 0
          };
      entry.score = Engine.handfoot(entry, rules);
      entries[u.id] = entry;
    });
    this.commitHand(entries);
  },

  saveRook() {
    const game = App.state.game;
    const manualMode = document.getElementById("rookManualSwitch").classList.contains("on");
    const entries = {};

    if (manualMode) {
      game.units.forEach(u => {
        const block = document.querySelector(`#rookManualFields .entry-unit-block[data-unit="${u.id}"]`);
        const manualTotal = Number(block.querySelector(".rook-manual").value) || 0;
        entries[u.id] = { manual: true, manualTotal, score: manualTotal };
      });
      this.commitHand(entries, {});
    } else {
      const biddingTeamId = document.getElementById("rookBidder").value;
      const bid = Number(document.getElementById("rookBid").value) || 0;
      const trump = document.getElementById("rookTrump").value;
      const rawCaptured = Number(document.getElementById("rookCapturedBid").value) || 0;
      const capturedByBidder = Math.max(0, Math.min(100, rawCaptured));
      const handMeta = { biddingTeamId, bid, trump };
      game.units.forEach(u => {
        const captured = u.id === biddingTeamId ? capturedByBidder : (100 - capturedByBidder);
        const entry = { manual: false, captured };
        entry.score = Engine.rook(entry, handMeta, u.id);
        entries[u.id] = entry;
      });
      const bidderUnit = game.units.find(u => u.id === biddingTeamId);
      game.lastRookInfo = {
        biddingTeamName: bidderUnit ? bidderUnit.name : "—",
        bid, trump,
        made: capturedByBidder >= bid
      };
      this.commitHand(entries, handMeta);
    }
  },

  stepCardQty(btn, delta) {
    const row = btn.closest(".cardqty-row");
    const span = row.querySelector(".qty-val");
    const next = Math.max(0, (parseInt(span.textContent, 10) || 0) + delta);
    span.textContent = next;
  },

  savePhase10() {
    const game = App.state.game;
    const entries = {};
    game.units.forEach(u => {
      const block = document.querySelector(`.entry-unit-block[data-unit="${u.id}"]`);
      const manual = !block.querySelector(".manual-fields").classList.contains("hidden");
      const completedPhase = block.querySelector(".phase-complete-switch").classList.contains("on");
      let entry;
      if (manual) {
        entry = { manual: true, manualTotal: Number(block.querySelector(".p10-manual").value) || 0, completedPhase };
      } else {
        let cardTotal = 0;
        block.querySelectorAll(".cardqty-row").forEach(row => {
          const qty = parseInt(row.querySelector(".qty-val").textContent, 10) || 0;
          const pts = Number(row.dataset.points) || 0;
          cardTotal += qty * pts;
        });
        entry = { manual: false, cardTotal, completedPhase };
      }
      entry.score = Engine.phase10(entry);
      entries[u.id] = entry;
    });
    this.commitHand(entries);
  },

  saveWinLoss() {
    const game = App.state.game;
    const winnerId = App.state.entryDraft.winnerId;
    game.hands.push({ handNum: game.hands.length + 1, winnerId });
    App.state.entryDraft = {};
    Storage.saveActiveGame(game);
    this.afterHandSaved(game);
  },

  commitHand(entries, handMeta) {
    const game = App.state.game;
    const hand = { handNum: game.hands.length + 1, entries };
    if (handMeta) hand.handMeta = handMeta;
    game.hands.push(hand);
    Storage.saveActiveGame(game);
    this.afterHandSaved(game);
  },

  afterHandSaved(game) {
    const result = Engine.checkEndCondition(game);
    if (result.done) {
      this.finishGame(game);
    } else {
      App.render();
    }
  },

  standingsList(game) {
    if (game.winMode === "winloss") {
      const wins = Engine.runningWinCounts(game);
      return game.units.map(u => ({ id: u.id, name: u.name, value: wins[u.id] || 0 }))
        .sort((a, b) => b.value - a.value);
    }
    const totals = Engine.runningTotals(game);
    return game.units.map(u => ({ id: u.id, name: u.name, value: totals[u.id] || 0 }))
      .sort((a, b) => game.winMode === "low" ? a.value - b.value : b.value - a.value);
  },

  scoreboard(game) {
    const standings = this.standingsList(game);
    if (game.winMode === "winloss") {
      return `
        <div class="ledger">
          <table>
            <tr><th>Player/Team</th><th>Wins</th></tr>
            ${standings.map((s, i) => `<tr class="${i === 0 ? "totalrow" : ""}"><td>${escapeHtml(s.name)}${i === 0 && s.value > 0 ? ' <span class="lead-badge">LEADING</span>' : ""}</td><td>${s.value}</td></tr>`).join("")}
          </table>
        </div>`;
    }
    const handNums = game.hands.map(h => h.handNum);
    return `
      <div class="ledger">
        <table>
          <tr><th>Player/Team</th>${handNums.map(n => `<th>H${n}</th>`).join("")}<th>Total</th></tr>
          ${standings.map((s, i) => `
            <tr class="${i === 0 ? "totalrow" : ""}">
              <td>${escapeHtml(s.name)}${i === 0 ? ' <span class="lead-badge">LEADING</span>' : ""}</td>
              ${game.hands.map(h => `<td>${h.entries[s.id] ? h.entries[s.id].score : (h.winnerId ? "" : 0)}</td>`).join("")}
              <td>${s.value}</td>
            </tr>`).join("")}
        </table>
      </div>`;
  },

  confirmEnd() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>End this game?</h3>
        <p class="hint-text">You can lock in a winner based on current standings, or just walk away without recording one.</p>
        <button class="btn-primary" onclick="Play.endWithWinner()">End &amp; Declare Winner</button>
        <button class="btn-outline-dark" style="margin-top:10px;" onclick="Play.endNoWinner()">End Without a Winner</button>
        <button class="tiny-link" style="display:block;text-align:center;margin-top:16px;" onclick="this.closest('.modal-overlay').remove()">Never mind, keep playing</button>
      </div>`;
    document.body.appendChild(overlay);
  },

  endWithWinner() {
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
    this.finishGame(App.state.game);
  },

  endNoWinner() {
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
    this.abandonGame();
  },

  abandonGame() {
    Storage.clearActiveGame();
    App.state.game = null;
    App.state.entryDraft = {};
    App.go("home");
  },

  finishGame(game) {
    const winnerId = Engine.determineWinner(game);
    game.winnerId = winnerId;
    const standings = this.standingsList(game);
    const winnerStanding = standings.find(s => s.id === winnerId);

    // Update player stats
    const players = Storage.getPlayers();
    const playerMap = {};
    players.forEach(p => (playerMap[p.id] = p));
    const allMemberIds = new Set();
    game.units.forEach(u => u.memberIds.forEach(id => allMemberIds.add(id)));
    const winningUnit = game.units.find(u => u.id === winnerId);
    const winningMemberIds = new Set(winningUnit ? winningUnit.memberIds : []);
    allMemberIds.forEach(id => {
      if (playerMap[id]) {
        playerMap[id].gamesPlayed = (playerMap[id].gamesPlayed || 0) + 1;
        if (winningMemberIds.has(id)) playerMap[id].wins = (playerMap[id].wins || 0) + 1;
      }
    });
    Storage.savePlayers(players);

    const historyEntry = {
      id: game.id,
      gameKey: game.gameKey,
      label: game.rulesSnapshot.label,
      winMode: game.winMode,
      standings,
      winnerName: winnerStanding ? winnerStanding.name : "—",
      hands: game.hands,
      finishedAt: Date.now()
    };
    Storage.addHistoryEntry(historyEntry);
    Storage.clearActiveGame();

    App.state.game = null;
    App.state.lastFinishedGame = { ...game, standings };
    App.state.entryDraft = {};
    App.go("results");
  }
};

var RulesEdit = {
  buffer: null,
  startEdit(key) {
    this.buffer = JSON.parse(JSON.stringify(Storage.getRules()[key]));
  },
  setNested(section, key, val) {
    this.buffer[section][key] = Number(val);
  },
  setEndValue(val) {
    this.buffer.endCondition.value = Number(val) || 0;
  },
  save() {
    if (!confirm(`This changes scoring for all future ${this.buffer.label} games. Games already in progress keep their original rules. Continue?`)) return;
    const rules = Storage.getRules();
    rules[App.state.rulesViewKey] = this.buffer;
    Storage.saveRules(rules);
    this.buffer = null;
    App.go("rules");
  }
};
