"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { NameEntryForm } from "@/components/name-entry-form";
import { GameHeader } from "@/components/game-header";
import { RaceArticleCard } from "@/components/race-article-card";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { useWikiRace } from "@/hooks/use-wiki-race";
import { fetchArticleByTitle } from "@/lib/wiki-client";
import {
  type PartyPlayer,
  type PartyRoundResult,
  type PartySession,
  advancePartyRound,
  completeRoundIfDone,
  fetchPartyPlayers,
  fetchPartyRoundResults,
  fetchPartySessionByCode,
  joinPartySession,
  setPlayerReady,
  subscribeToPartySession,
  submitRoundResult,
} from "@/lib/party";
import { getOrCreatePlayerId, getSavedPlayerName, savePlayerName } from "@/lib/player-identity";
import { AlertTriangle, Check, Copy, Crown, Loader2, Users } from "lucide-react";

interface PartyRoomProps {
  code: string;
}

export function PartyRoom({ code }: PartyRoomProps) {
  const [playerId] = useState(() => getOrCreatePlayerId());
  const roundNumberRef = useRef(0);

  const [session, setSession] = useState<PartySession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [results, setResults] = useState<PartyRoundResult[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const refreshPlayers = useCallback(async (sessionId: string) => {
    try {
      setPlayers(await fetchPartyPlayers(sessionId));
    } catch {
      // realtime will nudge another refresh soon; not worth surfacing
    }
  }, []);

  const refreshResults = useCallback(async (sessionId: string, roundNumber: number) => {
    try {
      setResults(await fetchPartyRoundResults(sessionId, roundNumber));
    } catch {
      // same as above
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPartySessionByCode(code)
      .then(async (found) => {
        if (cancelled) return;
        if (!found) {
          setNotFound(true);
          return;
        }
        setSession(found);
        roundNumberRef.current = found.roundNumber;
        await Promise.all([
          refreshPlayers(found.id),
          found.roundNumber > 0
            ? refreshResults(found.id, found.roundNumber)
            : Promise.resolve(),
        ]);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load session.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, refreshPlayers, refreshResults]);

  useEffect(() => {
    if (!session) return;
    const sessionId = session.id;
    const channel = subscribeToPartySession(sessionId, {
      onSessionChange: (updated) => {
        setSession(updated);
        roundNumberRef.current = updated.roundNumber;
        setResults([]);
        void refreshResults(sessionId, updated.roundNumber);
      },
      onPlayersChange: () => void refreshPlayers(sessionId),
      onResultsChange: () => void refreshResults(sessionId, roundNumberRef.current),
    });
    return () => {
      channel.unsubscribe();
    };
    // Deliberately keyed on session?.id only: this subscribes once per
    // session and reads fresh values via closures/refs, not on every
    // session update (which would tear down and recreate the socket).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, refreshPlayers, refreshResults]);

  const myPlayer = players.find((p) => p.id === playerId) ?? null;
  const isHost = session?.hostPlayerId === playerId;

  const completeAttemptedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session || session.status !== "playing") return;
    if (players.length === 0 || results.length < players.length) return;
    if (completeAttemptedRef.current === session.roundNumber) return;
    completeAttemptedRef.current = session.roundNumber;
    void completeRoundIfDone(session.id, session.roundNumber);
  }, [session, players, results]);

  const advanceAttemptedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session || session.status !== "round_results") return;
    if (players.length === 0 || !players.every((p) => p.isReady)) return;
    if (advanceAttemptedRef.current === session.roundNumber) return;
    advanceAttemptedRef.current = session.roundNumber;
    void advancePartyRound(code, playerId).catch(() => {
      advanceAttemptedRef.current = null;
    });
  }, [session, players, code, playerId]);

  async function handleJoin(name: string) {
    if (!session) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      savePlayerName(name);
      await joinPartySession(session.id, playerId, name);
      await refreshPlayers(session.id);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join the session.");
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleStartGame() {
    if (!session) return;
    setJoinError(null);
    try {
      await advancePartyRound(code, playerId);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to start the game.");
    }
  }

  const handleRoundWin = useCallback(
    async (result: { clicks: number; durationMs: number; path: string[] }) => {
      if (!session) return;
      await submitRoundResult({
        sessionId: session.id,
        roundNumber: session.roundNumber,
        playerId,
        clicks: result.clicks,
        durationMs: result.durationMs,
        path: result.path,
      });
      await completeRoundIfDone(session.id, session.roundNumber);
    },
    [session, playerId]
  );

  async function handleReadyUp() {
    await setPlayerReady(playerId, true);
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">No session found for code &ldquo;{code}&rdquo;.</p>
        <Button render={<Link href="/party" />} nativeButton={false}>
          Back to Play with Friends
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load this session</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!myPlayer) {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Badge variant="secondary" className="gap-1.5 font-mono tracking-widest">
            {session.code}
          </Badge>
          <h1 className="font-heading text-2xl font-semibold">Join the session</h1>
          <p className="text-sm text-muted-foreground">
            {players.length > 0
              ? `${players.length} ${players.length === 1 ? "player has" : "players have"} already joined.`
              : "Be the first to join."}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <NameEntryForm
              fieldId="party-join-room-name"
              defaultName={getSavedPlayerName()}
              submitLabel="Join Session"
              busy={joinBusy}
              errorMessage={joinError}
              onSubmit={handleJoin}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (session.status === "playing" && session.currentStartTitle) {
    return (
      <PartyRound
        key={`${session.id}-${session.roundNumber}`}
        startTitle={session.currentStartTitle}
        roundNumber={session.roundNumber}
        resultsCount={results.length}
        playersCount={players.length}
        onWin={handleRoundWin}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <PartyCodeBanner code={session.code} />

      {session.status === "lobby" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lobby</CardTitle>
            <CardDescription>
              {isHost ? "Start whenever everyone's in." : "Waiting for the host to start the game."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PlayerList players={players} hostId={session.hostPlayerId} />
            {joinError && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{joinError}</AlertDescription>
              </Alert>
            )}
            {isHost && (
              <Button className="w-full" onClick={handleStartGame}>
                Start Game
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {session.status === "round_results" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Round {session.roundNumber} results</CardTitle>
            <CardDescription>Once everyone&apos;s ready, the next round starts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LeaderboardTable
              rows={results.map((r) => ({
                id: r.id,
                name: players.find((p) => p.id === r.playerId)?.name ?? "Unknown",
                clicks: r.clicks,
                durationMs: r.durationMs,
                isSelf: r.playerId === playerId,
              }))}
              emptyMessage="No one has finished this round yet."
            />
            <Separator />
            <div className="space-y-1.5">
              {players.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  {p.isReady ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Check className="size-3.5" /> ready
                    </span>
                  ) : (
                    <span className="text-muted-foreground">waiting…</span>
                  )}
                </div>
              ))}
            </div>
            {myPlayer.isReady ? (
              <Button className="w-full" disabled>
                <Loader2 className="size-4 animate-spin" />
                Waiting for others…
              </Button>
            ) : (
              <Button className="w-full" onClick={handleReadyUp}>
                Ready for next round
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {session.status === "finished" && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            This session has ended.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PartyCodeBanner({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/party/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable in this context — nothing to do
    }
  }

  return (
    <div className="mb-6 flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <span className="font-mono text-lg font-semibold tracking-[0.3em]">{code}</span>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={copyInviteLink}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied!" : "Copy invite link"}
      </Button>
    </div>
  );
}

function PlayerList({ players, hostId }: { players: PartyPlayer[]; hostId: string }) {
  if (players.length === 0) {
    return <p className="text-sm text-muted-foreground">No one has joined yet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {players.map((p) => (
        <li key={p.id} className="flex items-center gap-1.5 text-sm">
          {p.id === hostId && <Crown className="size-3.5 text-primary" />}
          {p.name}
        </li>
      ))}
    </ul>
  );
}

interface PartyRoundProps {
  startTitle: string;
  roundNumber: number;
  resultsCount: number;
  playersCount: number;
  onWin: (result: { clicks: number; durationMs: number; path: string[] }) => void;
}

function PartyRound({ startTitle, roundNumber, resultsCount, playersCount, onWin }: PartyRoundProps) {
  const race = useWikiRace();
  const firedRef = useRef(false);

  useEffect(() => {
    race.loadInBackground(() => fetchArticleByTitle(startTitle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (race.status === "won" && !firedRef.current) {
      firedRef.current = true;
      void onWin({ clicks: race.clicks, durationMs: race.elapsedMs, path: race.path });
    }
  }, [race.status, race.clicks, race.elapsedMs, race.path, onWin]);

  if (race.status === "won") {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-16 text-center">
        <Check className="mx-auto mb-3 size-8 text-primary" />
        <h1 className="mb-1 font-heading text-2xl font-semibold">You made it!</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {race.clicks} {race.clicks === 1 ? "click" : "clicks"} · {(race.elapsedMs / 1000).toFixed(1)}s
        </p>
        <p className="text-sm text-muted-foreground">
          Waiting for the rest of the group ({resultsCount}/{playersCount} finished)…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <GameHeader
        clicks={race.clicks}
        elapsedMs={race.elapsedMs}
        currentTitle={race.title}
        isRunning={race.status === "playing" || race.status === "navigating"}
        onRestart={() => race.start(() => fetchArticleByTitle(startTitle))}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <p className="mb-3 text-xs text-muted-foreground">Round {roundNumber}</p>
        <RaceArticleCard
          race={race}
          onNavigate={race.handleNavigate}
          onRetry={() => race.start(() => fetchArticleByTitle(startTitle))}
        />
      </main>
    </div>
  );
}
