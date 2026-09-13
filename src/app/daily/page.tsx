"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { NameEntryForm } from "@/components/name-entry-form";
import { GameHeader } from "@/components/game-header";
import { RaceArticleCard } from "@/components/race-article-card";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { BuyMeACoffeeButton } from "@/components/buy-me-a-coffee-button";
import { useWikiRace } from "@/hooks/use-wiki-race";
import {
  type DailyChallenge,
  type DailyScore,
  createDailyAttempt,
  fetchDailyLeaderboard,
  fetchTodayChallenge,
  navigateDailyAttempt,
} from "@/lib/daily";
import { getOrCreatePlayerId, getSavedPlayerName, savePlayerName } from "@/lib/player-identity";
import { AlertTriangle, CalendarDays, PartyPopper } from "lucide-react";

/** Shared shell for every pre-/post-game state on this page (not the active
 * race view, which has its own GameHeader). */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <div className="absolute top-4 left-4">
        <Link href="/" className="font-heading text-sm font-semibold whitespace-nowrap">
          Everything is Tuberculosis
        </Link>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <BuyMeACoffeeButton />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

export default function DailyPage() {
  const race = useWikiRace();
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<{ clicks: number; elapsedMs: number } | null>(
    null,
  );

  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<DailyScore[] | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const refreshLeaderboard = useCallback(async (challengeDate: string) => {
    try {
      const rows = await fetchDailyLeaderboard(challengeDate);
      setLeaderboard(rows);
    } catch (err) {
      setLeaderboardError(err instanceof Error ? err.message : "Failed to load the leaderboard.");
    }
  }, []);

  useEffect(() => {
    fetchTodayChallenge()
      .then((loaded) => {
        setChallenge(loaded);
        void refreshLeaderboard(loaded.challengeDate);
      })
      .catch((err: unknown) =>
        setChallengeError(err instanceof Error ? err.message : "Failed to load today's challenge."),
      );
  }, [refreshLeaderboard]);

  // Proxies every click through the server-tracked attempt: clicks and timing
  // are counted/stamped by the server, never taken from the client. The
  // server writes the finished score row itself the moment the winning click
  // lands, so there's nothing left to submit — just refresh the leaderboard
  // to pick up that row.
  async function navigate(title: string) {
    if (!attemptId || !challenge) throw new Error("No active attempt.");
    const result = await navigateDailyAttempt(attemptId, playerId, title);
    if (result.isTarget && result.elapsedMs !== undefined) {
      setFinalResult({ clicks: result.clicks, elapsedMs: result.elapsedMs });
      void refreshLeaderboard(challenge.challengeDate);
    }
    return result;
  }

  function handleNameSubmit(name: string) {
    if (!challenge) return;
    savePlayerName(name);
    setPlayerName(name);
    setStarted(true);
    setFinalResult(null);
    race.start(async () => {
      const attempt = await createDailyAttempt({ playerId, playerName: name });
      setAttemptId(attempt.attemptId);
      return attempt.article;
    });
  }

  function retryToday() {
    if (!challenge) return;
    setFinalResult(null);
    race.start(async () => {
      const attempt = await createDailyAttempt({ playerId, playerName });
      setAttemptId(attempt.attemptId);
      return attempt.article;
    });
  }

  if (challengeError) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load today&apos;s challenge</AlertTitle>
          <AlertDescription>
            <p>{challengeError}</p>
            <Button size="sm" className="mt-2" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  if (!challenge) {
    return (
      <PageShell>
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!started) {
    return (
      <PageShell>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <CalendarDays className="size-3.5" />
            {challenge.challengeDate}
          </Badge>
          <h1 className="font-heading text-2xl font-semibold">Daily Challenge</h1>
          <p className="text-sm text-muted-foreground">
            Everyone starting today&apos;s challenge begins on the same article. Enter your name to
            see how you rank.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <NameEntryForm
              fieldId="daily-name"
              defaultName={getSavedPlayerName()}
              submitLabel="Start Today's Challenge"
              onSubmit={handleNameSubmit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s leaderboard</CardTitle>
            <CardDescription>Fewest clicks wins; time breaks ties.</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardError && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle />
                <AlertDescription>{leaderboardError}</AlertDescription>
              </Alert>
            )}
            {leaderboard ? (
              <LeaderboardTable
                rows={leaderboard.map((s) => ({
                  id: s.id,
                  name: s.playerName,
                  clicks: s.clicks,
                  durationMs: s.durationMs,
                }))}
              />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (race.status === "won") {
    const myRank = leaderboard?.findIndex((s) => s.playerId === playerId) ?? -1;
    const clicks = finalResult?.clicks ?? race.clicks;
    const elapsedMs = finalResult?.elapsedMs ?? race.elapsedMs;
    return (
      <PageShell>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <PartyPopper className="size-8 text-primary" />
          <h1 className="font-heading text-2xl font-semibold">Nice work, {playerName}!</h1>
          <p className="text-sm text-muted-foreground">
            {clicks} {clicks === 1 ? "click" : "clicks"} · {(elapsedMs / 1000).toFixed(1)}s
            {myRank >= 0 && ` · rank #${myRank + 1} today`}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard ? (
              <LeaderboardTable
                rows={leaderboard.map((s) => ({
                  id: s.id,
                  name: s.playerName,
                  clicks: s.clicks,
                  durationMs: s.durationMs,
                  isSelf: s.playerId === playerId,
                }))}
              />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={retryToday}>
              Try again
            </Button>
            <Button render={<Link href="/" />} nativeButton={false}>
              Back to home
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <GameHeader
        clicks={race.clicks}
        elapsedMs={race.elapsedMs}
        currentTitle={race.title}
        isRunning={race.status === "playing" || race.status === "navigating"}
        onRestart={retryToday}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <RaceArticleCard
          race={race}
          onNavigate={(title) => race.handleNavigate(title, navigate)}
          onRetry={retryToday}
        />
      </main>
    </div>
  );
}
