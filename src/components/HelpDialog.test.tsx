/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_README_URL } from "../docsLinks";
import { HelpDialog } from "./HelpDialog";

describe("HelpDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("summarizes portal areas and links to the GitHub README", () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);

    expect(
      screen.getByRole("heading", { name: /how sharingbridge works/i })
    ).toBeTruthy();
    expect(screen.getByText("Initiations", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Actions", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Map", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Connection", { selector: "strong" })).toBeTruthy();

    const readme = screen.getByRole("link", { name: /github readme/i });
    expect(readme.getAttribute("href")).toBe(GITHUB_README_URL);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
