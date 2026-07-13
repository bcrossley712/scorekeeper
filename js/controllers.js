// ============================================================
// CONTROLLERS — handle user actions. Split from rendering so
// each screen function in app.js stays focused on markup.
// ============================================================

var Density = {
  get() { return Storage.getSettings().scoreEntryDensity || "comfortable"; },

  set(mode) {
    const s = Storage.getSettings();
    s.scoreEntryDensity = mode;
    Storage.saveSettings(s);
    App.render();
  },

  toggle() { this.set(this.get() === "compact" ? "comfortable" : "compact"); },

  // Called only from finishGame() — an abandoned game (no winner) never counts.
  recordGameCompleted() {
    const s = Storage.getSettings();
    s.gamesCompletedCount = (s.gamesCompletedCount || 0) + 1;
    if (s.gamesCompletedCount >= 2 && !s.densityIntroSeen) {
      s.densityIntroSeen = true;
      // If they've already found the toggle and switched themselves, don't
      // flip anything or show the modal — they already know it's there.
      if (s.scoreEntryDensity !== "compact") {
        s.scoreEntryDensity = "compact";
        s.showDensityIntroModal = true;
      }
    }
    Storage.saveSettings(s);
  },

  // Checked once, right after landing on the results screen post-finishGame().
  maybeShowIntroModal() {
    const s = Storage.getSettings();
    if (!s.showDensityIntroModal) return;
    s.showDensityIntroModal = false;
    Storage.saveSettings(s);

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>Faster score entry</h3>
        <p class="hint-text">Now that you've played a couple games, score entry has switched to a more compact layout &mdash; everyone fits with less scrolling. Look for the small toggle at the top of any entry screen if you ever want to switch views.</p>
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Got it</button>
        <button class="btn-outline-dark" style="margin-top:10px;" onclick="Density.set('comfortable'); this.closest('.modal-overlay').remove()">Switch Back to Comfortable</button>
      </div>`;
    document.body.appendChild(overlay);
  },

  toggleHtml() {
    const compact = this.get() === "compact";
    return `
      <div class="density-toggle-quiet">
        <button class="density-quiet-btn" onclick="Density.toggle()">${compact ? "Comfortable view" : "Compact view"}</button>
      </div>
    `;
  }
};

var GameOrder = {
  alphabeticalOrder() {
    return [...GAME_ORDER].sort((a, b) => DEFAULT_RULES[a].label.localeCompare(DEFAULT_RULES[b].label));
  },

  // Returns the order to actually display. If the user has a custom order saved,
  // it's used as-is except: any game no longer in GAME_ORDER is dropped, and any
  // game newly added to GAME_ORDER since they last customized (like a future new
  // preset) gets appended alphabetically rather than wiping their whole layout.
  getEffectiveOrder() {
    const custom = Storage.getGameOrder();
    if (!custom) return this.alphabeticalOrder();
    const stillValid = custom.filter(k => GAME_ORDER.includes(k));
    const missing = GAME_ORDER.filter(k => !stillValid.includes(k))
      .sort((a, b) => DEFAULT_RULES[a].label.localeCompare(DEFAULT_RULES[b].label));
    return stillValid.concat(missing);
  },

  moveUp(key) {
    const order = this.getEffectiveOrder().slice();
    const idx = order.indexOf(key);
    if (idx > 0) {
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
      Storage.saveGameOrder(order);
    }
    App.render();
  },

  moveDown(key) {
    const order = this.getEffectiveOrder().slice();
    const idx = order.indexOf(key);
    if (idx >= 0 && idx < order.length - 1) {
      [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
      Storage.saveGameOrder(order);
    }
    App.render();
  },

  resetToAlphabetical() {
    Storage.clearGameOrder();
    App.render();
  }
};

var Players = {
  openColorId: null,

  // Leaderboard order for the Home screen: anyone with at least one game
  // played is ranked by wins (desc), then games played (asc) as a tiebreak —
  // same win count, fewer games looks better. Anyone who hasn't played yet
  // (0 games) always sinks below that group, sorted alphabetically, so a
  // fresh 0-0 player never outranks someone who's played and just hasn't
  // won yet.
  leaderboardOrder(players) {
    const played = players.filter(p => (p.gamesPlayed || 0) > 0);
    const unplayed = players.filter(p => (p.gamesPlayed || 0) === 0);
    played.sort((a, b) => {
      const winsDiff = (b.wins || 0) - (a.wins || 0);
      if (winsDiff !== 0) return winsDiff;
      return (a.gamesPlayed || 0) - (b.gamesPlayed || 0);
    });
    unplayed.sort((a, b) => a.name.localeCompare(b.name));
    return played.concat(unplayed);
  },

  add() {
    const input = document.getElementById("newPlayerName");
    if (!input) return;
    const name = (input.value || "").trim();
    if (!name) return;
    const players = Storage.getPlayers();
    const finish = () => {
      const color = PLAYER_COLORS[players.length % PLAYER_COLORS.length];
      players.push({ id: Storage.uid(), name, wins: 0, gamesPlayed: 0, color });
      Storage.savePlayers(players);
      input.value = "";
      App.render();
    };
    const isDup = players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (isDup) {
      UI.confirm(`There's already a player named "${escapeHtml(name)}." Add another with the same name?`, finish,
        { title: "Duplicate name", confirmLabel: "Add Anyway" });
    } else {
      finish();
    }
  },
  remove(id) {
    UI.confirm("Remove this player? Their past game history stays, but they'll need to be re-added to play again.", () => {
      const players = Storage.getPlayers().filter(p => p.id !== id);
      Storage.savePlayers(players);
      App.render();
    }, { title: "Remove this player?", confirmLabel: "Remove" });
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
    UI.confirm("Reset this player's wins and games-played count back to zero? This doesn't touch past game history.", () => {
      const players = Storage.getPlayers();
      const p = players.find(pp => pp.id === id);
      if (p) { p.wins = 0; p.gamesPlayed = 0; }
      Storage.savePlayers(players);
      App.render();
    }, { title: "Reset stats?", confirmLabel: "Reset" });
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
      endType: gr ? gr.endCondition.type : "manual",
      endValue: gr && gr.endCondition && gr.endCondition.value ? gr.endCondition.value : 10,
      customName: "",
      customWinLow: false,
      customScoreMode: "points",   // "points" (plain totals) or "winloss" (just track who won, like Sequence/Backwards 8)
      customTeamMode: "choice",
      customEndType: "manual"
    };
    App.go("setup");
  },

  setEndType(type) {
    App.state.setup.endType = type;
    App.render();
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
    UI.prompt("What's the guest's name?", (name) => {
      if (!name || !name.trim()) return;
      const s = App.state.setup;
      const id = "guest_" + Storage.uid();
      s.guestPlayers.push({ id, name: name.trim() });
      s.selectedPlayerIds.push(id);
      App.render();
    }, { title: "Add a guest", placeholder: "Guest's name", okLabel: "Add Guest" });
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
  setCustomScoreMode(mode) {
    App.state.setup.customScoreMode = mode;
    App.render();
  },
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
      if (t1.length) units.push({ id: "team1", name: "Team 1 (" + t1.map(id => byId[id].name).join(" & ") + ")", memberIds: t1, memberNames: t1.map(id => byId[id].name) });
      if (t2.length) units.push({ id: "team2", name: "Team 2 (" + t2.map(id => byId[id].name).join(" & ") + ")", memberIds: t2, memberNames: t2.map(id => byId[id].name) });
      return units;
    }
    return s.selectedPlayerIds.map(id => ({ id, name: byId[id].name, memberIds: [id], memberNames: [byId[id].name] }));
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
    if (s.gameKey === "custom" && s.customScoreMode !== "winloss" && s.customEndType !== "manual" && (!s.endValue || s.endValue <= 0)) return "Enter a valid number.";
    return "";
  },

  start() {
    if (this.validationMessage()) return;
    const s = App.state.setup;
    const units = this.buildUnits(s);
    let rulesSnapshot, winMode, endCondition, label;

    if (s.gameKey === "custom") {
      label = s.customName.trim();
      if (s.customScoreMode === "winloss") {
        winMode = "winloss";
        rulesSnapshot = { label, entryType: "winloss", info: ["Custom game — just tracks who won each hand, no point totals."] };
        endCondition = { type: "manual" }; // moot — saveWinLoss() always finishes after one hand regardless
      } else {
        winMode = s.customWinLow ? "low" : "high";
        rulesSnapshot = { label, entryType: "simple", info: ["Custom game — plain point totals per hand."] };
        endCondition = s.customEndType === "manual" ? { type: "manual" } : { type: s.customEndType, value: s.endValue };
      }
    } else {
      const rules = Storage.getRules();
      const gr = rules[s.gameKey];
      rulesSnapshot = JSON.parse(JSON.stringify(gr)); // SNAPSHOT — future rule edits won't affect this game
      winMode = gr.winMode;
      label = gr.label;
      if (s.endType === "target" || s.endType === "hands") {
        endCondition = { type: s.endType, value: s.endValue };
      } else if (s.endType === "manual") {
        endCondition = { type: "manual" };
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
    if (entryType === "skullking") return this.skullkingForm(game);
    if (entryType === "whoacowboy") return this.whoaCowboyForm(game);
    if (entryType === "countdown321") return this.countdown321Form(game);
    return this.simpleForm(game);
  },

  simpleForm(game) {
    return `
      <h3 style="margin-bottom:10px;">Enter hand totals</h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact inline-fields" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(escapeHtml(u.name), Density.get() !== "compact")}
            <input class="num-input simple-total" type="number" placeholder="0" />
          </div>
        `).join("")}
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveSimple()">Save Hand &amp; Continue</button>
    `;
  },

  handfootForm(game) {
    return `
      <h3 style="margin-bottom:10px;">Enter this hand</h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(escapeHtml(u.name), true)}
            <div class="toggle-row">
              <span class="toggle-label-full">Just type the total instead</span>
              <span class="toggle-label-short">Manual</span>
              <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
            </div>
            <div class="structured-fields">
              <div class="field-row"><label>Clean books</label><input type="number" class="hf-clean" min="0" placeholder="0" /></div>
              <div class="field-row"><label>Dirty books</label><input type="number" class="hf-dirty" min="0" placeholder="0" /></div>
              <div class="field-row"><label>Meld total</label><input type="number" class="hf-meld" min="0" placeholder="0" /></div>
              <div class="field-row"><label>Bonus</label><input type="number" class="hf-bonus" placeholder="0" /></div>
              <p class="hint-text" style="margin-top:-4px;margin-bottom:10px;">e.g. went out first, or pulled your exact 26 cards from the community pile — enter as points (negative for a penalty).</p>
              <div class="field-row"><label>Stuck in hand/foot</label><input type="number" class="hf-stuck" min="0" placeholder="0" /></div>
            </div>
            <div class="manual-fields hidden">
              <input class="num-input hf-manual" type="number" placeholder="0" />
            </div>
          </div>
        `).join("")}
      </div>
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
          <select id="rookBidder">
            <option value="" disabled selected>Select bidder</option>
            ${game.units.map(u => `
              <optgroup label="${escapeHtml(u.name.split(" (")[0])}">
                ${u.memberIds.map((mid, i) => `<option value="${mid}">${escapeHtml((u.memberNames && u.memberNames[i]) || mid)}</option>`).join("")}
              </optgroup>
            `).join("")}
          </select>
        </div>
        <div class="field-row"><label>Bid amount</label><input type="number" id="rookBid" class="input-compact" min="1" max="100" placeholder="e.g. 85" /></div>
        <div class="field-row"><label>Trump color called</label>
          <select id="rookTrump">
            <option value="" disabled selected>Select color</option>
            <option>Red</option><option>Green</option><option>Black</option><option>Yellow</option>
          </select>
        </div>
        <div class="field-row"><label>Points captured by bidder</label><input type="number" id="rookCapturedBid" class="input-compact" min="0" max="100" placeholder="0-100" /></div>
        <p class="hint-text">The other team automatically gets what's left out of 100.</p>
      </div>
      <div id="rookManualFields" class="hidden">
        <div class="entry-grid ${Density.get() === "compact" ? "is-compact" : ""}">
          ${game.units.map(u => `
            <div class="entry-unit-block" data-unit="${u.id}">
              <div class="unit-label">${escapeHtml(u.name)}</div>
              <input class="num-input rook-manual" type="number" placeholder="0" />
            </div>
          `).join("")}
        </div>
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveRook()">Save Hand &amp; Continue</button>
    `;
  },

  phase10Form(game) {
    const phases = Engine.phaseProgress(game);
    // Per the official rulebook: cards numbered 1-9 are a flat 5 points each
    // (not face value), 10/11/12 are 10 points, Skip is 15 points, Wild is 25.
    const cardVals = [
      { label: "1 through 9", pts: 5 }, { label: "10, 11, 12", pts: 10 },
      { label: "Skip", pts: 15 }, { label: "Wild", pts: 25 }
    ];
    return `
      <h3 style="margin-bottom:10px;">Enter this hand</h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(`${escapeHtml(u.name)} <span class="pill">${phases[u.id] > 10 ? "Complete!" : "Phase " + phases[u.id]}</span>`, true)}
            <div class="toggle-row">
              <span class="toggle-label-full">Completed this phase</span>
              <span class="toggle-label-short">Done</span>
              <div class="switch phase-complete-switch" onclick="Play.toggleManualSwitch(this,true)"><div class="knob"></div></div>
            </div>
            <div class="toggle-row">
              <span class="toggle-label-full">Just type the total instead</span>
              <span class="toggle-label-short">Manual</span>
              <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
            </div>
            <div class="structured-fields">
              <p class="hint-text">Tap + for every card left in hand that falls in that range (doesn't matter which exact number).</p>
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
              <input class="num-input p10-manual" type="number" min="0" placeholder="0" />
            </div>
          </div>
        `).join("")}
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.savePhase10()">Save Hand &amp; Continue</button>
    `;
  },

  skullkingForm(game) {
    const roundNum = game.hands.length + 1;
    return `
      <h3 style="margin-bottom:10px;">Round ${roundNum} <span class="pill">${roundNum} card${roundNum === 1 ? "" : "s"} dealt</span></h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact inline-fields" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(escapeHtml(u.name), Density.get() !== "compact")}
            <div class="toggle-row">
              <span class="toggle-label-full">Just type the total instead</span>
              <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
            </div>
            <div class="structured-fields">
              <div class="field-row"><label>${this.fieldLabelText("Bid", "Bid")}</label><input type="number" id="sk-bid-${u.id}" class="input-compact" min="0" max="${roundNum}" placeholder="0-${roundNum}" /></div>
              <div class="field-row"><label>${this.fieldLabelText("Tricks won", "Won")}</label><input type="number" id="sk-tricks-${u.id}" class="input-compact" min="0" max="${roundNum}" placeholder="0-${roundNum}" /></div>
              <div class="field-row"><label>${this.fieldLabelText("Bonus points", "Bonus")}</label><input type="number" id="sk-bonus-${u.id}" class="input-compact digits-3" placeholder="0" /></div>
              <p class="hint-text">Bonus only counts if the bid above was exactly right.</p>
            </div>
            <div class="manual-fields hidden">
              <input class="num-input" id="sk-manual-${u.id}" type="number" placeholder="0" />
            </div>
          </div>
        `).join("")}
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveSkullKing()">Save Round &amp; Continue</button>
    `;
  },

  whoaCowboyForm(game) {
    return `
      <h3 style="margin-bottom:10px;">Enter this round</h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact inline-fields" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(escapeHtml(u.name), Density.get() !== "compact")}
            <div class="toggle-row">
              <span class="toggle-label-full">Just type the total instead</span>
              <div class="switch" onclick="Play.toggleManualSwitch(this)"><div class="knob"></div></div>
            </div>
            <div class="structured-fields">
              <div class="field-row"><label>${this.fieldLabelText("Tokens (total points)", "Tokens")}</label><input type="number" class="wtc-tokens input-compact digits-3" placeholder="0" /></div>
              <div class="field-row"><label>${this.fieldLabelText("Cards left in hand", "Left")}</label><input type="number" class="wtc-left input-compact" min="0" placeholder="0" /></div>
            </div>
            <div class="manual-fields hidden">
              <input class="num-input wtc-manual" type="number" placeholder="0" />
            </div>
          </div>
        `).join("")}
      </div>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveWhoaCowboy()">Save Round &amp; Continue</button>
    `;
  },

  countdown321Form(game) {
    const roundNum = game.hands.length + 1;
    return `
      <h3 style="margin-bottom:10px;">Round ${roundNum}</h3>
      <div class="entry-grid ${Density.get() === "compact" ? "is-compact inline-fields" : ""}">
        ${game.units.map(u => `
          <div class="entry-unit-block" data-unit="${u.id}">
            ${this.unitLabelHtml(escapeHtml(u.name), Density.get() !== "compact")}
            <div class="c321-fields">
              <label class="check-inline">
                <input type="checkbox" id="c321-declare-countdown-${u.id}" class="c321-declare-cb" data-unit="${u.id}" data-type="countdown" onchange="Play.setCountdown321Declaration(this)" />
                <span>Countdown!</span>
              </label>
              <label class="check-inline">
                <input type="checkbox" id="c321-declare-blastoff-${u.id}" class="c321-declare-cb" data-unit="${u.id}" data-type="blastoff" onchange="Play.setCountdown321Declaration(this)" />
                <span>Blastoff!</span>
              </label>
              <div class="field-row c321-total-row">
                <label>Total</label>
                <input type="number" id="c321-total-${u.id}" class="input-compact digits-3 c321-total" min="0" placeholder="0" />
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      <p class="hint-text" style="margin-top:8px;">Check who declared Countdown or Blastoff — checking one disables it for everyone else, since only one player can declare per round. The Blastoff player's total locks to 0 automatically.</p>
      <button class="btn-primary" style="margin-top:12px;" onclick="Play.saveCountdown321()">Save Round &amp; Continue</button>
    `;
  },

  winLossForm(game) {
    const picked = App.state.entryDraft.winnerId;
    return `
      <h3 style="margin-bottom:10px;">Who won this game?</h3>
      ${game.units.map(u => `
        <div class="winloss-pick ${picked === u.id ? "sel" : ""}" onclick="Play.pickWinner('${u.id}')">
          <div class="avatar">${initials(u.name)}</div>
          <div class="player-name">${escapeHtml(u.name)}</div>
        </div>
      `).join("")}
      <button class="btn-primary" style="margin-top:12px;" ${picked ? "" : "disabled"} onclick="Play.saveWinLoss()">Log Winner</button>
    `;
  },

  pickWinner(unitId) {
    App.state.entryDraft.winnerId = unitId;
    App.render();
  },

  // Shared by every per-player entry form. Only collapsible=true forms get
  // the chevron: Hand & Foot and Phase 10 always (they never inline,
  // regardless of density), and the inline-eligible games (Simple, Skull
  // King, Whoa Cowboy, Countdown321) only in Comfortable — their Compact
  // view is already a single row with nothing left to collapse.
  unitLabelHtml(nameHtml, collapsible) {
    if (!collapsible) return `<div class="unit-label">${nameHtml}</div>`;
    return `
      <div class="unit-label-row">
        <div class="unit-label">${nameHtml}</div>
        <button type="button" class="collapse-toggle" onclick="Play.toggleCollapse(this)" aria-label="Collapse player">&#9662;</button>
      </div>
    `;
  },

  // Collapsing just hides everything but the name/chevron row — pure CSS,
  // no re-render, so nothing typed into other players' fields is lost.
  toggleCollapse(el) {
    el.closest(".entry-unit-block").classList.toggle("collapsed");
  },

  // Short field labels for the inline-eligible games' compact rows — a
  // mini-label like "Won" reads fine sitting right above a tiny input, but
  // "Tricks won" or "Bonus points" at that size either wraps or blows the
  // row width out. Comfortable always gets the full, spelled-out label.
  fieldLabelText(full, short) {
    return Density.get() === "compact" ? short : full;
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

  // Checking a Countdown/Blastoff checkbox for one player disables every
  // other declaration checkbox (any player, any type) — only one person can
  // declare per round. It also disables the *other* checkbox on the same
  // player (can't declare both). Checking Blastoff locks that player's
  // total to 0, since their whole hand was discarded. Unchecking re-enables
  // everything. Deliberately DOM-only, no re-render — so totals already
  // typed for other players survive someone changing their mind.
  setCountdown321Declaration(checkbox) {
    const unitId = checkbox.dataset.unit;
    const type = checkbox.dataset.type;
    const totalInput = document.getElementById(`c321-total-${unitId}`);

    if (checkbox.checked) {
      document.querySelectorAll(".c321-declare-cb").forEach(cb => {
        if (cb === checkbox) return;
        cb.checked = false;
        cb.disabled = true;
      });
      if (type === "blastoff") {
        totalInput.value = "0";
        totalInput.disabled = true;
      }
    } else {
      document.querySelectorAll(".c321-declare-cb").forEach(cb => { cb.disabled = false; });
      if (type === "blastoff") totalInput.disabled = false;
    }
  },

  clearCountdown321FieldErrors(game) {
    game.units.forEach(u => {
      this.clearFieldError(`c321-total-${u.id}`);
      this.clearFieldError(`c321-declare-countdown-${u.id}`);
    });
  },

  saveCountdown321() {
    const game = App.state.game;
    this.clearCountdown321FieldErrors(game);

    const declaredCb = document.querySelector(".c321-declare-cb:checked");
    if (!declaredCb) {
      this.flagFieldError(`c321-declare-countdown-${game.units[0].id}`, "*Check who declared Countdown or Blastoff");
      return;
    }
    const declarationType = declaredCb.dataset.type;
    const declaredById = declaredCb.dataset.unit;

    const rawEntries = {};
    for (const u of game.units) {
      const raw = document.getElementById(`c321-total-${u.id}`).value;
      if (raw === "") { this.flagFieldError(`c321-total-${u.id}`, "*missing value"); return; }
      const handTotal = Number(raw);
      if (handTotal < 0) { this.flagFieldError(`c321-total-${u.id}`, "*Hand total can't be negative"); return; }
      rawEntries[u.id] = { handTotal };
    }

    if (declarationType === "countdown" && rawEntries[declaredById].handTotal > 5) {
      this.flagFieldError(`c321-total-${declaredById}`, "*'Countdown!' requires a hand total of 5 or less");
      return;
    }

    const scores = Engine.countdown321(rawEntries, { declarationType, declaredById });
    const entries = {};
    game.units.forEach(u => {
      entries[u.id] = { handTotal: rawEntries[u.id].handTotal, score: scores[u.id] };
    });
    this.commitHand(entries, { declarationType, declaredById });
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
            cleanBooks: Math.max(0, Number(block.querySelector(".hf-clean").value) || 0),
            dirtyBooks: Math.max(0, Number(block.querySelector(".hf-dirty").value) || 0),
            meldTotal: Math.max(0, Number(block.querySelector(".hf-meld").value) || 0),
            bonus: Number(block.querySelector(".hf-bonus").value) || 0, // open-ended on purpose — can be negative (a penalty)
            stuckTotal: Math.max(0, Number(block.querySelector(".hf-stuck").value) || 0)
          };
      entry.score = Engine.handfoot(entry, rules);
      entries[u.id] = entry;
    });
    this.commitHand(entries);
  },

  showToast(message) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    container.innerHTML = ""; // rapid repeats replace, never stack
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 1700);
  },

  _validationFailStreak: 0,
  toastForValidationFail() {
    this._validationFailStreak++;
    if (this._validationFailStreak === 1) return "Hey, you missed something!";
    if (this._validationFailStreak === 2) return "Really...? Check the red one.";
    return "C'mon now 👀";
  },
  resetValidationStreak() {
    this._validationFailStreak = 0;
  },

  flagFieldError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    this.clearFieldError(id);
    el.classList.add("input-error");
    const msg = document.createElement("div");
    msg.className = "field-error-msg";
    msg.dataset.forField = id;
    msg.textContent = message || "*missing value";
    const row = el.closest(".field-row") || el;
    row.insertAdjacentElement("afterend", msg);
    const clearOnce = () => this.clearFieldError(id);
    el.addEventListener("input", clearOnce, { once: true });
    el.addEventListener("change", clearOnce, { once: true });
    el.focus();
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    this.showToast(this.toastForValidationFail());
  },

  clearFieldError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("input-error");
    const msg = document.querySelector(`.field-error-msg[data-for-field="${id}"]`);
    if (msg) msg.remove();
  },

  clearRookFieldErrors() {
    ["rookBidder", "rookBid", "rookTrump", "rookCapturedBid"].forEach(id => this.clearFieldError(id));
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
      this.clearRookFieldErrors();
      const bidderPlayerId = document.getElementById("rookBidder").value;
      const trump = document.getElementById("rookTrump").value;
      const bidRaw = document.getElementById("rookBid").value;
      const capturedRaw = document.getElementById("rookCapturedBid").value;

      if (bidderPlayerId === "") { this.flagFieldError("rookBidder", "*Select who won the bid"); return; }
      if (bidRaw === "") { this.flagFieldError("rookBid", "*missing value"); return; }
      if (trump === "") { this.flagFieldError("rookTrump", "*Select a trump color"); return; }
      if (capturedRaw === "") { this.flagFieldError("rookCapturedBid", "*missing value"); return; }

      let bid = Number(bidRaw) || 0;
      if (bid > 100) { this.flagFieldError("rookBid", "*Can't bid more than 100"); return; }
      if (bid < 1) { this.flagFieldError("rookBid", "*Enter a valid bid"); return; }

      const rawCaptured = Number(capturedRaw) || 0;
      const capturedByBidder = Math.max(0, Math.min(100, rawCaptured));

      const bidderUnit = game.units.find(u => u.memberIds.includes(bidderPlayerId)) || game.units[0];
      const biddingTeamId = bidderUnit.id;
      const bidderIndex = bidderUnit.memberIds.indexOf(bidderPlayerId);
      const bidderName = bidderIndex >= 0 && bidderUnit.memberNames ? bidderUnit.memberNames[bidderIndex] : "Bidder";

      const handMeta = { biddingTeamId, bid, trump, biddingPlayerName: bidderName };
      game.units.forEach(u => {
        const captured = u.id === biddingTeamId ? capturedByBidder : (100 - capturedByBidder);
        const entry = { manual: false, captured };
        entry.score = Engine.rook(entry, handMeta, u.id);
        entries[u.id] = entry;
      });

      game.lastRookInfo = {
        biddingPlayerName: bidderName,
        biddingTeamName: bidderUnit.name,
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
        entry = { manual: true, manualTotal: Math.max(0, Number(block.querySelector(".p10-manual").value) || 0), completedPhase };
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

  saveSkullKing() {
    const game = App.state.game;
    const roundNum = game.hands.length + 1;
    const entries = {};
    for (const u of game.units) {
      const block = document.querySelector(`.entry-unit-block[data-unit="${u.id}"]`);
      const manual = !block.querySelector(".manual-fields").classList.contains("hidden");
      if (manual) {
        const manualRaw = document.getElementById(`sk-manual-${u.id}`).value;
        if (manualRaw === "") { this.flagFieldError(`sk-manual-${u.id}`, "*missing value"); return; }
        const manualTotal = Number(manualRaw) || 0;
        entries[u.id] = { manual: true, manualTotal, score: manualTotal };
      } else {
        const bidRaw = document.getElementById(`sk-bid-${u.id}`).value;
        const tricksRaw = document.getElementById(`sk-tricks-${u.id}`).value;
        if (bidRaw === "") { this.flagFieldError(`sk-bid-${u.id}`, "*missing value"); return; }
        if (tricksRaw === "") { this.flagFieldError(`sk-tricks-${u.id}`, "*missing value"); return; }
        const bid = Number(bidRaw);
        const tricks = Number(tricksRaw);
        if (bid < 0) { this.flagFieldError(`sk-bid-${u.id}`, "*Bid can't be negative"); return; }
        if (bid > roundNum) { this.flagFieldError(`sk-bid-${u.id}`, `*Max bid this round is ${roundNum}`); return; }
        if (tricks < 0) { this.flagFieldError(`sk-tricks-${u.id}`, "*Tricks can't be negative"); return; }
        if (tricks > roundNum) { this.flagFieldError(`sk-tricks-${u.id}`, `*Only ${roundNum} tricks this round`); return; }
        const bonusRaw = document.getElementById(`sk-bonus-${u.id}`).value;
        const bonus = Number(bonusRaw) || 0;
        if (bonus < 0) { this.flagFieldError(`sk-bonus-${u.id}`, "*Bonus can't be negative — it's only ever an addition for special captures"); return; }
        const entry = { manual: false, bid, tricks, bonus };
        entry.score = Engine.skullking(entry, game.rulesSnapshot, roundNum);
        entries[u.id] = entry;
      }
    }
    this.commitHand(entries);
  },

  saveWhoaCowboy() {
    const game = App.state.game;
    const entries = {};
    game.units.forEach(u => {
      const block = document.querySelector(`.entry-unit-block[data-unit="${u.id}"]`);
      const manual = !block.querySelector(".manual-fields").classList.contains("hidden");
      const entry = manual
        ? { manual: true, manualTotal: Number(block.querySelector(".wtc-manual").value) || 0 }
        : {
            manual: false,
            tokens: Number(block.querySelector(".wtc-tokens").value) || 0, // no fixed ruleset for this one, left flexible
            cardsLeft: Math.max(0, Number(block.querySelector(".wtc-left").value) || 0)
          };
      entry.score = Engine.whoacowboy(entry);
      entries[u.id] = entry;
    });
    this.commitHand(entries);
  },

  saveWinLoss() {
    const game = App.state.game;
    const winnerId = App.state.entryDraft.winnerId;
    if (!winnerId) return; // shouldn't happen — the button is disabled until someone's picked — but don't log a hand with no winner
    game.hands.push({ handNum: game.hands.length + 1, winnerId });
    App.state.entryDraft = {};
    Storage.saveActiveGame(game);
    // Win/loss games (Sequence, Backwards 8, custom Win/Loss) are a single
    // complete game with one outcome — logging the winner always finishes
    // it immediately. Fixed Hands / Target / manual don't really apply to
    // a "who won" tracker, so this bypasses that whole system on purpose.
    this.finishGame(game);
  },

  commitHand(entries, handMeta) {
    this.resetValidationStreak();
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
    const totalsTable = `
      <div class="ledger">
        <table>
          <tr><th>Player/Team</th><th>Total</th></tr>
          ${standings.map((s, i) => `
            <tr class="${i === 0 ? "totalrow" : ""}">
              <td>${escapeHtml(s.name)}${i === 0 ? ' <span class="lead-badge">LEADING</span>' : ""}</td>
              <td>${s.value}</td>
            </tr>`).join("")}
        </table>
      </div>`;
    if (game.hands.length === 0) return totalsTable;
    const handHistory = `
      <div class="hand-history">
        ${game.hands.slice().reverse().map(h => `
          <div class="hand-row">
            <div class="hand-row-top">
              <div class="hand-row-title">Hand ${h.handNum}</div>
              <button class="icon-btn danger" onclick="Play.deleteHand(${h.handNum})" title="Remove this hand">&times;</button>
            </div>
            <div class="hand-row-scores">
              ${game.units.map(u => `<span class="hand-score-chip">${escapeHtml(u.name.split(" (")[0])}: ${h.entries[u.id] ? h.entries[u.id].score : 0}</span>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>`;
    return totalsTable + handHistory;
  },

  // Undoes whichever hand just finished the game — reverses the player-stat
  // bump and history entry finishGame() applied, then hands you back to the
  // Play screen with that hand removed, ready to re-enter it. Needed because
  // "Undo Last Hand" only exists on the Play screen, so a game that
  // auto-finishes (hit its target/hand-count, or a win/loss game logging its
  // one deciding hand) otherwise leaves no way to fix a mis-entered final hand.
  undoLastFromResults() {
    const finished = App.state.lastFinishedGame;
    if (!finished || !finished.hands || finished.hands.length === 0) return;
    UI.confirm("Undo the last hand? It'll be removed from this game (and out of History), and you'll go back to entering hands.", () => {
      const players = Storage.getPlayers();
      const playerMap = {};
      players.forEach(p => (playerMap[p.id] = p));
      const allMemberIds = new Set();
      finished.units.forEach(u => u.memberIds.forEach(id => allMemberIds.add(id)));
      const winningUnit = finished.units.find(u => u.id === finished.winnerId);
      const winningMemberIds = new Set(winningUnit ? winningUnit.memberIds : []);
      allMemberIds.forEach(id => {
        if (playerMap[id]) {
          playerMap[id].gamesPlayed = Math.max(0, (playerMap[id].gamesPlayed || 0) - 1);
          if (winningMemberIds.has(id)) playerMap[id].wins = Math.max(0, (playerMap[id].wins || 0) - 1);
        }
      });
      Storage.savePlayers(players);

      Storage.deleteHistoryEntry(finished.id);

      const game = {
        id: finished.id,
        gameKey: finished.gameKey,
        customName: finished.customName,
        units: finished.units,
        participantIds: finished.participantIds,
        mode: finished.mode,
        winMode: finished.winMode,
        rulesSnapshot: finished.rulesSnapshot,
        endCondition: finished.endCondition,
        hands: finished.hands.slice(0, -1),
        status: "active",
        createdAt: finished.createdAt
      };
      if (game.gameKey === "rook") this.recomputeLastRookInfo(game);

      Storage.saveActiveGame(game);
      App.state.game = game;
      App.state.lastFinishedGame = null;
      App.state.entryDraft = {};
      App.go("play");
    }, { title: "Undo the last hand?", confirmLabel: "Undo & Keep Playing" });
  },

  rematch() {
    const finished = App.state.lastFinishedGame;
    if (!finished) return;
    const newGame = {
      id: Storage.uid(),
      gameKey: finished.gameKey,
      customName: finished.customName,
      units: finished.units,
      participantIds: finished.units.map(u => u.id),
      mode: finished.mode,
      winMode: finished.winMode,
      rulesSnapshot: finished.rulesSnapshot,
      endCondition: finished.endCondition,
      hands: [],
      status: "active",
      createdAt: Date.now()
    };
    Storage.saveActiveGame(newGame);
    App.state.game = newGame;
    App.state.lastFinishedGame = null;
    App.state.entryDraft = {};
    App.go("play");
  },

  recomputeLastRookInfo(game) {
    const prevHand = game.hands[game.hands.length - 1];
    if (prevHand && prevHand.handMeta && prevHand.handMeta.biddingTeamId) {
      const meta = prevHand.handMeta;
      const bidderUnit = game.units.find(u => u.id === meta.biddingTeamId);
      const bidderEntry = prevHand.entries[meta.biddingTeamId];
      game.lastRookInfo = {
        biddingPlayerName: meta.biddingPlayerName || "Bidder",
        biddingTeamName: bidderUnit ? bidderUnit.name : "—",
        bid: meta.bid,
        trump: meta.trump,
        made: bidderEntry ? bidderEntry.score >= 0 : true
      };
    } else {
      game.lastRookInfo = null; // previous hand was manual, or no hands left — nothing to show
    }
  },

  undoLastHand() {
    const game = App.state.game;
    if (!game || game.hands.length === 0) return;
    UI.confirm("Remove the last hand? You'll need to re-enter it.", () => {
      game.hands.pop();
      if (game.gameKey === "rook") this.recomputeLastRookInfo(game);
      Storage.saveActiveGame(game);
      App.render();
    }, { title: "Remove this hand?", confirmLabel: "Remove Hand" });
  },

  // Removes any hand (not just the most recent) — for fixing a typo a few
  // hands back without losing everything played since. Renumbers what's
  // left so the display stays contiguous (Hand 1, 2, 3...).
  deleteHand(handNum) {
    const game = App.state.game;
    if (!game) return;
    UI.confirm(`Remove Hand ${handNum}? You'll need to re-enter it if that wasn't the intent.`, () => {
      const idx = game.hands.findIndex(h => h.handNum === handNum);
      if (idx === -1) return;
      game.hands.splice(idx, 1);
      game.hands.forEach((h, i) => { h.handNum = i + 1; });
      if (game.gameKey === "rook") this.recomputeLastRookInfo(game);
      Storage.saveActiveGame(game);
      App.render();
    }, { title: "Remove this hand?", confirmLabel: "Remove Hand" });
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
    Density.recordGameCompleted();

    App.state.game = null;
    App.state.lastFinishedGame = { ...game, standings };
    App.state.entryDraft = {};
    App.go("results");
    Density.maybeShowIntroModal();
  },

  deleteHistoryEntry(id) {
    UI.confirm("Delete this game from history? This can't be undone.", () => {
      Storage.deleteHistoryEntry(id);
      App.go("history");
    }, { title: "Delete this entry?", confirmLabel: "Delete" });
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
    UI.confirm(`This changes scoring for all future ${this.buffer.label} games. Games already in progress keep their original rules. Continue?`, () => {
      const rules = Storage.getRules();
      rules[App.state.rulesViewKey] = this.buffer;
      Storage.saveRules(rules);
      this.buffer = null;
      App.go("rules");
    }, { title: "Save house rules?", confirmLabel: "Save Changes" });
  }
};
