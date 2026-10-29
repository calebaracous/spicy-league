import { describe, expect, it } from "vitest";

import { parseChampionJson } from "@/lib/champions";
import {
  availableChampions,
  championIconUrl,
  DRAFT_SEQUENCE,
  draftBoard,
  isDraftComplete,
  nextStep,
  resolveTimeout,
  sideOnClock,
  stepAt,
  TOTAL_STEPS,
  unavailableReason,
  type DraftAction,
} from "@/lib/draft-room";

/** Actions for the first `keys.length` steps, taking each key in order. */
function take(keys: (string | null)[]): DraftAction[] {
  return keys.map((championKey, i) => ({ ...DRAFT_SEQUENCE[i], championKey }));
}

const CATALOG = ["Ahri", "Garen", "Jinx", "Lux", "MonkeyKing", "Thresh", "Yasuo", "Zed"];

describe("DRAFT_SEQUENCE", () => {
  it("is the standard 20-step tournament draft", () => {
    const code = DRAFT_SEQUENCE.map((s) => `${s.side[0].toUpperCase()}${s.kind[0]}`);
    expect(code).toEqual([
      ...["Bb", "Rb", "Bb", "Rb", "Bb", "Rb"],
      ...["Bp", "Rp", "Rp", "Bp", "Bp", "Rp"],
      ...["Rb", "Bb", "Rb", "Bb"],
      ...["Rp", "Bp", "Bp", "Rp"],
    ]);
  });

  it("numbers steps 1..20 with 10 bans, 10 picks, 5 of each per side", () => {
    expect(TOTAL_STEPS).toBe(20);
    expect(DRAFT_SEQUENCE.map((s) => s.step)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const side of ["blue", "red"] as const) {
      for (const kind of ["ban", "pick"] as const) {
        expect(DRAFT_SEQUENCE.filter((s) => s.side === side && s.kind === kind)).toHaveLength(5);
      }
    }
  });

  it("stepAt is 1-based and null outside the draft", () => {
    expect(stepAt(1)).toEqual({ step: 1, side: "blue", kind: "ban" });
    expect(stepAt(7)).toEqual({ step: 7, side: "blue", kind: "pick" });
    expect(stepAt(20)).toEqual({ step: 20, side: "red", kind: "pick" });
    expect(stepAt(0)).toBeNull();
    expect(stepAt(21)).toBeNull();
    expect(stepAt(1.5)).toBeNull();
  });
});

describe("progress", () => {
  it("nextStep, sideOnClock and isDraftComplete follow the action count", () => {
    expect(nextStep([])).toBe(1);
    expect(sideOnClock([])).toBe("blue");
    expect(isDraftComplete([])).toBe(false);

    const seven = take(["Ahri", "Garen", null, "Jinx", "Lux", "Thresh", "Zed"]);
    expect(nextStep(seven)).toBe(8);
    expect(sideOnClock(seven)).toBe("red");

    const all = take(Array.from({ length: 20 }, (_, i) => `C${i}`));
    expect(nextStep(all)).toBe(21);
    expect(sideOnClock(all)).toBeNull();
    expect(isDraftComplete(all)).toBe(true);
  });
});

describe("availability", () => {
  const base = { catalogKeys: CATALOG, actions: [], priorGamePicks: [], disabled: [] };

  it("everything is available in a fresh game", () => {
    expect(availableChampions({ ...base, fearless: true })).toEqual(CATALOG);
  });

  it("this game's bans and picks are unavailable; skipped bans block nothing", () => {
    const actions = take(["Ahri", null, "Garen", "Jinx", "Lux", "Thresh", "Zed"]);
    expect(availableChampions({ ...base, actions, fearless: false })).toEqual([
      "MonkeyKing",
      "Yasuo",
    ]);
  });

  it("fearless on: earlier games' picks (either team) are out; earlier bans are not", () => {
    // Earlier bans aren't passed in at all: only picks carry over.
    const input = { ...base, priorGamePicks: ["Jinx", "Thresh"], fearless: true };
    expect(availableChampions(input)).toEqual([
      "Ahri",
      "Garen",
      "Lux",
      "MonkeyKing",
      "Yasuo",
      "Zed",
    ]);
  });

  it("fearless off: earlier games' picks are available again", () => {
    const input = { ...base, priorGamePicks: ["Jinx", "Thresh"], fearless: false };
    expect(availableChampions(input)).toEqual(CATALOG);
  });

  it("disabled champions are unavailable, fearless or not", () => {
    for (const fearless of [true, false]) {
      expect(availableChampions({ ...base, disabled: ["Yasuo", "Zed"], fearless })).toEqual(
        CATALOG.slice(0, 6),
      );
    }
  });

  it("keeps catalogue order", () => {
    const keys = ["Zed", "Ahri", "Lux"];
    expect(availableChampions({ ...base, catalogKeys: keys, fearless: false })).toEqual(keys);
  });
});

describe("unavailableReason", () => {
  const actions = take(["Ahri", null, "Garen", "Jinx", "Lux", "Thresh", "Zed"]);
  const input = {
    actions,
    priorGamePicks: ["Zed", "Yasuo", "Ahri", "MonkeyKing"],
    disabled: ["Zed", "Yasuo", "Ahri", "Jinx"],
    fearless: true,
  };

  it("labels bans and picks from this game", () => {
    expect(unavailableReason("Garen", input)).toBe("banned");
    expect(unavailableReason("Zed", input)).toBe("picked");
  });

  it("precedence: this game's ban/pick, then fearless, then disabled", () => {
    expect(unavailableReason("Ahri", input)).toBe("banned"); // also fearless + disabled
    expect(unavailableReason("Zed", input)).toBe("picked"); // also fearless + disabled
    expect(unavailableReason("Yasuo", input)).toBe("fearless"); // also disabled
    expect(unavailableReason("MonkeyKing", input)).toBe("fearless");
    expect(unavailableReason("Yasuo", { ...input, fearless: false })).toBe("disabled");
  });

  it("fearless off ignores earlier picks; free champions get null", () => {
    expect(unavailableReason("MonkeyKing", { ...input, fearless: false })).toBeNull();
    expect(unavailableReason("Thresh", { ...input, actions: [] })).toBeNull();
  });

  it("agrees with availableChampions", () => {
    for (const fearless of [true, false]) {
      const i = { ...input, fearless };
      const available = availableChampions({ ...i, catalogKeys: CATALOG });
      expect(CATALOG.filter((k) => unavailableReason(k, i) === null)).toEqual(available);
    }
  });
});

describe("resolveTimeout", () => {
  const available = ["Ahri", "Garen", "Jinx", "Lux"];

  it("locks the hovered champion when it's still available", () => {
    expect(resolveTimeout({ hover: "Jinx", available })).toBe("Jinx");
  });

  it("hover taken or missing: nothing (a skipped ban, a paused pick)", () => {
    expect(resolveTimeout({ hover: "Zed", available })).toBeNull();
    expect(resolveTimeout({ hover: null, available })).toBeNull();
    expect(resolveTimeout({ hover: undefined, available: [] })).toBeNull();
  });
});

describe("draftBoard", () => {
  it("groups bans (with skips) and picks per side in step order", () => {
    const keys = [
      ...["Ahri", "Garen", null, "Jinx", "Lux", null],
      ...["B1", "R1", "R2", "B2", "B3", "R3"],
      ...["Thresh", "Zed"],
    ];
    const actions = take(keys).reverse(); // order of input doesn't matter
    expect(draftBoard(actions)).toEqual({
      blue: { bans: ["Ahri", null, "Lux", "Zed"], picks: ["B1", "B2", "B3"] },
      red: { bans: ["Garen", "Jinx", null, "Thresh"], picks: ["R1", "R2", "R3"] },
    });
  });

  it("empty draft", () => {
    expect(draftBoard([])).toEqual({
      blue: { bans: [], picks: [] },
      red: { bans: [], picks: [] },
    });
  });
});

describe("championIconUrl", () => {
  it("builds the Data Dragon icon URL from the key", () => {
    expect(championIconUrl("16.21.1", "MonkeyKing")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/16.21.1/img/champion/MonkeyKing.png",
    );
  });
});

describe("parseChampionJson", () => {
  const json = {
    type: "champion",
    version: "16.21.1",
    data: {
      MonkeyKing: { id: "MonkeyKing", key: "62", name: "Wukong", title: "the Monkey King" },
      Aatrox: { id: "Aatrox", key: "266", name: "Aatrox" },
      KSante: { id: "KSante", key: "897", name: "K'Sante" },
      Nunu: { id: "Nunu", key: "20", name: "Nunu & Willump" },
    },
  };

  it("maps id → key, name, numeric key, sorted by display name", () => {
    expect(parseChampionJson(json)).toEqual([
      { key: "Aatrox", name: "Aatrox", numericId: 266 },
      { key: "KSante", name: "K'Sante", numericId: 897 },
      { key: "Nunu", name: "Nunu & Willump", numericId: 20 },
      { key: "MonkeyKing", name: "Wukong", numericId: 62 },
    ]);
  });

  it("drops malformed entries", () => {
    const bad = {
      data: { ...json.data, Broken: { id: "Broken", key: "x", name: "B" }, Nil: null },
    };
    expect(parseChampionJson(bad)?.map((c) => c.key)).toEqual([
      "Aatrox",
      "KSante",
      "Nunu",
      "MonkeyKing",
    ]);
  });

  it("null when the payload isn't champion.json-shaped", () => {
    expect(parseChampionJson(null)).toBeNull();
    expect(parseChampionJson({})).toBeNull();
    expect(parseChampionJson("nope")).toBeNull();
  });
});
