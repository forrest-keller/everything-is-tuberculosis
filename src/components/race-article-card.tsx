"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WikiArticle } from "@/components/wiki-article";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RaceState } from "@/hooks/use-wiki-race";

interface RaceArticleCardProps {
  race: Pick<RaceState, "status" | "title" | "html" | "errorMessage">;
  onNavigate: (title: string) => void;
  onRetry: () => void;
}

export function RaceArticleCard({ race, onNavigate, onRetry }: RaceArticleCardProps) {
  if (race.status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (race.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Couldn&apos;t load the article</AlertTitle>
        <AlertDescription>
          <p>{race.errorMessage}</p>
          <Button size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {race.errorMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Couldn&apos;t load that page</AlertTitle>
          <AlertDescription>{race.errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card className="relative overflow-visible">
        {race.status === "navigating" && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-background/60 pt-16 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading next article…
            </div>
          </div>
        )}
        <CardContent
          className={race.status === "navigating" ? "pointer-events-none select-none" : ""}
        >
          <h1 className="mb-4 font-heading text-2xl font-semibold">{race.title}</h1>
          <WikiArticle title={race.title} html={race.html} onNavigate={onNavigate} />
        </CardContent>
      </Card>
    </>
  );
}
