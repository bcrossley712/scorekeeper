// ============================================================
// STORAGE — everything persists to localStorage. No server,
// no account, no sync. Data lives on whatever device it's used on.
// ============================================================

var STORAGE_KEYS = {
  players: "sk_players",
  rules: "sk_rules",         // current, editable house rules (a copy of DEFAULT_RULES, mutated over time)
  history: "sk_history",     // completed games
  active: "sk_active_game",  // in-progress game, if any
  settings: "sk_settings"
};

var Storage = {
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("Storage read failed for", key, e);
      return fallback;
    }
  },
  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write failed for", key, e);
      return false;
    }
  },

  getPlayers() { return this._read(STORAGE_KEYS.players, []); },
  savePlayers(players) { return this._write(STORAGE_KEYS.players, players); },

  getRules() {
    let rules = this._read(STORAGE_KEYS.rules, null);
    if (!rules) {
      rules = JSON.parse(JSON.stringify(DEFAULT_RULES)); // deep copy default on first run
      this._write(STORAGE_KEYS.rules, rules);
    }
    return rules;
  },
  saveRules(rules) { return this._write(STORAGE_KEYS.rules, rules); },

  getHistory() { return this._read(STORAGE_KEYS.history, []); },
  addHistoryEntry(entry) {
    const h = this.getHistory();
    h.unshift(entry);
    return this._write(STORAGE_KEYS.history, h);
  },

  getActiveGame() { return this._read(STORAGE_KEYS.active, null); },
  saveActiveGame(game) { return this._write(STORAGE_KEYS.active, game); },
  clearActiveGame() { localStorage.removeItem(STORAGE_KEYS.active); },

  getSettings() { return this._read(STORAGE_KEYS.settings, { helpSeen: false }); },
  saveSettings(s) { return this._write(STORAGE_KEYS.settings, s); },

  uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
};
