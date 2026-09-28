import { describe, expect, it } from "vitest";
import { ApiError } from "./api/orderIntents";
import { formatUserFacingApiError } from "./apiUserMessage";

describe("formatUserFacingApiError", () => {
  it("rewrites bearer token errors for non-technical users", () => {
    const err = new ApiError(
      "A valid Bearer token is required.",
      401,
      "missing_auth_context"
    );
    expect(formatUserFacingApiError(err)).toBe(
      "Your sign-in has expired or is invalid. Please sign out and sign in again."
    );
  });

  it("passes through other API messages", () => {
    const err = new ApiError("No matching demand line.", 400);
    expect(formatUserFacingApiError(err)).toBe("No matching demand line.");
  });
});
