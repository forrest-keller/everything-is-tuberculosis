"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RULES } from "@/lib/rules";
import { HelpCircle } from "lucide-react";

export function HowToPlayDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" />
        }
      >
        <HelpCircle className="size-3.5" />
        How to play
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How to play</DialogTitle>
          <DialogDescription>
            Navigate link by link until you reach the &quot;Tuberculosis&quot; article.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {RULES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3 rounded-lg border p-3">
              <Icon className="size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
