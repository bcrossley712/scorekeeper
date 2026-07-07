// ============================================================
// SCORING ENGINE — pure functions. Given a hand's raw entry data
// and the game's rules snapshot, compute the score that hand
// contributed. Kept separate from rendering/storage so the math
// is easy to reason about and test independently.
// ============================================================

var Engine = {
  // Simple numeric entry (Gnoming Around, Custom): entry = { total }
  simple(entry) {
    return Number(entry.total) || 0;
  },

  // Hand & Foot: entry = { manual, manualTotal, cleanBooks, dirtyBooks, meldTotal, stuckTotal }
  handfoot(entry, rules) {
    if (entry.manual) return Number(entry.manualTotal) || 0;
    const clean = (Number(entry.cleanBooks) || 0) * rules.bonuses.cleanBook;
    const dirty = (Number(entry.dirtyBooks) || 0) * rules.bonuses.dirtyBook;
    const meld = Number(entry.meldTotal) || 0;
    const stuck = Number(entry.stuckTotal) || 0;
    return clean + dirty + meld - stuck;
  },

  // Rook: computed per team. handMeta = { biddingTeamId, bid, trump },
  // entry (per team) = { manual, manualTotal, captured }
  rook(entry, handMeta, teamId) {
    if (entry.manual) return Number(entry.manualTotal) || 0;
    const captured = Number(entry.captured) || 0;
    if (teamId === handMeta.biddingTeamId) {
      const bid = Number(handMeta.bid) || 0;
      return captured >= bid ? captured : -bid;
    }
    return captured;
  },

  // Phase 10: entry = { manual, manualTotal, cardTotal, completedPhase }
  phase10(entry) {
    if (entry.manual) return Number(entry.manualTotal) || 0;
    return Number(entry.cardTotal) || 0;
  },

  computeHandScore(gameKey, entryType, entry, handMeta, participantId, rules) {
    switch (entryType) {
      case "handfoot": return this.handfoot(entry, rules);
      case "rook": return this.rook(entry, handMeta, participantId);
      case "phase10": return this.phase10(entry);
      case "simple": return this.simple(entry);
      default: return 0;
    }
  },

  // Totals across all hands played so far, per participant/team id.
  runningTotals(game) {
    const totals = {};
    game.participantIds.forEach(id => (totals[id] = 0));
    game.hands.forEach(hand => {
      game.participantIds.forEach(id => {
        const e = hand.entries[id];
        if (e && typeof e.score === "number") totals[id] += e.score;
      });
    });
    return totals;
  },

  // Win/loss tally for winloss-type games (Sequence, Backwards 8).
  runningWinCounts(game) {
    const wins = {};
    game.participantIds.forEach(id => (wins[id] = 0));
    game.hands.forEach(hand => {
      if (hand.winnerId && wins[hand.winnerId] !== undefined) wins[hand.winnerId]++;
    });
    return wins;
  },

  // Phase 10 tracker: current phase per participant (1-10). Can exceed 10
  // once someone completes their final phase — that's the end-game signal.
  phaseProgress(game) {
    const phases = {};
    game.participantIds.forEach(id => (phases[id] = 1));
    game.hands.forEach(hand => {
      game.participantIds.forEach(id => {
        const e = hand.entries[id];
        if (e && e.completedPhase) phases[id]++;
      });
    });
    return phases;
  },

  // Checks whether a game's end condition has been met.
  // Returns { done: bool, reason: string }
  checkEndCondition(game) {
    const cond = game.endCondition;
    if (!cond || cond.type === "manual") return { done: false };

    if (cond.type === "hands") {
      return { done: game.hands.length >= cond.value, reason: "Reached hand limit" };
    }
    if (cond.type === "target") {
      const totals = this.runningTotals(game);
      const ids = Object.keys(totals);
      if (game.winMode === "high") {
        const hit = ids.some(id => totals[id] >= cond.value);
        return { done: hit, reason: "Target score reached" };
      } else if (game.winMode === "low") {
        // Low-score games ending at a target doesn't really apply, but handle defensively
        return { done: false };
      }
    }
    if (cond.type === "phase") {
      const phases = this.phaseProgress(game);
      const anyDone = Object.values(phases).some(p => p > 10);
      return { done: anyDone, reason: "Someone completed Phase 10" };
    }
    return { done: false };
  },

  // Determine winner id(s) given current standings.
  determineWinner(game) {
    if (game.winMode === "winloss") {
      const wins = this.runningWinCounts(game);
      let best = null, bestVal = -Infinity;
      Object.entries(wins).forEach(([id, v]) => { if (v > bestVal) { bestVal = v; best = id; } });
      return best;
    }
    const totals = this.runningTotals(game);
    let best = null;
    let bestVal = game.winMode === "low" ? Infinity : -Infinity;
    Object.entries(totals).forEach(([id, v]) => {
      if ((game.winMode === "low" && v < bestVal) || (game.winMode === "high" && v > bestVal)) {
        bestVal = v; best = id;
      }
    });
    return best;
  }
};
