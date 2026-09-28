import { ApiError } from "./api/orderIntents";

const BEARER_TOKEN_RE = /bearer token|invalid token|token (is )?(invalid|expired)/i;
const RELOGIN_MESSAGE =
  "Your sign-in has expired or is invalid. Please sign out and sign in again.";

function authReloginWithSupport(parts: {
  status?: number;
  code?: string | null;
  detail?: string | null;
}): string {
  const support: string[] = [];
  if (parts.status != null) {
    support.push(`HTTP ${parts.status}`);
  }
  const code = parts.code?.trim();
  if (code) {
    support.push(code);
  }
  const detail = parts.detail?.trim();
  if (
    detail &&
    detail.toLowerCase() !== RELOGIN_MESSAGE.toLowerCase() &&
    !detail.toLowerCase().startsWith("your sign-in has expired")
  ) {
    support.push(detail);
  }
  if (support.length === 0) {
    return RELOGIN_MESSAGE;
  }
  return `${RELOGIN_MESSAGE} (Support: ${support.join(" · ")})`;
}

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
      return authReloginWithSupport({
        status: err.status,
        code: err.code,
        detail: err.reason || err.message
      });
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
      return authReloginWithSupport({ detail: err.message });
    }
    return err.message;
  }
  return fallback;
}
