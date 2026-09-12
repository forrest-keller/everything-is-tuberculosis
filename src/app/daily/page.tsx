"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { useWikiRace } from "@/hooks/use-wiki-race";
import { fetchArticleByTitle } from "@/lib/wiki-client";
import {
  type DailyChallenge,
  type DailyScore,
  fetchDailyLeaderboard,
  fetchTodayChallenge,
  submitDailyScore,
} from "@/lib/daily";
import { getOrCreatePlayerId, getSavedPlayerName, savePlayerName } from "@/lib/player-identity";
import { AlertTriangle, CalendarDays, PartyPopper } from "lucide-react";

/** Shared shell for every pre-/post-game state on this page (not the active
 * race view, which has its own GameHeader). */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

export default function DailyPage() {
  const race = useWikiRace();
  const [playerId] = useState(() => getOrCreatePlayerId());
  const submittedRef = useRef(false);

  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<DailyScore[] | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        setChallengeError(err instanceof Error ? err.message : "Failed to load today's challenge.")
      );
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (race.status !== "won" || !challenge || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    submitDailyScore({
      challengeDate: challenge.challengeDate,
      playerId,
      playerName,
      clicks: race.clicks,
      durationMs: race.elapsedMs,
      path: race.path,
    })
      .then(() => refreshLeaderboard(challenge.challengeDate))
      .catch((err: unknown) =>
        setLeaderboardError(err instanceof Error ? err.message : "Failed to save your score.")
      )
      .finally(() => setSubmitting(false));
  }, [
    race.status,
    race.clicks,
    race.elapsedMs,
    race.path,
    challenge,
    playerId,
    playerName,
    refreshLeaderboard,
  ]);

  function handleNameSubmit(name: string) {
    if (!challenge) return;
    savePlayerName(name);
    setPlayerName(name);
    setStarted(true);
    submittedRef.current = false;
    race.start(() => fetchArticleByTitle(challenge.startTitle));
  }

  function retryToday() {
    if (!challenge) return;
    submittedRef.current = false;
    race.start(() => fetchArticleByTitle(challenge.startTitle));
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
            Everyone starting today&apos;s challenge begins on the same article. Enter your
            name to see how you rank.
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
    return (
      <PageShell>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <PartyPopper className="size-8 text-primary" />
          <h1 className="font-heading text-2xl font-semibold">Nice work, {playerName}!</h1>
          <p className="text-sm text-muted-foreground">
            {race.clicks} {race.clicks === 1 ? "click" : "clicks"} ·{" "}
            {(race.elapsedMs / 1000).toFixed(1)}s
            {myRank >= 0 && ` · rank #${myRank + 1} today`}
            {submitting && " · saving…"}
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
        <RaceArticleCard race={race} onNavigate={race.handleNavigate} onRetry={retryToday} />
      </main>
    </div>
  );
}
