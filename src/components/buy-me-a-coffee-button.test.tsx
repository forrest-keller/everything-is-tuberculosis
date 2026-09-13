import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BuyMeACoffeeButton } from "./buy-me-a-coffee-button";

describe("BuyMeACoffeeButton", () => {
  it("links out to the buymeacoffee page in a new tab", () => {
    render(<BuyMeACoffeeButton />);
    const link = screen.getByRole("button", { name: "Buy me a coffee" });
    expect(link).toHaveAttribute("href", "https://buymeacoffee.com/forrestbkeller");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
