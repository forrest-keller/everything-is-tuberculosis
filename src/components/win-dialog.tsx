"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDuration } from "@/lib/format";
import { MousePointerClick, Timer, PartyPopper } from "lucide-react";

interface WinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clicks: number;
  elapsedMs: number;
  path: string[];
  onPlayAgain: () => void;
}

export function WinDialog({
  open,
  onOpenChange,
  clicks,
  elapsedMs,
  path,
  onPlayAgain,
}: WinDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PartyPopper className="size-5 text-primary" />
            Diagnosis confirmed: it was Tuberculosis
          </DialogTitle>
          <DialogDescription>
            You navigated from a random article all the way to Tuberculosis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 py-3">
            <MousePointerClick className="size-4 text-muted-foreground" />
            <span className="text-2xl font-semibold tabular-nums">{clicks}</span>
            <span className="text-xs text-muted-foreground">
              {clicks === 1 ? "click" : "clicks"}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 py-3">
            <Timer className="size-4 text-muted-foreground" />
            <span className="text-2xl font-semibold tabular-nums">
              {formatDuration(elapsedMs)}
            </span>
            <span className="text-xs text-muted-foreground">time</span>
          </div>
        </div>

        <div>
          <Separator className="mb-2" />
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Your path
          </p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {path.map((title, index) => (
              <div key={`${title}-${index}`} className="flex items-center gap-1.5">
                <Badge variant={index === path.length - 1 ? "default" : "secondary"}>
                  {title}
                </Badge>
                {index < path.length - 1 && (
                  <span className="text-muted-foreground">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="!mx-0 !mb-0 !bg-transparent !p-0 !border-t-0 sm:justify-between">
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Back to home
          </Button>
          <Button onClick={onPlayAgain}>Play again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
