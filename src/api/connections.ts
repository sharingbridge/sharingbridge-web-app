import { ApiError } from "./orderIntents";
import { formatUserFacingApiError } from "../apiUserMessage";
import type { AuthSession } from "../authSession";

export type ConnectionStatus = "ready" | "pending_kitchen";

export type ConnectionViewerRole =
  | "initiator"
  | "pledger"
  | "kitchen"
  | "coordinator";

export type OrderConnection = {
  order_code: string;
  status: ConnectionStatus;
  initiation_route: string;
  viewer_role: ConnectionViewerRole;
  safety_copy: string;
  menu_label: string;
  meal_units: number | null;
  price_inr: number | null;
  /** ISO 4217; amount is `price_inr` (historical column name). */
  currency?: string | null;
  locality_key: string;
  seeker_demand_id: string | null;
  demand?: {
    seeker_demand_id: string;
    status: string;
    need_description: string;
    verbal_notes: string;
    location_label: string;
    standard_offer_id: string | null;
    recorded_at: string;
  } | null;
  kitchen?: {
    display_name: string;
    login_email?: string | null;
    commitment_status?: string;
  } | null;
  counterparty_email?: string | null;
  initiator?: { login_email: string | null } | null;
  pledgers?: Array<{
    pledged_by_user_id: string | null;
    meal_units: number;
    login_email: string | null;
  }>;
};

export async function fetchOrderConnection(
  apiBaseUrl: string,
  session: AuthSession,
  orderCode: string
): Promise<OrderConnection> {
  const trimmed = orderCode.trim();
  const response = await fetch(
    `${apiBaseUrl}/v1/connections/${encodeURIComponent(trimmed)}`,
    {
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json"
      }
    }
  );
  if (!response.ok) {
    let message = "Could not load connection for this order.";
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        code?: string;
      };
      if (body.message) {
        message = body.message;
      }
      code = body.code;
    } catch {
      // ignore
    }
    const err = new ApiError(message, response.status, code);
    throw new ApiError(
      formatUserFacingApiError(err, "Could not load connection for this order."),
      response.status,
      code
    );
  }
  const data = (await response.json()) as { connection: OrderConnection };
  return data.connection;
}
