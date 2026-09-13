"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NameEntryForm } from "@/components/name-entry-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { BuyMeACoffeeButton } from "@/components/buy-me-a-coffee-button";
import { createPartySession, fetchPartySessionByCode } from "@/lib/party";
import { getOrCreatePlayerId, getSavedPlayerName, savePlayerName } from "@/lib/player-identity";
import { AlertTriangle, Loader2, Users } from "lucide-react";

export default function PartyLandingPage() {
  const router = useRouter();
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function handleCreate(name: string) {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const playerId = getOrCreatePlayerId();
      savePlayerName(name);
      const session = await createPartySession(name, playerId);
      router.push(`/party/${session.code}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create a session.");
      setCreateBusy(false);
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const session = await fetchPartySessionByCode(trimmed);
      if (!session) {
        setJoinError("No session found with that code.");
        return;
      }
      router.push(`/party/${session.code}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to look up that session.");
    } finally {
      setJoinBusy(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-lg flex-1 px-4 py-16">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <BuyMeACoffeeButton />
        <ThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Users className="size-8 text-primary" />
        <h1 className="font-heading text-2xl font-semibold">Play with Friends</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in the session starts from the same article each round.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="create">
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="create">Create session</TabsTrigger>
              <TabsTrigger value="join">Join session</TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <NameEntryForm
                fieldId="party-create-name"
                defaultName={getSavedPlayerName()}
                submitLabel="Create Session"
                busy={createBusy}
                errorMessage={createError}
                onSubmit={handleCreate}
              />
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="party-join-code">Room code</Label>
                  <Input
                    id="party-join-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="e.g. 7K3QM"
                    autoComplete="off"
                    className="tracking-widest uppercase"
                    disabled={joinBusy}
                  />
                </div>
                {joinError && (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertDescription>{joinError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={joinBusy || !code.trim()} className="w-full gap-2">
                  {joinBusy && <Loader2 className="size-4 animate-spin" />}
                  Continue
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
