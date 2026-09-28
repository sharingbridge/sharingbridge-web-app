import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthSession } from "../authSession";
import { fetchOrderConnection, type OrderConnection } from "../api/connections";
import type { DemandBoardSnapshot } from "../api/demandBoard";
import { getAppConfig } from "../config";
import { CONNECTION_SAFETY_COPY } from "../connectionCopy";
import { formatUserFacingApiError } from "../apiUserMessage";
import { isSessionExpired } from "../authSession";
import { formatCatalogPrice } from "../formatCatalogPrice";
import { CollapsiblePanel } from "./CollapsiblePanel";
import {
  orderContactsArrivalSignature,
  orderContactsCollapsedSummary,
  orderContactsHighlightCollapsed,
  summarizeOrderContactsFromSnapshot
} from "../orderContactBoardSummary";

import {
  actionsDemandLineKey,
  connectionInitiationSummary,
  formatDemandStatus,
  orderContactChipLabel
} from "../connectionDemandContext";
import { initiationApiRouteLabel } from "../initiationLabels";

type Props = {
  session: AuthSession;
  snapshot: DemandBoardSnapshot | null;
  onSessionInvalid?: () => void;
  autoLoadOrderCode?: string | null;
  onOpenInitiation?: (seekerDemandId: string) => void;
  onOpenActionsLine?: (lineKey: string) => void;
};

export function ConnectionLookupPanel({
  session,
  snapshot,
  onSessionInvalid,
  autoLoadOrderCode = null,
  onOpenInitiation,
  onOpenActionsLine
}: Props) {
  const [orderCodeInput, setOrderCodeInput] = useState("");
  const [connection, setConnection] = useState<OrderConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactBoard = useMemo(
    () => summarizeOrderContactsFromSnapshot(snapshot),
    [snapshot]
  );
  const knownCodes = useMemo(
    () => [...contactBoard.readyCodes, ...contactBoard.waitingCodes],
    [contactBoard]
  );
  const arrivalSignature = orderContactsArrivalSignature(contactBoard);

  const loadConnection = useCallback(
    async (orderCode: string) => {
      const trimmed = orderCode.trim();
      if (!trimmed) {
        setError("Enter an order code (for example SB-7K2M-9F3).");
        return;
      }
      if (isSessionExpired(session)) {
        setError("Your sign-in has expired or is invalid. Please sign out and sign in again.");
        onSessionInvalid?.();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOrderConnection(
          getAppConfig().apiBaseUrl,
          session,
          trimmed
        );
        setConnection(data);
        setOrderCodeInput(trimmed);
      } catch (err) {
        setConnection(null);
        setError(
          formatUserFacingApiError(
            err,
            "Could not load order contacts for this order."
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [session, onSessionInvalid]
  );

  useEffect(() => {
    const code = autoLoadOrderCode?.trim();
    if (!code) {
      return;
    }
    void loadConnection(code);
  }, [autoLoadOrderCode, loadConnection]);

  return (
    <CollapsiblePanel
      title="Order contacts"
      collapsedSummary={orderContactsCollapsedSummary(contactBoard, loading)}
      highlightCollapsed={orderContactsHighlightCollapsed(contactBoard)}
      arrivalSignature={arrivalSignature}
      expandedRevision={autoLoadOrderCode}
      defaultExpanded={Boolean(autoLoadOrderCode?.trim())}
      storageKey="actions-connection"
      className="connection-panel panel"
      ariaLabel="Order contacts"
    >
      <p className="connection-panel-lede">
        After an eco kitchen commits, look up the order code here to see login
        emails for off-platform payment and delivery. We never send payment links
        or QR codes by email.
      </p>

      <div className="connection-lookup-row">
        <label className="connection-lookup-field">
          Order code
          <input
            type="text"
            value={orderCodeInput}
            placeholder="SB-7K2M-9F3"
            disabled={loading}
            onChange={(event) => setOrderCodeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadConnection(orderCodeInput);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          disabled={loading || !orderCodeInput.trim()}
          onClick={() => void loadConnection(orderCodeInput)}
        >
          {loading ? "Loading…" : "View contacts"}
        </button>
      </div>

      {knownCodes.length > 0 ? (
        <div className="connection-quick-codes">
          <span className="connection-quick-label">Recent orders:</span>
          {knownCodes.map((code) => (
            <button
              key={code}
              type="button"
              className="connection-code-chip"
              disabled={loading}
              title={orderContactChipLabel(code, snapshot)}
              onClick={() => void loadConnection(code)}
            >
              {orderContactChipLabel(code, snapshot)}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {connection ? (
        <div className="connection-detail" role="status">
          <div className="connection-detail-code">
            <strong>{connection.order_code}</strong>
            <span className="badge">
              {connection.status === "ready"
                ? "Contacts ready"
                : "Waiting for kitchen"}
            </span>
            {connection.demand?.status ? (
              <span className="badge badge-muted">
                {formatDemandStatus(connection.demand.status)}
              </span>
            ) : null}
          </div>

          {connection.demand || connection.menu_label ? (
            <section
              className="connection-demand-context"
              aria-label="Original initiation"
            >
              <h3 className="connection-demand-heading">Original initiation</h3>
              <p>
                <span className="initiation-kind-chip">
                  {initiationApiRouteLabel(connection.initiation_route)}
                </span>
              </p>
              {(() => {
                const ctx = connectionInitiationSummary(connection);
                return (
                  <>
                    <p className="connection-demand-headline">
                      <strong>{ctx.headline}</strong>
                      {connection.meal_units != null
                        ? ` · ${connection.meal_units} meal unit${connection.meal_units === 1 ? "" : "s"}`
                        : ""}
                      {connection.price_inr != null
                        ? ` · ${formatCatalogPrice(
                            connection.price_inr,
                            connection.currency
                          )}`
                        : ""}
                    </p>
                    {ctx.area ? (
                      <p className="intent-meta">
                        <strong>Area:</strong> {ctx.area}
                      </p>
                    ) : null}
                    {ctx.recordedAt ? (
                      <p className="intent-meta">
                        <strong>Recorded:</strong> {ctx.recordedAt}
                      </p>
                    ) : null}
                    {ctx.notes ? (
                      <p className="intent-meta">
                        <strong>Notes:</strong> {ctx.notes}
                      </p>
                    ) : null}
                  </>
                );
              })()}
              <div className="connection-demand-links">
                {connection.demand?.seeker_demand_id && onOpenInitiation ? (
                  <button
                    type="button"
                    className="btn btn-link btn-compact"
                    onClick={() =>
                      onOpenInitiation(connection.demand!.seeker_demand_id)
                    }
                  >
                    View on Initiations
                  </button>
                ) : null}
                {onOpenActionsLine &&
                actionsDemandLineKey(connection) != null ? (
                  <button
                    type="button"
                    className="btn btn-link btn-compact"
                    onClick={() =>
                      onOpenActionsLine(actionsDemandLineKey(connection)!)
                    }
                  >
                    Show on Actions board
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {connection.status === "ready" ? (
            <section
              className="connection-contacts-block"
              aria-label="Contact emails"
            >
              <h3 className="connection-demand-heading">Contact emails</h3>
              {connection.kitchen?.display_name ? (
                <p>
                  <strong>Eco kitchen:</strong> {connection.kitchen.display_name}
                </p>
              ) : null}
              {connection.counterparty_email ? (
                <p>
                  <strong>Kitchen login email:</strong>{" "}
                  <a href={`mailto:${connection.counterparty_email}`}>
                    {connection.counterparty_email}
                  </a>
                </p>
              ) : null}
              {connection.initiator?.login_email ? (
                <p>
                  <strong>Initiator login email:</strong>{" "}
                  <a href={`mailto:${connection.initiator.login_email}`}>
                    {connection.initiator.login_email}
                  </a>
                </p>
              ) : null}
              {connection.pledgers && connection.pledgers.length > 0 ? (
                <div>
                  <strong>Pledgers</strong>
                  <ul className="connection-pledger-list">
                    {connection.pledgers.map((row) => (
                      <li key={`${row.pledged_by_user_id}-${row.meal_units}`}>
                        {row.login_email ?? "—"} · {row.meal_units} unit
                        {row.meal_units === 1 ? "" : "s"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : (
            <p>
              No eco kitchen has committed to this order yet. You will see
              contact emails here once a kitchen commitment is recorded.
            </p>
          )}

          <p className="connection-safety">{CONNECTION_SAFETY_COPY}</p>
        </div>
      ) : null}
    </CollapsiblePanel>
  );
}
