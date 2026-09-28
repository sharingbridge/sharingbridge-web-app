import { formatWhen } from "../format";
import { formatCatalogPrice } from "../formatCatalogPrice";
import {
  initiationSelectionId,
  type InitiationFeedItem
} from "../initiationFeed";
import type { OrderInitiation } from "../types";
import { initiationApiRouteLabel, initiationKindLabel } from "../initiationLabels";
import { OrderIntentDetail } from "./OrderIntentDetail";

type Props = {
  items: InitiationFeedItem[];
  selectedKey: string | null;
  showInitiatorInList: boolean;
  coordinatorView: boolean;
  showInlineDetail: boolean;
  viewerUserId: string;
  opsSaving?: boolean;
  onSelect: (key: string) => void;
  onMarkPaymentDone?: (orderIntentId: string) => void;
  onMarkDelivered?: (orderIntentId: string) => void;
};

function vendorOrderTitle(intent: OrderInitiation): string {
  const preset = intent.selected_preset;
  if (
    preset &&
    typeof preset.restaurant_name === "string" &&
    preset.restaurant_name.trim()
  ) {
    return preset.restaurant_name.trim();
  }
  const snapshot = intent.presets_snapshot[0];
  if (snapshot?.restaurant_name?.trim()) {
    return snapshot.restaurant_name.trim();
  }
  return intent.pack_id;
}

export function InitiationsList({
  items,
  selectedKey,
  showInitiatorInList,
  coordinatorView,
  showInlineDetail,
  viewerUserId,
  opsSaving,
  onSelect,
  onMarkPaymentDone,
  onMarkDelivered
}: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="intent-list initiation-timeline">
      {items.map((row) => {
        const key = initiationSelectionId(row);
        const selected = selectedKey === key;
        if (row.kind === "vendor_order") {
          const intent = row.intent;
          return (
            <li key={key} className="intent-row-wrap">
              <button
                type="button"
                className={selected ? "intent-row active" : "intent-row"}
                onClick={() => onSelect(key)}
              >
                <span className="initiation-kind-chip">
                  {initiationKindLabel(row.kind)}
                </span>
                <strong>{vendorOrderTitle(intent)}</strong>
                <span className="intent-meta">
                  {showInitiatorInList && intent.initiator_email
                    ? `${intent.initiator_email} · `
                    : ""}
                  {intent.payment_status === "paid_externally"
                    ? "Paid"
                    : "Payment pending"}{" "}
                  · {formatWhen(intent.created_at)}
                </span>
              </button>
              {showInlineDetail && selected ? (
                <div className="intent-inline-detail">
                  <OrderIntentDetail
                    intent={intent}
                    coordinatorView={coordinatorView}
                    compact
                    canMarkPaymentDone={
                      !coordinatorView &&
                      intent.user_id === viewerUserId &&
                      intent.payment_status !== "paid_externally"
                    }
                    markingPayment={opsSaving}
                    onMarkPaymentDone={() =>
                      onMarkPaymentDone?.(intent.order_intent_id)
                    }
                    canMarkDelivered={
                      coordinatorView && intent.delivery_status !== "delivered"
                    }
                    markingDelivered={opsSaving}
                    onMarkDelivered={() =>
                      onMarkDelivered?.(intent.order_intent_id)
                    }
                  />
                </div>
              ) : null}
            </li>
          );
        }

        const demand = row.demand;
        const routeLabel = initiationApiRouteLabel(demand.initiation_route);
        const isSelfPay = demand.initiation_route === "eco_kitchen_self_pay";
        return (
          <li key={key} className="intent-row-wrap">
            <button
              type="button"
              className={selected ? "intent-row active" : "intent-row"}
              onClick={() => onSelect(key)}
            >
              <span className="initiation-kind-chip">{routeLabel}</span>
              <strong>{demand.menu_label ?? demand.need_description}</strong>
              {demand.price_inr != null
                ? ` · ${formatCatalogPrice(demand.price_inr, demand.currency)}`
                : ""}
              <span className="intent-meta">
                {demand.meal_units} unit{demand.meal_units === 1 ? "" : "s"}
                {demand.locality_key ? ` · ${demand.locality_key}` : ""}
                {demand.order_code ? ` · ${demand.order_code}` : ""} ·{" "}
                {formatWhen(demand.created_at)}
              </span>
            </button>
            {showInlineDetail && selected ? (
              <div className="intent-inline-detail">
                <p>
                  {isSelfPay
                    ? "Eco kitchen · I pay — coordinators commit on the Actions tab. After commitment, use Order contacts with this order code to pay off-platform."
                    : "Open for pledging — use the Actions tab to pledge or record a kitchen commitment."}
                </p>
                {demand.verbal_notes?.trim() ? (
                  <p className="intent-meta">{demand.verbal_notes}</p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
