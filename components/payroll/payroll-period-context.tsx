"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type PayrollPeriod = {
  id: string;
  period_name: string;
  status: string;
};

type SetPeriodOptions = {
  syncUrl?: boolean;
};

type PayrollPeriodContextValue = {
  periods: PayrollPeriod[];
  periodId: string;
  selectedPeriod: PayrollPeriod | null;
  loading: boolean;
  setPeriodId: (id: string, options?: SetPeriodOptions) => void;
  refreshPeriods: () => Promise<void>;
};

const STORAGE_KEY = "erp.payroll.selected_period_id";
const EDITABLE_STATUS = new Set(["draft", "review"]);

const PayrollPeriodContext = createContext<PayrollPeriodContextValue | null>(null);

function preferredPeriod(periods: PayrollPeriod[]) {
  return (
    periods.find((p) => EDITABLE_STATUS.has(p.status)) ??
    periods.find((p) => p.status !== "cancelled") ??
    periods[0] ??
    null
  );
}

function readUrlPeriodId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("period_id") ?? "";
}

function readStoredPeriodId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function persistPeriodId(id: string, syncUrl: boolean) {
  if (typeof window === "undefined") return;

  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);

  if (!syncUrl) return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("period_id", id);
  else url.searchParams.delete("period_id");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function choosePeriodId(periods: PayrollPeriod[], currentId: string) {
  const valid = (id: string) => !!id && periods.some((p) => p.id === id);
  const urlId = readUrlPeriodId();
  const storedId = readStoredPeriodId();
  if (valid(urlId)) return urlId;
  if (valid(currentId)) return currentId;
  if (valid(storedId)) return storedId;
  return preferredPeriod(periods)?.id ?? "";
}

export function PayrollPeriodProvider({ children }: { children: React.ReactNode }) {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const periodIdRef = useRef("");

  useEffect(() => {
    periodIdRef.current = periodId;
  }, [periodId]);

  const setPeriodId = useCallback((id: string, options?: SetPeriodOptions) => {
    setPeriodIdState(id);
    persistPeriodId(id, options?.syncUrl ?? true);
  }, []);

  const refreshPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json());
      const nextPeriods = (j.data ?? []) as PayrollPeriod[];
      setPeriods(nextPeriods);
      const nextId = choosePeriodId(nextPeriods, periodIdRef.current);
      setPeriodIdState(nextId);
      persistPeriodId(nextId, true);
    } catch {
      setPeriods([]);
      setPeriodIdState("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPeriods();
  }, [refreshPeriods]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      setPeriodIdState(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === periodId) ?? null,
    [periodId, periods],
  );

  const value = useMemo<PayrollPeriodContextValue>(() => ({
    periods,
    periodId,
    selectedPeriod,
    loading,
    setPeriodId,
    refreshPeriods,
  }), [periods, periodId, selectedPeriod, loading, setPeriodId, refreshPeriods]);

  return (
    <PayrollPeriodContext.Provider value={value}>
      {children}
    </PayrollPeriodContext.Provider>
  );
}

export function usePayrollPeriod() {
  const ctx = useContext(PayrollPeriodContext);
  if (!ctx) throw new Error("usePayrollPeriod must be used inside PayrollPeriodProvider");
  return ctx;
}
