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

  it("disables the submit button for a blank/whitespace-only name", () => {
    const onSubmit = vi.fn();
    render(<NameEntryForm fieldId="name" submitLabel="Join" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  });

  it("does not submit a blank/whitespace-only name even if the form is submitted directly", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <NameEntryForm fieldId="name" submitLabel="Join" onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "   " } });
    // The submit button is disabled for this input, so bypass it and submit
    // the form directly to exercise handleSubmit's own guard.
    fireEvent.submit(container.querySelector("form")!);
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
