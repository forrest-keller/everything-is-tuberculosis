"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";

interface NameEntryFormProps {
  fieldId: string;
  defaultName?: string;
  submitLabel: string;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmit: (name: string) => void;
  extraFields?: ReactNode;
}

export function NameEntryForm({
  fieldId,
  defaultName = "",
  submitLabel,
  busy = false,
  errorMessage,
  onSubmit,
  extraFields,
}: NameEntryFormProps) {
  const [name, setName] = useState(defaultName);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>Your name</Label>
        <Input
          id={fieldId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="e.g. Florence Nightingale"
          autoComplete="off"
          autoFocus
          disabled={busy}
        />
      </div>

      {extraFields}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={busy || !name.trim()} className="w-full gap-2">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
