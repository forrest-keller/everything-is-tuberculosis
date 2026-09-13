import { Ban, Link2, Shuffle, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Rule {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const RULES: Rule[] = [
  {
    icon: Shuffle,
    title: "You start somewhere random",
    description: "Every game drops you on a random Wikipedia article. Could be anything.",
  },
  {
    icon: Link2,
    title: "Click your way there",
    description: "Click any link inside the article to jump to the page it points to.",
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
