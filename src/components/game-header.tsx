"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { HowToPlayDialog } from "@/components/how-to-play-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDuration } from "@/lib/format";
import { MousePointerClick, RotateCcw, Timer } from "lucide-react";

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
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  function handleWordmarkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isRunning) return;
    // Let modified/non-primary clicks (open in new tab, etc.) through as-is —
    // those don't abandon this tab's run.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    setConfirmLeave(true);
  }

  function handleRestartClick() {
    if (isRunning) {
      setConfirmRestart(true);
    } else {
      onRestart();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link
          href="/"
          onClick={handleWordmarkClick}
          className="font-heading text-sm font-semibold whitespace-nowrap"
        >
          Everything is Tuberculosis
        </Link>

        <div className="flex flex-1 flex-wrap items-center gap-2">
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

        <div className="flex items-center gap-2">
          <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:inline">
            {currentTitle}
          </span>
          <HowToPlayDialog />
          <Button variant="outline" size="sm" onClick={handleRestartClick} className="gap-1.5">
            <RotateCcw className="size-3.5" />
            Restart
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave this game?"
        description="Going home will abandon your current run. Your progress won't be saved."
        confirmLabel="Leave"
        onConfirm={() => router.push("/")}
      />

      <ConfirmDialog
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="Restart this game?"
        description="You'll lose your current clicks and time and start over from a new article."
        confirmLabel="Restart"
        onConfirm={onRestart}
      />
    </header>
  );
}
