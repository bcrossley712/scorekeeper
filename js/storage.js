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

    // _mergeMissing only fills in keys that are completely absent — it can't
    // fix a key that already exists with an outdated VALUE, which is exactly
    // what happens to entryType/info/label/winMode/teamMode whenever a code
    // update changes one of them: the very first getRules() call ever made
    // on this device already wrote the old value in, so it's "present" and
    // never gets healed. Those five fields are never user-editable (RulesEdit
    // only ever touches nested numeric fields like endCondition, scoring,
    // bonuses, cardValues — real house-rule stuff), so it's always safe to
    // re-sync them from the current code on every load. Anything actually
    // customizable stays untouched.
    Object.keys(DEFAULT_RULES).forEach(key => {
      if (!merged[key]) return;
      merged[key].entryType = DEFAULT_RULES[key].entryType;
      merged[key].info = JSON.parse(JSON.stringify(DEFAULT_RULES[key].info));
      merged[key].label = DEFAULT_RULES[key].label;
      merged[key].winMode = DEFAULT_RULES[key].winMode;
      merged[key].teamMode = DEFAULT_RULES[key].teamMode;
    });

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

  getSettings() {
    const DEFAULT_SETTINGS = {
      helpSeen: false,
      scoreEntryDensity: "comfortable", // "comfortable" (today's layout) or "compact" (tighter, more players per screen)
      gamesCompletedCount: 0,           // only bumped by a real finish (a winner recorded) — never an abandoned game
      densityIntroSeen: false,          // once true, the one-time "hey, layout changed" modal never shows again
      showDensityIntroModal: false      // one-shot flag: true right after the auto-switch happens, consumed on next render
    };
    const s = this._read(STORAGE_KEYS.settings, null);
    if (!s) {
      this._write(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const merged = this._mergeMissing(s, DEFAULT_SETTINGS);
    this._write(STORAGE_KEYS.settings, merged);
    return merged;
  },
  saveSettings(s) { return this._write(STORAGE_KEYS.settings, s); },

  getGameOrder() { return this._read(STORAGE_KEYS.gameOrder, null); },
  saveGameOrder(order) { return this._write(STORAGE_KEYS.gameOrder, order); },
  clearGameOrder() { localStorage.removeItem(STORAGE_KEYS.gameOrder); },

  uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
};
