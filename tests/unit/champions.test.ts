import { describe, expect, it } from "vitest";

import { resolveChampionKeys, type Champion } from "@/lib/champions";

const CHAMPIONS: Champion[] = [
  { key: "Aurora", name: "Aurora", numericId: 893 },
  { key: "Belveth", name: "Bel'Veth", numericId: 200 },
  { key: "DrMundo", name: "Dr. Mundo", numericId: 36 },
  { key: "Kaisa", name: "Kai'Sa", numericId: 145 },
  { key: "MonkeyKing", name: "Wukong", numericId: 62 },
  { key: "Nunu", name: "Nunu & Willump", numericId: 20 },
];

describe("resolveChampionKeys", () => {
  it("matches display names and keys, case-insensitively", () => {
    expect(resolveChampionKeys("Wukong, aurora", CHAMPIONS)).toEqual({
      keys: ["Aurora", "MonkeyKing"],
      unknown: [],
    });
    expect(resolveChampionKeys("monkeyking", CHAMPIONS).keys).toEqual(["MonkeyKing"]);
  });

  it("ignores spaces and punctuation", () => {
    expect(
      resolveChampionKeys("kaisa, Kai'Sa, dr mundo, DR. MUNDO, belveth, nunu & willump", CHAMPIONS),
    ).toEqual({ keys: ["Belveth", "DrMundo", "Kaisa", "Nunu"], unknown: [] });
    expect(resolveChampionKeys("nunu", CHAMPIONS).keys).toEqual(["Nunu"]);
  });

  it("dedupes and sorts keys, and accepts newlines as separators", () => {
    expect(resolveChampionKeys("Wukong\nAurora, MonkeyKing,, wukong", CHAMPIONS).keys).toEqual([
      "Aurora",
      "MonkeyKing",
    ]);
  });

  it("returns unknown entries trimmed, deduped, in input order", () => {
    expect(resolveChampionKeys(" Teemo , Aurora, Yuumi, Teemo", CHAMPIONS)).toEqual({
      keys: ["Aurora"],
      unknown: ["Teemo", "Yuumi"],
    });
    expect(resolveChampionKeys("'", CHAMPIONS).unknown).toEqual(["'"]);
  });

  it("is empty for blank input", () => {
    expect(resolveChampionKeys("", CHAMPIONS)).toEqual({ keys: [], unknown: [] });
    expect(resolveChampionKeys(" , \n ", CHAMPIONS)).toEqual({ keys: [], unknown: [] });
  });
});
