"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LeaderboardRow {
  id: string;
  name: string;
  clicks: number;
  durationMs: number;
  isSelf?: boolean;
}

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
  emptyMessage?: string;
}

export function LeaderboardTable({ rows, emptyMessage }: LeaderboardTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyMessage ?? "No results yet — be the first."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.id} className={cn(row.isSelf && "bg-accent/60")}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="font-medium">
              {row.name}
              {row.isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.clicks}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDuration(row.durationMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
