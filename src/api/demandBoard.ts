import { ApiError } from "./orderIntents";
import { formatUserFacingApiError } from "../apiUserMessage";
import type { AuthSession } from "../authSession";
import type { OrderListQuery } from "../coordinatorScope";
import type { OrderFeedMeta } from "../feedScope";

export type AllocationHint =
  | "needs_pledges"
  | "needs_vendor_bids"
  | "balanced";

export type DemandWindowRow = {
  bucket_key?: string;
  locality_key: string;
  standard_offer_id?: string | null;
  menu_label?: string;
  price_inr?: number | null;
  currency?: string | null;
  demand_count: number;
  meal_units_total: number;
  latest_at: string;
  pledged_units_total?: number;
  bid_portions_total?: number;
  unmet_demand_units?: number;
  supply_gap_units?: number;
  allocation_hint?: AllocationHint;
};

export type StandardOfferRow = {
  standard_offer_id: string;
  locality_key: string;
  menu_label: string;
  price_inr?: number | null;
  currency?: string | null;
  created_at: string;
  updated_at: string;
};

export type SeekerDemandRow = {
  seeker_demand_id: string;
  order_code?: string | null;
  initiation_route?: string | null;
  reported_by_user_id?: string | null;
  status: string;
  meal_units: number;
  standard_offer_id?: string | null;
  menu_label?: string;
  price_inr?: number | null;
  currency?: string | null;
  need_description: string;
  verbal_notes?: string;
  location_lat?: number | null;
  location_lng?: number | null;
  locality_key?: string;
  created_at: string;
  updated_at: string;
  /** Set when coordinators mark eco-kitchen delivery complete. */
  delivered_at?: string | null;
};

export type PledgeRow = {
  pledge_id: string;
  pledged_by_user_id?: string;
  locality_key: string;
  standard_offer_id?: string | null;
  menu_label?: string;
  meal_units: number;
  status: string;
  created_at: string;
  matches_demand_bucket?: boolean;
};

export type VendorBidRow = {
  vendor_bid_id: string;
  submitted_by_user_id?: string;
  locality_key: string;
  standard_offer_id?: string | null;
  menu_label?: string;
  vendor_name: string;
  portions: number;
  status: string;
  commitment_status?: string;
  order_code?: string | null;
  seeker_demand_id?: string | null;
  notes?: string;
  created_at: string;
  matches_demand_bucket?: boolean;
};

export type DemandBoardSnapshot = {
  status: string;
  role?: string | null;
  since?: string;
  neighbourhood?: Record<string, unknown>;
  feed?: OrderFeedMeta["feed"];
  message: string;
  standard_offers: StandardOfferRow[];
  demand_windows: DemandWindowRow[];
  active_offer_buckets?: Array<{
    bucket_key: string;
    locality_key: string;
    standard_offer_id: string | null;
    menu_label?: string;
    price_inr?: number | null;
    currency?: string | null;
  }>;
  active_locality_keys?: string[];
  seeker_demands: SeekerDemandRow[];
  pledges: PledgeRow[];
  vendor_bids: VendorBidRow[];
  orphan_pledges?: PledgeRow[];
  orphan_vendor_bids?: VendorBidRow[];
  generated_at: string;
};

export function demandLineKey(row: DemandWindowRow): string {
  return (
    row.bucket_key ??
    `${row.locality_key}::${row.standard_offer_id ?? "legacy"}`
  );
}

export function parseDemandLineKey(key: string): {
  locality_key: string;
  standard_offer_id: string;
} {
  const [locality_key, standard_offer_id] = key.split("::");
  return {
    locality_key: locality_key ?? "",
    standard_offer_id: standard_offer_id === "legacy" ? "" : (standard_offer_id ?? "")
  };
}

async function readApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message?.trim()) {
      return body.message;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export async function createPledge(
  apiBaseUrl: string,
  session: AuthSession,
  body: {
    locality_key: string;
    standard_offer_id: string;
    meal_units: number;
    email_share_consent: boolean;
  }
): Promise<PledgeRow> {
  const response = await fetch(`${apiBaseUrl}/v1/pledges`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new ApiError(
      formatUserFacingApiError(
        new ApiError(
          await readApiErrorMessage(response, "Pledge request failed."),
          response.status
        ),
        "Pledge request failed."
      ),
      response.status
    );
  }
  const data = (await response.json()) as { pledge: PledgeRow };
  return data.pledge;
}

export async function createVendorBid(
  apiBaseUrl: string,
  session: AuthSession,
  body: {
    locality_key: string;
    standard_offer_id: string;
    vendor_name: string;
    portions: number;
    notes?: string;
    email_share_consent: boolean;
  }
): Promise<VendorBidRow> {
  const response = await fetch(`${apiBaseUrl}/v1/vendor-bids`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new ApiError(
      formatUserFacingApiError(
        new ApiError(
          await readApiErrorMessage(response, "Vendor bid request failed."),
          response.status
        ),
        "Vendor bid request failed."
      ),
      response.status
    );
  }
  const data = (await response.json()) as { vendor_bid: VendorBidRow };
  return data.vendor_bid;
}

export function demandBoardFeedMeta(snapshot: DemandBoardSnapshot): OrderFeedMeta {
  return {
    since: snapshot.since,
    neighbourhood: snapshot.neighbourhood,
    feed: snapshot.feed
  };
}

export async function fetchDemandBoard(
  apiBaseUrl: string,
  session: AuthSession,
  query: OrderListQuery = {}
): Promise<DemandBoardSnapshot> {
  const url = new URL(`${apiBaseUrl}/v1/demand/board`);
  if (query.since) {
    url.searchParams.set("since", query.since);
  }
  if (query.near_lat != null && query.near_lng != null) {
    url.searchParams.set("near_lat", String(query.near_lat));
    url.searchParams.set("near_lng", String(query.near_lng));
  }
  if (query.locality_key) {
    url.searchParams.set("locality_key", query.locality_key);
  }
  const response = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    }
  });
  if (!response.ok) {
    let message = "Demand board request failed.";
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        code?: string;
        detail?: string;
      };
      if (body.message) {
        message = body.message;
      }
      code = body.code;
      detail = body.detail;
    } catch {
      // ignore
    }
    const err = new ApiError(message, response.status, code, detail);
    throw new ApiError(
      formatUserFacingApiError(err, "Could not load the Actions board."),
      response.status,
      code,
      detail
    );
  }
  return (await response.json()) as DemandBoardSnapshot;
}

export async function patchSeekerDemandDelivery(
  apiBaseUrl: string,
  session: AuthSession,
  seekerDemandId: string
): Promise<SeekerDemandRow> {
  const response = await fetch(
    `${apiBaseUrl}/v1/seeker-demands/${encodeURIComponent(seekerDemandId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ delivery_status: "delivered" })
    }
  );
  if (!response.ok) {
    let message = "Could not mark eco-kitchen delivery complete.";
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }
  const data = (await response.json()) as { seeker_demand: SeekerDemandRow };
  return data.seeker_demand;
}
