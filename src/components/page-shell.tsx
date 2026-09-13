import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { BuyMeACoffeeButton } from "@/components/buy-me-a-coffee-button";

/** Shared shell for every pre-/post-game page (daily, party, party lobby) —
 * keeps the wordmark and the coffee/theme icons pinned to the same corners
 * of the actual viewport rather than a page's own (narrower) content column,
 * so they land in the same place as the active-race GameHeader and the
 * landing page. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex-1 px-4 py-16">
      <div className="absolute top-4 left-4">
        <Link href="/" className="font-heading text-sm font-semibold whitespace-nowrap">
          Everything is Tuberculosis
        </Link>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <BuyMeACoffeeButton />
        <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
