"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { AuditLogEntry } from "@/app/api/audit-logs/route";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { apiFetch } from "@/lib/api";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { withImageWidth } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { wfIconSlotId } from "@/lib/brand-theme";
import { BrandSlot } from "@/components/brand-theme/slots";
import { BrandThemedShell, useBrandTheme } from "@/components/brand-theme/provider";
import { BrandThemeBuilder } from "@/components/brand-theme-builder";

const WorkflowStatusManager = dynamic(
  () => import("@/components/workflow-status-manager").then((mod) => mod.WorkflowStatusManager),
  { ssr: false }
);
// popup รายละเอียดงาน = ของกลาง design-sheet-detail โหมด "เฉพาะ popup" (โหลดเฉพาะตอนเปิดการ์ด ไม่ถ่วงบอร์ด)
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });

type Tone = "danger" | "warn" | "good" | "done" | "normal";

type ListResponse = { data: DesignSheetListItem[]; total: number; error: string | null };
type StatusResponse = { data: WfStatusRow[]; error: string | null };
type AuditResponse = { data: AuditLogEntry[]; total: number; error: string | null };
type MoveMessage = { type: "success" | "error"; text: string };

type BrandSummary = {
  key: string;
  id: string | null;
  name: string;
  color: string;
  total: number;
  active: number;
  urgent: number;
};

type StatusColumn = {
  key: string;
  label: string;
  color: string;
  old?: boolean;
};

const DEFAULT_BRAND_COLOR = "#94a3b8";
const DASHBOARD_LIMIT = 500;

async function readApi<T extends { error: string | null }>(response: Response, fallbackMessage: string): Promise<T> {
  const json = await response.json() as T;
  if (!response.ok || json.error) throw new Error(json.error || fallbackMessage);
  return json;
}

function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_BRAND_COLOR;
}

function brandKeyOf(sheet: DesignSheetListItem): string {
  return sheet.brand_id ?? "__no_brand__";
}

function brandNameOf(sheet: DesignSheetListItem): string {
  return sheet.brand_name ?? "ไม่ระบุแบรนด์";
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function isUrgent(sheet: DesignSheetListItem, statusMeta: StatusMeta): boolean {
  if (statusMeta.finished.has(sheet.status)) return false;
  const days = daysUntil(sheet.deadline);
  return days !== null && days <= 2;
}

function deadlineTone(sheet: DesignSheetListItem, statusMeta: StatusMeta): Tone {
  if (statusMeta.finished.has(sheet.status)) return sheet.status === "sku_created" ? "done" : "good";
  const days = daysUntil(sheet.deadline);
  if (days === null) return "normal";
  if (days <= 0) return "danger";
  if (days <= 2) return "warn";
  return "normal";
}

function deadlineLabel(sheet: DesignSheetListItem, statusMeta: StatusMeta): string {
  if (statusMeta.finished.has(sheet.status)) return "ปิดงาน";
  const days = daysUntil(sheet.deadline);
  if (days === null) return "ไม่มีกำหนด";
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`;
  if (days === 0) return "วันนี้";
  if (days === 1) return "พรุ่งนี้";
  return `${days} วัน`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function auditActionLabel(action: string): string {
  if (action === "create") return "สร้าง";
  if (action === "update") return "แก้ไข";
  if (action === "delete") return "ลบ";
  if (action === "archive") return "เก็บเข้ากรุ";
  if (action === "restore") return "กู้คืน";
  return action;
}

function auditText(row: AuditLogEntry): string {
  const metadata = row.metadata ?? {};
  const code = typeof metadata.code === "string" ? metadata.code : null;
  const name = typeof metadata.name === "string" ? metadata.name : null;
  const label = code || name || row.entity_id?.slice(0, 8) || "รายการ";
  return `${auditActionLabel(row.action)} ${label}`;
}

function sheetCoverUrl(sheet: DesignSheetListItem): string | null {
  return withImageWidth(sheet.cover_url, 220);
}

function CardDeadline({ tone, label }: { tone: Tone; label: string }) {
  const styles: Record<Tone, string> = {
    danger: "bg-rose-500 text-rose-700",
    warn: "bg-amber-500 text-amber-700",
    good: "bg-emerald-500 text-emerald-700",
    done: "bg-violet-500 text-violet-700",
    normal: "bg-slate-300 text-slate-500",
  };
  const [dot, text] = styles[tone].split(" ");
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}



function LoadingCard() {
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-8 w-14 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

export function DesignDashboard() {
  const [sheets, setSheets] = useState<DesignSheetListItem[]>([]);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedBrandKey, setSelectedBrandKey] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusMgr, setStatusMgr] = useState(false);
  const [draggingSheetId, setDraggingSheetId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const [movingSheetId, setMovingSheetId] = useState<string | null>(null);
  const [moveMessage, setMoveMessage] = useState<MoveMessage | null>(null);
  const [search, setSearch] = useState("");
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);   // เปิด popup รายละเอียดในตัวบอร์ด
  const [createOpen, setCreateOpen] = useState(false);                   // เปิด popup สร้างงานใหม่
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());   // คอลัมน์ที่กางดูงานครบ (ไม่จำกัด 8)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) setOpenSheetId(id);   // เปิดด้วยลิงก์ ?open=ID (refresh/copy link แล้วยังเปิดงานเดิม)
  }, []);
  const openDetail = (id: string | null) => {
    setOpenSheetId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("open", id); else url.searchParams.delete("open");
      window.history.replaceState(null, "", url.toString());
    }
  };
  // preload chunk ของ popup ไว้ล่วงหน้า → กดการ์ดแล้วเปิดทันที (ไม่ต้องรอโหลดไฟล์ครั้งแรก)
  useEffect(() => { void import("@/components/design-sheet-detail"); }, []);
  // refresh "เงียบ" หลังปิด popup — อัปเดตการ์ดบนบอร์ดเบื้องหลัง ไม่เด้ง skeleton ทั้งหน้า
  const silentRefresh = () => {
    apiFetch(`/api/design-sheets?limit=${DASHBOARD_LIMIT}&archived=0&sort_by=updated_at&sort_dir=desc`)
      .then((r) => r.json())
      .then((j) => { if (!j.error && Array.isArray(j.data)) { setSheets(j.data as DesignSheetListItem[]); setTotal(typeof j.total === "number" ? j.total : j.data.length); } })
      .catch(() => {});
  };
  const [quickFilter, setQuickFilter] = useState<"all" | "active" | "urgent" | "soon" | "closed">("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    async function loadDashboard() {
      const [listJson, statusJson, auditJson] = await Promise.all([
        apiFetch(`/api/design-sheets?limit=${DASHBOARD_LIMIT}&archived=0&sort_by=updated_at&sort_dir=desc`)
          .then((response) => readApi<ListResponse>(response, "โหลดใบงานไม่สำเร็จ")),
        apiFetch("/api/design-sheets/statuses")
          .then((response) => readApi<StatusResponse>(response, "โหลดสถานะไม่สำเร็จ")),
        apiFetch("/api/audit-logs?entity_type=design_sheet&limit=40")
          .then(async (response) => (response.ok ? (await response.json() as AuditResponse) : { data: [], total: 0, error: null }))
          .catch(() => ({ data: [], total: 0, error: null } satisfies AuditResponse)),
      ]);

      if (!alive) return;
      setSheets(listJson.data);
      setTotal(listJson.total);
      setStatusRows(statusJson.data);
      // กรอง canvas_update (ออโต้เซฟกระดานวาด) ออก ไม่ให้ถล่มฟีด แล้วเอา 6 เหตุการณ์ล่าสุดที่มีความหมาย
      setAuditRows(Array.isArray(auditJson.data) ? auditJson.data.filter((r) => r.action !== "canvas_update").slice(0, 6) : []);
    }

    loadDashboard()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "โหลดข้อมูลจริงไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [refreshKey]);

  const statusMeta = useMemo(() => buildStatusMeta(statusRows), [statusRows]);

  const brandSummaries = useMemo<BrandSummary[]>(() => {
    const map = new Map<string, BrandSummary>();
    for (const sheet of sheets) {
      const key = brandKeyOf(sheet);
      const current = map.get(key) ?? {
        key,
        id: sheet.brand_id,
        name: brandNameOf(sheet),
        color: safeColor(sheet.brand_color),
        total: 0,
        active: 0,
        urgent: 0,
      };
      current.total += 1;
      if (!statusMeta.finished.has(sheet.status)) current.active += 1;
      if (isUrgent(sheet, statusMeta)) current.urgent += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, "th"));
  }, [sheets, statusMeta]);

  useEffect(() => {
    if (selectedBrandKey !== "ALL" && !brandSummaries.some((brand) => brand.key === selectedBrandKey)) {
      setSelectedBrandKey("ALL");
    }
  }, [brandSummaries, selectedBrandKey]);

  const statusColumns = useMemo<StatusColumn[]>(() => {
    const known = new Set<string>();
    const columns = statusMeta.opts.map(([key, label]) => {
      known.add(key);
      return { key, label, color: statusMeta.colorHex[key] ?? "#94a3b8" };
    });
    const oldStatuses = Array.from(new Set(sheets.map((sheet) => sheet.status).filter((status) => !known.has(status))));
    return [
      ...columns,
      ...oldStatuses.map((key) => ({ key, label: `สถานะเดิม: ${key}`, color: "#94a3b8", old: true })),
    ];
  }, [sheets, statusMeta]);

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (selectedBrandKey !== "ALL" && brandKeyOf(sheet) !== selectedBrandKey) return false;
      if (q && !`${sheet.code} ${sheet.name} ${sheet.brand_name ?? ""}`.toLowerCase().includes(q)) return false;
      if (quickFilter === "active" && statusMeta.finished.has(sheet.status)) return false;
      if (quickFilter === "urgent" && !isUrgent(sheet, statusMeta)) return false;
      if (quickFilter === "soon") { const dd = daysUntil(sheet.deadline); if (statusMeta.finished.has(sheet.status) || dd === null || dd > 7) return false; }
      if (quickFilter === "closed" && !statusMeta.finished.has(sheet.status)) return false;
      return true;
    });
  }, [selectedBrandKey, sheets, search, quickFilter, statusMeta]);

  const selectedBrand = brandSummaries.find((brand) => brand.key === selectedBrandKey) ?? null;
  const activeJobs = filteredSheets.filter((sheet) => !statusMeta.finished.has(sheet.status)).length;
  const urgentJobs = filteredSheets.filter((sheet) => isUrgent(sheet, statusMeta)).length;
  const finishedJobs = filteredSheets.filter((sheet) => statusMeta.finished.has(sheet.status)).length;
  const visibleTotal = selectedBrand ? selectedBrand.total : total;
  const loadedLimitNote = total > sheets.length ? `แสดงล่าสุด ${sheets.length.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} งาน` : "ข้อมูลจากระบบจริง";

  const boardColumns = statusColumns.map((column) => ({
    ...column,
    sheets: filteredSheets.filter((sheet) => sheet.status === column.key),
  }));

  // ── Brand Theme (ระบบกลาง) — ใช้ของกลาง useBrandTheme + <BrandThemedShell> (หน้าอื่น reuse ได้เหมือนกัน) ──
  const [themeBuilderOpen, setThemeBuilderOpen] = useState(false);
  const [themeReloadKey, setThemeReloadKey] = useState(0);   // bump หลังเผยแพร่ → โหลดธีมใหม่
  const selectedBrandId = selectedBrand?.id ?? null;
  const brandTheme = useBrandTheme(selectedBrandId, themeReloadKey);

  function refreshDashboard() {
    setMoveMessage(null);
    setRefreshKey((key) => key + 1);
  }

  async function moveSheetToStatus(sheetId: string, nextStatus: string) {
    const sheet = sheets.find((item) => item.id === sheetId);
    if (!sheet || sheet.status === nextStatus || movingSheetId) return;

    const previousSheets = sheets;
    const nextLabel = statusMeta.map[nextStatus]?.label ?? nextStatus;

    setMovingSheetId(sheetId);
    setMoveMessage(null);
    setSheets((items) => items.map((item) => (
      item.id === sheetId ? { ...item, status: nextStatus, updated_at: new Date().toISOString() } : item
    )));

    try {
      const response = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await response.json() as { error?: string | null };
      if (!response.ok || json.error) throw new Error(json.error || "\u0e22\u0e49\u0e32\u0e22\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08");
      setMoveMessage({ type: "success", text: `\u0e22\u0e49\u0e32\u0e22 ${sheet.code} \u0e44\u0e1b ${nextLabel} \u0e41\u0e25\u0e49\u0e27` });
    } catch (e) {
      setSheets(previousSheets);
      setMoveMessage({ type: "error", text: e instanceof Error ? e.message : "\u0e22\u0e49\u0e32\u0e22\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08" });
    } finally {
      setMovingSheetId(null);
      setDraggingSheetId(null);
      setDropTargetStatus(null);
    }
  }

  function handleCardDragStart(event: DragEvent<HTMLDivElement>, sheet: DesignSheetListItem) {
    event.dataTransfer.setData("text/plain", sheet.id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingSheetId(sheet.id);
    setMoveMessage(null);
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>, column: StatusColumn) {
    if (column.old || movingSheetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetStatus !== column.key) setDropTargetStatus(column.key);
  }

  function handleColumnDragLeave(event: DragEvent<HTMLDivElement>, column: StatusColumn) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (dropTargetStatus === column.key) setDropTargetStatus(null);
  }

  function handleColumnDrop(event: DragEvent<HTMLDivElement>, column: StatusColumn) {
    if (column.old) return;
    event.preventDefault();
    const sheetId = event.dataTransfer.getData("text/plain");
    setDropTargetStatus(null);
    if (sheetId) void moveSheetToStatus(sheetId, column.key);
  }

  return (
    <BrandThemedShell theme={brandTheme}>
      <div className="w-full px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            <BrandSlot theme={brandTheme} id="header_left" className="shrink-0 mt-1" />
            <div className="min-w-0">
            <div data-gg-live-badge className="mb-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.8)]" />
              Live design sheets dashboard
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">แผนที่ภารกิจงานออกแบบ</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              ดึงใบงาน แบรนด์ และสถานะจากระบบจริงก่อน แล้วค่อยปรับหน้าตาเฉพาะแบรนด์ในขั้นถัดไป
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandSlot theme={brandTheme} id="header_right" className="shrink-0" />
            <a data-gg-action href="/master/design-sheets" className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
              กลับ Design Sheets
            </a>
            <button
              data-gg-action
              onClick={refreshDashboard}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white"
            >
              รีเฟรชข้อมูล
            </button>
            {selectedBrandId && (
              <button data-gg-action onClick={() => setThemeBuilderOpen(true)} title={`ปรับธีมของ ${selectedBrand?.name ?? "แบรนด์"}`}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
                🎨 ปรับธีม
              </button>
            )}
            <button data-gg-action="primary" onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              ＋ เพิ่มงาน
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            โหลดข้อมูลจริงไม่สำเร็จ: {error}
          </div>
        )}

        {moveMessage && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${moveMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {moveMessage.text}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            <>
              <LoadingCard /><LoadingCard /><LoadingCard /><LoadingCard />
            </>
          ) : (
            [
              ["งานทั้งหมด", visibleTotal, selectedBrand ? selectedBrand.name : loadedLimitNote],
              ["กำลังเดินงาน", activeJobs, "ยังไม่จบหรือยกเลิก"],
              ["ใกล้ครบกำหนด", urgentJobs, "ควรไล่สถานะวันนี้"],
              ["ปิดงานแล้ว", finishedJobs, "อนุมัติ / ตั้ง SKU / ยกเลิก"],
            ].map(([label, value, hint], index) => (
              <div key={label} data-gg-stat-card className="relative overflow-hidden rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                <BrandSlot theme={brandTheme} id={`stat_icon_${index}`} />
                <div className="text-xs font-medium text-slate-400">{label}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{hint}</div>
              </div>
            ))
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside data-gg-sidebar className="rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
            <BrandSlot theme={brandTheme} id="sidebar_top" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">แบรนด์จากงานจริง</h2>
                <p className="text-xs text-slate-400">คลิกเพื่อกรองบอร์ด</p>
              </div>
              <span data-gg-brand-count className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{brandSummaries.length} แบรนด์</span>
            </div>

            <button data-gg-action onClick={() => setCreateOpen(true)} title="สร้างงานใหม่ (เลือก/เพิ่มแบรนด์ในฟอร์มได้)"
              className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
              ＋ เพิ่มงาน / แบรนด์
            </button>

            <button
              data-gg-all-button
              onClick={() => setSelectedBrandKey("ALL")}
              className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${selectedBrandKey === "ALL" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="font-semibold">ทั้งหมด</span>
              <span className="text-xs opacity-70">{activeJobs} งานเดินอยู่</span>
            </button>

            <div className="space-y-2">
              {brandSummaries.map((brand) => {
                const selected = selectedBrandKey === brand.key;
                return (
                  <button
                    key={brand.key}
                    data-gg-brand-card
                    data-gg-selected={selected ? "true" : undefined}
                    onClick={() => setSelectedBrandKey(brand.key)}
                    className="w-full rounded-lg border bg-white p-3 text-left shadow-[3px_3px_0_rgba(148,163,184,0.16)] transition hover:-translate-y-0.5"
                    style={{ borderColor: selected ? brand.color : "#e2e8f0", boxShadow: selected ? `0 0 0 1px ${brand.color}33, 0 18px 45px ${brand.color}18` : undefined }}
                  >
                    <div className="flex items-center gap-2">
                      <span data-gg-brand-mark className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: brand.color }}>
                        {brand.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{brand.name}</div>
                        <div className="text-xs text-slate-400">{brand.active} งานกำลังเดิน</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div data-gg-mini-stat className="rounded-md bg-slate-50 px-2 py-1.5">
                        <div className="text-slate-400">งานทั้งหมด</div>
                        <div className="font-semibold text-slate-700">{brand.total}</div>
                      </div>
                      <div data-gg-mini-stat className="rounded-md bg-rose-50 px-2 py-1.5">
                        <div className="text-rose-400">ใกล้ครบ</div>
                        <div className="font-semibold text-rose-700">{brand.urgent}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && brandSummaries.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-center text-sm text-slate-400">
                  ยังไม่มีใบงานที่ผูกแบรนด์
                </div>
              )}
            </div>
            <BrandSlot theme={brandTheme} id="sidebar_bottom" />
          </aside>

          <main className="min-w-0 space-y-4">
            <section data-gg-panel className="min-w-0 rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">เส้นทางสถานะจาก Workflow กลาง</h2>
                  <p className="text-xs text-slate-400">{selectedBrand ? selectedBrand.name : "ทุกแบรนด์"} • {filteredSheets.length.toLocaleString("th-TH")} งานที่โหลดมา</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> ด่วน</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> ใกล้ครบ</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ปิดงาน</span>
                  </div>
                  <button
                    data-gg-action
                    onClick={() => setStatusMgr(true)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    จัดการสถานะ
                  </button>
                </div>
              </div>

              {/* แถบเครื่องมือ: ค้นหา + ตัวกรองด่วน */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="🔍 ค้นหารหัส / ชื่องาน / แบรนด์..."
                  className="h-9 min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                <div className="flex flex-wrap items-center gap-1">
                  {([["all", "ทั้งหมด"], ["active", "🛠 กำลังทำ"], ["urgent", "🔴 ด่วน"], ["soon", "🟠 ใกล้กำหนด"], ["closed", "✅ ปิดงาน"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setQuickFilter(key)}
                      className={`h-9 rounded-md border px-3 text-xs font-medium transition ${quickFilter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((item) => <LoadingCard key={item} />)}
                </div>
              ) : filteredSheets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-400">
                  <BrandSlot theme={brandTheme} id="page_empty" />
                  ยังไม่มีใบงานสำหรับตัวกรองนี้
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="grid min-w-[1120px] grid-flow-col auto-cols-[160px] gap-3">
                    {boardColumns.map((column, index) => {
                      const expanded = expandedCols.has(column.key);
                      const shown = expanded ? column.sheets : column.sheets.slice(0, 8);
                      const hiddenCount = Math.max(0, column.sheets.length - shown.length);
                      const isDropTarget = dropTargetStatus === column.key;
                      return (
                        <div
                          key={`${column.key}-${index}`}
                          data-gg-column-drop
                          data-gg-drop-target={isDropTarget ? "true" : undefined}
                          onDragOver={(event) => handleColumnDragOver(event, column)}
                          onDragEnter={(event) => handleColumnDragOver(event, column)}
                          onDragLeave={(event) => handleColumnDragLeave(event, column)}
                          onDrop={(event) => handleColumnDrop(event, column)}
                          className={`relative rounded-xl transition-colors ${isDropTarget ? "bg-amber-50/70 ring-2 ring-amber-300 ring-offset-2" : ""}`}
                        >
                          {index < boardColumns.length - 1 && (
                            <div data-gg-connector className="absolute left-[62%] top-8 h-px w-[76%] bg-gradient-to-r from-amber-300 via-amber-200 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.45)]" />
                          )}
                          <div data-gg-column-header className="relative mb-3 rounded-lg border px-2 py-2 text-center shadow-sm" style={{ borderColor: `${column.color}33`, background: `linear-gradient(180deg, #ffffff 0%, ${column.color}14 100%)` }}>
                            <BrandSlot theme={brandTheme} id={wfIconSlotId(column.key)} w={96} size="w-7 h-7" className="absolute left-1 top-1" />
                            <div data-gg-column-dot className="mx-auto mb-1 h-3 w-3 rounded-full shadow-[0_0_16px_rgba(245,158,11,0.65)]" style={{ backgroundColor: column.color }} />
                            <div className="truncate text-xs font-semibold text-slate-800" title={column.label}>{column.label}</div>
                            <div className="text-[11px] text-slate-400">{column.sheets.length} งาน</div>
                          </div>
                          <div className="min-h-[128px] space-y-2">
                            {shown.map((sheet) => {
                              const brandColor = safeColor(sheet.brand_color);
                              const coverUrl = sheetCoverUrl(sheet);
                              const isDragging = draggingSheetId === sheet.id;
                              const isMoving = movingSheetId === sheet.id;
                              return (
                                <div
                                  key={sheet.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => { if (!isMoving) openDetail(sheet.id); }}
                                  onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !isMoving) { event.preventDefault(); openDetail(sheet.id); } }}
                                  data-gg-task-card
                                  draggable={!movingSheetId}
                                  onDragStart={(event) => handleCardDragStart(event, sheet)}
                                  onDragEnd={() => { setDraggingSheetId(null); setDropTargetStatus(null); }}
                                  aria-busy={isMoving}
                                  title="Drag to change status or click to open"
                                  className={`relative block overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-[3px_3px_0_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-amber-300 ${isDragging ? "opacity-45" : ""} ${isMoving ? "pointer-events-none opacity-60" : "cursor-grab active:cursor-grabbing"}`}
                                >
                                  <BrandSlot theme={brandTheme} id="task_corner" />
                                  {coverUrl ? (
                                    <HoverPreview url={sheet.cover_url} previewW={640}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        data-gg-cover
                                        src={coverUrl}
                                        alt={sheet.name}
                                        loading="lazy"
                                        decoding="async"
                                        className="mb-2 h-16 w-full rounded-md border border-slate-100 bg-slate-50 object-cover"
                                      />
                                    </HoverPreview>
                                  ) : (
                                    <div data-gg-cover className="mb-2 flex h-16 items-center justify-center overflow-hidden rounded-md border border-slate-100" style={{ background: `linear-gradient(135deg, #ffffff 0%, ${brandColor}18 70%, #fef3c7 100%)` }}>
                                      <BrandSlot theme={brandTheme} id="task_placeholder" size="max-h-14" />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
                                    <span className="font-mono text-[11px] text-slate-400">{sheet.code}</span>
                                  </div>
                                  <div className="mt-0.5 min-h-[32px] text-xs font-semibold text-slate-800">{sheet.name}</div>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="truncate text-[11px] text-slate-400">{sheet.brand_name ?? "ไม่ระบุ"}</span>
                                    <CardDeadline tone={deadlineTone(sheet, statusMeta)} label={deadlineLabel(sheet, statusMeta)} />
                                  </div>
                                  <div className="mt-2 flex gap-1 text-[10px] text-slate-400">
                                    {sheet.has_cost && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">ตีราคาแล้ว</span>}
                                    {sheet.has_quote && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">มีราคา</span>}
                                    {sheet.parent_count > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">มี SKU</span>}
                                  </div>
                                </div>
                              );
                            })}
                            {shown.length === 0 && (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-3 text-center text-xs text-slate-400">
                                ไม่มีงานในสถานะนี้
                              </div>
                            )}
                            {hiddenCount > 0 && (
                              <button type="button" onClick={() => setExpandedCols((s) => new Set(s).add(column.key))}
                                className="w-full rounded-lg border border-dashed border-slate-200 bg-white/70 p-2 text-center text-xs text-blue-600 hover:border-blue-300 hover:bg-blue-50">
                                ＋ ดูอีก {hiddenCount.toLocaleString("th-TH")} งาน
                              </button>
                            )}
                            {expanded && column.sheets.length > 8 && (
                              <button type="button" onClick={() => setExpandedCols((s) => { const n = new Set(s); n.delete(column.key); return n; })}
                                className="w-full rounded-lg p-1.5 text-center text-[11px] text-slate-400 hover:text-slate-600">
                                ย่อ ▲
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section data-gg-audit className="rounded-lg border border-white/70 bg-slate-900 p-4 text-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BrandSlot theme={brandTheme} id="audit_badge" />
                  <div>
                    <h2 className="text-sm font-semibold">ประวัติจาก Audit Log กลาง</h2>
                    <p className="mt-1 text-xs text-slate-300">อ่านจากประวัติจริงของใบงานออกแบบ</p>
                  </div>
                </div>
                <span data-gg-audit-count className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-200">{auditRows.length} รายการล่าสุด</span>
              </div>
              {auditRows.length === 0 ? (
                <div data-gg-audit-row className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  ยังไม่มีประวัติที่โหลดได้ หรือระบบยังไม่เปิดสิทธิ์อ่านประวัติในหน้านี้
                </div>
              ) : (
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {auditRows.map((row) => (
                    <div key={row.id} data-gg-audit-row className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span data-gg-audit-dot className="block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]" />
                        <span className="text-[11px] text-slate-400">{formatDateTime(row.created_at)} • {row.actor_name || "ระบบ"}</span>
                      </div>
                      <div className="text-xs font-medium text-white">{auditText(row)}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{row.entity_type}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      {statusMgr && (
        <WorkflowStatusManager
          open={statusMgr}
          onClose={() => setStatusMgr(false)}
          entityType="design_sheet"
          actor={null}
          onChanged={refreshDashboard}
        />
      )}

      {/* popup รายละเอียดงาน "ในตัวบอร์ด" (reuse popup ของ Design Sheets) — ปิดแล้วรีเฟรชบอร์ดให้เห็นการเปลี่ยน */}
      {openSheetId && (
        <DesignSheetDetail detailOnly openId={openSheetId} onDetailClose={() => { openDetail(null); silentRefresh(); }} />
      )}

      {/* popup สร้างงานใหม่ (reuse ฟอร์มเดิม) — default แบรนด์ = แบรนด์ที่เลือกอยู่ในแถบซ้าย · ปิดแล้ว refresh เงียบ */}
      {createOpen && (
        <DesignSheetDetail detailOnly createMode defaultBrandId={selectedBrand?.id ?? null}
          onDetailClose={() => { setCreateOpen(false); silentRefresh(); }} />
      )}

      {/* Brand Theme Builder — ปรับธีมของแบรนด์ที่เลือก · เผยแพร่แล้วโหลดธีมใหม่ */}
      {themeBuilderOpen && selectedBrandId && (
        <BrandThemeBuilder brandId={selectedBrandId} brandName={selectedBrand?.name ?? "แบรนด์"}
          statuses={statusColumns.map((c) => ({ key: c.key, label: c.label }))}
          brands={brandSummaries.filter((b) => b.id && b.id !== selectedBrandId).map((b) => ({ id: b.id as string, name: b.name }))}
          open={themeBuilderOpen} onClose={() => setThemeBuilderOpen(false)}
          onPublished={() => setThemeReloadKey((k) => k + 1)} />
      )}
    </BrandThemedShell>
  );
}