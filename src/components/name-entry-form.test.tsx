import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NameEntryForm } from "./name-entry-form";

describe("NameEntryForm", () => {
  it("submits the trimmed name", () => {
    const onSubmit = vi.fn();
    render(<NameEntryForm fieldId="name" submitLabel="Join" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Alice  " } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(onSubmit).toHaveBeenCalledWith("Alice");
  });

  it("does not submit a blank/whitespace-only name", () => {
    const onSubmit = vi.fn();
    render(<NameEntryForm fieldId="name" submitLabel="Join" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefills the default name", () => {
    render(
      <NameEntryForm fieldId="name" submitLabel="Join" defaultName="Bob" onSubmit={vi.fn()} />,
    );
    expect(screen.getByLabelText("Your name")).toHaveValue("Bob");
  });

  it("shows the error message when provided", () => {
    render(
      <NameEntryForm
        fieldId="name"
        submitLabel="Join"
        errorMessage="Name already taken"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("Name already taken")).toBeInTheDocument();
  });

  it("disables the input and submit button while busy", () => {
    render(
      <NameEntryForm
        fieldId="name"
        submitLabel="Join"
        busy
        defaultName="Alice"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Your name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  });

  it("renders extraFields", () => {
    render(
      <NameEntryForm
        fieldId="name"
        submitLabel="Join"
        onSubmit={vi.fn()}
        extraFields={<p>Extra field</p>}
      />,
    );
    expect(screen.getByText("Extra field")).toBeInTheDocument();
  });
});
