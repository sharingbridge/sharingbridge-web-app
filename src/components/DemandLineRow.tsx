import { demandLineKey, type DemandWindowRow } from "../api/demandBoard";
import type { AllocationHint } from "../api/demandBoard";
import { formatCatalogPrice } from "../formatCatalogPrice";

export type DemandLineDraft = {
  pledgeUnits: string;
  bidVendor: string;
  bidPortions: string;
};

export const DEFAULT_LINE_DRAFT: DemandLineDraft = {
  pledgeUnits: "1",
  bidVendor: "",
  bidPortions: "10"
};

type Props = {
  row: DemandWindowRow;
  coordinator: boolean;
  bulkSelected: boolean;
  detailSelected: boolean;
  draft: DemandLineDraft;
  submitting: boolean;
  pledgeEmailConsent: boolean;
  onToggleBulk: () => void;
  onSelectDetail: () => void;
  onDraftChange: (next: DemandLineDraft) => void;
  onPledge: () => void;
  onBid: () => void;
};

export function DemandLineRow({
  row,
  coordinator,
  bulkSelected,
  detailSelected,
  draft,
  submitting,
  pledgeEmailConsent,
  onToggleBulk,
  onSelectDetail,
  onDraftChange,
  onPledge,
  onBid
}: Props) {
  const lineKey = demandLineKey(row);
  const canPledge = Boolean(row.standard_offer_id);

  return (
    <li
      data-demand-line-key={lineKey}
      className={`demand-bucket-row${bulkSelected ? " demand-bucket-row-selected" : ""}${detailSelected ? " demand-bucket-row-detail-active" : ""}`}
    >
      <div className="demand-row-grid">
        <label className="demand-line-select" title="Select for bulk actions">
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={onToggleBulk}
            aria-label={`Bulk select ${row.menu_label ?? lineKey}`}
          />
        </label>
        <button
          type="button"
          className="demand-row-summary-btn"
          onClick={onSelectDetail}
        >
          <strong>{row.menu_label ?? row.standard_offer_id ?? "Item"}</strong>
          {row.price_inr != null
            ? ` (${formatCatalogPrice(row.price_inr, row.currency)})`
            : ""}
          <span className="intent-meta">
            @ {row.locality_key} · demand {row.meal_units_total} · pledged{" "}
            {row.pledged_units_total ?? 0} · committed{" "}
            {row.bid_portions_total ?? 0}
            {(row.unmet_demand_units ?? 0) > 0 ? (
              <>
                {" "}
                · <span className="demand-gap">
                  {row.unmet_demand_units} unpledged
                </span>
              </>
            ) : null}
            {(row.supply_gap_units ?? 0) > 0 ? (
              <>
                {" "}
                · <span className="demand-gap">
                  {row.supply_gap_units} short on kitchen capacity
                </span>
              </>
            ) : null}
            {row.allocation_hint ? (
              <>
                {" "}
                ·{" "}
                <span
                  className={`allocation-hint allocation-hint-${row.allocation_hint}`}
                >
                  {allocationHintLabel(row.allocation_hint)}
                </span>
              </>
            ) : null}
          </span>
        </button>
        <div className="demand-row-actions">
          <label className="demand-action-field">
            <span>Units</span>
            <input
              type="number"
              min={1}
              value={draft.pledgeUnits}
              disabled={submitting || !canPledge}
              onChange={(event) =>
                onDraftChange({ ...draft, pledgeUnits: event.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            disabled={submitting || !canPledge || !pledgeEmailConsent}
            onClick={onPledge}
          >
            Pledge
          </button>
          {coordinator ? (
            <>
              <label className="demand-action-field demand-action-field--kitchen">
                <span>Kitchen</span>
                <input
                  type="text"
                  value={draft.bidVendor}
                  placeholder="Kitchen name"
                  disabled={submitting || !canPledge}
                  onChange={(event) =>
                    onDraftChange({ ...draft, bidVendor: event.target.value })
                  }
                />
              </label>
              <label className="demand-action-field">
                <span>Portions</span>
                <input
                  type="number"
                  min={1}
                  value={draft.bidPortions}
                  disabled={submitting || !canPledge}
                  onChange={(event) =>
                    onDraftChange({ ...draft, bidPortions: event.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={
                  submitting ||
                  !canPledge ||
                  !pledgeEmailConsent ||
                  !draft.bidVendor.trim()
                }
                onClick={onBid}
              >
                Commit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function allocationHintLabel(hint: AllocationHint): string {
  switch (hint) {
    case "needs_pledges":
      return "Needs pledges";
    case "needs_vendor_bids":
      return "Needs kitchen commit";
    case "balanced":
      return "Balanced";
    default:
      return hint;
  }
}
