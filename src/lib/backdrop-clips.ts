export type BackdropGame = "lol" | "cs2";

export type BackdropClip = {
  id: string;
  game: BackdropGame;
  /** Still frame shown before the video loads, and instead of it for reduced motion / Save-Data. */
  poster: string;
  /** Ordered by preference (AV1/WebM first, H.264 MP4 last). Empty = poster only. */
  sources: { src: string; type: string }[];
};

// Clips live in public/videos/. Posters are placeholders until real footage is
// encoded — add `sources` to a clip to turn its video on. Footage must be our
// own recordings or official Riot/Valve material (see docs/DESIGN-SYSTEM.md).
const CLIPS: Record<BackdropGame, BackdropClip[]> = {
  lol: [
    { id: "lol-1", game: "lol", poster: "/videos/posters/lol-1.svg", sources: [] },
    { id: "lol-2", game: "lol", poster: "/videos/posters/lol-2.svg", sources: [] },
  ],
  cs2: [
    { id: "cs2-1", game: "cs2", poster: "/videos/posters/cs2-1.svg", sources: [] },
    { id: "cs2-2", game: "cs2", poster: "/videos/posters/cs2-2.svg", sources: [] },
  ],
};

/** The `index`-th clip for a game, cycling when there are fewer clips than rows. */
export function backdropClip(game: BackdropGame, index = 0): BackdropClip {
  const clips = CLIPS[game];
  return clips[index % clips.length];
}

export function otherGame(game: BackdropGame): BackdropGame {
  return game === "lol" ? "cs2" : "lol";
}
