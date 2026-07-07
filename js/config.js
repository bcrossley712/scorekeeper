// ============================================================
// GAME CONFIG — every game's rules live here as data, not logic
// scattered through the app. This is what makes a future
// "house rules editor" for other games a small add-on instead
// of a rewrite.
// ============================================================

var DEFAULT_RULES = {
  rook: {
    label: "Rook",
    winMode: "high",              // higher score wins
    teamMode: "forced",           // always 2 v 2
    entryType: "rook",            // custom entry screen (bid/trump/points)
    endCondition: { type: "target", value: 500 },
    info: [
      "Played in fixed partnerships (2 v 2).",
      "Each hand, the winning bidder's team must capture at least their bid in points, or they lose the bid amount instead of scoring the points they captured.",
      "The non-bidding team always scores whatever points they captured, bid or no bid.",
      "Trump suit is recorded for the hand history but doesn't change scoring.",
      "First team to the target score wins (default 500 — editable per game)."
    ]
  },

  handfoot: {
    label: "Hand & Foot",
    winMode: "high",
    teamMode: "choice",           // solo or teams
    entryType: "handfoot",
    endCondition: { type: "hands", value: 4 },
    cardValues: {
      joker: 50, two: 20, ace: 15,
      tenPlus: 10,   // 10 through King
      lowCard: 5,    // 4 through 9
      blackThree: 5,
      redThree: -300 // always negative, no replace-on-draw rule
    },
    bonuses: { cleanBook: 500, dirtyBook: 300 },
    meldThresholds: [50, 90, 120, 150], // rises each hand, editable
    info: [
      "Family house rules — differs from the standard published version.",
      "Card values: Joker 50, 2s 20, Aces 15, 10 through King 10, 4 through 9 are 5, black 3s are 5.",
      "Red 3s always score −300 — there is no immediate-replace-on-draw rule, it's on you to get rid of it.",
      "Clean (natural) books score 500 each. Dirty (wild) books score 300 each.",
      "Hand score = (clean books × 500) + (dirty books × 300) + total melded card points − total points stuck in hand/foot.",
      "Default game length is 4 hands, with the minimum opening meld rising each hand (50 / 90 / 120 / 150) — both are editable in House Rules."
    ]
  },

  gnoming: {
    label: "Gnoming Around",
    winMode: "low",
    teamMode: "none",
    entryType: "simple",
    endCondition: { type: "hands", value: 3 },
    info: [
      "A Golf-style card layout game played over 3 rounds.",
      "Positive cards score their face value toward your row/column total — unless a full row or column is three-of-a-kind, in which case it's subtracted instead.",
      "Lowest cumulative total after all rounds wins."
    ]
  },

  phase10: {
    label: "Phase 10",
    winMode: "low",
    teamMode: "none",
    entryType: "phase10",
    endCondition: { type: "phase", value: 10 },
    cardValues: { numberCard: "face value", tenElevenTwelveSkip: 10, wild: 25 },
    info: [
      "Each player works through 10 phases in order across as many hands as it takes.",
      "Number cards score their face value if left in hand. 10s, 11s, 12s and Skips score 10. Wild cards score 25.",
      "The game ends once someone completes Phase 10 — at that point, whoever has the LOWEST cumulative score wins overall, even if they weren't the one who finished Phase 10 and even if they're behind on phases."
    ]
  },

  sequence: {
    label: "Sequence",
    winMode: "winloss",
    teamMode: "choice",
    entryType: "winloss",
    endCondition: { type: "manual" },
    info: [ "Not point-based — just tracks who wins each game." ]
  },

  backwards8: {
    label: "Backwards 8",
    winMode: "winloss",
    teamMode: "choice",
    entryType: "winloss",
    endCondition: { type: "manual" },
    info: [
      "A marble-race style game (in the spirit of Aggravation), moved around the board with cards instead of dice.",
      "No point ruleset yet — currently tracked as a simple win/loss game. A full ruleset can be added later."
    ]
  }
};

var GAME_ORDER = ["rook", "handfoot", "phase10", "gnoming", "sequence", "backwards8"];

var GAME_SUITS = { rook: "♣", handfoot: "♦", phase10: "♠", gnoming: "♥", sequence: "♠", backwards8: "♣" };

var RED_SUITS = ["♦", "♥"];

var PLAYER_COLORS = ["#B23A2E", "#2B6350", "#C79B4A", "#4A6FA5", "#8E5B9F", "#3D8B7D", "#B2673A", "#6B4E71"];
