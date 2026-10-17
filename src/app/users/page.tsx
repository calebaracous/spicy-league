import { PlayerDirectory } from "./_components/player-directory";
import { getPlayerDirectory } from "@/lib/players";

export const metadata = { title: "Players" };

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayerDirectory();

  return (
    <div className="page flex-1 space-y-8 [--page-max:48rem]">
      <header className="space-y-2">
        <h1 className="text-heading">Players</h1>
        <p className="text-muted-foreground">
          Everyone on Spicy League, A–Z. {players.length}{" "}
          {players.length === 1 ? "player" : "players"}.
        </p>
      </header>
      <PlayerDirectory players={players} />
    </div>
  );
}
