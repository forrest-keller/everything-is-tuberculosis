"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { HowToPlayDialog } from "@/components/how-to-play-dialog";
import { formatDuration } from "@/lib/format";
import { Home, MousePointerClick, RotateCcw, Timer } from "lucide-react";

interface GameHeaderProps {
  clicks: number;
  elapsedMs: number;
  currentTitle: string;
  isRunning: boolean;
  onRestart: () => void;
}

export function GameHeader({
  clicks,
  elapsedMs,
  currentTitle,
  isRunning,
  onRestart,
}: GameHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <Link href="/" className="font-heading text-sm font-semibold whitespace-nowrap">
            Everything is Tuberculosis
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:inline">
              {currentTitle}
            </span>
            <HowToPlayDialog />
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<Link href="/" aria-label="Home" />}
            >
              <Home className="size-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-between gap-2 sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <MousePointerClick className="size-3.5" />
              {clicks} {clicks === 1 ? "click" : "clicks"}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 tabular-nums ${isRunning ? "" : "opacity-60"}`}
            >
              <Timer className="size-3.5" />
              {formatDuration(elapsedMs)}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onRestart} className="gap-1.5">
            <RotateCcw className="size-3.5" />
            Restart
          </Button>
        </div>
      </div>
    </header>
  );
}
