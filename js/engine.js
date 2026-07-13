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
    const bonus = Number(entry.bonus) || 0; // open-ended — went out first, or any other house-rule bonus/penalty
    const stuck = Number(entry.stuckTotal) || 0;
    return clean + dirty + meld + bonus - stuck;
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

  // Skull King: entry = { manual, manualTotal, bid, tricks, bonus }, roundNum = cards dealt that round.
  // Bonus points only ever count when the bid was made exactly right.
  skullking(entry, rules, roundNum) {
    if (entry.manual) return Number(entry.manualTotal) || 0;
    const bid = Number(entry.bid) || 0;
    const tricks = Number(entry.tricks) || 0;
    const bonus = Number(entry.bonus) || 0;
    const s = rules.scoring;
    if (bid === 0) {
      return tricks === 0 ? (s.zeroBidRoundMultiplier * roundNum + bonus) : -(s.zeroBidRoundMultiplier * roundNum);
    }
    return bid === tricks ? (s.perTrickMade * bid + bonus) : -s.perTrickMissedPenalty * Math.abs(bid - tricks);
  },

  // Whoa There Cowboy: entry = { manual, manualTotal, tokens, cardsLeft }
  whoacowboy(entry) {
    if (entry.manual) return Number(entry.manualTotal) || 0;
    const tokens = Number(entry.tokens) || 0;
    const left = Number(entry.cardsLeft) || 0;
    return tokens - left;
  },

  // 3-2-1 Countdown: entries = { unitId: { handTotal } } for every participant
  // in the hand, handMeta = { declarationType: "countdown" | "blastoff", declaredById }.
  // Unlike the other engine functions, this computes every participant's
  // score in one shot — the ranking (and the declarer's bonus/penalty) is
  // inherently comparative, not something that can be worked out per-player
  // in isolation. Returns { unitId: score }.
  //
  // Base rule: lowest hand total = 3, second-lowest = 2, third-lowest = 1,
  // everyone else 0. Ties share the same points and don't skip the next
  // tier (dense ranking by distinct value, not by player count).
  countdown321(entries, handMeta) {
    const ids = Object.keys(entries);
    const scores = {};
    ids.forEach(id => (scores[id] = 0));

    const rankByTiers = (idList, tierPoints) => {
      const values = [...new Set(idList.map(id => entries[id].handTotal))].sort((a, b) => a - b);
      idList.forEach(id => {
        const tier = values.indexOf(entries[id].handTotal);
        scores[id] = tier < tierPoints.length ? tierPoints[tier] : 0;
      });
    };

    const declaredById = handMeta.declaredById;

    if (handMeta.declarationType === "blastoff") {
      // Declarer's hand is fully discarded — guaranteed lowest by
      // definition, flat 3 points, no bonus. Everyone else is ranked
      // normally among themselves for the second/third tiers.
      scores[declaredById] = 3;
      const rest = ids.filter(id => id !== declaredById);
      rankByTiers(rest, [2, 1]);
      return scores;
    }

    // Countdown declaration.
    rankByTiers(ids, [3, 2, 1]);
    const lowestTotal = Math.min(...ids.map(id => entries[id].handTotal));
    const declarerTotal = entries[declaredById].handTotal;
    const tiedForLowest = ids.filter(id => entries[id].handTotal === lowestTotal);

    if (declarerTotal > lowestTotal) {
      // Someone actually had a lower hand — the declarer forfeits their
      // tier entirely, even if they'd have naturally landed 2nd or 3rd.
      // Nobody else moves up to fill that slot; the real lowest/2nd/3rd
      // (by hand value) keep whatever rankByTiers already gave them.
      scores[declaredById] = 0;
    } else if (tiedForLowest.length === 1) {
      // Sole lowest — the +1 bonus on top of the normal 3.
      scores[declaredById] = 4;
    }
    // else: declarer ties for lowest with someone else — the normal tier
    // score (3) from rankByTiers stands as-is, no bonus.

    return scores;
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
    if (game.endCondition && game.endCondition.type === "phase") {
      // Phase 10's real rule: whoever actually completes Phase 10 wins
      // outright — score doesn't matter, even if someone else is ahead on
      // points. Only if more than one player completes Phase 10 in that
      // same final hand does it fall back to lowest score, and only among
      // those tied finishers (not everyone).
      const phases = this.phaseProgress(game);
      const finishers = game.participantIds.filter(id => phases[id] > 10);
      if (finishers.length === 1) return finishers[0];
      if (finishers.length > 1) {
        const totals = this.runningTotals(game);
        let best = null, bestVal = Infinity;
        finishers.forEach(id => { if (totals[id] < bestVal) { bestVal = totals[id]; best = id; } });
        return best;
        // A genuine tie in points among finishers should be broken by
        // replaying Phase 10 per the rulebook — the app doesn't automate
        // that (same documented gap as 3-2-1 Countdown/Skull King ties), so
        // a tie here just resolves to the first finisher found.
      }
      // Nobody's finished Phase 10 — the game was ended early via "End Game
      // Now" (not a scenario the official rules cover at all). Whoever has
      // progressed furthest through the phases is considered ahead, same
      // priority as the real rule gives phase completion over score; a tie
      // on phase is broken by lowest score among just those tied.
      const totals = this.runningTotals(game);
      let best = null, bestPhase = -Infinity, bestScore = Infinity;
      game.participantIds.forEach(id => {
        const p = phases[id];
        const s = totals[id] || 0;
        if (p > bestPhase || (p === bestPhase && s < bestScore)) {
          bestPhase = p; bestScore = s; best = id;
        }
      });
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
