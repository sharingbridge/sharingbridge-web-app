import { describe, expect, it } from "vitest";
import { ApiError } from "./api/orderIntents";
import { formatUserFacingApiError } from "./apiUserMessage";

describe("formatUserFacingApiError", () => {
  it("rewrites auth errors with re-login copy and support refs", () => {
    const err = new ApiError(
      "Your sign-in has expired or is invalid. Please sign out and sign in again.",
      401,
      "missing_auth_context",
      "Missing or invalid Bearer token."
    );
    expect(formatUserFacingApiError(err)).toBe(
      "Your sign-in has expired or is invalid. Please sign out and sign in again. " +
        "(Support: HTTP 401 · missing_auth_context · Missing or invalid Bearer token.)"
    );
  });

  it("keeps legacy bearer wording in the support ref", () => {
    const err = new ApiError(
      "A valid Bearer token is required.",
      401,
      "missing_auth_context"
    );
    expect(formatUserFacingApiError(err)).toContain("sign out and sign in again");
    expect(formatUserFacingApiError(err)).toContain("Support:");
    expect(formatUserFacingApiError(err)).toContain("A valid Bearer token is required.");
  });

  it("passes through other API messages", () => {
    const err = new ApiError("No matching demand line.", 400);
    expect(formatUserFacingApiError(err)).toBe("No matching demand line.");
  });
});
