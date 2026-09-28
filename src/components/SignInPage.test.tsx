/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_README_URL } from "../docsLinks";
import { SignInPage } from "./SignInPage";
import type { AppConfig } from "../config";

const pickGoogleAccount = vi.fn();

vi.mock("@react-oauth/google", () => ({
  googleLogout: vi.fn(),
  useGoogleOAuth: () => ({
    clientId: "test-client-id",
    scriptLoadedSuccessfully: true
  }),
  useGoogleLogin: vi.fn(() => pickGoogleAccount)
}));

const baseConfig: AppConfig = {
  apiBaseUrl: "http://localhost:3001",
  userServiceBaseUrl: "http://localhost:3000",
  googleClientId: "test-client-id",
  googleMapsApiKey: ""
};

describe("SignInPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    pickGoogleAccount.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Google sign-in, README link, and Help", () => {
    render(<SignInPage config={baseConfig} onSignedIn={vi.fn()} />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByText(/coordinator/i)).toBeNull();
    expect(screen.getByText(/new here\?/i)).toBeTruthy();

    const readme = screen.getByRole("link", { name: /read the github readme/i });
    expect(readme.getAttribute("href")).toBe(GITHUB_README_URL);

    fireEvent.click(screen.getByRole("button", { name: /^help$/i }));
    expect(
      screen.getByRole("heading", { name: /how sharingbridge works/i })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(pickGoogleAccount).toHaveBeenCalledWith({ prompt: "select_account" });
  });
});
