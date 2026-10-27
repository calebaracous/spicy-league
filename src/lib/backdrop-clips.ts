export type BackdropGame = "lol" | "cs2";

export type BackdropClip = {
  id: string;
  game: BackdropGame;
  /** Still frame shown before the video loads, and instead of it for reduced motion / Save-Data. */
  poster: string;
  /** Ordered by preference (AV1/WebM first, H.264 MP4 last). Empty = poster only. */
  sources: { src: string; type: string }[];
};

/** WebM (AV1) then MP4 (H.264) for `public/videos/<id>.*`. Codec strings let
 * browsers without AV1 skip straight to the MP4. */
function loopSources(id: string): BackdropClip["sources"] {
  return [
    { src: `/videos/${id}.webm`, type: 'video/webm; codecs="av01.0.05M.08"' },
    { src: `/videos/${id}.mp4`, type: 'video/mp4; codecs="avc1.64001F"' },
  ];
}

// Clips live in public/videos/. CS2 posters are placeholders until real footage
// is encoded — add `sources` to a clip to turn its video on. Footage must be our
// own recordings or official Riot/Valve material (see docs/DESIGN-SYSTEM.md).
const CLIPS: Record<BackdropGame, BackdropClip[]> = {
  lol: [
    {
      id: "lol-1",
      game: "lol",
      poster: "/videos/posters/lol-1.jpg",
      sources: loopSources("lol-1"),
    },
    {
      id: "lol-2",
      game: "lol",
      poster: "/videos/posters/lol-2.jpg",
      sources: loopSources("lol-2"),
    },
    {
      id: "lol-3",
      game: "lol",
      poster: "/videos/posters/lol-3.jpg",
      sources: loopSources("lol-3"),
    },
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

/**
 * Still placeholder art instead of footage, for rows that should stay calm
 * (the "Signups open" row). LoL uses the original pre-footage poster; CS2's
 * clips are still placeholders anyway.
 */
export function placeholderBackdrop(game: BackdropGame): BackdropClip {
  return game === "lol"
    ? { id: "lol-placeholder", game, poster: "/videos/posters/lol-placeholder.svg", sources: [] }
    : CLIPS.cs2[1];
}

export function otherGame(game: BackdropGame): BackdropGame {
  return game === "lol" ? "cs2" : "lol";
}
