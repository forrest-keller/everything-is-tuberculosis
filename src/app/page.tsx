import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme-toggle";
import { BuyMeACoffeeButton } from "@/components/buy-me-a-coffee-button";
import { RULES } from "@/lib/rules";
import { CalendarDays, Info, Shuffle, Users } from "lucide-react";

const MODES = [
  {
    href: "/solo",
    icon: Shuffle,
    title: "Solo",
    description: "Jump straight in from a random article.",
    cta: "Play Solo",
    accent: "border-t-primary",
  },
  {
    href: "/daily",
    icon: CalendarDays,
    title: "Daily Challenge",
    description: "Everyone gets the same start article each day. Race for the leaderboard.",
    cta: "Play Today's Challenge",
    accent: "border-t-secondary",
  },
  {
    href: "/party",
    icon: Users,
    title: "Play with Friends",
    description: "Create or join a session — everyone starts the same page each round.",
    cta: "Play with Friends",
    accent: "border-t-destructive",
  },
];

export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <BuyMeACoffeeButton />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Everything is <span className="text-primary">Tuberculosis</span>
          </h1>
          <p className="max-w-lg text-balance font-serif text-muted-foreground">
            No matter where Wikipedia drops you, every article is secretly just a few clicks away
            from Tuberculosis. Prove it — as fast as you can, in as few clicks as possible.
          </p>
        </div>

        <Alert className="mb-6">
          <Info />
          <AlertDescription>
            This is an unofficial fan project and is not affiliated with or endorsed by the
            Wikimedia Foundation. It&apos;s inspired by, but likewise not affiliated with or
            endorsed by, John Green&apos;s book of the same name — check out{" "}
            <a href="https://everythingistb.com/" target="_blank" rel="noopener noreferrer">
              Everything Is Tuberculosis
            </a>{" "}
            for the real story.
          </AlertDescription>
        </Alert>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {MODES.map(({ href, icon: Icon, title, description, cta, accent }) => (
            <Card key={href} className={`flex flex-col border-t-4 ${accent}`}>
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
      </div>
    </div>
  );
}
