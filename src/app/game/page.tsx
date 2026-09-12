"use client";

import { useEffect, useState } from "react";
import { GameHeader } from "@/components/game-header";
import { RaceArticleCard } from "@/components/race-article-card";
import { WinDialog } from "@/components/win-dialog";
import { useWikiRace } from "@/hooks/use-wiki-race";
import { fetchRandomArticle } from "@/lib/wiki-client";

export default function GamePage() {
  const race = useWikiRace();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    race.loadInBackground(fetchRandomArticle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = () => {
    setDismissed(false);
    race.start(fetchRandomArticle);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <GameHeader
        clicks={race.clicks}
        elapsedMs={race.elapsedMs}
        currentTitle={race.title}
        isRunning={race.status === "playing" || race.status === "navigating"}
        onRestart={restart}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <RaceArticleCard race={race} onNavigate={race.handleNavigate} onRetry={restart} />
      </main>

      <WinDialog
        open={race.status === "won" && !dismissed}
        onOpenChange={(open) => setDismissed(!open)}
        clicks={race.clicks}
        elapsedMs={race.elapsedMs}
        path={race.path}
        onPlayAgain={restart}
      />
    </div>
  );
}
