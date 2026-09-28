import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthSession } from "../authSession";
import { isSessionExpired } from "../authSession";
import { formatUserFacingApiError } from "../apiUserMessage";
import { getAppConfig } from "../config";
import {
  createPledge,
  createVendorBid,
  demandBoardFeedMeta,
  demandLineKey,
  fetchDemandBoard,
  parseDemandLineKey,
  type DemandBoardSnapshot
} from "../api/demandBoard";
import {
  DEFAULT_LINE_DRAFT,
  DemandLineRow,
  type DemandLineDraft
} from "./DemandLineRow";
import { SupplyLedgerPanel } from "./SupplyLedgerPanel";
import { ConnectionLookupPanel } from "./ConnectionLookupPanel";
import {
  ConnectionEmailConsent,
  initialPledgeConsentState
} from "./ConnectionEmailConsent";
import {
  EMPTY_ORDER_LIST_QUERY,
  orderListQueryKey,
  type OrderListQuery
} from "../coordinatorScope";
import type { OrderFeedMeta } from "../feedScope";
import { isCoordinatorSession } from "../sessionRole";
import {
  filterBidsLedger,
  filterDemandLines,
  filterPledgesLedger,
  lineLabelFromKey,
  SUPPLY_STATUS_FILTER_LABELS,
  type SupplyStatusFilter
} from "../supplyFilters";
import { ApiError } from "../api/orderIntents";
import { useMobileLayout } from "../hooks/useMobileLayout";

type Props = {
  session: AuthSession;
  refreshKey?: number;
  scopeQuery?: OrderListQuery;
  connectionOrderCode?: string | null;
  onSessionInvalid?: () => void;
  onBoundariesChange?: (
    meta: OrderFeedMeta,
    coordinator: boolean
  ) => void;
  onOpenInitiation?: (seekerDemandId: string) => void;
};

export function DemandBoardPanel({
  session,
  refreshKey = 0,
  scopeQuery = EMPTY_ORDER_LIST_QUERY,
  connectionOrderCode = null,
  onSessionInvalid,
  onBoundariesChange,
  onOpenInitiation
}: Props) {
  const [snapshot, setSnapshot] = useState<DemandBoardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<Record<string, DemandLineDraft>>(
    {}
  );
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<string[]>([]);
  const [detailLineKey, setDetailLineKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupplyStatusFilter>("all");
  const [ledgerTab, setLedgerTab] = useState<"pledges" | "bids">("pledges");
  const [bulkPledgeUnits, setBulkPledgeUnits] = useState("1");
  const [bulkBidVendor, setBulkBidVendor] = useState("");
  const [bulkBidPortions, setBulkBidPortions] = useState("10");
  const [pledgeEmailConsent, setPledgeEmailConsent] = useState(
    initialPledgeConsentState
  );
  const coordinator = isCoordinatorSession(session);
  const isMobileLayout = useMobileLayout();
  const scopeQueryKey = orderListQueryKey(scopeQuery);
  const onBoundariesChangeRef = useRef(onBoundariesChange);
  onBoundariesChangeRef.current = onBoundariesChange;
  const onSessionInvalidRef = useRef(onSessionInvalid);
  onSessionInvalidRef.current = onSessionInvalid;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const scopeQueryRef = useRef(scopeQuery);
  scopeQueryRef.current = scopeQuery;

  const getDraft = useCallback(
    (lineKey: string): DemandLineDraft =>
      lineDrafts[lineKey] ?? DEFAULT_LINE_DRAFT,
    [lineDrafts]
  );

  const setDraft = useCallback((lineKey: string, draft: DemandLineDraft) => {
    setLineDrafts((prev) => ({ ...prev, [lineKey]: draft }));
  }, []);

  const toggleBulkSelected = useCallback((lineKey: string) => {
    setBulkSelectedKeys((prev) =>
      prev.includes(lineKey)
        ? prev.filter((key) => key !== lineKey)
        : [...prev, lineKey]
    );
  }, []);

  const load = useCallback(async () => {
    const activeSession = sessionRef.current;
    if (isSessionExpired(activeSession)) {
      setError("Your sign-in has expired or is invalid. Please sign out and sign in again.");
      onSessionInvalidRef.current?.();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDemandBoard(
        getAppConfig().apiBaseUrl,
        activeSession,
        scopeQueryRef.current
      );
      setSnapshot(data);
      onBoundariesChangeRef.current?.(
        demandBoardFeedMeta(data),
        isCoordinatorSession(activeSession)
      );
    } catch (err) {
      setSnapshot(null);
      if (err instanceof ApiError && err.status === 401) {
        onSessionInvalidRef.current?.();
      }
      setError(
        formatUserFacingApiError(err, "Could not load the Actions board.")
      );
    } finally {
      setLoading(false);
    }
  }, [scopeQueryKey, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitPledge = useCallback(
    async (lineKey: string, unitsRaw: string) => {
      const line = parseDemandLineKey(lineKey);
      if (!line.standard_offer_id) {
        throw new Error("This demand line has no standard menu item.");
      }
      await createPledge(getAppConfig().apiBaseUrl, session, {
        locality_key: line.locality_key,
        standard_offer_id: line.standard_offer_id,
        meal_units: Math.max(1, Number(unitsRaw) || 1),
        email_share_consent: true
      });
    },
    [session]
  );

  const submitBid = useCallback(
    async (lineKey: string, vendor: string, portionsRaw: string) => {
      const line = parseDemandLineKey(lineKey);
      if (!line.standard_offer_id) {
        throw new Error("This demand line has no standard menu item.");
      }
      await createVendorBid(getAppConfig().apiBaseUrl, session, {
        locality_key: line.locality_key,
        standard_offer_id: line.standard_offer_id,
        vendor_name: vendor.trim(),
        portions: Math.max(1, Number(portionsRaw) || 1),
        email_share_consent: true
      });
    },
    [session]
  );

  const runForLine = useCallback(
    async (lineKey: string, action: "pledge" | "bid") => {
      if (!pledgeEmailConsent) {
        setError(
          action === "pledge"
            ? "Accept email sharing consent above before pledging."
            : "Accept email sharing consent above before recording a kitchen commitment."
        );
        return;
      }
      const draft = getDraft(lineKey);
      setSubmitting(true);
      setError(null);
      try {
        if (action === "pledge") {
          await submitPledge(lineKey, draft.pledgeUnits);
        } else {
          await submitBid(lineKey, draft.bidVendor, draft.bidPortions);
        }
        await load();
      } catch (err) {
        setError(formatUserFacingApiError(err, "Could not save."));
      } finally {
        setSubmitting(false);
      }
    },
    [getDraft, load, pledgeEmailConsent, submitBid, submitPledge]
  );

  const runBulk = useCallback(
    async (action: "pledge" | "bid") => {
      if (!pledgeEmailConsent) {
        setError(
          action === "pledge"
            ? "Accept email sharing consent above before pledging."
            : "Accept email sharing consent above before recording kitchen commitments."
        );
        return;
      }
      if (bulkSelectedKeys.length === 0) {
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        for (const lineKey of bulkSelectedKeys) {
          if (action === "pledge") {
            await submitPledge(lineKey, bulkPledgeUnits);
          } else {
            await submitBid(lineKey, bulkBidVendor, bulkBidPortions);
          }
        }
        setBulkSelectedKeys([]);
        await load();
      } catch (err) {
        setError(formatUserFacingApiError(err, "Bulk action failed."));
      } finally {
        setSubmitting(false);
      }
    },
    [
      bulkBidPortions,
      bulkBidVendor,
      bulkPledgeUnits,
      bulkSelectedKeys,
      load,
      pledgeEmailConsent,
      submitBid,
      submitPledge
    ]
  );

  const demandWindows = snapshot?.demand_windows ?? [];
  const matchedPledges =
    snapshot?.pledges.filter((row) => row.matches_demand_bucket !== false) ??
    [];

  const filteredLines = useMemo(
    () =>
      filterDemandLines(
        demandWindows,
        statusFilter,
        session.userId,
        matchedPledges
      ),
    [demandWindows, statusFilter, session.userId, matchedPledges]
  );

  const ledgerPledges = useMemo(
    () =>
      filterPledgesLedger(
        matchedPledges,
        snapshot?.orphan_pledges ?? [],
        statusFilter,
        session.userId,
        detailLineKey
      ),
    [
      matchedPledges,
      snapshot?.orphan_pledges,
      statusFilter,
      session.userId,
      detailLineKey
    ]
  );

  const ledgerBids = useMemo(
    () =>
      filterBidsLedger(
        snapshot?.vendor_bids ?? [],
        statusFilter,
        detailLineKey
      ),
    [snapshot?.vendor_bids, statusFilter, detailLineKey]
  );

  const selectedLineLabel = detailLineKey
    ? lineLabelFromKey(detailLineKey, demandWindows)
    : null;

  const selectAllVisible = () => {
    setBulkSelectedKeys(filteredLines.map((row) => demandLineKey(row)));
  };

  return (
    <section
      className="supply-workspace"
      aria-label="Actions — pledge and kitchen commit"
    >
      <div className="supply-workspace-chrome">
      <div
        className="supply-filter-bar"
        role="toolbar"
        aria-label="Actions status filters"
      >
        {(Object.keys(SUPPLY_STATUS_FILTER_LABELS) as SupplyStatusFilter[]).map(
          (key) => (
            <button
              key={key}
              type="button"
              className={
                statusFilter === key
                  ? "supply-filter-chip active"
                  : "supply-filter-chip"
              }
              onClick={() => setStatusFilter(key)}
            >
              {SUPPLY_STATUS_FILTER_LABELS[key]}
            </button>
          )
        )}
        {loading ? <span className="badge">Loading…</span> : null}
        <span className="supply-filter-hint">My bids — coming for vendors</span>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <ConnectionEmailConsent
        checked={pledgeEmailConsent}
        onChange={setPledgeEmailConsent}
      />

      <ConnectionLookupPanel
        session={session}
        snapshot={snapshot}
        onSessionInvalid={onSessionInvalid}
        autoLoadOrderCode={connectionOrderCode}
        onOpenInitiation={onOpenInitiation}
        onOpenActionsLine={(lineKey) => {
          setDetailLineKey(lineKey);
          setStatusFilter("all");
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-demand-line-key="${CSS.escape(lineKey)}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }}
      />

      <div
        className="demand-bulk-bar demand-bulk-bar-sticky"
        role="region"
        aria-label="Bulk pledge and kitchen commit"
      >
        <span className="demand-bulk-count">
          {bulkSelectedKeys.length > 0
            ? `${bulkSelectedKeys.length} line${bulkSelectedKeys.length === 1 ? "" : "s"} selected`
            : null}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          disabled={filteredLines.length === 0}
          onClick={selectAllVisible}
        >
          Select rows below
        </button>
        <div className="demand-inline-op">
          <label>
            Bulk units
            <input
              type="number"
              min={1}
              value={bulkPledgeUnits}
              disabled={submitting}
              onChange={(event) => setBulkPledgeUnits(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            disabled={
              submitting || bulkSelectedKeys.length === 0 || !pledgeEmailConsent
            }
            onClick={() => void runBulk("pledge")}
          >
            Bulk pledge
          </button>
        </div>
        {coordinator ? (
          <div className="demand-inline-op">
            <label>
              Kitchen
              <input
                type="text"
                value={bulkBidVendor}
                placeholder="Kitchen name"
                disabled={submitting}
                onChange={(event) => setBulkBidVendor(event.target.value)}
              />
            </label>
            <label>
              Portions
              <input
                type="number"
                min={1}
                value={bulkBidPortions}
                disabled={submitting}
                onChange={(event) => setBulkBidPortions(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={
                submitting ||
                bulkSelectedKeys.length === 0 ||
                !bulkBidVendor.trim() ||
                !pledgeEmailConsent
              }
              onClick={() => void runBulk("bid")}
            >
              Bulk commit
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-compact"
          disabled={submitting || bulkSelectedKeys.length === 0}
          onClick={() => setBulkSelectedKeys([])}
        >
          Clear
        </button>
      </div>
      </div>

      <div
        className={
          isMobileLayout
            ? "supply-split layout-mobile-inline"
            : "supply-split dashboard layout"
        }
      >
        <section className="panel supply-lines-panel" aria-labelledby="supply-lines-heading">
          <div className="panel-head">
            <h3 id="supply-lines-heading">Demand lines</h3>
            <span className="badge">{filteredLines.length} shown</span>
          </div>
          {!snapshot && !loading ? (
            <p className="empty">Could not load actions data.</p>
          ) : filteredLines.length === 0 && !loading ? (
            <p className="empty">
              No demand lines match this filter. Widen scope or choose another
              filter.
            </p>
          ) : (
            <ul className="preset-list demand-bucket-list">
              {filteredLines.map((row) => {
                const key = demandLineKey(row);
                return (
                  <DemandLineRow
                    key={key}
                    row={row}
                    coordinator={coordinator}
                    bulkSelected={bulkSelectedKeys.includes(key)}
                    detailSelected={detailLineKey === key}
                    draft={getDraft(key)}
                    submitting={submitting}
                    pledgeEmailConsent={pledgeEmailConsent}
                    onToggleBulk={() => toggleBulkSelected(key)}
                    onSelectDetail={() =>
                      setDetailLineKey((prev) => (prev === key ? null : key))
                    }
                    onDraftChange={(draft) => setDraft(key, draft)}
                    onPledge={() => void runForLine(key, "pledge")}
                    onBid={() => void runForLine(key, "bid")}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <SupplyLedgerPanel
          ledgerTab={ledgerTab}
          onLedgerTabChange={setLedgerTab}
          pledges={ledgerPledges}
          bids={ledgerBids}
          coordinator={coordinator}
          selectedLineLabel={selectedLineLabel}
        />
      </div>
    </section>
  );
}
