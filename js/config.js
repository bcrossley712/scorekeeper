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
    endCondition: { type: "target", value: 500, allowChoice: true },
    info: [
      "Played in fixed partnerships (2 v 2).",
      "Each hand, the winning bidder's team must capture at least their bid in points, or they lose the bid amount instead of scoring the points they captured.",
      "The non-bidding team always scores whatever points they captured, bid or no bid.",
      "Trump color (red, green, black, or yellow) is recorded for the hand history but doesn't change scoring.",
      "First team to the target score wins (default 500 — editable per game)."
    ]
  },

  handfoot: {
    label: "Hand & Foot",
    winMode: "high",
    teamMode: "choice",           // solo or teams
    entryType: "handfoot",
    endCondition: { type: "hands", value: 4, allowChoice: true },
    cardValues: {
      joker: 50, two: 20, ace: 15,
      tenPlus: 10,   // 10 through King
      lowCard: 5,    // 4 through 9
      blackThree: 5,
      redThree: -300 // always negative, no replace-on-draw rule
    },
    bonuses: { cleanBook: 500, dirtyBook: 300 },
    meldThresholds: [50, 100, 150, 200], // rises each hand by 50
    info: [
      "Family house rules — differs from the standard published version.",
      "Card values: Joker 50, 2s 20, Aces 15, 10 through King 10, 4 through 9 are 5, black 3s are 5.",
      "Red 3s always score −300 — there is no immediate-replace-on-draw rule, it's on you to get rid of it.",
      "Clean (natural) books score 500 each. Dirty (wild) books score 300 each.",
      "The Bonus field is open-ended — use it for a went-out-first bonus, a bonus for pulling exactly the 26 cards needed for your hand and foot from the community pile at the start of a round, or any other house-rule bonus (or penalty, entered as a negative number).",
      "Hand score = (clean books × 500) + (dirty books × 300) + total melded card points + bonus − total points stuck in hand/foot.",
      "Default game length is 4 hands, with the minimum opening meld rising each hand by 50 (50 / 100 / 150 / 200). Only the hand count is currently editable in House Rules — the meld thresholds aren't wired up there yet."
    ]
  },

  gnoming: {
    label: "Gnoming A Round",
    winMode: "low",
    teamMode: "none",
    entryType: "simple",
    endCondition: { type: "hands", value: 3, allowChoice: true },
    info: [
      "A Golf-style card layout game played over 3 rounds.",
      "Positive cards score their face value toward your row/column total — unless a full row or column is three-of-a-kind, in which case it's subtracted instead.",
      "Lowest cumulative total after all rounds wins.",
      "Default is 3 rounds, but you can switch to a longer fixed round count or an open-ended \"End on Cue\" game at setup if your family wants to keep going."
    ]
  },

  phase10: {
    label: "Phase 10",
    winMode: "low",
    teamMode: "none",
    entryType: "phase10",
    endCondition: { type: "phase", value: 10 },
    cardValues: { numbersOneToNine: 5, tenElevenTwelve: 10, skip: 15, wild: 25 },
    info: [
      "Each player works through 10 phases in order across as many hands as it takes.",
      "Cards numbered 1-9 score a flat 5 points each if left in hand (not their face value). 10s, 11s, and 12s score 10 points each. Skip cards score 15. Wild cards score 25.",
      "The game ends once someone completes Phase 10 — that player wins outright, regardless of score, even if someone else has fewer points. If more than one player completes Phase 10 in that same final hand, whichever of them has the fewest total points wins.",
      "If those tied finishers also have the exact same point total, the official rules have them replay just Phase 10 and whoever goes out first wins — the app doesn't automate that part, so if it comes up, just play the extra hand and compare manually.",
      "Ending early with \"End Game Now\" isn't something the official rules cover, so the app treats it the same way it treats a completed game: furthest phase reached wins first, and only ties on phase fall back to lowest score."
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
  },

  dragoness: {
    label: "Reign of Dragoness",
    winMode: "high",
    teamMode: "none",
    entryType: "simple",
    endCondition: { type: "hands", value: 5, allowChoice: true },
    info: [
      "A hand-shedding \"climbing\" game — players race to empty their hand by playing patterns (singles, sets, or runs) in ascending rank.",
      "5 fixed rounds. Each round, whoever empties their hand first scores 3 points, next-fewest cards scores 2, third-fewest scores 1 — everyone else scores 0 that round.",
      "Ties for 2nd: all tied players get 2 points and no 3rd place is awarded. Ties for 3rd: all tied players get 1 point.",
      "Highest cumulative score after all 5 rounds wins.",
      "Default is 5 rounds, but you can switch to a longer fixed round count, a target score, or an open-ended \"End on Cue\" game at setup if your family wants to keep going."
    ]
  },

  countdown321: {
    label: "3-2-1 Countdown",
    winMode: "high",
    teamMode: "none",
    entryType: "simple",
    endCondition: { type: "hands", value: 5, allowChoice: true },
    info: [
      "A card-shedding game — discard down toward the lowest hand value, or declare \"Countdown\" if you think you already have it.",
      "5 fixed rounds. Each round, lowest hand value scores 3 points, second-lowest scores 2, third-lowest scores 1 — everyone else scores 0.",
      "If you declared \"Countdown\" and truly had the lowest hand, add a +1 bonus (4 points that round). Declare it and you're wrong, and you score 0 instead of 3.",
      "Highest cumulative score after 5 rounds wins.",
      "The official rules break ties with one extra round among just the tied players — the app doesn't automate that part, so if it comes up, just play one more hand and compare manually.",
      "Default is 5 rounds, but you can switch to a longer fixed round count, a target score, or an open-ended \"End on Cue\" game at setup if your family wants to keep going."
    ]
  },

  skullking: {
    label: "Skull King",
    winMode: "high",
    teamMode: "none",
    entryType: "skullking",
    endCondition: { type: "hands", value: 10, allowChoice: true },
    scoring: {
      perTrickMade: 20,          // points per trick if your bid is exact
      perTrickMissedPenalty: 10, // points lost per trick you're off by, when bid isn't 0
      zeroBidRoundMultiplier: 10 // bid 0 and correct = this × round number; bid 0 and wrong = negative of the same
    },
    info: [
      "A trick-taking bidding game played over 10 rounds — round N deals N cards, so N tricks are played that round.",
      "Bid exactly the number of tricks you'll win, then score 20 points for each trick bid, if you're exactly right.",
      "Bid wrong (over or under) and you lose 10 points for every trick you were off by.",
      "Bid zero and take zero tricks: score 10 points × the round number. Bid zero and take any tricks at all: lose 10 points × the round number instead.",
      "Bonus points — only earned if your bid was exactly right: +10 for each standard-suit 14 you capture (+20 for the black trump 14), +20 for a Pirate capturing a Mermaid, +30 for the Skull King capturing a Pirate, +40 for a Mermaid capturing the Skull King.",
      "Highest total after 10 rounds wins. Official rules break ties with one extra round — same manual workaround as 3-2-1 Countdown if that comes up.",
      "Point values above are editable in House Rules if you ever switch to the \"Rascal Scoring\" alternate method from the box.",
      "Default is 10 rounds, but you can switch to a different fixed round count, a target score, or an open-ended \"End on Cue\" game at setup if your family wants to keep going."
    ]
  },

  whoacowboy: {
    label: "Whoa There Cowboy",
    winMode: "high",
    teamMode: "none",
    entryType: "whoacowboy",
    endCondition: { type: "hands", value: 3, allowChoice: true },
    info: [
      "A bluffing game — announce a card (like \"two 3's\"), then either play truthfully or bluff. Numbers must climb (or later descend) each turn; call \"Whoa There Cowboy!\" if you suspect someone's lying.",
      "Catch a real bluff: the bluffer takes back their cards plus a penalty card from the draw pile, and you earn a 10-point token. Wrongly accuse a truthful player: you owe them a card from your own hand.",
      "Empty your hand without getting caught bluffing on that last play: earn a 20-point token, then draw 7 new cards and keep going.",
      "End-of-round score = add up all your collected token points (10s and 20s together) and subtract however many cards are left in your hand.",
      "The rulebook suggests 3 rounds by default but says to play as many as your family likes — adjust the round count at setup, or just tap \"End Game Now\" whenever you're done.",
      "Highest total wins. Official tie-break is whoever scored higher in the very last round, and a genuine tie after that is a shared win — the app doesn't automate either of those, so just compare manually if it comes up."
    ]
  }
};

var GAME_ORDER = ["rook", "handfoot", "phase10", "gnoming", "sequence", "backwards8", "dragoness", "countdown321", "skullking", "whoacowboy"];

var GAME_SUITS = { rook: "♣", handfoot: "♦", phase10: "♠", gnoming: "♥", sequence: "♠", backwards8: "♣", dragoness: "♦", countdown321: "♣", skullking: "♠", whoacowboy: "♥" };

var RED_SUITS = ["♦", "♥"];

var PLAYER_COLORS = ["#B23A2E", "#2B6350", "#C79B4A", "#4A6FA5", "#8E5B9F", "#3D8B7D", "#B2673A", "#6B4E71"];
