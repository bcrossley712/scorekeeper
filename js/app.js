// ============================================================
// APP — state, routing, and screen rendering.
// Plain vanilla JS, no build step, re-renders the #app root
// on every state change. Small enough at this scale that a
// framework would add more overhead than it saves.
// ============================================================

var App = {
  state: {
    screen: "home",
    game: null,          // active game object, mirrors Storage.getActiveGame()
    setup: null,         // in-progress setup form data
    entryDraft: {},       // in-progress score entry form data
    rulesViewKey: null,
    rulesEditMode: false,
    historyDetailId: null
  },

  init() {
    this.state.game = Storage.getActiveGame();
    const settings = Storage.getSettings();
    this.showFirstRunBanner = !settings.helpSeen;
    if (window.history && window.history.replaceState) {
      history.replaceState(this._historySnapshot(), "");
    }
    window.addEventListener("popstate", (e) => this._onPopState(e));
    this.render();
  },

  // Every screen change gets its own history entry, so the device/browser
  // back button steps backward through in-app screens instead of the app
  // just closing outright (which is what happens with an empty history
  // stack in a standalone-mode PWA).
  _historySnapshot() {
    return {
      screen: this.state.screen,
      rulesViewKey: this.state.rulesViewKey,
      historyDetailId: this.state.historyDetailId
    };
  },

  _onPopState(e) {
    // A lingering modal shouldn't survive a back navigation underneath it.
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
    const s = e.state || { screen: "home", rulesViewKey: null, historyDetailId: null };
    this.state.screen = s.screen || "home";
    this.state.rulesViewKey = s.rulesViewKey;
    this.state.historyDetailId = s.historyDetailId;
    window.scrollTo(0, 0);
    this.render();
  },

  go(screen, extra) {
    this.state.screen = screen;
    if (extra) Object.assign(this.state, extra);
    window.scrollTo(0, 0);
    if (window.history && window.history.pushState) {
      history.pushState(this._historySnapshot(), "");
    }
    this.render();
  },

  render() {
    const root = document.getElementById("app");
    let html = "";
    switch (this.state.screen) {
      case "home": html = Screens.home(); break;
      case "picker": html = Screens.picker(); break;
      case "setup": html = Screens.setup(); break;
      case "play": html = Screens.play(); break;
      case "results": html = Screens.results(); break;
      case "history": html = Screens.history(); break;
      case "historyDetail": html = Screens.historyDetail(); break;
      case "rules": html = Screens.rules(); break;
      case "reorderGames": html = Screens.reorderGames(); break;
      case "rulesEdit": html = Screens.rulesEdit(); break;
      case "help": html = Screens.help(); break;
      case "players": html = Screens.players(); break;
      default: html = Screens.home();
    }
    root.innerHTML = html;
  },

  dismissFirstRun() {
    this.showFirstRunBanner = false;
    const s = Storage.getSettings();
    s.helpSeen = true;
    Storage.saveSettings(s);
    this.render();
  }
};

// ============================================================
// SCREENS
// ============================================================

var Screens = {

  // ---------- HOME ----------
  home() {
    const players = Players.leaderboardOrder(Storage.getPlayers());
    const game = App.state.game;
    return `
      <div class="topbar">
        <div class="brand"><span class="pip">&#9824;</span> Family Scorekeeper</div>
        <button class="icon-btn" onclick="App.go('help')" title="Help">?</button>
      </div>

      ${App.showFirstRunBanner ? `
        <div class="firstrun-banner">
          <span>New here? Tap Help for a 60-second walkthrough.</span>
          <button onclick="App.dismissFirstRun()">&times;</button>
        </div>` : ``}

      ${game ? `
        <div class="card resume-card" onclick="App.go('play')">
          <div class="stitch"></div>
          <div class="resume-label">Game in progress</div>
          <h3>${DEFAULT_RULES[game.gameKey].label} &middot; Hand ${game.hands.length + 1}</h3>
          <div class="resume-sub">Tap to jump back in</div>
        </div>` : ``}

      <div class="card">
        <div class="stitch"></div>
        <h3 style="margin-bottom:12px;">Players</h3>
        ${players.length === 0 ? `
          <p class="empty-hint">No players yet — add everyone who plays so you can pick them quickly each game night.</p>
        ` : players.map(p => `
          <div class="player-row">
            <div class="left-cluster">
              ${avatarHtml(p.name, p.color)}
              <div>
                <div class="player-name">${escapeHtml(p.name)}</div>
                <div class="player-meta">${p.wins || 0} win${p.wins === 1 ? "" : "s"} &middot; ${p.gamesPlayed || 0} game${p.gamesPlayed === 1 ? "" : "s"} played</div>
              </div>
            </div>
          </div>
        `).join("")}
        <button class="fab-add" onclick="App.go('players')">Manage players</button>
      </div>

      <div class="section-label">Get playing</div>
      <button class="btn-primary" ${game ? "disabled" : ""} onclick="Setup.begin()">
        <svg width="24" height="19" viewBox="0 0 140 110" style="vertical-align:middle;margin-right:8px;" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="25" width="50" height="70" rx="8" fill="#F6F1E4" stroke="#2A2622" stroke-width="3" transform="rotate(-18 45 60)"/>
          <rect x="70" y="25" width="50" height="70" rx="8" fill="#F6F1E4" stroke="#2A2622" stroke-width="3" transform="rotate(18 95 60)"/>
          <rect x="45" y="20" width="50" height="70" rx="8" fill="#F6F1E4" stroke="#2A2622" stroke-width="3"/>
        </svg>
        ${game ? "Finish current game first" : "Deal a New Game"}
      </button>

      <div class="link-row">
        <button class="rules-link" onclick="App.go('history')">Game history</button>
        <button class="rules-link" onclick="App.go('rules')">House rules</button>
      </div>
    `;
  },

  // ---------- PLAYER MANAGEMENT ----------
  players() {
    const players = Storage.getPlayers();
    const openColorId = Players.openColorId;
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">Players</div>
        <span></span>
      </div>
      <div class="card">
        <div class="stitch"></div>
        ${players.length === 0 ? `<p class="empty-hint">No players yet.</p>` : players.map(p => `
          <div class="player-row" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div class="left-cluster" onclick="Players.toggleColorPicker('${p.id}')" style="cursor:pointer;">
                ${avatarHtml(p.name, p.color)}
                <div class="player-name">${escapeHtml(p.name)}</div>
              </div>
              <div class="row-actions">
                <button class="tiny-link" onclick="Players.resetStats('${p.id}')">Reset stats</button>
                <button class="icon-btn danger" onclick="Players.remove('${p.id}')">&times;</button>
              </div>
            </div>
            ${openColorId === p.id ? `
              <div class="color-swatch-row">
                ${PLAYER_COLORS.map(c => `<div class="color-swatch ${p.color === c ? "selected" : ""}" style="background:${c};" onclick="Players.setColor('${p.id}','${c}')"></div>`).join("")}
              </div>` : ``}
          </div>
        `).join("")}
      </div>
      <div class="card">
        <div class="stitch"></div>
        <h3 style="margin-bottom:10px;">Add a player</h3>
        <input id="newPlayerName" class="text-input" type="text" placeholder="Name" onkeydown="if(event.key==='Enter'){event.preventDefault();Players.add();}" />
        <button class="btn-primary" style="margin-top:10px;" onclick="Players.add()">Add player</button>
      </div>
    `;
  },

  // ---------- GAME PICKER ----------
  picker() {
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">Choose a Game</div>
        <button class="rules-link" onclick="App.go('reorderGames')">Reorder</button>
      </div>
      <div class="game-grid">
        ${GameOrder.getEffectiveOrder().map(key => {
          const r = DEFAULT_RULES[key];
          const fallback = `<div class="suit-fallback ${suitClass(GAME_SUITS[key])}">${GAME_SUITS[key]}</div>`;
          return `
          <div class="game-tile" onclick="Setup.pick('${key}')">
            <div class="tile-photo">${fallback}</div>
            <div>
              <div class="gname">${r.label}</div>
              <div class="gsub">${teamModeLabel(r.teamMode)}</div>
            </div>
          </div>`;
        }).join("")}
        <div class="game-tile custom" onclick="Setup.pick('custom')">
          <div class="tile-photo"><div class="suit-fallback" style="color:#8a6423;">+</div></div>
          <div>
            <div class="gname">Custom Game</div>
            <div class="gsub">Build your own</div>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button class="rules-link" onclick="App.go('rules')">View rule sheets for any game &rarr;</button>
      </div>
    `;
  },

  // ---------- SETUP ----------
  setup() {
    const s = App.state.setup;
    if (!s) return Screens.picker();
    const rules = Storage.getRules();
    const gameRules = s.gameKey === "custom" ? null : rules[s.gameKey];
    const label = s.gameKey === "custom" ? "Custom Game" : gameRules.label;
    const players = Storage.getPlayers();
    const teamModeVal = s.gameKey === "custom" ? s.customTeamMode : gameRules.teamMode;
    const showTeamToggle = teamModeVal === "choice";
    const forced = teamModeVal === "forced";
    const showTeams = s.useTeams;

    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('picker')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">${label}</div>
        ${s.gameKey !== "custom" ? `<button class="rules-link" onclick="App.state.rulesViewKey='${s.gameKey}';App.go('rules')">Rules</button>` : `<span></span>`}
      </div>

      ${s.gameKey === "custom" ? `
      <div class="card">
        <div class="stitch"></div>
        <h3>Game name & rules</h3>
        <input id="customName" class="text-input" type="text" placeholder="e.g. Uno" value="${s.customName || ""}" style="margin-top:8px;" oninput="Setup.updateCustomName(this.value)"/>
        <p class="hint-text" style="margin-top:12px;margin-bottom:6px;">How is this scored?</p>
        <div class="segmented">
          <button class="${s.customScoreMode === "points" ? "on" : ""}" onclick="Setup.setCustomScoreMode('points')">Point totals</button>
          <button class="${s.customScoreMode === "winloss" ? "on" : ""}" onclick="Setup.setCustomScoreMode('winloss')">Win/Loss only</button>
        </div>
        ${s.customScoreMode === "winloss" ? `
        <p class="hint-text" style="margin-top:8px;">Just tap who won and you're done — logging the winner finishes the game immediately, like Sequence or Backwards 8.</p>
        ` : `
        <div class="toggle-row" style="margin-top:12px;">
          <span>Lower score wins</span>
          <div class="switch ${s.customWinLow ? "on" : ""}" onclick="Setup.toggleCustomWinLow()"><div class="knob"></div></div>
        </div>
        `}
        <div class="toggle-row">
          <span>Play as teams</span>
          <div class="switch ${s.useTeams ? "on" : ""}" onclick="Setup.toggleTeams()"><div class="knob"></div></div>
        </div>
      </div>` : ``}

      <div class="card">
        <div class="stitch"></div>
        <h3>Who's playing?</h3>
        <div style="margin:12px 0;">
          ${players.map(p => `
            <span class="chip ${s.selectedPlayerIds.includes(p.id) ? "" : "chip-off"}" onclick="Setup.togglePlayer('${p.id}')" ${s.selectedPlayerIds.includes(p.id) && p.color ? `style="background:${p.color};"` : ""}>
              ${avatarHtml(p.name, s.selectedPlayerIds.includes(p.id) ? p.color : null)}${escapeHtml(p.name)}
            </span>`).join("")}
          <button class="chip-outline" onclick="Setup.addGuest()">+ Add guest</button>
        </div>
      </div>

      ${(showTeamToggle && s.gameKey !== "custom") ? `
      <div class="card">
        <div class="stitch"></div>
        <div class="toggle-row">
          <span>Play as teams this time</span>
          <div class="switch ${s.useTeams ? "on" : ""}" onclick="Setup.toggleTeams()"><div class="knob"></div></div>
        </div>
      </div>` : ``}

      ${(forced || (showTeams && s.selectedPlayerIds.length >= 2)) ? `
      <div class="card">
        <div class="stitch"></div>
        <h3>${forced ? "Set Partnerships" : "Assign Teams"}</h3>
        <p class="hint-text">Tap a number to place a player on a team. Tap again to remove or switch. Teams are just for tonight.</p>
        <div style="margin-top:8px;">
          ${s.selectedPlayerIds.map(pid => {
            const p = players.find(pp => pp.id === pid) || Setup.guestById(pid);
            const teamNums = s.teamAssignments[pid] || null;
            return `
            <div class="assign-row">
              <div class="left-cluster">
                ${avatarHtml(p.name, p.color)}
                <div class="player-name" style="font-size:14.5px;">${escapeHtml(p.name)}</div>
              </div>
              <div class="team-btns">
                <button class="team-btn t1 ${teamNums === 1 ? "on" : ""}" onclick="Setup.assignTeam('${pid}',1)">1</button>
                <button class="team-btn t2 ${teamNums === 2 ? "on" : ""}" onclick="Setup.assignTeam('${pid}',2)">2</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>` : ``}

      ${s.gameKey !== "custom" && gameRules.endCondition.type !== "manual" && gameRules.endCondition.type !== "phase" ? `
      <div class="card">
        <div class="stitch"></div>
        <h3>How should this game end?</h3>
        ${gameRules.endCondition.allowChoice ? `
          <div class="segmented" style="margin-bottom:10px;">
            ${gameRules.winMode === "high" ? `<button class="${s.endType === "target" ? "on" : ""}" onclick="Setup.setEndType('target')">Target score</button>` : ``}
            <button class="${s.endType === "hands" ? "on" : ""}" onclick="Setup.setEndType('hands')">Fixed hands</button>
            <button class="${s.endType === "manual" ? "on" : ""}" onclick="Setup.setEndType('manual')">End on cue</button>
          </div>
        ` : ``}
        ${s.endType === "manual" ? `
          <p class="hint-text">No target score or hand limit — just tap "End Game Now" whenever you're ready to stop.</p>
        ` : `
          <p class="hint-text" style="margin-bottom:8px;">${s.endType === "target" ? "First to reach this score wins." : "Play exactly this many hands, then the best total wins."}</p>
          <input class="num-input" type="number" value="${s.endValue}" oninput="Setup.updateEndValue(this.value)" />
        `}
      </div>` : ``}

      ${s.gameKey === "custom" && s.customScoreMode !== "winloss" ? `
      <div class="card">
        <div class="stitch"></div>
        <h3>How should this game end?</h3>
        <div class="segmented">
          <button class="${s.customEndType === "target" ? "on" : ""}" onclick="Setup.setCustomEndType('target')">Target score</button>
          <button class="${s.customEndType === "hands" ? "on" : ""}" onclick="Setup.setCustomEndType('hands')">Fixed hands</button>
          <button class="${s.customEndType === "manual" ? "on" : ""}" onclick="Setup.setCustomEndType('manual')">End on cue</button>
        </div>
        ${s.customEndType !== "manual" ? `<input class="num-input" style="margin-top:10px;" type="number" value="${s.endValue}" oninput="Setup.updateEndValue(this.value)" />` : ``}
      </div>` : ``}

      <button class="btn-primary" style="margin-top:16px;" onclick="Setup.start()">Start Game &rarr;</button>
      ${Setup.validationMessage() ? `<p class="validation-msg">${Setup.validationMessage()}</p>` : ``}
    `;
  },

  // ---------- PLAY / SCORE ENTRY ----------
  play() {
    const game = App.state.game;
    if (!game) return Screens.home();
    const rules = game.rulesSnapshot;
    const entryType = rules.entryType || "simple";
    const isWinLoss = game.winMode === "winloss";

    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Home</button>
        <div class="brand" style="font-size:18px;">${rules.label} &middot; Hand ${game.hands.length + 1}</div>
        <button class="rules-link" onclick="App.state.rulesViewKey='${game.gameKey}';App.go('rules')">Rules</button>
      </div>

      <div class="card">
        <div class="stitch"></div>
        ${!isWinLoss ? Density.toggleHtml() : ``}
        ${isWinLoss ? Play.winLossForm(game) : Play.scoreForm(game, entryType)}
      </div>

      ${game.gameKey === "rook" && game.lastRookInfo ? `
        <div class="card rook-info-card">
          <div class="stitch"></div>
          <div class="rook-info-label">Last hand's bid</div>
          <div class="rook-info-main">${escapeHtml(game.lastRookInfo.biddingPlayerName)} (${escapeHtml(game.lastRookInfo.biddingTeamName.split(" (")[0])}) bid ${game.lastRookInfo.bid}, called ${game.lastRookInfo.trump}</div>
          <div class="rook-info-sub">${game.lastRookInfo.made ? "Made the bid" : "Set — lost the bid"}</div>
        </div>` : ``}

      <div class="section-label">Running Scoreboard</div>
      ${Play.scoreboard(game)}

      <button class="btn-outline-light" style="margin-top:14px;" ${game.hands.length === 0 ? "disabled" : ""} onclick="Play.undoLastHand()">Undo Last Hand</button>
      <button class="btn-secondary danger" style="margin-top:10px;" onclick="Play.confirmEnd()">End Game Now</button>
    `;
  },

  // ---------- RESULTS ----------
  results() {
    const game = App.state.lastFinishedGame;
    if (!game) return Screens.home();
    const winnerId = game.winnerId;
    const winnerUnit = game.units.find(u => u.id === winnerId);
    const standings = Play.standingsList(game);
    return `
      <div class="topbar">
        <div class="brand" style="font-size:18px;">Game Over</div>
        <span></span>
      </div>
      <div class="card winner-card">
        <div class="stitch"></div>
        <div class="trophy">&#127942;</div>
        <h2>${winnerUnit ? escapeHtml(winnerUnit.name) : "No winner"} wins!</h2>
        <div class="resume-sub">${DEFAULT_RULES[game.gameKey] ? DEFAULT_RULES[game.gameKey].label : game.customName}</div>
      </div>
      <div class="ledger">
        <table>
          <tr><th>Player/Team</th><th>${game.winMode === "winloss" ? "Wins" : "Total"}</th></tr>
          ${standings.map(s => `<tr><td>${escapeHtml(s.name)}${s.id === winnerId ? ' <span class="lead-badge">WINNER</span>' : ""}</td><td>${s.value}</td></tr>`).join("")}
        </table>
      </div>
      <button class="btn-primary" style="margin-top:18px;" onclick="Play.rematch()">Play Again (Same Players)</button>
      ${game.hands && game.hands.length > 0 ? `<button class="btn-outline-light" style="margin-top:10px;" onclick="Play.undoLastFromResults()">Undo Last Hand</button>` : ``}
      <button class="btn-outline-light" style="margin-top:10px;" onclick="App.go('home')">Back to Home</button>
    `;
  },

  // ---------- HISTORY ----------
  history() {
    const h = Storage.getHistory();
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">Game History</div>
        <span></span>
      </div>
      ${h.length === 0 ? `<div class="card"><div class="stitch"></div><p class="empty-hint">No games logged yet — they'll show up here once you finish one.</p></div>` : h.map(entry => `
        <div class="card history-item" onclick="App.go('historyDetail', {historyDetailId:'${entry.id}'})">
          <div class="stitch"></div>
          <div class="left-cluster" style="justify-content:space-between;width:100%;">
            <div>
              <div class="player-name">${escapeHtml(entry.label)}</div>
              <div class="player-meta">${formatUSDateTime(entry.finishedAt)} &middot; Winner: ${escapeHtml(entry.winnerName)}</div>
            </div>
          </div>
        </div>
      `).join("")}
    `;
  },

  historyDetail() {
    const h = Storage.getHistory();
    const entry = h.find(e => e.id === App.state.historyDetailId);
    if (!entry) return Screens.history();
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('history')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">${escapeHtml(entry.label)}</div>
        <span></span>
      </div>
      <div class="ledger">
        <table>
          <tr><th>Player/Team</th><th>${entry.winMode === "winloss" ? "Wins" : "Total"}</th></tr>
          ${entry.standings.map(s => `<tr><td>${escapeHtml(s.name)}${s.name === entry.winnerName ? ' <span class="lead-badge">WINNER</span>' : ""}</td><td>${s.value}</td></tr>`).join("")}
        </table>
      </div>
      <p class="hint-text" style="margin-top:12px;">${entry.hands.length} hand${entry.hands.length === 1 ? "" : "s"} played &middot; ${formatUSDateTime(entry.finishedAt)}</p>
      <button class="tiny-link danger" style="display:block;text-align:center;margin-top:16px;" onclick="Play.deleteHistoryEntry('${entry.id}')">Delete this entry</button>
    `;
  },

  // ---------- HOUSE RULES ----------
  rules() {
    const rules = Storage.getRules();
    const activeKey = App.state.rulesViewKey || GameOrder.getEffectiveOrder()[0];
    App.state.rulesViewKey = activeKey; // keep state in sync with what's actually shown
    const r = rules[activeKey];
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">House Rules</div>
        <span></span>
      </div>
      <div class="segmented wrap">
        ${GameOrder.getEffectiveOrder().map(k => `<button class="${k === activeKey ? "on" : ""}" onclick="App.state.rulesViewKey='${k}';App.render()">${DEFAULT_RULES[k].label}</button>`).join("")}
      </div>
      <div class="card" style="margin-top:12px;">
        <div class="stitch"></div>
        <h3>${r.label}</h3>
        <ul class="rules-list">
          ${r.info.map(line => `<li>${line}</li>`).join("")}
        </ul>
        <div class="rules-edit-footer">
          <button class="tiny-link" onclick="RulesEdit.startEdit('${activeKey}');App.go('rulesEdit')">Edit house rules</button>
        </div>
      </div>
    `;
  },

  rulesEdit() {
    const key = App.state.rulesViewKey;
    const r = RulesEdit.buffer;
    if (!r) return Screens.rules();

    let fields = "";
    if (key === "handfoot") {
      fields = `
        <h4>Card Values</h4>
        ${Object.entries(r.cardValues).map(([k, v]) => `
          <div class="edit-row"><span>${cardValueLabel(k)}</span><input type="number" value="${v}" oninput="RulesEdit.setNested('cardValues','${k}',this.value)" /></div>
        `).join("")}
        <h4>Book Bonuses</h4>
        <div class="edit-row"><span>Clean book</span><input type="number" value="${r.bonuses.cleanBook}" oninput="RulesEdit.setNested('bonuses','cleanBook',this.value)" /></div>
        <div class="edit-row"><span>Dirty book</span><input type="number" value="${r.bonuses.dirtyBook}" oninput="RulesEdit.setNested('bonuses','dirtyBook',this.value)" /></div>
        <h4>Default hands per game</h4>
        <input class="num-input" type="number" value="${r.endCondition.value}" oninput="RulesEdit.setEndValue(this.value)" />
      `;
    } else if (key === "rook") {
      fields = `
        <h4>Default target score</h4>
        <input class="num-input" type="number" value="${r.endCondition.value}" oninput="RulesEdit.setEndValue(this.value)" />
      `;
    } else if (key === "skullking") {
      fields = `
        <h4>Scoring</h4>
        <div class="edit-row"><span>Points per trick (bid made)</span><input type="number" value="${r.scoring.perTrickMade}" oninput="RulesEdit.setNested('scoring','perTrickMade',this.value)" /></div>
        <div class="edit-row"><span>Penalty per trick (bid missed)</span><input type="number" value="${r.scoring.perTrickMissedPenalty}" oninput="RulesEdit.setNested('scoring','perTrickMissedPenalty',this.value)" /></div>
        <div class="edit-row"><span>Zero-bid round multiplier</span><input type="number" value="${r.scoring.zeroBidRoundMultiplier}" oninput="RulesEdit.setNested('scoring','zeroBidRoundMultiplier',this.value)" /></div>
        <p class="hint-text">Switching to "Rascal Scoring" from the box? Try 10 / 5 / 10 as a starting point, then adjust to match the half-credit rule as needed.</p>
      `;
    } else {
      fields = `<p class="hint-text">This game doesn't have editable numeric rules yet.</p>`;
    }

    const editable = key === "handfoot" || key === "rook" || key === "skullking";
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('rules')">&larr; Cancel</button>
        <div class="brand" style="font-size:18px;">Edit: ${r.label}</div>
        <span></span>
      </div>
      <div class="card">
        <div class="stitch"></div>
        ${fields}
      </div>
      ${editable ? `
        <button class="btn-primary" style="margin-top:16px;" onclick="RulesEdit.save()">Save House Rules</button>
        <p class="hint-text" style="margin-top:8px;">This changes scoring for all future ${r.label} games — games already in progress keep using the rules they started with.</p>
      ` : ``}
    `;
  },

  // ---------- REORDER GAMES ----------
  reorderGames() {
    const order = GameOrder.getEffectiveOrder();
    const isCustom = !!Storage.getGameOrder();
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('picker')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">Reorder Games</div>
        <span></span>
      </div>
      <div class="card">
        <div class="stitch"></div>
        <p class="hint-text">Arrange the list however your family likes. Sorted alphabetically by default. Custom Game always stays last, no matter what.</p>
        ${order.map((key, i) => `
          <div class="reorder-row">
            <div class="reorder-name">${DEFAULT_RULES[key].label}</div>
            <div class="reorder-btns">
              <button class="reorder-btn" ${i === 0 ? "disabled" : ""} onclick="GameOrder.moveUp('${key}')">&uarr;</button>
              <button class="reorder-btn" ${i === order.length - 1 ? "disabled" : ""} onclick="GameOrder.moveDown('${key}')">&darr;</button>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="btn-outline-light" style="margin-top:14px;" ${isCustom ? "" : "disabled"} onclick="GameOrder.resetToAlphabetical()">Reset to Alphabetical</button>
    `;
  },

  // ---------- HELP ----------
  help() {
    return `
      <div class="topbar">
        <button class="back-btn" onclick="App.go('home')">&larr; Back</button>
        <div class="brand" style="font-size:18px;">How this works</div>
        <span></span>
      </div>
      <div class="card"><div class="stitch"></div><h3>1. Add your players</h3><p class="hint-text">Add everyone who plays regularly under Players on the home screen. You'll pick from this list every game night instead of retyping names.</p></div>
      <div class="card"><div class="stitch"></div><h3>2. Deal a new game</h3><p class="hint-text">Tap "Deal a New Game," choose which card game you're playing, pick who's playing, and set up teams if that game uses them.</p></div>
      <div class="card"><div class="stitch"></div><h3>3. Enter scores each hand</h3><p class="hint-text">Every game has a quick entry screen. If it ever feels easier, there's always a "type the total yourself" option instead.</p></div>
      <div class="card"><div class="stitch"></div><h3>4. End the game</h3><p class="hint-text">Games end automatically at a target score or hand count, or tap "End Game Now" any time to stop early.</p></div>
      <div class="card"><div class="stitch"></div><h3>5. House Rules</h3><p class="hint-text">Tap House Rules from the home screen to see exactly how each game scores. Editing rules is tucked away deliberately so nobody changes them by accident.</p></div>
    `;
  }
};

// ============================================================
// UTIL
// ============================================================

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function suitClass(suit) {
  return RED_SUITS.indexOf(suit) >= 0 ? "suit-red" : "suit-black";
}
function avatarHtml(name, color) {
  const style = color ? ` style="background:${color}"` : "";
  return `<div class="avatar"${style}>${initials(name)}</div>`;
}
function formatUSDateTime(ms) {
  // Always formatted US-style (e.g. "Jul 6, 2026, 3:45 PM EDT"), but the
  // actual moment shown is whatever the device's own local timezone says —
  // handy for family spread across different US time zones.
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZoneName: "short"
  });
}
function teamModeLabel(mode) {
  if (mode === "forced") return "Always partnered";
  if (mode === "choice") return "Solo or teams";
  return "Individual";
}
function cardValueLabel(key) {
  const map = { joker: "Joker", two: "2s", ace: "Aces", tenPlus: "10 through King", lowCard: "4 through 9", blackThree: "Black 3s", redThree: "Red 3s" };
  return map[key] || key;
}
