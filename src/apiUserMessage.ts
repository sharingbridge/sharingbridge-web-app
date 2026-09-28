import { ApiError } from "./api/orderIntents";

const BEARER_TOKEN_RE = /bearer token|invalid token|token (is )?(invalid|expired)/i;

/** Map integration-service errors to plain language for dashboard users. */
export function formatUserFacingApiError(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (err instanceof ApiError) {
    if (
      err.status === 401 ||
      err.code === "missing_auth_context" ||
      BEARER_TOKEN_RE.test(err.message)
    ) {
      return "Your sign-in has expired or is invalid. Please sign out and sign in again.";
    }
    if (err.status === 403) {
      return err.message?.trim() || "You do not have permission for this action.";
    }
    if (err.message?.trim()) {
      return err.message;
    }
    return fallback;
  }
  if (err instanceof Error && err.message.trim()) {
    if (BEARER_TOKEN_RE.test(err.message)) {
      return "Your sign-in has expired or is invalid. Please sign out and sign in again.";
    }
    return err.message;
  }
  return fallback;
}
