import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History | Spicy League",
  description: "Every Spicy League season, from the beginning.",
};

type SeasonNote = {
  label?: string;
  text: string;
  href?: string;
};

type SeasonImage = {
  src: string;
  alt: string;
};

type Season = {
  number: number;
  label?: string;
  title: string;
  champion: string | null;
  description: string;
  finalsDate: string | null;
  notes: SeasonNote[];
  images: SeasonImage[];
};

const SEASONS: Season[] = [
  {
    number: 10,
    title: "Spicy League Season 10",
    champion: "Team 0% Passion",
    description:
      "24 player captain's draft League of Legends tournament with 6 teams of 4 in a single group round robin into single elim playoffs.",
    finalsDate: "November 17, 2024",
    notes: [{ text: "Captains: jamze, caloxy, futdra, earcky, thenat, taghim" }],
    images: [
      { src: "/history/season-10-img0.png", alt: "Team rosters" },
      { src: "/history/season-10-img1.png", alt: "Group A — Matches" },
      { src: "/history/season-10-img2.png", alt: "Group A — Standings" },
      { src: "/history/season-10-img3.png", alt: "Playoffs" },
    ],
  },
  {
    number: 9.5,
    label: "Special Edition",
    title: "Spicy League Special Zero Space Edition",
    champion: "team future",
    description:
      "16 player captain's draft League of Legends special interim season featuring 4 teams of 4 in a single group round robin into single elim playoffs.",
    finalsDate: "April 14, 2024",
    notes: [],
    images: [
      { src: "/history/season-zs-img0.png", alt: "Team rosters" },
      { src: "/history/season-zs-img1.png", alt: "Group A — Standings" },
      { src: "/history/season-zs-img2.png", alt: "Group A — Matches" },
      { src: "/history/season-zs-img3.png", alt: "Playoffs" },
    ],
  },
  {
    number: 9,
    title: "Spicy League Season 9",
    champion: "Team Jheffe",
    description:
      "40 player captain's draft tournament with 2 four-player groups of double round robin into single elim playoffs.",
    finalsDate: "February 18, 2024",
    notes: [
      { text: "Lucky was voted Finals MVP" },
      { text: "RyanSC2 was voted Most Improved Player" },
      { text: "EGOR was voted Greenest Goblin" },
      {
        text: "Ciki was voted to have had the Best Play of the Finals",
        href: "https://clips.twitch.tv/SmilingReliableWombatDogFace-5zNOoQVZn56S5mkP",
      },
    ],
    images: [
      { src: "/history/season-9-img5.png", alt: "Draft picks" },
      { src: "/history/season-9-img0.png", alt: "Group A — Matches" },
      { src: "/history/season-9-img1.png", alt: "Group A — Standings" },
      { src: "/history/season-9-img2.png", alt: "Group B — Matches" },
      { src: "/history/season-9-img3.png", alt: "Group B — Standings" },
      { src: "/history/season-9-img4.png", alt: "Playoffs" },
    ],
  },
  {
    number: 8,
    title: "Spicy League Season 8",
    champion: "Team Mcanning",
    description:
      "30 player captain's draft CS2 tournament with a $400 prize pool split between first and second.",
    finalsDate: "January 7, 2024",
    notes: [
      {
        text: "The tie between Team Silky and ♥ Pokimane was actually a win for Team Silky, but it was reported as a tie so that seeding into playoffs would go according to tiebreaker rules.",
      },
    ],
    images: [
      { src: "/history/season-8-img3.png", alt: "Team rosters" },
      { src: "/history/season-8-img0.png", alt: "Group stage — Matches" },
      { src: "/history/season-8-img1.png", alt: "Group stage — Standings" },
      { src: "/history/season-8-img2.png", alt: "Playoffs" },
    ],
  },
  {
    number: 7,
    title: "Spicy League: CSGO",
    champion: "Mental Fortitude",
    description: "25 player captain's draft CSGO tournament with a $200 prize pool for first.",
    finalsDate: "September 8, 2023",
    notes: [],
    images: [
      { src: "/history/season-7-img2.png", alt: "Team rosters" },
      { src: "/history/season-7-img0.png", alt: "Group stage — Standings" },
      { src: "/history/season-7-img1.png", alt: "Playoffs" },
    ],
  },
  {
    number: 6,
    title: "Spicy League 3",
    champion: "SEAM TILKY",
    description: "25 player captain's draft League of Legends tournament.",
    finalsDate: "June 26, 2023",
    notes: [],
    images: [],
  },
  {
    number: 5,
    title: "Spicy League 2",
    champion: "Team Early",
    description:
      "35 player captain's draft League of Legends tournament with $250 prize for first.",
    finalsDate: "January 15, 2023",
    notes: [],
    images: [{ src: "/history/season-5-img0.png", alt: "Standings" }],
  },
  {
    number: 4,
    title: "Spicy League: Alpha",
    champion: "Masa's Backpack",
    description:
      "35 player captain's draft League of Legends tournament with $250 prize pool for first place.",
    finalsDate: "April 24, 2022",
    notes: [],
    images: [
      { src: "/history/season-4-img2.png", alt: "Team rosters" },
      { src: "/history/season-4-img0.png", alt: "Standings" },
      { src: "/history/season-4-img1.png", alt: "Masa's Backpack vs. Joe Biden" },
    ],
  },
  {
    number: 3,
    title: "The NA Apprentice: Spicy League 2",
    champion: "Single-Horny Ponies",
    description: "48 player captain's draft StarCraft 2 tournament using Proleague format.",
    finalsDate: "May 16, 2020",
    notes: [],
    images: [
      { src: "/history/season-3-img0.png", alt: "Prize pool" },
      { src: "/history/season-3-img1.png", alt: "Participating teams" },
      { src: "/history/season-3-img2.png", alt: "Group stage standings & playoffs" },
    ],
  },
  {
    number: 2,
    title: "Spicy League: Civil War",
    champion: "Team Minnesota",
    description:
      "StarCraft 2 Olympics-style team league where American players represent their state.",
    finalsDate: "July 8, 2018",
    notes: [],
    images: [
      { src: "/history/season-2-img0.png", alt: "Prize pool" },
      { src: "/history/season-2-img1.png", alt: "Participating teams" },
      { src: "/history/season-2-img2.png", alt: "Results" },
    ],
  },
  {
    number: 1,
    title: "Spicy League: Season 1",
    champion: null,
    description:
      "Captain's draft team league in StarCraft 2 with 70+ signups and a spicy format. Cancelled early.",
    finalsDate: null,
    notes: [],
    images: [
      { src: "/history/season-1-img0.png", alt: "Participating teams" },
      { src: "/history/season-1-img1.png", alt: "Group stage standings" },
    ],
  },
];

export default function HistoryPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-12 space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">History</h1>
        <p className="text-muted-foreground">Every Spicy League season, from the beginning.</p>
      </header>

      <div className="relative">
        {/* vertical timeline line */}
        <div className="bg-border absolute top-0 bottom-0 left-5 w-px" />

        <ol className="space-y-14">
          {SEASONS.map((season) => (
            <li key={season.number} className="relative pl-14">
              {/* dot */}
              <div className="bg-primary border-background absolute top-1 left-3.5 h-3 w-3 -translate-x-1/2 rounded-full border-2" />

              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                    {season.label ?? `Season ${season.number}`}
                  </span>
                  {season.finalsDate ? (
                    <span className="text-muted-foreground text-xs">{season.finalsDate}</span>
                  ) : null}
                </div>

                <h2 className="text-2xl leading-tight font-bold">{season.title}</h2>

                {season.champion ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Champion: </span>
                    <span className="font-semibold">{season.champion}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Season cancelled — no champion crowned.
                  </p>
                )}

                <p className="text-muted-foreground text-sm leading-relaxed">
                  {season.description}
                </p>

                {season.notes.length > 0 ? (
                  <ul className="border-border mt-2 space-y-1 border-l-2 pl-4">
                    {season.notes.map((note, i) => (
                      <li key={i} className="text-muted-foreground text-sm">
                        {note.label ? (
                          <span className="text-foreground font-medium">{note.label}: </span>
                        ) : null}
                        {note.href ? (
                          <a
                            href={note.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2 hover:opacity-80"
                          >
                            {note.text}
                          </a>
                        ) : (
                          note.text
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {season.images.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {season.images.map((img) => (
                      <figure key={img.src}>
                        <div className="overflow-x-auto rounded-lg border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.src}
                            alt={img.alt}
                            loading="lazy"
                            className="h-auto max-h-[600px] w-auto min-w-full object-contain"
                          />
                        </div>
                        <figcaption className="text-muted-foreground mt-1 pl-1 text-xs">
                          {img.alt}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
