import type { AuthSession } from "../authSession";
import type { CoordinatorScopeFilters } from "../coordinatorScope";
import { coordinatorScopedEmptyListMessage } from "../coordinatorScope";
import type { FeedScope } from "../feedScope";
import { initiatorEmptyListMessage } from "../feedScope";
import type { InitiationFeedItem } from "../initiationFeed";
import { initiationApiRouteLabel } from "../initiationLabels";
import { formatCatalogPrice } from "../formatCatalogPrice";
import type { OrderInitiation } from "../types";
import type { SeekerDemandRow } from "../api/demandBoard";
import { isConnectionOrderInProgress } from "../connectionOrderProgress";
import { InitiationsList } from "./InitiationsList";
import { OrderIntentDetail } from "./OrderIntentDetail";

type Props = {
  isMobileLayout: boolean;
  loading: boolean;
  apiDashboard: "coordinator" | "limited" | null;
  feedScope: FeedScope | null;
  viewerLocationShared: boolean;
  initiationItems: InitiationFeedItem[];
  selectedKey: string | null;
  coordinatorView: boolean;
  scopeApplied: CoordinatorScopeFilters;
  session: AuthSession;
  selected: OrderInitiation | null;
  selectedMealNeed: SeekerDemandRow | null;
  opsSaving: boolean;
  onSelect: (key: string) => void;
  onMarkPaymentDone: (orderIntentId: string) => void;
  onMarkDelivered: (orderIntentId: string) => void;
  onMarkMealNeedDelivered: (seekerDemandId: string) => void;
};

export function InitiationsView({
  isMobileLayout,
  loading,
  apiDashboard,
  feedScope,
  viewerLocationShared,
  initiationItems,
  selectedKey,
  coordinatorView,
  scopeApplied,
  session,
  selected,
  selectedMealNeed,
  opsSaving,
  onSelect,
  onMarkPaymentDone,
  onMarkDelivered,
  onMarkMealNeedDelivered
}: Props) {
  return (
    <div
      className={
        isMobileLayout
          ? "dashboard layout layout-mobile-inline dashboard-view-initiations"
          : "dashboard layout dashboard-view-initiations"
      }
    >
      <section className="panel list-panel" aria-labelledby="list-heading">
        <div className="panel-head">
          <h2 id="list-heading">Initiations</h2>
          {loading ? <span className="badge">Syncing…</span> : null}
        </div>
        <p className="panel-lede">
          Direct orders you pay yourself, and eco kitchen initiations — open
          Actions to pledge or record a kitchen commit.
        </p>
        {initiationItems.length === 0 && !loading ? (
          <p className="empty">
            {apiDashboard === "limited" &&
            scopeApplied.since === "" &&
            scopeApplied.areaMode === "all"
              ? initiatorEmptyListMessage(feedScope, viewerLocationShared)
              : coordinatorScopedEmptyListMessage(scopeApplied)}
          </p>
        ) : (
          <InitiationsList
            items={initiationItems}
            selectedKey={selectedKey}
            showInitiatorInList={coordinatorView}
            coordinatorView={coordinatorView}
            showInlineDetail={isMobileLayout}
            viewerUserId={session.userId}
            opsSaving={opsSaving}
            onSelect={onSelect}
            onMarkPaymentDone={onMarkPaymentDone}
            onMarkDelivered={onMarkDelivered}
          />
        )}
      </section>

      {!isMobileLayout ? (
      <section
        className="panel detail-panel detail-panel-desktop"
        aria-labelledby="detail-heading"
      >
        <h2 id="detail-heading">Initiation detail</h2>
        {selected ? (
          <OrderIntentDetail
            intent={selected}
            coordinatorView={coordinatorView}
            canMarkPaymentDone={
              !coordinatorView &&
              selected.user_id === session.userId &&
              selected.payment_status !== "paid_externally"
            }
            markingPayment={opsSaving}
            onMarkPaymentDone={() => onMarkPaymentDone(selected.order_intent_id)}
            canMarkDelivered={
              coordinatorView && selected.delivery_status !== "delivered"
            }
            markingDelivered={opsSaving}
            onMarkDelivered={() => onMarkDelivered(selected.order_intent_id)}
          />
        ) : selectedMealNeed ? (
          <div className="intent-inline-detail">
            <p>
              <span className="initiation-kind-chip">
                {initiationApiRouteLabel(selectedMealNeed.initiation_route)}
              </span>
            </p>
            <p>
              <strong>
                {selectedMealNeed.menu_label ?? selectedMealNeed.need_description}
              </strong>
              {selectedMealNeed.price_inr != null
                ? ` · ${formatCatalogPrice(
                    selectedMealNeed.price_inr,
                    selectedMealNeed.currency
                  )}`
                : ""}
            </p>
            <p className="intent-metrics">
              {selectedMealNeed.meal_units} meal unit
              {selectedMealNeed.meal_units === 1 ? "" : "s"}
              {selectedMealNeed.locality_key
                ? ` · ${selectedMealNeed.locality_key}`
                : ""}
              {selectedMealNeed.order_code
                ? ` · ${selectedMealNeed.order_code}`
                : ""}
            </p>
            <p>
              {selectedMealNeed.initiation_route === "eco_kitchen_self_pay"
                ? "Eco kitchen · I pay — coordinators commit on Actions. Use Order contacts with the order code after commitment."
                : "Open for pledging — use the Actions tab for pledges and kitchen commits, not direct checkout here."}
            </p>
            {selectedMealNeed.verbal_notes?.trim() ? (
              <p className="intent-meta">{selectedMealNeed.verbal_notes}</p>
            ) : null}
            {coordinatorView && isConnectionOrderInProgress(selectedMealNeed) ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={opsSaving}
                onClick={() =>
                  onMarkMealNeedDelivered(selectedMealNeed.seeker_demand_id)
                }
              >
                {opsSaving ? "Saving…" : "Mark delivered"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="empty">Select an initiation to review handover context.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}
