// ───────────────────────────────────────────────────────────────────
// Mock data for the 10-man prototype.
// Roles use League shorthand: top, jg, mid, adc, sup, fill.
// ───────────────────────────────────────────────────────────────────

const PLAYERS = [
  {
    id: "u1",
    name: "shaco_main",
    joinedAt: "2m ago",
    primary: "jg",
    secondary: "fill",
    rank: "Diamond II",
    lp: 47,
  },
  {
    id: "u2",
    name: "BotLaneDiff",
    joinedAt: "2m ago",
    primary: "adc",
    secondary: "mid",
    rank: "Diamond IV",
    lp: 12,
  },
  {
    id: "u3",
    name: "tilted_proxy",
    joinedAt: "4m ago",
    primary: "top",
    secondary: "fill",
    rank: "Platinum I",
    lp: 88,
  },
  {
    id: "u4",
    name: "crouton",
    joinedAt: "5m ago",
    primary: "sup",
    secondary: "adc",
    rank: "Emerald II",
    lp: 31,
  },
  {
    id: "u5",
    name: "Wizardrydoge",
    joinedAt: "6m ago",
    primary: "mid",
    secondary: "top",
    rank: "Diamond III",
    lp: 64,
  },
  {
    id: "u6",
    name: "nullpointer",
    joinedAt: "8m ago",
    primary: "jg",
    secondary: "top",
    rank: "Platinum II",
    lp: 22,
  },
  {
    id: "u7",
    name: "parserror",
    joinedAt: "10m ago",
    primary: "adc",
    secondary: "sup",
    rank: "Emerald III",
    lp: 76,
  },
  {
    id: "u8",
    name: "mossbear",
    joinedAt: "11m ago",
    primary: "top",
    secondary: "jg",
    rank: "Gold I",
    lp: 9,
  },
  {
    id: "u9",
    name: "blue_buff",
    joinedAt: "13m ago",
    primary: "mid",
    secondary: "sup",
    rank: "Emerald I",
    lp: 55,
  },
  {
    id: "u10",
    name: "yumi_diff",
    joinedAt: "14m ago",
    primary: "sup",
    secondary: "mid",
    rank: "Platinum III",
    lp: 41,
  },
];

// Vote counts (each player picks 2, so total = 20)
const VOTE_TALLY = {
  u1: 5, // shaco_main → captain
  u2: 4, // BotLaneDiff → captain
  u5: 3,
  u3: 2,
  u6: 2,
  u4: 1,
  u7: 1,
  u9: 1,
  u8: 1,
  u10: 0,
};

// Captains after voting (top 2)
const CAPTAINS = ["u1", "u2"];

// Snake pick order: C1, C2, C2, C1, C1, C2, C2, C1
const PICK_ORDER = ["u1", "u2", "u2", "u1", "u1", "u2", "u2", "u1"];

// Partial draft state — 3 picks made (default)
const SAMPLE_PICKS = [
  { pickNumber: 1, captainId: "u1", pickedId: "u5" }, // shaco picks Wizardrydoge (mid)
  { pickNumber: 2, captainId: "u2", pickedId: "u3" }, // botlane picks tilted_proxy (top)
  { pickNumber: 3, captainId: "u2", pickedId: "u7" }, // botlane picks parserror (adc)
];

const FULL_PICKS = [
  { pickNumber: 1, captainId: "u1", pickedId: "u5" }, // shaco → Wizardrydoge (mid)
  { pickNumber: 2, captainId: "u2", pickedId: "u3" }, // botlane → tilted_proxy (top)
  { pickNumber: 3, captainId: "u2", pickedId: "u7" }, // botlane → parserror (adc)
  { pickNumber: 4, captainId: "u1", pickedId: "u6" }, // shaco → nullpointer (jg backup, top sec)
  { pickNumber: 5, captainId: "u1", pickedId: "u4" }, // shaco → crouton (sup)
  { pickNumber: 6, captainId: "u2", pickedId: "u9" }, // botlane → blue_buff (mid)
  { pickNumber: 7, captainId: "u2", pickedId: "u10" }, // botlane → yumi_diff (sup)
  { pickNumber: 8, captainId: "u1", pickedId: "u8" }, // shaco → mossbear (top)
];

// Past 10-mans for the history list
const MATCH_HISTORY = [
  {
    id: "tm-042",
    date: "Yesterday, 9:14 PM",
    winner: "Team shaco_main",
    loser: "Team BotLaneDiff",
    duration: "31m",
    scoreline: "Won",
  },
  {
    id: "tm-041",
    date: "Yesterday, 7:42 PM",
    winner: "Team Wizardrydoge",
    loser: "Team crouton",
    duration: "44m",
    scoreline: "Won",
  },
  {
    id: "tm-040",
    date: "May 14, 10:08 PM",
    winner: "Team nullpointer",
    loser: "Team parserror",
    duration: "28m",
    scoreline: "Won",
  },
  {
    id: "tm-039",
    date: "May 13, 11:30 PM",
    winner: "Team blue_buff",
    loser: "Team mossbear",
    duration: "37m",
    scoreline: "Won",
  },
  {
    id: "tm-038",
    date: "May 12, 8:55 PM",
    winner: "Team tilted_proxy",
    loser: "Team yumi_diff",
    duration: "52m",
    scoreline: "Won",
  },
  {
    id: "tm-037",
    date: "May 11, 9:20 PM",
    winner: "Team shaco_main",
    loser: "Team BotLaneDiff",
    duration: "33m",
    scoreline: "Won",
  },
];

const ROLE_LABELS = {
  top: "Top",
  jg: "Jng",
  mid: "Mid",
  adc: "ADC",
  sup: "Sup",
  fill: "Fill",
};

// Helpers
function getPlayer(id) {
  return PLAYERS.find((p) => p.id === id);
}
function initials(name) {
  return name.slice(0, 2);
}

// Export
Object.assign(window, {
  PLAYERS,
  VOTE_TALLY,
  CAPTAINS,
  PICK_ORDER,
  SAMPLE_PICKS,
  FULL_PICKS,
  MATCH_HISTORY,
  ROLE_LABELS,
  getPlayer,
  initials,
});
