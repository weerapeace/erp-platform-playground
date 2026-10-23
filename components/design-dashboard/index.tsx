"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { AuditLogEntry } from "@/app/api/audit-logs/route";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { buildStatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { SheetHoverSettingsButton, useSheetHoverPref } from "./sheet-hover";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { usePermission } from "@/components/auth";
import { CampaignBoardPicker, useCanSendToBoard } from "@/components/campaign-board-send";
import { SummaryListMenu } from "@/components/design-sheet-summary/list-menu";
import { RecordTasksButton } from "@/components/record-tasks";
import type { ChecklistSummary } from "@/lib/record-tasks";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { BrandSlot } from "@/components/brand-theme/slots";
import { BrandThemedShell, useBrandTheme } from "@/components/brand-theme/provider";
import { BrandThemeBuilder } from "@/components/brand-theme-builder";
import { useViewportLayout, useDeviceMode, DeviceModeToggle, DevicePreviewFrame, DEVICE_PARAM } from "@/components/device-view";
import { type ListResponse, type StatusResponse, type AuditResponse, type MoveMessage, type BrandSummary, type StatusColumn, type BrandGroup, GROUP_KEY, GROUP_LABEL, DEFAULT_HIDDEN_COLS, DASHBOARD_LIMIT, readApi, safeColor, brandKeyOf, brandNameOf, sheetIsOwn, daysUntil, isUrgent, LoadingCard } from "./dashboard-helpers";
import { BoardCard, GalleryCard } from "./dashboard-cards";
import { BrandBar } from "./brand-bar";
import { BrandSettingsModal } from "./brand-settings-modal";
import { DashboardStats } from "./dashboard-stats";
import { StatusBoard } from "./status-board";
import { AuditFeed } from "./audit-feed";
import { PickActionBar } from "./pick-action-bar";

const WorkflowStatusManager = dynamic(
  () => import("@/components/workflow-status-manager").then((mod) => mod.WorkflowStatusManager),
  { ssr: false }
);
// popup รายละเอียดงาน = ของกลาง design-sheet-detail โหมด "เฉพาะ popup" (โหลดเฉพาะตอนเปิดการ์ด ไม่ถ่วงบอร์ด)
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });
// แผงลอย "📄 ใบนำเสนอ A4" — mount ที่ระดับบอร์ด (ปิดป๊อปอัปใบงานแล้วแผงยังอยู่ ดูบอร์ดไปจัดใบไป)
const DesignSheetPresentPanel = dynamic(() => import("@/components/design-sheet-present").then((m) => m.DesignSheetPresentPanel), { ssr: false });
// ป๊อป "📋 สรุปงาน" (ของกลาง design-sheet-summary) — โหลดเฉพาะตอนเปิด
const DesignSheetSummaryBuilder = dynamic(() => import("@/components/design-sheet-summary").then((m) => m.DesignSheetSummaryBuilder), { ssr: false });

export function DesignDashboard() {
  const t = useT();
  const canEdit = usePermission("products.edit");
  const canTasks = useCanSendToBoard();   // มีสิทธิ์เข้าแอปงาน (ที่กระดานแคมเปญอยู่) ไหม — ไม่มี = ไม่โชว์ปุ่ม
  const [sheets, setSheets] = useState<DesignSheetListItem[]>([]);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedBrandKey, setSelectedBrandKey] = useState(GROUP_KEY.customer);   // แบรนด์เดียว หรือ "ทั้งกลุ่ม" (GROUP_KEY)
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
  const [presentId, setPresentId] = useState<string | null>(null);       // แผงใบนำเสนอ A4 ของใบไหน (null = ปิด)
  const [createOpen, setCreateOpen] = useState(false);                   // เปิด popup สร้างงานใหม่
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());   // คอลัมน์ที่กางดูงานครบ (ไม่จำกัด 8)
  const [viewMode, setViewMode] = useState<"board" | "gallery">("board");     // มุมมอง: บอร์ด Kanban / การ์ดรูปใหญ่ (แกลเลอรี)
  const { cols: galleryCols, setCols: setGalleryCols, gridStyle: galleryGridStyle } = useGalleryColumns("design-dashboard", 6);   // จำนวนการ์ดต่อแถว (ของกลาง จำรายคน)
  // ── รูปแบบจอ (ของกลาง device-view): จอคอม / แท็บเล็ต / มือถือ — อัตโนมัติตามจอจริง หรือเลือกเอง (?device=) ──
  // `layout` = สิ่งที่ต้องเรนเดอร์จริง · เลือกดูแบบมือถือบนจอคอม → DevicePreviewFrame ครอบเป็นกรอบเครื่อง + QR ให้สแกนเปิดบนเครื่องจริง
  const viewport = useViewportLayout();
  const { mode: deviceMode, setMode: setDeviceMode, layout } = useDeviceMode(viewport);
  const isDesktop = layout === "desktop";
  const isPhone = layout === "phone";
  const [moreOpen, setMoreOpen] = useState(false);                     // มือถือ: เมนู ⋯ รวมปุ่มรอง (กลับ/รีเฟรช/ธีม/จัดการสถานะ/ส่งขึ้นกระดาน/ตั้งค่าแบรนด์)
  const moreAnchorRef = useRef<HTMLDivElement>(null);
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null); // มือถือ: บอร์ดเป็น "แท็บสถานะ" ทีละสถานะ (ไม่ใช่คอลัมน์เรียงข้าง)
  const galleryStyle = useMemo(() => (
    // แกลเลอรีบนมือถือ = 2 ต่อแถว · แท็บเล็ต = ไม่เกิน 4 (การ์ดไม่จิ๋วเกินอ่าน) · จอคอม = ตามที่ผู้ใช้เลือก
    isPhone ? { display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
      : layout === "tablet" ? { ...galleryGridStyle, gridTemplateColumns: `repeat(${Math.min(galleryCols, 4)}, minmax(0, 1fr))` }
      : galleryGridStyle
  ), [isPhone, layout, galleryCols, galleryGridStyle]);
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});   // brand id → logo R2 key (จาก /api/brands)
  // โหลดโลโก้แบรนด์ (จาก /master/brands → brands.logo_url) มาโชว์ในการ์ดแบรนด์แถวบน
  useEffect(() => {
    let alive = true;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => {
      if (!alive || !Array.isArray(j.data)) return;
      const m: Record<string, string> = {};
      for (const b of j.data as { id?: string; logo_url?: string | null }[]) if (b.id && b.logo_url) m[b.id] = b.logo_url;
      setBrandLogos(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // (คลิกนอกแล้วปิด — ของกลาง FloatingDropdown จัดการให้แล้ว)
  // ตั้งค่าแบรนด์ (เรียง/ซ่อน) — เก็บรายคนที่ user_ui_prefs
  const [brandPrefs, setBrandPrefs] = useState<{ order: string[]; hidden: string[] }>({ order: [], hidden: [] });
  const [brandSettingsOpen, setBrandSettingsOpen] = useState(false);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_brand_prefs").then((r) => r.json())
      .then((j) => { const v = (j?.value ?? {}) as { order?: string[]; hidden?: string[] };
        setBrandPrefs({ order: Array.isArray(v.order) ? v.order : [], hidden: Array.isArray(v.hidden) ? v.hidden : [] }); })
      .catch(() => {});
  }, []);
  const saveBrandPrefs = (next: { order: string[]; hidden: string[] }) => {
    setBrandPrefs(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_brand_prefs", value: next }) }).catch(() => {});
  };
  // จำมุมมองที่เลือกไว้รายคน (บอร์ด/การ์ดรูปใหญ่)
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_view_mode").then((r) => r.json())
      .then((j) => { const v = j?.value; if (v === "board" || v === "gallery") setViewMode(v); })
      .catch(() => {});
  }, []);
  // คอลัมน์สถานะที่ซ่อนบนบอร์ด — จำรายคน (user_ui_prefs) · ยังไม่เคยตั้ง = ค่าเริ่มต้น DEFAULT_HIDDEN_COLS
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN_COLS);
  const [hideColsOpen, setHideColsOpen] = useState(false);
  const hideColsAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_hidden_cols").then((r) => r.json())
      .then((j) => { const v = j?.value; if (Array.isArray(v)) setHiddenCols(v.map(String)); })
      .catch(() => {});
  }, []);
  const saveHiddenCols = (next: string[]) => {
    setHiddenCols(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_hidden_cols", value: next }) }).catch(() => {});
  };
  const toggleHiddenCol = (key: string) => saveHiddenCols(hiddenCols.includes(key) ? hiddenCols.filter((k) => k !== key) : [...hiddenCols, key]);
  // ขนาดการ์ดบนบอร์ด (เจ้าของขอ compact): ▦ การ์ดเล็ก (เรียงหลายใบในคอลัมน์กว้าง) / ☰ แถวย่อ (รูปจิ๋ว+ชื่อ) — จำรายคน
  const [cardSize, setCardSize] = useState<"compact" | "row">("compact");
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_card_size").then((r) => r.json())
      .then((j) => { const v = j?.value; if (v === "compact" || v === "row") setCardSize(v); })
      .catch(() => {});
  }, []);
  const changeCardSize = (size: "compact" | "row") => {
    setCardSize(size);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_card_size", value: size }) }).catch(() => {});
  };
  // 🪟 ชี้ที่การ์ด = รูปใหญ่ + รายละเอียดงาน (ของกลาง components/hover-card) — ตั้งค่าต่อคน
  const hoverPref = useSheetHoverPref();
  const hoverOn = hoverPref.on && hoverPref.fields.length > 0;
  const changeViewMode = (mode: "board" | "gallery") => {
    setViewMode(mode);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_view_mode", value: mode }) }).catch(() => {});
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) setOpenSheetId(id);   // เปิดด้วยลิงก์ ?open=ID (refresh/copy link แล้วยังเปิดงานเดิม)
  }, []);
  const router = useRouter();
  const openDetail = (id: string | null) => {
    // แท็บเล็ต/มือถือ: เปิดใบงานเป็น "หน้าเต็ม" (design-sheet-mobile) ไม่ใช่ป๊อปอัปจอคอม · จำโหมดจอที่เลือกไว้ไปด้วย
    if (id && !isDesktop) {
      router.push(`/master/design-dashboard/sheet/${encodeURIComponent(id)}${deviceMode === "auto" ? "" : `?${DEVICE_PARAM}=${deviceMode}`}`);
      return;
    }
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

  // ── โหมดติ๊กเลือกใบงาน — ใช้ 2 งาน: 🎨 ส่งขึ้นกระดานแคมเปญ (ของกลาง campaign-board-send) / 📋 สรุปงาน (ของกลาง design-sheet-summary) ──
  const [pickMode, setPickMode] = useState(false);
  const [pickPurpose, setPickPurpose] = useState<"board" | "summary">("board");
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [campaignPickOpen, setCampaignPickOpen] = useState(false);
  // สรุปงาน: เลือกได้เฉพาะใบที่ยังไม่ปิดงาน (เจ้าของขอ)
  const canPick = (sheet: DesignSheetListItem) => pickPurpose !== "summary" || !statusMeta.finished.has(sheet.status);
  const togglePicked = (id: string) => {
    const sheet = sheets.find((s) => s.id === id);
    if (sheet && !canPick(sheet)) return;
    setPickedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const exitPickMode = () => { setPickMode(false); setPickedIds(new Set()); setCampaignPickOpen(false); };
  const startPick = (purpose: "board" | "summary") => { setPickPurpose(purpose); setPickedIds(new Set()); setPickMode(true); };
  // ป๊อปสรุปงาน + ดรอปดาวน์ "สรุปที่บันทึกไว้"
  const [summaryBuilder, setSummaryBuilder] = useState<{ id: string | null; sheetIds: string[] } | null>(null);
  const [summaryMenuOpen, setSummaryMenuOpen] = useState(false);
  const [summaryReload, setSummaryReload] = useState(0);
  const summaryAnchorRef = useRef<HTMLDivElement>(null);
  const openSummary = (id: string | null, sheetIds: string[] = []) => { setSummaryMenuOpen(false); setMoreOpen(false); setSummaryBuilder({ id, sheetIds }); };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    async function loadDashboard() {
      // ฟีดความเคลื่อนไหว (ประวัติ) โหลดแยก ไม่ให้หน้ารอ — ตารางประวัติใหญ่ ช้าได้ 1–3 วิ (เดิมรอพร้อมรายการใบงาน → ทั้งหน้าค้าง "กำลังโหลด")
      void apiFetch("/api/audit-logs?entity_type=design_sheet&limit=40")
        .then(async (response) => (response.ok ? (await response.json() as AuditResponse) : { data: [], total: 0, error: null }))
        .catch(() => ({ data: [], total: 0, error: null } satisfies AuditResponse))
        .then((auditJson) => {
          if (!alive) return;
          // กรอง canvas_update (ออโต้เซฟกระดานวาด) ออก ไม่ให้ถล่มฟีด แล้วเอา 6 เหตุการณ์ล่าสุดที่มีความหมาย
          setAuditRows(Array.isArray(auditJson.data) ? auditJson.data.filter((r) => r.action !== "canvas_update").slice(0, 6) : []);
        });
      const [listJson, statusJson] = await Promise.all([
        apiFetch(`/api/design-sheets?limit=${DASHBOARD_LIMIT}&archived=0&sort_by=updated_at&sort_dir=desc`)
          .then((response) => readApi<ListResponse>(response, tr("โหลดใบงานไม่สำเร็จ", "Couldn't load design sheets"))),
        apiFetch("/api/design-sheets/statuses")
          .then((response) => readApi<StatusResponse>(response, tr("โหลดสถานะไม่สำเร็จ", "Couldn't load statuses"))),
      ]);

      if (!alive) return;
      setSheets(listJson.data);
      setTotal(listJson.total);
      setStatusRows(statusJson.data);
    }

    loadDashboard()
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : tr("โหลดข้อมูลจริงไม่สำเร็จ", "Couldn't load data"));
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
        own: sheetIsOwn(sheet),
      };
      current.total += 1;
      if (!statusMeta.finished.has(sheet.status)) current.active += 1;
      if (isUrgent(sheet, statusMeta)) current.urgent += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, "th"));
  }, [sheets, statusMeta]);

  const isGroupKey = selectedBrandKey === GROUP_KEY.customer || selectedBrandKey === GROUP_KEY.own;
  useEffect(() => {
    if (loading) return;   // ยังโหลดไม่เสร็จ (ยังไม่มีแบรนด์) — อย่าเพิ่งรีเซ็ต
    if (!isGroupKey && !brandSummaries.some((brand) => brand.key === selectedBrandKey)) {
      setSelectedBrandKey(GROUP_KEY.customer);
    }
  }, [brandSummaries, selectedBrandKey, isGroupKey, loading]);
  const selectedBrand = brandSummaries.find((brand) => brand.key === selectedBrandKey) ?? null;
  // กลุ่มที่กำลังดู: เลือกแบรนด์เดียว = กลุ่มของแบรนด์นั้น · เลือก "ทั้งหมด" ของกลุ่ม = กลุ่มนั้น
  const selectedGroup: BrandGroup = selectedBrand ? (selectedBrand.own ? "own" : "customer") : selectedBrandKey === GROUP_KEY.own ? "own" : "customer";
  const ownView = selectedGroup === "own";
  const scopeLabel = selectedBrand ? selectedBrand.name : GROUP_LABEL[selectedGroup].all;

  const statusColumns = useMemo<StatusColumn[]>(() => {
    const known = new Set<string>();
    const columns = statusMeta.opts.map(([key, label]) => {
      known.add(key);
      return { key, label, color: statusMeta.colorHex[key] ?? "#94a3b8" };
    });
    const oldStatuses = Array.from(new Set(sheets.map((sheet) => sheet.status).filter((status) => !known.has(status))));
    return [
      ...columns,
      ...oldStatuses.map((key) => ({ key, label: tr(`สถานะเดิม: ${key}`, `Old status: ${key}`), color: "#94a3b8", old: true })),
    ];
  }, [sheets, statusMeta]);

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (isGroupKey) { if (sheetIsOwn(sheet) !== (selectedBrandKey === GROUP_KEY.own)) return false; }
      else if (brandKeyOf(sheet) !== selectedBrandKey) return false;
      if (q && !`${sheet.code} ${sheet.name} ${sheet.brand_name ?? ""}`.toLowerCase().includes(q)) return false;
      if (quickFilter === "active" && statusMeta.finished.has(sheet.status)) return false;
      if (quickFilter === "urgent" && !isUrgent(sheet, statusMeta)) return false;
      if (quickFilter === "soon") { const dd = daysUntil(sheet.deadline); if (statusMeta.finished.has(sheet.status) || dd === null || dd > 7) return false; }
      if (quickFilter === "closed" && !statusMeta.finished.has(sheet.status)) return false;
      return true;
    });
  }, [selectedBrandKey, isGroupKey, sheets, search, quickFilter, statusMeta]);

  // แถวแบรนด์แนวนอน แยก 2 กลุ่ม: แต่ละกลุ่มโชว์ 4 อันดับแรก (ตามงานกำลังเดิน) + ที่เหลือไปอยู่ดรอปดาวน์ "อื่นๆ" ของกลุ่มนั้น
  const orderedAll = useMemo(() => {
    const idx = (k: string) => { const i = brandPrefs.order.indexOf(k); return i === -1 ? 1e6 : i; };
    return [...brandSummaries].sort((a, b) => (idx(a.key) - idx(b.key)) || (b.active - a.active));
  }, [brandSummaries, brandPrefs.order]);
  const groupView = (group: BrandGroup) => {
    const inGroup = orderedAll.filter((b) => b.own === (group === "own"));
    const visible = inGroup.filter((b) => !brandPrefs.hidden.includes(b.key));
    const hidden = inGroup.filter((b) => brandPrefs.hidden.includes(b.key));
    const others = [...visible.slice(4), ...hidden];   // ที่เหลือ + ที่ซ่อน → ไปอยู่ "อื่นๆ"
    return {
      top: visible.slice(0, 4),                        // โชว์ 4 อันดับแรกที่ไม่ซ่อน
      others,
      othersSelected: others.find((b) => b.key === selectedBrandKey) ?? null,
      active: inGroup.reduce((n, b) => n + b.active, 0),
      total: inGroup.reduce((n, b) => n + b.total, 0),
      count: inGroup.length,
    };
  };
  const groups = { customer: groupView("customer"), own: groupView("own") };
  const topBrands = [...groups.customer.top, ...groups.own.top];   // ใช้ในป๊อปตั้งค่าแบรนด์ (ป้าย "โชว์")
  const moveBrand = (key: string, dir: -1 | 1) => {
    const keys = orderedAll.map((b) => b.key);
    const i = keys.indexOf(key); if (i < 0) return;
    let j = i + dir;
    while (j >= 0 && j < keys.length && orderedAll[j].own !== orderedAll[i].own) j += dir;   // สลับเฉพาะในกลุ่มเดียวกัน
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    saveBrandPrefs({ ...brandPrefs, order: keys });
  };
  const toggleHiddenBrand = (key: string) => {
    const hidden = brandPrefs.hidden.includes(key) ? brandPrefs.hidden.filter((k) => k !== key) : [...brandPrefs.hidden, key];
    saveBrandPrefs({ ...brandPrefs, hidden });
  };
  // สัญลักษณ์แบรนด์: โลโก้จริง (ถ้ามี) ไม่งั้นสี+ตัวย่อ
  const brandMark = (brand: BrandSummary, cls: string) => {
    const logo = brand.id ? brandLogos[brand.id] : undefined;
    return logo
      ? <img src={`/api/r2-image?key=${encodeURIComponent(logo)}`} alt="" className={`${cls} shrink-0 rounded-md border border-slate-100 bg-white object-contain`} />
      : <span className={`${cls} flex shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white`} style={{ backgroundColor: brand.color }}>{brand.name.slice(0, 2).toUpperCase()}</span>;
  };
  const activeJobs = filteredSheets.filter((sheet) => !statusMeta.finished.has(sheet.status)).length;
  const urgentJobs = filteredSheets.filter((sheet) => isUrgent(sheet, statusMeta)).length;
  const finishedJobs = filteredSheets.filter((sheet) => statusMeta.finished.has(sheet.status)).length;
  const visibleTotal = selectedBrand ? selectedBrand.total : groups[selectedGroup].total;
  const loadedLimitNote = total > sheets.length ? t(`แสดงล่าสุด ${sheets.length.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} งาน`, `Showing latest ${sheets.length.toLocaleString("th-TH")} of ${total.toLocaleString("th-TH")} jobs`) : t("ข้อมูลจากระบบจริง", "Live data");

  const allBoardColumns = statusColumns.map((column) => ({
    ...column,
    sheets: filteredSheets.filter((sheet) => sheet.status === column.key),
  }))
    // แบรนด์เรา: ตัดสถานะ "เฉพาะงานลูกค้า" (ตั้งที่ปุ่มจัดการสถานะ) — ถ้ามีงานค้างอยู่ในสถานะนั้น โชว์ต่อพร้อมเตือน งานไม่หาย
    .filter((column) => !ownView || !statusMeta.customerOnly.has(column.key) || column.sheets.length > 0)
    .map((column) => (ownView && statusMeta.customerOnly.has(column.key) ? { ...column, notForOwn: true } : column));
  // บอร์ด/แท็บสถานะมือถือ ใช้เฉพาะคอลัมน์ที่ไม่ได้ซ่อน · ที่ซ่อนไว้เปิดกลับได้จากปุ่ม 👁 (สถิติด้านบนยังนับทุกสถานะ)
  const hiddenSet = new Set(hiddenCols);
  const boardColumns = allBoardColumns.filter((c) => !hiddenSet.has(c.key));
  const hiddenBoardColumns = allBoardColumns.filter((c) => hiddenSet.has(c.key));
  // มือถือ: สถานะที่เลือกดูอยู่ (ค่าเริ่มต้น = คอลัมน์แรก)
  const phoneCol = boardColumns.find((c) => c.key === phoneStatus) ?? boardColumns[0] ?? null;
  // ป้ายสถานะสำหรับมุมมองการ์ด (ไม่มีคอลัมน์ → โชว์สถานะเป็น badge บนการ์ด)
  const statusInfo = useMemo(() => {
    const m = new Map<string, { label: string; color: string }>();
    for (const c of statusColumns) m.set(c.key, { label: c.label, color: c.color });
    return m;
  }, [statusColumns]);

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
      if (!response.ok || json.error) throw new Error(json.error || t("\u0e22\u0e49\u0e32\u0e22\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08", "Couldn't move status"));
      setMoveMessage({ type: "success", text: t(`\u0e22\u0e49\u0e32\u0e22 ${sheet.code} \u0e44\u0e1b ${nextLabel} \u0e41\u0e25\u0e49\u0e27`, `Moved ${sheet.code} to ${nextLabel}`) });
    } catch (e) {
      setSheets(previousSheets);
      setMoveMessage({ type: "error", text: e instanceof Error ? e.message : t("\u0e22\u0e49\u0e32\u0e22\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08", "Couldn't move status") });
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
    if (column.old || column.notForOwn || movingSheetId) return;
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
    if (column.old || column.notForOwn) return;
    event.preventDefault();
    const sheetId = event.dataTransfer.getData("text/plain");
    setDropTargetStatus(null);
    if (sheetId) void moveSheetToStatus(sheetId, column.key);
  }

  // การ์ดใบงาน (ของกลางในโมดูล ./dashboard-cards) — แกลเลอรี/บอร์ด ใช้ค่าร่วมชุดเดียวกัน
  // ⏳ ติ๊ก "รออะไรอยู่" บนการ์ด → อัปเดตสรุปของใบนั้นในรายการทันที (ไม่ต้องโหลดทั้งหน้า)
  const onWaitingChange = (id: string, s: ChecklistSummary) => setSheets((items) => items.map((it) => (it.id === id ? { ...it, waiting_items: s } : it)));
  const cardProps = { statusInfo, statusMeta, pickedIds, pickMode, canPick, togglePicked, openDetail, hoverPref, hoverOn, brandTheme, canEditWaiting: canEdit, onWaitingChange };
  const renderGalleryCard = (sheet: DesignSheetListItem) => <GalleryCard key={sheet.id} sheet={sheet} {...cardProps} />;
  const renderBoardCard = (sheet: DesignSheetListItem) => (
    <BoardCard key={sheet.id} sheet={sheet} {...cardProps} draggingSheetId={draggingSheetId} movingSheetId={movingSheetId} cardSize={cardSize} isDesktop={isDesktop}
      handleCardDragStart={handleCardDragStart} setDraggingSheetId={setDraggingSheetId} setDropTargetStatus={setDropTargetStatus} />
  );
  const menuItem = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50";

  // เนื้อหาทั้งหน้า (ไม่รวมป๊อปอัป/แถบล่างที่ portal ออกไป) — ถ้าเลือกดูแบบมือถือ/แท็บเล็ตบนจอที่กว้างกว่า
  // DevicePreviewFrame จะครอบเป็นกรอบเครื่อง + QR · ถ้าเปิดบนเครื่องจริงอยู่แล้ว = เรนเดอร์ตรง ๆ
  const body = (
      /* จำกัดความกว้างเนื้อหา + จัดกลางจอ (เจ้าของขอ) — จอกว้างมากถ้ายืดเต็มจะกวาดตาไกล อ่านยาก */
      <div className={`mx-auto w-full max-w-screen-2xl ${isPhone ? "px-3 py-3" : isDesktop ? "px-6 py-5" : "px-4 py-4"}`}>
        {isPhone ? (
          /* ── หัวแบบมือถือ: ชื่อหน้า + สรุปสั้น · ขวา = สลับจอ + เมนู ⋯ (ปุ่มรองทั้งหมดอยู่ในเมนู · ปุ่ม ＋ เป็นปุ่มลอยมุมล่าง) ── */
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <BrandSlot theme={brandTheme} id="header_left" className="shrink-0" />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold leading-tight text-slate-900">{t("แผนที่ภารกิจงานออกแบบ", "Design mission map")}</h1>
                <p className="truncate text-[11px] text-slate-400">{scopeLabel} · {activeJobs} {t("งานเดินอยู่", "active")}{urgentJobs > 0 ? <> · <span className="text-rose-500">{urgentJobs} {t("ใกล้ครบ", "due soon")}</span></> : null}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5" ref={moreAnchorRef}>
              <DeviceModeToggle mode={deviceMode} viewport={viewport} onChange={setDeviceMode} compact />
              <button type="button" onClick={() => setMoreOpen((o) => !o)} title={t("เมนูเพิ่มเติม", "More menu")} aria-label={t("เมนูเพิ่มเติม", "More menu")}
                className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg leading-none ${moreOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>⋯</button>
              <FloatingDropdown anchorRef={moreAnchorRef} open={moreOpen} onClose={() => setMoreOpen(false)} minWidth={224} maxWidth={280}>
                <div className="rounded-lg border border-slate-200 bg-white p-1 shadow-2xl">
                  <div className="px-1 py-0.5"><RecordTasksButton moduleKey="design_sheets" canEdit={canEdit} /></div>
                  <a href="/master/design-sheets" className={menuItem}>📄 {t("กลับ Design Sheets", "Back to Design Sheets")}</a>
                  <button type="button" className={menuItem} onClick={() => { refreshDashboard(); setMoreOpen(false); }}>🔄 {t("รีเฟรชข้อมูล", "Refresh data")}</button>
                  {selectedBrandId && <button type="button" className={menuItem} onClick={() => { setThemeBuilderOpen(true); setMoreOpen(false); }}>🎨 {t("ปรับธีม", "Theme")} {selectedBrand?.name}</button>}
                  <button type="button" className={menuItem} onClick={() => { setStatusMgr(true); setMoreOpen(false); }}>🔀 {t("จัดการสถานะ", "Manage statuses")}</button>
                  <button type="button" className={menuItem} onClick={() => { changeCardSize(cardSize === "row" ? "compact" : "row"); setMoreOpen(false); }}>
                    {cardSize === "row" ? t("▦ การ์ดเล็ก (มีรูป)", "▦ Small cards (with image)") : t("☰ การ์ดแถวย่อ", "☰ Compact rows")}
                  </button>
                  {canTasks && <button type="button" className={menuItem} onClick={() => { if (pickMode) exitPickMode(); else startPick("board"); setMoreOpen(false); }}>{pickMode ? t("✕ ออกจากโหมดเลือก", "✕ Exit select mode") : t("🎨 ส่งขึ้นกระดาน", "🎨 Send to board")}</button>}
                  {canEdit && !pickMode && <button type="button" className={menuItem} onClick={() => { startPick("summary"); setMoreOpen(false); }}>📋 {t("สรุปงานใหม่ (เลือกใบงาน)", "New summary (pick sheets)")}</button>}
                  {canEdit && <button type="button" className={menuItem} onClick={() => { setMoreOpen(false); setSummaryMenuOpen(true); }}>📂 {t("สรุปที่บันทึกไว้", "Saved summaries")}</button>}
                  <button type="button" className={menuItem} onClick={() => { setBrandSettingsOpen(true); setMoreOpen(false); }}>⚙️ {t("ตั้งค่าแบรนด์", "Brand settings")}</button>
                </div>
              </FloatingDropdown>
            </div>
          </div>
        ) : (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            <BrandSlot theme={brandTheme} id="header_left" className="shrink-0 mt-1" />
            <div className="min-w-0">
            <div data-gg-live-badge className="mb-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.8)]" />
              Live design sheets dashboard
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{t("แผนที่ภารกิจงานออกแบบ", "Design mission map")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {t("ดึงใบงาน แบรนด์ และสถานะจากระบบจริงก่อน แล้วค่อยปรับหน้าตาเฉพาะแบรนด์ในขั้นถัดไป", "Live design sheets, brands and statuses from the system; brand-specific looks come next")}
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandSlot theme={brandTheme} id="header_right" className="shrink-0" />
            {/* สลับรูปแบบจอ (ของกลาง): 🖥️ จอคอม / 📟 แท็บเล็ต / 📱 มือถือ — เลือกแบบเล็กกว่าจอจริงจะได้กรอบพรีวิว + QR สแกนเปิดบนเครื่อง */}
            <DeviceModeToggle mode={deviceMode} viewport={viewport} onChange={setDeviceMode} compact={!isDesktop} />
            <RecordTasksButton moduleKey="design_sheets" canEdit={canEdit} />
            <a data-gg-action href="/master/design-sheets" className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
              {t("กลับ Design Sheets", "Back to Design Sheets")}
            </a>
            <button
              data-gg-action
              onClick={refreshDashboard}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white"
            >
              {t("รีเฟรชข้อมูล", "Refresh data")}
            </button>
            {selectedBrandId && (
              <button data-gg-action onClick={() => setThemeBuilderOpen(true)} title={t(`ปรับธีมของ ${selectedBrand?.name ?? "แบรนด์"}`, `Adjust theme for ${selectedBrand?.name ?? "brand"}`)}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
                🎨 {t("ปรับธีม", "Theme")}
              </button>
            )}
            <button data-gg-action="primary" onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              ＋ {t("เพิ่มงาน", "Add job")}
            </button>
          </div>
        </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {t("โหลดข้อมูลจริงไม่สำเร็จ", "Couldn't load data")}: {error}
          </div>
        )}

        {moveMessage && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${moveMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {moveMessage.text}
          </div>
        )}

        {/* แบรนด์: แถวบนสุด (เต็มกว้าง) */}
        <BrandBar isPhone={isPhone} isDesktop={isDesktop} loading={loading} groups={groups} selectedBrandKey={selectedBrandKey} setSelectedBrandKey={setSelectedBrandKey} brandMark={brandMark} brandTheme={brandTheme} brandSummaries={brandSummaries} setBrandSettingsOpen={setBrandSettingsOpen} setCreateOpen={setCreateOpen} />

        {/* ป๊อปอัปตั้งค่าแบรนด์ (เรียง/ซ่อน) — บันทึกรายคน */}
        <BrandSettingsModal brandSettingsOpen={brandSettingsOpen} setBrandSettingsOpen={setBrandSettingsOpen} orderedAll={orderedAll} brandPrefs={brandPrefs} topBrands={topBrands} moveBrand={moveBrand} brandMark={brandMark} toggleHiddenBrand={toggleHiddenBrand} />

        {/* สถิติ (แถวป้ายเล็กด้านบน) + บอร์ด (เต็มกว้าง) */}
        <div className="space-y-4">
          <DashboardStats isPhone={isPhone} loading={loading} visibleTotal={visibleTotal} total={total} sheets={sheets} loadedLimitNote={loadedLimitNote} scopeLabel={scopeLabel} activeJobs={activeJobs} urgentJobs={urgentJobs} finishedJobs={finishedJobs} brandTheme={brandTheme} />

          <main className="min-w-0 space-y-4">
            <section data-gg-panel className={`min-w-0 rounded-lg border border-white/70 bg-white/80 shadow-sm backdrop-blur ${isPhone ? "p-3" : "p-4"}`}>
              {!isPhone && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{t("เส้นทางสถานะจาก Workflow กลาง", "Status path from the central Workflow")}</h2>
                  <p className="text-xs text-slate-400">{scopeLabel} • {filteredSheets.length.toLocaleString("th-TH")} {t("งานที่โหลดมา", "jobs loaded")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> {t("ด่วน", "Urgent")}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {t("ใกล้ครบ", "Due soon")}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("ปิดงาน", "Closed")}</span>
                  </div>
                  <button
                    data-gg-action
                    onClick={() => setStatusMgr(true)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    {t("จัดการสถานะ", "Manage statuses")}
                  </button>
                </div>
              </div>
              )}

              {isPhone ? (
                /* ── มือถือ: ค้นหาเต็มแถว + สลับบอร์ด/แกลเลอรี (ไอคอน) · ตัวกรองด่วนเป็นชิปเลื่อนซ้าย-ขวา ── */
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("🔍 ค้นหารหัส / ชื่องาน...", "🔍 Search code / job name...")}
                      className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
                      {([["board", "🗂️", t("บอร์ดตามสถานะ", "Board by status")], ["gallery", "🖼️", t("การ์ดรูปใหญ่", "Large image cards")]] as const).map(([key, icon, label]) => (
                        <button key={key} type="button" onClick={() => changeViewMode(key)} title={label} aria-label={label}
                          className={`h-8 w-9 rounded text-sm transition ${viewMode === key ? "bg-slate-900 text-white" : "text-slate-600"}`}>{icon}</button>
                      ))}
                    </div>
                  </div>
                  <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1">
                    {([["all", t("ทั้งหมด", "All")], ["active", t("🛠 กำลังทำ", "🛠 In progress")], ["urgent", t("🔴 ด่วน", "🔴 Urgent")], ["soon", t("🟠 ใกล้กำหนด", "🟠 Due soon")], ["closed", t("✅ ปิดงาน", "✅ Closed")]] as const).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setQuickFilter(key)}
                        className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition ${quickFilter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
                    ))}
                  </div>
                </div>
              ) : (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("🔍 ค้นหารหัส / ชื่องาน / แบรนด์...", "🔍 Search code / job name / brand...")}
                  className="h-9 min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                <div className="flex flex-wrap items-center gap-1">
                  {([["all", t("ทั้งหมด", "All")], ["active", t("🛠 กำลังทำ", "🛠 In progress")], ["urgent", t("🔴 ด่วน", "🔴 Urgent")], ["soon", t("🟠 ใกล้กำหนด", "🟠 Due soon")], ["closed", t("✅ ปิดงาน", "✅ Closed")]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setQuickFilter(key)}
                      className={`h-9 rounded-md border px-3 text-xs font-medium transition ${quickFilter === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
                {/* ส่งใบงานขึ้นกระดานวางแผน (Campaign Canvas) — ติ๊กเลือกหลายใบแล้วส่งทีเดียว */}
                {canTasks && (
                  <button type="button" onClick={() => (pickMode && pickPurpose === "board" ? exitPickMode() : startPick("board"))}
                    title={t("ติ๊กเลือกใบงานแล้วส่งขึ้นกระดานวางแผนของแคมเปญ", "Select sheets and send them to a campaign planning board")}
                    className={`h-9 rounded-md border px-3 text-xs font-medium transition ${pickMode && pickPurpose === "board" ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"}`}>
                    {pickMode && pickPurpose === "board" ? t("✕ ออกจากโหมดเลือก", "✕ Exit select mode") : t("🎨 ส่งขึ้นกระดาน", "🎨 Send to board")}
                  </button>
                )}
                {/* 📋 สรุปงาน: สรุปใหม่ (ติ๊กเลือกใบที่ยังไม่ปิด) / เปิดสรุปที่บันทึกไว้ — ป๊อปของกลาง design-sheet-summary */}
                {canEdit && (
                  <div className="relative" ref={summaryAnchorRef}>
                    {pickMode && pickPurpose === "summary" ? (
                      <button type="button" onClick={exitPickMode}
                        className="h-9 rounded-md border border-teal-600 bg-teal-600 px-3 text-xs font-medium text-white">✕ {t("ออกจากโหมดสรุป", "Exit summary mode")}</button>
                    ) : (
                      <button type="button" onClick={() => setSummaryMenuOpen((o) => !o)} title={t("สรุปงานที่เลือก → พิมพ์ / PDF / คัดลอกเป็นรูป", "Summarize selected jobs → print / PDF / copy as image")}
                        className="h-9 rounded-md border border-teal-200 bg-white px-3 text-xs font-medium text-teal-700 hover:bg-teal-50">📋 {t("สรุปงาน", "Summary")} ▾</button>
                    )}
                  </div>
                )}
                {/* เลือกจำนวนการ์ดต่อแถว (ของกลาง) — เฉพาะมุมมองแกลเลอรี */}
                {viewMode === "gallery" && !isPhone && (
                  <GalleryColumnsControl cols={galleryCols} onChange={setGalleryCols} className="ml-auto" />
                )}
                {/* ซ่อน/โชว์คอลัมน์สถานะบนบอร์ด (จำรายคน) — ค่าเริ่มต้นซ่อน ยกเลิก + ทำตัวอย่างใบเดียว */}
                {viewMode === "board" && (
                  <div className="relative" ref={hideColsAnchorRef}>
                    <button type="button" onClick={() => setHideColsOpen((o) => !o)}
                      title={hiddenBoardColumns.length ? `${t("ซ่อนอยู่", "Hidden")}: ${hiddenBoardColumns.map((c) => c.label).join(", ")}` : t("เลือกคอลัมน์สถานะที่จะโชว์บนบอร์ด", "Choose status columns to show on the board")}
                      className={`h-9 rounded-md border px-3 text-xs font-medium transition ${hiddenBoardColumns.length ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      👁 {hiddenBoardColumns.length ? t(`ซ่อน ${hiddenBoardColumns.length} คอลัมน์`, `${hiddenBoardColumns.length} hidden`) : t("คอลัมน์", "Columns")} ▾
                    </button>
                    <FloatingDropdown anchorRef={hideColsAnchorRef} open={hideColsOpen} onClose={() => setHideColsOpen(false)} minWidth={260} maxWidth={320}>
                      <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl">
                        <div className="px-2 py-1 text-[11px] font-medium text-slate-500">{t("คอลัมน์สถานะบนบอร์ด (ติ๊ก = โชว์)", "Status columns on the board (checked = shown)")}</div>
                        {allBoardColumns.map((c) => (
                          <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                            <input type="checkbox" checked={!hiddenSet.has(c.key)} onChange={() => toggleHiddenCol(c.key)} className="h-4 w-4" />
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="min-w-0 flex-1 truncate">{c.label}</span>
                            <span className="text-[11px] text-slate-400">{c.sheets.length}</span>
                          </label>
                        ))}
                        <div className="mt-1 flex gap-1 border-t border-slate-100 pt-1.5">
                          <button type="button" onClick={() => saveHiddenCols([])} className="h-7 flex-1 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{t("แสดงทั้งหมด", "Show all")}</button>
                          <button type="button" onClick={() => saveHiddenCols(DEFAULT_HIDDEN_COLS)} className="h-7 flex-1 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{t("ค่าเริ่มต้น", "Default")}</button>
                        </div>
                      </div>
                    </FloatingDropdown>
                  </div>
                )}
                {/* 🪟 ชี้ที่การ์ด = รูปใหญ่ + รายละเอียดงาน (ตั้งค่าต่อคน) — จอคอมเท่านั้น (ทัชไม่เด้ง) */}
                {isDesktop && <SheetHoverSettingsButton pref={hoverPref} />}
                {/* ขนาดการ์ดบนบอร์ด: ▦ การ์ดเล็ก / ☰ แถวย่อ — จำรายคน (เฉพาะมุมมองบอร์ด) */}
                {viewMode === "board" && (
                  <div className="ml-auto flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5" title={t("ขนาดการ์ดบนบอร์ด (จำค่าของคุณ)", "Card size on the board (remembered for you)")}>
                    {([["compact", t("▦ การ์ดเล็ก", "▦ Small cards")], ["row", t("☰ แถวย่อ", "☰ Compact rows")]] as const).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => changeCardSize(key)}
                        className={`h-8 rounded px-2.5 text-xs font-medium transition ${cardSize === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                    ))}
                  </div>
                )}
                {/* สลับมุมมอง: บอร์ด Kanban ↔ การ์ดรูปใหญ่ (แกลเลอรี) — จำค่ารายคน */}
                <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
                  {([["board", t("🗂️ บอร์ด", "🗂️ Board")], ["gallery", t("🖼️ การ์ดรูปใหญ่", "🖼️ Large cards")]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => changeViewMode(key)}
                      className={`h-8 rounded px-2.5 text-xs font-medium transition ${viewMode === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
              </div>
              )}

              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((item) => <LoadingCard key={item} />)}
                </div>
              ) : filteredSheets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-400">
                  <BrandSlot theme={brandTheme} id="page_empty" />
                  {t("ยังไม่มีใบงานสำหรับตัวกรองนี้", "No sheets match this filter")}
                </div>
              ) : viewMode === "gallery" ? (
                /* ── มุมมองการ์ดรูปใหญ่ (แกลเลอรี): เห็นรูปงานเต็มใบ ไม่โดนตัด · จำนวนต่อแถวเลือกได้ · เรียงตามอัปเดตล่าสุด ── */
                <div style={galleryStyle}>
                  {filteredSheets.map(renderGalleryCard)}
                </div>
              ) : (
                /* ห้ามใส่ overflow-* ที่กรอบนี้ — จะทำให้หัวคอลัมน์ sticky ยึดกับกรอบแทนหน้าจอ (คอลัมน์พอดีจอแล้ว ไม่ต้อง scroll แนวนอน) */
                <StatusBoard boardColumns={boardColumns} cardSize={cardSize} renderBoardCard={renderBoardCard} renderGalleryCard={renderGalleryCard} isDesktop={isDesktop} isPhone={isPhone} dropTargetStatus={dropTargetStatus} handleColumnDragOver={handleColumnDragOver} handleColumnDragLeave={handleColumnDragLeave} handleColumnDrop={handleColumnDrop} brandTheme={brandTheme} toggleHiddenCol={toggleHiddenCol} expandedCols={expandedCols} setExpandedCols={setExpandedCols} phoneCol={phoneCol} setPhoneStatus={setPhoneStatus} />
              )}
            </section>

            <AuditFeed isPhone={isPhone} isDesktop={isDesktop} brandTheme={brandTheme} auditRows={auditRows} />
          </main>
        </div>
        {/* มือถือ: ปุ่ม ＋ ลอยมุมล่างขวา (ซ่อนตอนอยู่โหมดเลือกส่งขึ้นกระดาน — แถบล่างใช้พื้นที่นั้น) */}
        {isPhone && !pickMode && (
          <button type="button" onClick={() => setCreateOpen(true)} title={t("เพิ่มงานใหม่", "Add new job")} aria-label={t("เพิ่มงานใหม่", "Add new job")}
            className="fixed bottom-5 right-4 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-900 text-2xl leading-none text-white shadow-lg shadow-slate-900/30 active:scale-95">＋</button>
        )}
      </div>
  );

  return (
    <BrandThemedShell theme={brandTheme}>
      <DevicePreviewFrame layout={layout} viewport={viewport} onExitPreview={() => setDeviceMode("auto")}>{body}</DevicePreviewFrame>

      {/* แถบล่าง "เลือกไว้ N ใบ" (Bulk action bar) — โผล่เฉพาะโหมดเลือก */}
      <PickActionBar pickMode={pickMode} pickPurpose={pickPurpose} pickedIds={pickedIds} filteredSheets={filteredSheets} canPick={canPick} setPickedIds={setPickedIds} exitPickMode={exitPickMode} openSummary={openSummary} setCampaignPickOpen={setCampaignPickOpen} />

      {/* เลือกแคมเปญปลายทาง (ของกลาง) */}
      <CampaignBoardPicker open={campaignPickOpen} onClose={() => setCampaignPickOpen(false)} sheetIds={Array.from(pickedIds)} />

      {/* 📋 ดรอปดาวน์สรุปงาน (สรุปใหม่ + สรุปที่บันทึกไว้) — จอคอมยึดปุ่มในแถบเครื่องมือ · มือถือยึดปุ่ม ⋯ */}
      <FloatingDropdown anchorRef={isPhone ? moreAnchorRef : summaryAnchorRef} open={summaryMenuOpen} onClose={() => setSummaryMenuOpen(false)} minWidth={300} maxWidth={380}>
        <SummaryListMenu reloadKey={summaryReload} onNew={() => { setSummaryMenuOpen(false); startPick("summary"); }} onOpen={(id) => openSummary(id)} />
      </FloatingDropdown>
      {summaryBuilder && (
        <DesignSheetSummaryBuilder open summaryId={summaryBuilder.id} initialSheetIds={summaryBuilder.sheetIds}
          onClose={() => setSummaryBuilder(null)} onChanged={() => setSummaryReload((k) => k + 1)} />
      )}

      {statusMgr && (
        <WorkflowStatusManager
          open={statusMgr}
          onClose={() => setStatusMgr(false)}
          entityType="design_sheet"
          actor={null}
          onChanged={refreshDashboard}
          customerOnlyOption
        />
      )}

      {/* popup รายละเอียดงาน "ในตัวบอร์ด" (reuse popup ของ Design Sheets) — ปิดแล้วรีเฟรชบอร์ดให้เห็นการเปลี่ยน */}
      {openSheetId && (
        <DesignSheetDetail detailOnly openId={openSheetId} onDetailClose={() => { openDetail(null); silentRefresh(); }} onOpenPresentation={(id) => setPresentId(id)} />
      )}

      {presentId && <DesignSheetPresentPanel sheetId={presentId} open={!!presentId} onClose={() => setPresentId(null)} />}

      {/* popup สร้างงานใหม่ (reuse ฟอร์มเดิม) — default แบรนด์ = แบรนด์ที่เลือกอยู่ในแถบซ้าย · ปิดแล้ว refresh เงียบ */}
      {createOpen && (
        <DesignSheetDetail detailOnly createMode defaultBrandId={selectedBrand?.id ?? null}
          onDetailClose={() => { setCreateOpen(false); silentRefresh(); }} />
      )}

      {/* Brand Theme Builder — ปรับธีมของแบรนด์ที่เลือก · เผยแพร่แล้วโหลดธีมใหม่ */}
      {themeBuilderOpen && selectedBrandId && (
        <BrandThemeBuilder brandId={selectedBrandId} brandName={selectedBrand?.name ?? t("แบรนด์", "Brand")}
          statuses={statusColumns.map((c) => ({ key: c.key, label: c.label }))}
          brands={brandSummaries.filter((b) => b.id && b.id !== selectedBrandId).map((b) => ({ id: b.id as string, name: b.name }))}
          open={themeBuilderOpen} onClose={() => setThemeBuilderOpen(false)}
          onPublished={() => setThemeReloadKey((k) => k + 1)} />
      )}
    </BrandThemedShell>
  );
}