import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/forrestbkeller";

export function BuyMeACoffeeButton() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Buy me a coffee"
      nativeButton={false}
      render={<a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noopener noreferrer" />}
    >
      <Coffee className="size-4" />
    </Button>
  );
}
