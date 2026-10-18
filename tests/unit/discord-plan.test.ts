import { describe, expect, it } from "vitest";

import { roleHolderChanges, pickExactMember, staleTeamRoles } from "@/lib/discord-plan";

const member = (id: string, username: string) => ({ user: { id, username } });

describe("pickExactMember", () => {
  it("only accepts an exact (case-insensitive) username match", () => {
    const members = [member("1", "caleb.jones2"), member("2", "Caleb.Jones"), member("3", "cal")];
    expect(pickExactMember(members, "caleb.jones")?.user.id).toBe("2");
    expect(pickExactMember(members, "caleb")).toBeNull();
    expect(pickExactMember([], "anyone")).toBeNull();
  });
});

describe("roleHolderChanges", () => {
  it("adds holders and removes only former holders who aren't holders", () => {
    expect(roleHolderChanges(["a", "b", "a"], ["b", "c", "c", "d"])).toEqual({
      add: ["a", "b"],
      remove: ["c", "d"],
    });
  });
});

describe("staleTeamRoles", () => {
  const now = new Date("2026-11-01");
  const before = new Date("2026-01-01");
  const after = new Date("2027-01-01");

  it("returns roles from earlier seasons only", () => {
    const teams = [
      { id: "old", discordRoleId: "r1", seasonCreatedAt: before },
      { id: "old-norole", discordRoleId: null, seasonCreatedAt: before },
      { id: "newer", discordRoleId: "r2", seasonCreatedAt: after },
    ];
    expect(staleTeamRoles(teams, now).map((t) => t.id)).toEqual(["old"]);
  });
});
