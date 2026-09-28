import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleOAuthProvider, googleLogout } from "@react-oauth/google";
import {
  ApiError,
  fetchOrderInitiations,
  patchOrderIntent
} from "./api/orderIntents";
import {
  fetchDemandBoard,
  patchSeekerDemandDelivery,
  type DemandBoardSnapshot,
  type SeekerDemandRow
} from "./api/demandBoard";
import { SignInPage } from "./components/SignInPage";
import { SiteHeader } from "./components/SiteHeader";
import {
  clearSession,
  isSessionExpired,
  loadSession,
  saveSession,
  type AuthSession
} from "./authSession";
import { DashboardHeroPanel } from "./components/DashboardHeroPanel";
import { DashboardGroupPanel } from "./components/DashboardGroupPanel";
import { getAppConfig } from "./config";
import { sessionHeaderLabel } from "./sessionRole";
import type { OrderGroupMode } from "./groupOrderIntents";
import type { OrderFeedMeta } from "./feedScope";
import type { OrderInitiation } from "./types";
import { InitiationsView } from "./components/InitiationsView";
import { DashboardNav } from "./components/DashboardNav";
import {
  navigateDashboardView,
  readDashboardViewFromHash,
  type DashboardView
} from "./dashboardNavigation";
import {
  initiationSelectionId,
  mergeInitiationFeed
} from "./initiationFeed";
import { OrderIntentsMap } from "./components/OrderIntentsMap";
import { DemandBoardPanel } from "./components/DemandBoardPanel";
import { useMobileLayout } from "./hooks/useMobileLayout";
import {
  dashboardBoundariesFromApi,
  initiatorNoHandoverLocationNotice,
  feedScopeFromApi,
  type DashboardBoundaries,
  type FeedScope
} from "./feedScope";
import {
  coordinatorScopeToQuery,
  DEFAULT_COORDINATOR_SCOPE,
  demandBoardQueryFromScope,
  EMPTY_ORDER_LIST_QUERY,
  normalizeLocalityKey,
  type CoordinatorScopeFilters,
  type OrderListQuery
} from "./coordinatorScope";
import { DashboardNotificationsBanner } from "./components/DashboardNotificationsBanner";
import { DashboardScopePanel } from "./components/DashboardScopePanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { LocationRequiredDialog } from "./components/LocationRequiredDialog";
import {
  locationRequiredMessage,
  readViewerLocation
} from "./viewerLocation";
import { buildDashboardNotifications } from "./dashboardNotifications";

const appConfig = getAppConfig();

export function App() {
  if (!appConfig.googleClientId) {
    return <AppShell />;
  }
  return (
    <GoogleOAuthProvider clientId={appConfig.googleClientId}>
      <AppShell />
    </GoogleOAuthProvider>
  );
}

function AppShell() {
  const [session, setSession] = useState<AuthSession | null>(() =>
    loadSession()
  );
  const [intents, setIntents] = useState<OrderInitiation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<OrderGroupMode>("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiDashboard, setApiDashboard] = useState<
    "coordinator" | "limited" | null
  >(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<FeedScope | null>(null);
  const [viewerLocationShared, setViewerLocationShared] = useState(false);
  const [areaLoading, setAreaLoading] = useState(false);
  const [locationDialogMessage, setLocationDialogMessage] = useState<
    string | null
  >(null);
  const [dashboardMode, setDashboardMode] = useState<DashboardView>(() =>
    readDashboardViewFromHash()
  );
  const [seekerDemands, setSeekerDemands] = useState<SeekerDemandRow[]>([]);
  const [opsSaving, setOpsSaving] = useState(false);
  const [opsConfirm, setOpsConfirm] = useState<
    | { kind: "payment"; intentId: string }
    | { kind: "delivered"; intentId: string }
    | { kind: "meal_delivered"; seekerDemandId: string }
    | null
  >(null);
  const [opsSuccess, setOpsSuccess] = useState<string | null>(null);
  const [demandRefreshKey, setDemandRefreshKey] = useState(0);
  const [demandBoardSnapshot, setDemandBoardSnapshot] =
    useState<DemandBoardSnapshot | null>(null);
  const [connectionOrderCode, setConnectionOrderCode] = useState<string | null>(
    null
  );
  const [dashboardBoundaries, setDashboardBoundaries] =
    useState<DashboardBoundaries | null>(null);
  const [coordinatorScopeDraft, setCoordinatorScopeDraft] =
    useState<CoordinatorScopeFilters>(DEFAULT_COORDINATOR_SCOPE);
  const [coordinatorScopeApplied, setCoordinatorScopeApplied] =
    useState<CoordinatorScopeFilters>(DEFAULT_COORDINATOR_SCOPE);
  const [coordinatorNearCoords, setCoordinatorNearCoords] = useState<{
    near_lat: number;
    near_lng: number;
  } | null>(null);
  const [scopeApplying, setScopeApplying] = useState(false);
  const isMobileLayout = useMobileLayout();

  const initiationItems = useMemo(
    () => mergeInitiationFeed(intents, seekerDemands),
    [intents, seekerDemands]
  );
  const selectedIntentId = selectedKey?.startsWith("vendor_order:")
    ? selectedKey.slice("vendor_order:".length)
    : null;
  const selected =
    intents.find((row) => row.order_intent_id === selectedIntentId) ?? null;
  const selectedMealNeed = selectedKey?.startsWith("meal_need:")
    ? seekerDemands.find(
        (row) =>
          row.seeker_demand_id === selectedKey.slice("meal_need:".length)
      ) ?? null
    : null;
  const coordinatorView = apiDashboard === "coordinator";
  const showGroupToolbar =
    coordinatorView && intents.length > 0
      ? true
      : apiDashboard === "limited" || (apiDashboard == null && !coordinatorView);
  const coordinatorDemandQuery = useMemo(
    () =>
      coordinatorView || apiDashboard === "limited"
        ? demandBoardQueryFromScope(
            coordinatorScopeApplied,
            coordinatorNearCoords
          )
        : EMPTY_ORDER_LIST_QUERY,
    [
      coordinatorView,
      apiDashboard,
      coordinatorScopeApplied,
      coordinatorNearCoords
    ]
  );

  const loadHistory = useCallback(
    async (active: AuthSession, query: OrderListQuery = {}) => {
    if (isSessionExpired(active)) {
      clearSession();
      setSession(null);
      setError("Your sign-in has expired or is invalid. Please sign out and sign in again.");
      return;
    }

    setLoading(true);
    setError(null);
    setLocationNotice(null);
    setFeedScope(null);
    setViewerLocationShared(
      query.near_lat != null && query.near_lng != null
    );
    try {
      const result = await fetchOrderInitiations(
        appConfig.apiBaseUrl,
        active,
        query
      );
      setIntents(result.intents);
      setApiDashboard(result.dashboard);
      const scope =
        result.dashboard === "limited"
          ? feedScopeFromApi(result.feedMeta)
          : null;
      setFeedScope(scope);
      setDashboardBoundaries(
        dashboardBoundariesFromApi(result.feedMeta, {
          coordinator: result.dashboard === "coordinator"
        })
      );
    } catch (err) {
      setIntents([]);
      setApiDashboard(null);
      setFeedScope(null);
      setSelectedKey(null);
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        setSession(null);
        setError("Your sign-in has expired or is invalid. Please sign out and sign in again.");
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.message} (HTTP ${err.status})`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load order initiations.");
      }
    } finally {
      setLoading(false);
    }
  },
    []
  );

  const loadByAreaWithFreshLocation = useCallback(
    async (active: AuthSession): Promise<boolean> => {
      const location = await readViewerLocation();
      if (location.status !== "granted") {
        setLocationDialogMessage(
          locationRequiredMessage(location.reason)
        );
        return false;
      }
      try {
        await loadHistory(active, {
          near_lat: location.coords.lat,
          near_lng: location.coords.lng
        });
        return true;
      } catch {
        return false;
      }
    },
    [loadHistory]
  );

  const handleDemandBoundariesChange = useCallback(
    (meta: OrderFeedMeta, coordinator: boolean) => {
      setDashboardBoundaries(
        dashboardBoundariesFromApi(meta, { coordinator })
      );
    },
    []
  );

  const handleSessionInvalid = useCallback(() => {
    clearSession();
    setSession(null);
    setIntents([]);
    setSelectedKey(null);
    setError("Your sign-in has expired or is invalid. Please sign out and sign in again.");
  }, []);

  const handleApplyCoordinatorScope = useCallback(async () => {
    if (!session) {
      return;
    }
    setScopeApplying(true);
    try {
      if (coordinatorScopeDraft.areaMode === "locality") {
        const key = normalizeLocalityKey(coordinatorScopeDraft.localityKey);
        if (!key) {
          setLocationDialogMessage(
            "Enter a postal area key (e.g. IN:TN:600001) before applying scope."
          );
          return;
        }
      }
      let nearCoords: { near_lat: number; near_lng: number } | null = null;
      let query = coordinatorScopeToQuery(coordinatorScopeDraft, null);
      if (coordinatorScopeDraft.areaMode === "near") {
        const location = await readViewerLocation();
        if (location.status !== "granted") {
          setLocationDialogMessage(
            locationRequiredMessage(location.reason)
          );
          return;
        }
        nearCoords = {
          near_lat: location.coords.lat,
          near_lng: location.coords.lng
        };
        query = coordinatorScopeToQuery(coordinatorScopeDraft, nearCoords);
      }
      setCoordinatorNearCoords(nearCoords);
      setCoordinatorScopeApplied({ ...coordinatorScopeDraft });
      await loadHistory(session, query);
      setDemandRefreshKey((key) => key + 1);
    } finally {
      setScopeApplying(false);
    }
  }, [session, coordinatorScopeDraft, loadHistory]);

  const handleGroupModeClick = useCallback(
    async (nextMode: OrderGroupMode) => {
      if (!session) {
        return;
      }
      if (nextMode !== "locality") {
        setGroupMode(nextMode);
        await loadHistory(session, {});
        return;
      }

      setAreaLoading(true);
      const ok = await loadByAreaWithFreshLocation(session);
      setAreaLoading(false);
      if (ok) {
        setGroupMode("locality");
      }
    },
    [session, loadHistory, loadByAreaWithFreshLocation]
  );

  const handleRefresh = useCallback(async () => {
    if (!session) {
      return;
    }
    setDemandRefreshKey((key) => key + 1);
    if (dashboardMode === "map" || dashboardMode === "actions") {
      if (coordinatorView || apiDashboard === "limited") {
        await loadHistory(
          session,
          coordinatorScopeToQuery(
            coordinatorScopeApplied,
            coordinatorNearCoords
          )
        );
      }
      return;
    }
    if (coordinatorView || apiDashboard === "limited") {
      await loadHistory(
        session,
        coordinatorScopeToQuery(
          coordinatorScopeApplied,
          coordinatorNearCoords
        )
      );
      return;
    }
    if (groupMode === "locality") {
      setAreaLoading(true);
      await loadByAreaWithFreshLocation(session);
      setAreaLoading(false);
    } else {
      await loadHistory(session, {});
    }
  }, [
    session,
    dashboardMode,
    groupMode,
    coordinatorView,
    apiDashboard,
    coordinatorScopeApplied,
    coordinatorNearCoords,
    loadHistory,
    loadByAreaWithFreshLocation
  ]);

  useEffect(() => {
    if (session) {
      void loadHistory(session, {});
    }
  }, [session, loadHistory]);

  useEffect(() => {
    const syncViewFromHash = () => {
      setDashboardMode(readDashboardViewFromHash());
    };
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (!window.location.hash.replace(/^#\/?/, "").trim()) {
      navigateDashboardView("initiations");
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setDemandBoardSnapshot(null);
      return;
    }
    void fetchDemandBoard(
      appConfig.apiBaseUrl,
      session,
      coordinatorDemandQuery
    )
      .then((board) => {
        setDemandBoardSnapshot(board);
        setSeekerDemands(board.seeker_demands);
      })
      .catch(() => {
        setDemandBoardSnapshot(null);
        setSeekerDemands([]);
      });
  }, [session, coordinatorDemandQuery, demandRefreshKey]);

  const dashboardNotifications = useMemo(
    () =>
      buildDashboardNotifications(demandBoardSnapshot, session?.userId ?? "", {
        coordinator: coordinatorView
      }),
    [demandBoardSnapshot, session?.userId, coordinatorView]
  );

  const handleOpenConnectionFromNotification = useCallback(
    (orderCode: string) => {
      setConnectionOrderCode(orderCode.trim());
      navigateDashboardView("actions");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  const handleOpenInitiationFromConnection = useCallback(
    (seekerDemandId: string) => {
      const id = seekerDemandId.trim();
      if (!id) {
        return;
      }
      navigateDashboardView("initiations");
      setSelectedKey(`meal_need:${id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  useEffect(() => {
    setSelectedKey((prev) => {
      if (
        prev &&
        initiationItems.some((row) => initiationSelectionId(row) === prev)
      ) {
        return prev;
      }
      return initiationItems[0]
        ? initiationSelectionId(initiationItems[0])
        : null;
    });
  }, [initiationItems]);

  const handleMarkPaymentDone = useCallback(async (intentId?: string) => {
    const targetId = intentId ?? selectedIntentId;
    if (!session || !targetId) {
      return;
    }
    setOpsSaving(true);
    try {
      const updated = await patchOrderIntent(
        appConfig.apiBaseUrl,
        session,
        targetId,
        { payment_status: "paid_externally" }
      );
      setIntents((rows) =>
        rows.map((row) =>
          row.order_intent_id === updated.order_intent_id ? updated : row
        )
      );
      setOpsSuccess("Payment marked done — recorded for coordinators.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update payment.");
    } finally {
      setOpsSaving(false);
    }
  }, [session, selectedIntentId]);

  const handleMarkDelivered = useCallback(async (intentId?: string) => {
    const targetId = intentId ?? selectedIntentId;
    if (!session || !targetId || !coordinatorView) {
      return;
    }
    setOpsSaving(true);
    try {
      const updated = await patchOrderIntent(
        appConfig.apiBaseUrl,
        session,
        targetId,
        { delivery_status: "delivered" }
      );
      setIntents((rows) =>
        rows.map((row) =>
          row.order_intent_id === updated.order_intent_id ? updated : row
        )
      );
      setOpsSuccess(
        updated.delivered_at?.trim()
          ? `Marked delivered at ${new Date(updated.delivered_at).toLocaleString()}.`
          : "Marked delivered."
      );
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update delivery."
      );
    } finally {
      setOpsSaving(false);
    }
  }, [session, selectedIntentId, coordinatorView]);

  const handleMarkMealNeedDelivered = useCallback(
    async (seekerDemandId?: string) => {
      const targetId = seekerDemandId ?? selectedMealNeed?.seeker_demand_id;
      if (!session || !targetId || !coordinatorView) {
        return;
      }
      setOpsSaving(true);
      try {
        const updated = await patchSeekerDemandDelivery(
          appConfig.apiBaseUrl,
          session,
          targetId
        );
        setSeekerDemands((rows) =>
          rows.map((row) =>
            row.seeker_demand_id === updated.seeker_demand_id ? updated : row
          )
        );
        setDemandRefreshKey((key) => key + 1);
        setOpsSuccess(
          updated.delivered_at?.trim()
            ? `Eco kitchen order marked delivered at ${new Date(updated.delivered_at).toLocaleString()}.`
            : "Eco kitchen order marked delivered."
        );
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not mark eco-kitchen delivery complete."
        );
      } finally {
        setOpsSaving(false);
      }
    },
    [session, selectedMealNeed, coordinatorView]
  );

  const requestMarkPaymentDone = useCallback((intentId: string) => {
    setOpsConfirm({ kind: "payment", intentId });
  }, []);

  const requestMarkDelivered = useCallback((intentId: string) => {
    setOpsConfirm({ kind: "delivered", intentId });
  }, []);

  const requestMarkMealNeedDelivered = useCallback((seekerDemandId: string) => {
    setOpsConfirm({ kind: "meal_delivered", seekerDemandId });
  }, []);

  const confirmPendingOps = useCallback(async () => {
    if (!opsConfirm) {
      return;
    }
    const pending = opsConfirm;
    setOpsConfirm(null);
    if (pending.kind === "payment") {
      await handleMarkPaymentDone(pending.intentId);
    } else if (pending.kind === "delivered") {
      await handleMarkDelivered(pending.intentId);
    } else {
      await handleMarkMealNeedDelivered(pending.seekerDemandId);
    }
  }, [
    opsConfirm,
    handleMarkPaymentDone,
    handleMarkDelivered,
    handleMarkMealNeedDelivered
  ]);

  function handleSignedIn(next: AuthSession) {
    saveSession(next);
    setSession(next);
    setError(null);
  }

  function handleSignOut() {
    clearSession();
    if (appConfig.googleClientId) {
      googleLogout();
    }
    setSession(null);
    setIntents([]);
    setSelectedKey(null);
    setError(null);
  }

  function handleHome() {
    setSelectedKey(null);
    setError(null);
    navigateDashboardView("initiations");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!session) {
    return <SignInPage config={appConfig} onSignedIn={handleSignedIn} />;
  }

  const viewLabel =
    dashboardMode === "initiations"
      ? "Initiations"
      : dashboardMode === "actions"
        ? "Actions"
        : "Map";

  const dashboardStatusBanners = (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {opsSuccess ? (
        <div className="banner banner-success" role="status">
          {opsSuccess}
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setOpsSuccess(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {locationNotice ? (
        <div className="banner" role="status">
          {locationNotice}
        </div>
      ) : null}

      {apiDashboard === "limited" &&
      dashboardMode === "initiations" &&
      viewerLocationShared &&
      intents.some(
        (row) => row.distance_m == null && row.user_id !== session.userId
      ) ? (
        <div className="banner banner-info" role="status">
          {initiatorNoHandoverLocationNotice()}
        </div>
      ) : null}

      {coordinatorView &&
      dashboardMode === "initiations" &&
      intents.length > 0 &&
      !intents.some((row) => (row.initiator_email ?? row.donor_email)?.trim()) ? (
        <div className="banner" role="status">
          No initiator emails on these rows yet — usually because those
          initiators never signed in with Google (only user ids in the
          database), or integration-service needs the latest deploy with
          email lookup.
        </div>
      ) : null}
    </>
  );

  return (
    <div className="site site--app">
      <SiteHeader
        config={appConfig}
        session={session}
        onRefresh={() => void handleRefresh()}
        onHome={handleHome}
        onSignOut={handleSignOut}
        loading={loading || areaLoading}
      />

      {locationDialogMessage ? (
        <LocationRequiredDialog
          message={locationDialogMessage}
          onClose={() => setLocationDialogMessage(null)}
        />
      ) : null}

      {opsConfirm ? (
        <ConfirmDialog
          title={
            opsConfirm.kind === "payment"
              ? "Mark payment done?"
              : opsConfirm.kind === "meal_delivered"
                ? "Mark eco kitchen delivered?"
                : "Mark delivered?"
          }
          message={
            opsConfirm.kind === "payment"
              ? "Confirm you placed and paid for this meal in the vendor app."
              : opsConfirm.kind === "meal_delivered"
                ? "Confirm handover for this eco-kitchen order is complete. The order will leave Updates once marked delivered."
                : "Confirm handover to the beneficiary is complete. This sets delivery status and stamps Delivered at."
          }
          confirmLabel={
            opsConfirm.kind === "payment"
              ? "Mark payment done"
              : "Mark delivered"
          }
          confirming={opsSaving}
          onCancel={() => setOpsConfirm(null)}
          onConfirm={() => void confirmPendingOps()}
        />
      ) : null}

      <main className="main main-dashboard">
        <div className="dashboard-nav-bar">
          <DashboardNav activeView={dashboardMode} />
        </div>

        <div className="dashboard-body">
          {dashboardMode !== "initiations" && dashboardMode !== "actions" ? (
          <div className="dashboard-meta">
          <DashboardNotificationsBanner
            notifications={dashboardNotifications}
            onOpenConnection={handleOpenConnectionFromNotification}
            defaultExpanded={false}
          />

          {dashboardStatusBanners}

          {(coordinatorView || apiDashboard === "limited") ? (
            <DashboardScopePanel
              variant={coordinatorView ? "coordinator" : "initiator"}
              draft={coordinatorScopeDraft}
              applied={coordinatorScopeApplied}
              onDraftChange={setCoordinatorScopeDraft}
              onApply={() => void handleApplyCoordinatorScope()}
              applying={scopeApplying}
              boundaries={dashboardBoundaries}
              viewLabel={viewLabel}
              defaultExpanded={false}
            />
          ) : null}
          </div>
          ) : null}

          <div className={`dashboard-view dashboard-view--${dashboardMode}`}>
          {dashboardMode === "initiations" ? (
            <>
              <div
                className="dashboard-view-tools"
                aria-label="Initiations overview and filters"
              >
                <DashboardNotificationsBanner
                  notifications={dashboardNotifications}
                  onOpenConnection={handleOpenConnectionFromNotification}
                  defaultExpanded={false}
                />
                {dashboardStatusBanners}
                <DashboardHeroPanel
                  kind={coordinatorView ? "coordinator" : "initiator"}
                  session={session}
                  initiationCount={intents.length}
                />
                {coordinatorView || apiDashboard === "limited" ? (
                  <DashboardScopePanel
                    variant={coordinatorView ? "coordinator" : "initiator"}
                    draft={coordinatorScopeDraft}
                    applied={coordinatorScopeApplied}
                    onDraftChange={setCoordinatorScopeDraft}
                    onApply={() => void handleApplyCoordinatorScope()}
                    applying={scopeApplying}
                    boundaries={dashboardBoundaries}
                    viewLabel={viewLabel}
                    defaultExpanded={false}
                  />
                ) : null}
                {showGroupToolbar ? (
                  <DashboardGroupPanel
                    coordinatorView={coordinatorView}
                    groupMode={groupMode}
                    areaLoading={areaLoading}
                    onSelect={(mode) => void handleGroupModeClick(mode)}
                  />
                ) : null}
              </div>
              <div className="dashboard-workspace">
                <InitiationsView
              isMobileLayout={isMobileLayout}
              loading={loading}
              apiDashboard={apiDashboard}
              feedScope={feedScope}
              viewerLocationShared={viewerLocationShared}
              initiationItems={initiationItems}
              selectedKey={selectedKey}
              coordinatorView={coordinatorView}
              scopeApplied={coordinatorScopeApplied}
              session={session}
              selected={selected}
              selectedMealNeed={selectedMealNeed}
              opsSaving={opsSaving}
              onSelect={setSelectedKey}
              onMarkPaymentDone={requestMarkPaymentDone}
              onMarkDelivered={requestMarkDelivered}
              onMarkMealNeedDelivered={requestMarkMealNeedDelivered}
                />
              </div>
            </>
          ) : dashboardMode === "actions" ? (
            <>
              <div
                className="dashboard-view-tools"
                aria-label="Actions overview and scope"
              >
                <DashboardNotificationsBanner
                  notifications={dashboardNotifications}
                  onOpenConnection={handleOpenConnectionFromNotification}
                  defaultExpanded={false}
                />
                {dashboardStatusBanners}
                {coordinatorView || apiDashboard === "limited" ? (
                  <DashboardScopePanel
                    variant={coordinatorView ? "coordinator" : "initiator"}
                    draft={coordinatorScopeDraft}
                    applied={coordinatorScopeApplied}
                    onDraftChange={setCoordinatorScopeDraft}
                    onApply={() => void handleApplyCoordinatorScope()}
                    applying={scopeApplying}
                    boundaries={dashboardBoundaries}
                    viewLabel={viewLabel}
                    defaultExpanded={false}
                  />
                ) : null}
              </div>
              <div className="dashboard-workspace">
                <DemandBoardPanel
                  session={session}
                  refreshKey={demandRefreshKey}
                  scopeQuery={coordinatorDemandQuery}
                  connectionOrderCode={connectionOrderCode}
                  onSessionInvalid={handleSessionInvalid}
                  onBoundariesChange={handleDemandBoundariesChange}
                  onOpenInitiation={handleOpenInitiationFromConnection}
                />
              </div>
            </>
          ) : (
            <div className="dashboard-workspace">
            <OrderIntentsMap
              intents={intents}
              seekerDemands={seekerDemands}
              selectedId={selectedIntentId}
              onSelect={(orderIntentId) =>
                setSelectedKey(`vendor_order:${orderIntentId}`)
              }
              coordinatorView={coordinatorView}
              viewerUserId={session.userId}
            />
            </div>
          )}
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          SharingBridge · Signed in as {sessionHeaderLabel(session)} ·
          Session kept in this browser until sign-out or expiry
        </p>
      </footer>
    </div>
  );
}
