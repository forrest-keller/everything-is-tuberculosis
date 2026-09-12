import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Ban,
  CalendarDays,
  Link2,
  MousePointerClick,
  Shuffle,
  Stethoscope,
  Users,
} from "lucide-react";

const RULES = [
  {
    icon: Shuffle,
    title: "You start somewhere random",
    description:
      "Every game drops you on a random Wikipedia article. Could be anything.",
  },
  {
    icon: Link2,
    title: "Click your way there",
    description:
      "Click any link inside the article to jump to the page it points to.",
  },
  {
    icon: Ban,
    title: "Only real articles are clickable",
    description:
      "Citations, external links, and non-article pages (categories, files, templates…) are disabled.",
  },
  {
    icon: Stethoscope,
    title: "The diagnosis is always the same",
    description: 'Navigate link by link until you reach the "Tuberculosis" article.',
  },
];

const MODES = [
  {
    href: "/solo",
    icon: Shuffle,
    title: "Solo",
    description: "Jump straight in from a random article. No name, no waiting.",
    cta: "Play Solo",
  },
  {
    href: "/daily",
    icon: CalendarDays,
    title: "Daily Challenge",
    description: "Everyone gets the same start article each day. Race for the leaderboard.",
    cta: "Play Today's Challenge",
  },
  {
    href: "/party",
    icon: Users,
    title: "Play with Friends",
    description: "Create or join a session — everyone starts the same page each round.",
    cta: "Play with Friends",
  },
];

export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <MousePointerClick className="size-3.5" />
            A Wikipedia link-clicking game
          </Badge>
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Everything is <span className="text-primary">Tuberculosis</span>
          </h1>
          <p className="max-w-lg text-balance text-muted-foreground">
            No matter where Wikipedia drops you, every article is secretly just a
            few clicks away from Tuberculosis. Prove it — as fast as you can, in
            as few clicks as possible.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {MODES.map(({ href, icon: Icon, title, description, cta }) => (
            <Card key={href} className="flex flex-col">
              <CardHeader>
                <Icon className="mb-1 size-6 text-primary" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button className="w-full" render={<Link href={href} />} nativeButton={false}>
                  {cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How to play</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {RULES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-3 rounded-lg border p-3">
                <Icon className="size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          We track your clicks and your time — good luck.
        </p>
      </div>
    </div>
  );
}
