// ============================================================
// STORAGE — everything persists to localStorage. No server,
// no account, no sync. Data lives on whatever device it's used on.
// ============================================================

var STORAGE_KEYS = {
  players: "sk_players",
  rules: "sk_rules",         // current, editable house rules (a copy of DEFAULT_RULES, mutated over time)
  history: "sk_history",     // completed games
  active: "sk_active_game",  // in-progress game, if any
  settings: "sk_settings",
  gameOrder: "sk_game_order" // custom ordering of the game picker, if the user has set one
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
      return rules;
    }
    // Someone's saved copy may predate a later change to DEFAULT_RULES (a new field,
    // a new game, etc). Fill in anything missing without touching what they've
    // already customized, then persist the healed copy so this only happens once.
    const merged = this._mergeMissing(rules, DEFAULT_RULES);
    this._write(STORAGE_KEYS.rules, merged);
    return merged;
  },
  _mergeMissing(target, source) {
    Object.keys(source).forEach(key => {
      if (!(key in target)) {
        target[key] = JSON.parse(JSON.stringify(source[key]));
      } else if (
        source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === "object" && !Array.isArray(target[key])
      ) {
        this._mergeMissing(target[key], source[key]);
      }
    });
    return target;
  },
  saveRules(rules) { return this._write(STORAGE_KEYS.rules, rules); },

  getHistory() { return this._read(STORAGE_KEYS.history, []); },
  addHistoryEntry(entry) {
    const h = this.getHistory();
    h.unshift(entry);
    return this._write(STORAGE_KEYS.history, h);
  },
  deleteHistoryEntry(id) {
    const h = this.getHistory().filter(e => e.id !== id);
    return this._write(STORAGE_KEYS.history, h);
  },

  getActiveGame() { return this._read(STORAGE_KEYS.active, null); },
  saveActiveGame(game) { return this._write(STORAGE_KEYS.active, game); },
  clearActiveGame() { localStorage.removeItem(STORAGE_KEYS.active); },

  getSettings() { return this._read(STORAGE_KEYS.settings, { helpSeen: false }); },
  saveSettings(s) { return this._write(STORAGE_KEYS.settings, s); },

  getGameOrder() { return this._read(STORAGE_KEYS.gameOrder, null); },
  saveGameOrder(order) { return this._write(STORAGE_KEYS.gameOrder, order); },
  clearGameOrder() { localStorage.removeItem(STORAGE_KEYS.gameOrder); },

  uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
};
