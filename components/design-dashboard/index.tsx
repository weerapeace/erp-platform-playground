"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { buildStatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { SheetHoverSettingsPanel, useSheetHoverPref } from "./sheet-hover";
import { MenuBar, type MenuDef, type MenuItem } from "@/components/menu-bar";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { CampaignBoardPicker, useCanSendToBoard } from "@/components/campaign-board-send";
import { SummaryListMenu } from "@/components/design-sheet-summary/list-menu";
import { ChecklistPresetsEditor, RecordTasksButton } from "@/components/record-tasks";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import type { ChecklistSummary } from "@/lib/record-tasks";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { BrandSlot } from "@/components/brand-theme/slots";
import { BrandThemedShell, useBrandTheme } from "@/components/brand-theme/provider";
import { BrandThemeBuilder } from "@/components/brand-theme-builder";
import { useViewportLayout, useDeviceMode, DeviceModeToggle, DevicePreviewFrame, DEVICE_PARAM } from "@/components/device-view";
import { useStickyHeader } from "@/components/sticky-header";
import { type ListResponse, type StatusResponse, type MoveMessage, type BrandSummary, type StatusColumn, type BrandGroup, GROUP_KEY, MINE_KEY, GROUP_LABEL, DEFAULT_HIDDEN_COLS, DASHBOARD_LIMIT, readApi, safeColor, brandKeyOf, brandNameOf, sheetIsOwn, daysUntil, isUrgent, passPhoneFilter, LoadingCard } from "./dashboard-helpers";
import { BoardCard, GalleryCard } from "./dashboard-cards";
import { BrandBar } from "./brand-bar";
import { BrandSettingsModal } from "./brand-settings-modal";
import { StatusBoard } from "./status-board";
import { PhoneTodayView } from "./phone-today";
import { BottomSheet } from "@/components/modal";
import { DesignStatusSheet } from "@/components/design-sheet-mobile/status-sheet";
import { PickActionBar } from "./pick-action-bar";
import { LineInboxButton, LineInboxDrawer, useLineInboxCount } from "./line-inbox";
import type { LineInboxItem, MergeSheetOption } from "@/lib/design-line-inbox-shared";
import type { DesignSheetPrefill } from "@/components/design-sheet-detail";
import { usePageOwnsBottomBar } from "@/lib/app-shell-bar";

const WorkflowStatusManager = dynamic(
  () => import("@/components/workflow-status-manager").then((mod) => mod.WorkflowStatusManager),
  { ssr: false }
);
// popup รายละเอียดงาน = ของกลาง design-sheet-detail โหมด "เฉพาะ popup" (โหลดเฉพาะตอนเปิดการ์ด ไม่ถ่วงบอร์ด)
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });
// 💡 หน้าไอเดีย (Drafted) — โหลดเมื่อเปิดมุมมองนี้เท่านั้น (./ideas-view · เจ้าของขอ 2026-11-12)
const IdeasView = dynamic(() => import("./ideas-view").then((m) => m.IdeasView), { ssr: false });
// แผงลอย "📄 ใบนำเสนอ A4" — mount ที่ระดับบอร์ด (ปิดป๊อปอัปใบงานแล้วแผงยังอยู่ ดูบอร์ดไปจัดใบไป)
const DesignSheetPresentPanel = dynamic(() => import("@/components/design-sheet-present").then((m) => m.DesignSheetPresentPanel), { ssr: false });
// ป๊อป "📋 สรุปงาน" (ของกลาง design-sheet-summary) — โหลดเฉพาะตอนเปิด
const DesignSheetSummaryBuilder = dynamic(() => import("@/components/design-sheet-summary").then((m) => m.DesignSheetSummaryBuilder), { ssr: false });
// ลงออเดอร์จากใบงาน (ของกลาง ป๊อปเดียวกับหน้าใบสั่งขาย) — โหลดเมื่อใช้
const OrderBatchEntryModal = dynamic(() => import("@/components/order-batch-entry").then((m) => m.OrderBatchEntryModal), { ssr: false });

export function DesignDashboard() {
  const t = useT();
  const canEdit = usePermission("products.edit");
  const canOrder = usePermission("so.create");
  const canTasks = useCanSendToBoard();   // มีสิทธิ์เข้าแอปงาน (ที่กระดานแคมเปญอยู่) ไหม — ไม่มี = ไม่โชว์ปุ่ม
  const [sheets, setSheets] = useState<DesignSheetListItem[]>([]);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedBrandKey, setSelectedBrandKey] = useState(GROUP_KEY.customer);   // แบรนด์เดียว หรือ "ทั้งกลุ่ม" (GROUP_KEY) หรือ ⭐ แบรนด์ของฉัน (MINE_KEY)
  const brandPicked = useRef(false);   // ผู้ใช้กดเลือกเองแล้ว = ไม่สลับไป "แบรนด์ของฉัน" อัตโนมัติ
  const pickBrand = (key: string) => { brandPicked.current = true; setSelectedBrandKey(key); };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusMgr, setStatusMgr] = useState(false);
  const [checklistCfg, setChecklistCfg] = useState(false);   // ⚙️ ตั้งค่า → Checklist งานใหม่ (ข้อที่ใส่ให้ทุกงานใหม่ · เจ้าของขอ 2026-11-12)
  const [draggingSheetId, setDraggingSheetId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const [movingSheetId, setMovingSheetId] = useState<string | null>(null);
  const [moveMessage, setMoveMessage] = useState<MoveMessage | null>(null);
  const [search, setSearch] = useState("");
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);   // เปิด popup รายละเอียดในตัวบอร์ด
  const [presentId, setPresentId] = useState<string | null>(null);       // แผงใบนำเสนอ A4 ของใบไหน (null = ปิด)
  const [createOpen, setCreateOpen] = useState(false);                   // เปิด popup สร้างงานใหม่
  // 📥 กล่องงานจากไลน์ — ร่างที่บอทรับจากกลุ่มส่งงานออกแบบ · กด "เปิดใบงาน" = ฟอร์มสร้างเดิมกรอกให้ (createPrefill)
  const isAdmin = usePermission("admin.users");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxKey, setInboxKey] = useState(0);
  const [createPrefill, setCreatePrefill] = useState<DesignSheetPrefill | null>(null);
  const inboxCount = useLineInboxCount(inboxKey);
  const convertFromInbox = (it: LineInboxItem) => {
    const from = [it.sender_name, it.last_message_at ? new Date(it.last_message_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""].filter(Boolean).join(" · ");
    setCreatePrefill({
      // ข้อความจากไลน์ (มักเป็นแชตลูกค้าที่ส่งต่อมา) → ช่อง Note ตามเดิมทุกบรรทัด · "รายละเอียดงาน" เว้นว่างให้ทีมสรุปเอง (เจ้าของเลือก 2026-11-03)
      name: it.name, brand_id: it.brand_id, deadline: it.deadline, note: it.text,
      lineInboxId: it.id, images: it.images,
      sourceLabel: t(`มาจากไลน์${from ? ` · ${from}` : ""} · ชื่อ/แบรนด์/วันส่ง AI กรอกให้ · ข้อความไลน์อยู่ในช่อง Note — ตรวจก่อนบันทึก`, `From LINE${from ? ` · ${from}` : ""} · name/brand/due date filled by AI · LINE text is in Note — check before saving`),
    });
    setInboxOpen(false);
    setCreateOpen(true);
  };
  // ใบงานบนบอร์ด (แก้ล่าสุดก่อน) ให้กล่องเลือกตอน "รวมกับงาน…" แนบรูปเข้าใบที่มีแล้ว — ไม่ต้องโหลดซ้ำ
  const mergeSheets = useMemo<MergeSheetOption[]>(() => sheets.map((s) => ({
    id: s.id, code: s.code, name: s.name, brand_name: s.brand_name, cover_url: s.cover_url, updated_at: s.updated_at,
  })), [sheets]);
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());   // คอลัมน์ที่กางดูงานครบ (ไม่จำกัด 8)
  const [viewMode, setViewMode] = useState<"board" | "gallery" | "ideas">("board");     // มุมมอง: บอร์ด Kanban / การ์ดรูปใหญ่ (แกลเลอรี) / ไอเดีย (ยังไม่ใช่งานจริง)
  const { cols: galleryCols, setCols: setGalleryCols, gridStyle: galleryGridStyle } = useGalleryColumns("design-dashboard", 6);   // จำนวนการ์ดต่อแถว (ของกลาง จำรายคน)
  // ── รูปแบบจอ (ของกลาง device-view): จอคอม / แท็บเล็ต / มือถือ — อัตโนมัติตามจอจริง หรือเลือกเอง (?device=) ──
  // `layout` = สิ่งที่ต้องเรนเดอร์จริง · เลือกดูแบบมือถือบนจอคอม → DevicePreviewFrame ครอบเป็นกรอบเครื่อง + QR ให้สแกนเปิดบนเครื่องจริง
  const viewport = useViewportLayout();
  const { mode: deviceMode, setMode: setDeviceMode, layout } = useDeviceMode(viewport);
  const isDesktop = layout === "desktop";
  const isPhone = layout === "phone";
  // มือถือมีแถบล่างของตัวเอง (บอร์ด/วันนี้/ไลน์/เมนู) → บอกเชลล์แอปเดี่ยวให้ซ่อนแถบเมนูแอป (กันซ้อน 2 แถบ · เมนูแอปอยู่ที่ ☰)
  usePageOwnsBottomBar(isPhone);
  const [moreOpen, setMoreOpen] = useState(false);                     // มือถือ: เมนู ⋯ รวมปุ่มรอง (กลับ/รีเฟรช/ธีม/จัดการสถานะ/ส่งขึ้นกระดาน/ตั้งค่าแบรนด์)
  const moreAnchorRef = useRef<HTMLDivElement>(null);
  // 📌 หัวหน้าติดบนตอนเลื่อน (ของกลาง sticky-header · เจ้าของขอ 2026-10-24) — จอคอม/แท็บเล็ต เหลือแถบบาง ชื่อหน้า + ปุ่ม · มือถือ ติดทั้งหัว
  const sticky = useStickyHeader({ watch: layout });
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null); // มือถือ: บอร์ดเป็น "แท็บสถานะ" ทีละสถานะ (ไม่ใช่คอลัมน์เรียงข้าง)
  const [phoneView, setPhoneView] = useState<"board" | "today">("board");   // มือถือ: แถบล่าง บอร์ด / วันนี้
  const [quickStatusFor, setQuickStatusFor] = useState<DesignSheetListItem | null>(null);   // มือถือ: กดค้างที่การ์ด → แผ่นเปลี่ยนสถานะ
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
  const [brandPrefs, setBrandPrefs] = useState<{ order: string[]; hidden: string[]; fav: string[] }>({ order: [], hidden: [], fav: [] });
  const [brandSettingsOpen, setBrandSettingsOpen] = useState(false);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_brand_prefs").then((r) => r.json())
      .then((j) => { const v = (j?.value ?? {}) as { order?: string[]; hidden?: string[]; fav?: string[] };
        const fav = Array.isArray(v.fav) ? v.fav : [];
        setBrandPrefs({ order: Array.isArray(v.order) ? v.order : [], hidden: Array.isArray(v.hidden) ? v.hidden : [], fav });
        if (fav.length && !brandPicked.current) setSelectedBrandKey(MINE_KEY); })   // มีแบรนด์โปรด = เปิดมาโชว์ของฉันก่อน
      .catch(() => {});
  }, []);
  const saveBrandPrefs = (next: { order: string[]; hidden: string[]; fav: string[] }) => {
    setBrandPrefs(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_brand_prefs", value: next }) }).catch(() => {});
  };
  // จำมุมมองที่เลือกไว้รายคน (บอร์ด/การ์ดรูปใหญ่)
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_view_mode").then((r) => r.json())
      .then((j) => { const v = j?.value; if (v === "board" || v === "gallery" || v === "ideas") setViewMode(v); })
      .catch(() => {});
  }, []);
  // คอลัมน์สถานะที่ซ่อนบนบอร์ด — จำรายคน (user_ui_prefs) · ยังไม่เคยตั้ง = ค่าเริ่มต้น DEFAULT_HIDDEN_COLS
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN_COLS);
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
  // คอลัมน์ที่ "พับ" เป็นแถบแคบ (ยังเห็นชื่อ+จำนวน · ลากการ์ดไปวางได้) — จำรายคน · เจ้าของขอ 2026-11-07
  const [foldedCols, setFoldedCols] = useState<string[]>([]);
  const foldedRef = useRef<string[]>([]);   // ค่าล่าสุดเสมอ — กดพับหลายคอลัมน์ติดกันเร็ว ๆ ไม่ทับกัน
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_folded_cols").then((r) => r.json())
      .then((j) => { const v = j?.value; if (Array.isArray(v)) { foldedRef.current = v.map(String); setFoldedCols(foldedRef.current); } })
      .catch(() => {});
  }, []);
  const saveFoldedCols = (next: string[]) => {
    foldedRef.current = next;
    setFoldedCols(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_folded_cols", value: next }) }).catch(() => {});
  };
  const toggleFoldCol = (key: string) => { const cur = foldedRef.current; saveFoldedCols(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]); };
  const foldedSet = useMemo(() => new Set(foldedCols), [foldedCols]);
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
  // แถบสีแบรนด์ซ้ายการ์ด (ของกลาง components/brand-strip · เจ้าของเลือกแบบแถบซ้าย 2026-11-07) — ค่าเริ่มต้นเปิด · ปิดได้ต่อคน
  const [brandStrip, setBrandStrip] = useState(true);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=design_dashboard_brand_strip").then((r) => r.json())
      .then((j) => { if (typeof j?.value === "boolean") setBrandStrip(j.value); })
      .catch(() => {});
  }, []);
  const toggleBrandStrip = () => {
    const next = !brandStrip;
    setBrandStrip(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_brand_strip", value: next }) }).catch(() => {});
  };
  // 🪟 ชี้ที่การ์ด = รูปใหญ่ + รายละเอียดงาน (ของกลาง components/hover-card) — ตั้งค่าต่อคน
  const hoverPref = useSheetHoverPref();
  const hoverOn = hoverPref.on && hoverPref.fields.length > 0;
  const changeViewMode = (mode: "board" | "gallery" | "ideas") => {
    setViewMode(mode);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "design_dashboard_view_mode", value: mode }) }).catch(() => {});
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("open");
    if (id) setOpenSheetId(id);   // เปิดด้วยลิงก์ ?open=ID (refresh/copy link แล้วยังเปิดงานเดิม)
    if (sp.get("inbox") === "1") setInboxOpen(true);   // ลิงก์จากบอทไลน์ "ดูในระบบ" → เปิดกล่องงานจากไลน์
    // ?convert=ID (แท็บ LINE ในศูนย์แจ้งเตือน "เปิดใบงาน") → เปิดฟอร์มสร้างใบงานจากร่างนั้นเลย · ไม่เจอ/เปิดไปแล้ว = ค้างที่กล่องจากไลน์
    const convertId = sp.get("convert");
    if (convertId) {
      void apiFetch("/api/design-sheets/line-inbox?tab=pending").then((r) => (r.ok ? r.json() : null)).then((j: { items?: LineInboxItem[] } | null) => {
        const it = j?.items?.find((x) => x.id === convertId);
        if (it) convertFromInbox(it);
      }).catch(() => {});
      const url = new URL(window.location.href); url.searchParams.delete("convert"); window.history.replaceState(null, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // ตัวกรองด่วน — overdue/due2/await_quote/nodl ใช้กับตัวเลขสรุปบนมือถือ (จอคอมยังมี 5 ตัวเดิมในเมนู)
  const [quickFilter, setQuickFilter] = useState<"all" | "active" | "urgent" | "soon" | "closed" | "overdue" | "due2" | "await_quote" | "nodl">("all");

  // ── โหมดติ๊กเลือกใบงาน — ใช้ 2 งาน: 🎨 ส่งขึ้นกระดานแคมเปญ (ของกลาง campaign-board-send) / 📋 สรุปงาน (ของกลาง design-sheet-summary) ──
  const [pickMode, setPickMode] = useState(false);
  const [pickPurpose, setPickPurpose] = useState<"board" | "summary" | "order">("board");
  // 📦 ลงออเดอร์: ใบงานที่ติ๊ก → รายการตั้งต้น (กางสี/แบบจาก Parent SKU · ยังไม่มี SKU = ลงชื่อไว้) → ป๊อปลงออเดอร์กลาง
  const [orderSeed, setOrderSeed] = useState<{ seeds: import("@/components/order-batch-entry").BatchSeedLine[]; brand: { id: string; name: string | null } | null } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
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
  const startPick = (purpose: "board" | "summary" | "order") => { setPickPurpose(purpose); setPickedIds(new Set()); setPickMode(true); };
  const openOrderFromPicked = async () => {
    const picked = sheets.filter((s) => pickedIds.has(s.id));
    if (picked.length === 0) return;
    setOrderLoading(true);
    try {
      const { seedsFromDesignSheets } = await import("@/components/order-batch-entry");
      const seeds = await seedsFromDesignSheets(picked);
      const brandIds = [...new Set(picked.map((s) => s.brand_id))];
      const brand = brandIds.length === 1 && brandIds[0] ? { id: brandIds[0], name: picked[0].brand_name } : null;
      exitPickMode();
      setOrderSeed({ seeds, brand });
    } finally { setOrderLoading(false); }
  };
  // ป๊อปสรุปงาน + ดรอปดาวน์ "สรุปที่บันทึกไว้"
  const [summaryBuilder, setSummaryBuilder] = useState<{ id: string | null; sheetIds: string[] } | null>(null);
  const [summaryMenuOpen, setSummaryMenuOpen] = useState(false);
  const [summaryReload, setSummaryReload] = useState(0);
  const openSummary = (id: string | null, sheetIds: string[] = []) => { setSummaryMenuOpen(false); setMoreOpen(false); setSummaryBuilder({ id, sheetIds }); };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    async function loadDashboard() {
      // (ฟีดประวัติ Audit Log ท้ายหน้า เอาออกแล้ว — เจ้าของขอ 2026-11-07 · ดูประวัติรายใบได้ในป๊อปใบงาน)
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

  const mineOn = selectedBrandKey === MINE_KEY;
  const favSet = useMemo(() => new Set(brandPrefs.fav), [brandPrefs.fav]);
  const favBrands = useMemo(() => brandSummaries.filter((b) => favSet.has(b.key)), [brandSummaries, favSet]);
  const isGroupKey = selectedBrandKey === GROUP_KEY.customer || selectedBrandKey === GROUP_KEY.own;
  useEffect(() => {
    if (loading) return;   // ยังโหลดไม่เสร็จ (ยังไม่มีแบรนด์) — อย่าเพิ่งรีเซ็ต
    if (mineOn ? brandPrefs.fav.length === 0 : !isGroupKey && !brandSummaries.some((brand) => brand.key === selectedBrandKey)) {
      setSelectedBrandKey(GROUP_KEY.customer);
    }
  }, [brandSummaries, selectedBrandKey, isGroupKey, mineOn, brandPrefs.fav.length, loading]);
  const toggleFavBrand = (key: string) => {
    const fav = favSet.has(key) ? brandPrefs.fav.filter((k) => k !== key) : [...brandPrefs.fav, key];
    saveBrandPrefs({ ...brandPrefs, fav });
  };
  const selectedBrand = brandSummaries.find((brand) => brand.key === selectedBrandKey) ?? null;
  // กลุ่มที่กำลังดู: เลือกแบรนด์เดียว = กลุ่มของแบรนด์นั้น · ⭐ ของฉัน = มีแบรนด์ลูกค้าปน → มุมมองงานลูกค้า · เลือก "ทั้งหมด" ของกลุ่ม = กลุ่มนั้น
  const selectedGroup: BrandGroup = selectedBrand ? (selectedBrand.own ? "own" : "customer")
    : mineOn ? (favBrands.length > 0 && favBrands.every((b) => b.own) ? "own" : "customer")
    : selectedBrandKey === GROUP_KEY.own ? "own" : "customer";
  const ownView = selectedGroup === "own";
  const scopeLabel = selectedBrand ? selectedBrand.name : mineOn ? t("⭐ แบรนด์ของฉัน", "⭐ My brands") : GROUP_LABEL[selectedGroup].all;

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

  // ขอบเขตที่กำลังดู = แบรนด์ที่เลือก + คำค้น (ยังไม่กรองด่วน) — ใช้นับจำนวนในเมนูตัวกรอง
  const scopedSheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (mineOn) { if (!favSet.has(brandKeyOf(sheet))) return false; }
      else if (isGroupKey) { if (sheetIsOwn(sheet) !== (selectedBrandKey === GROUP_KEY.own)) return false; }
      else if (brandKeyOf(sheet) !== selectedBrandKey) return false;
      if (q && !`${sheet.code} ${sheet.name} ${sheet.brand_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [selectedBrandKey, isGroupKey, mineOn, favSet, sheets, search]);
  const passQuick = (sheet: DesignSheetListItem, f: typeof quickFilter) => {
    if (f === "active") return !statusMeta.finished.has(sheet.status);
    if (f === "urgent") return isUrgent(sheet, statusMeta);
    if (f === "soon") { const dd = daysUntil(sheet.deadline); return !statusMeta.finished.has(sheet.status) && dd !== null && dd <= 7; }
    if (f === "closed") return statusMeta.finished.has(sheet.status);
    if (f === "overdue" || f === "due2" || f === "await_quote" || f === "nodl") return passPhoneFilter(sheet, f, statusMeta);
    return true;
  };
  const filteredSheets = useMemo(() => (quickFilter === "all" ? scopedSheets : scopedSheets.filter((s) => passQuick(s, quickFilter))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedSheets, quickFilter, statusMeta]);
  const filterCounts = useMemo(() => {
    const c = { all: scopedSheets.length, active: 0, urgent: 0, soon: 0, closed: 0, overdue: 0, due2: 0, await_quote: 0, nodl: 0 };
    for (const s of scopedSheets) for (const f of ["active", "urgent", "soon", "closed", "overdue", "due2", "await_quote", "nodl"] as const) if (passQuick(s, f)) c[f]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedSheets, statusMeta]);

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
  // โหลดมาไม่ครบทุกใบ (เกิน DASHBOARD_LIMIT) → บอกไว้ใต้หัวบอร์ด (เดิมอยู่ในการ์ดสถิติที่เอาออกแล้ว)
  const loadedLimitNote = total > sheets.length ? t(`แสดงล่าสุด ${sheets.length.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} งาน`, `Showing latest ${sheets.length.toLocaleString("th-TH")} of ${total.toLocaleString("th-TH")} jobs`) : null;

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

  // ── แถบเมนูจอคอม/แท็บเล็ต (ของกลาง components/menu-bar) — แทนปุ่มเรียงยาวเดิม · ไอคอนเส้น ไม่มีอีโมจิสี ──
  const FILTER_DEFS = [
    { key: "all", label: t("ทั้งหมด", "All"), icon: "list" },
    { key: "active", label: t("กำลังทำ", "In progress"), icon: "hourglass" },
    { key: "urgent", label: t("ด่วน", "Urgent"), icon: "alert-triangle" },
    { key: "soon", label: t("ใกล้กำหนด (7 วัน)", "Due within 7 days"), icon: "clock" },
    { key: "closed", label: t("ปิดงานแล้ว", "Closed"), icon: "circle-check" },
  ] as const;
  const activeFilter = FILTER_DEFS.find((f) => f.key === quickFilter) ?? FILTER_DEFS[0];
  const allFolded = boardColumns.length > 0 && boardColumns.every((c) => foldedSet.has(c.key));
  const toolbarMenus: MenuDef[] = ([
    {
      key: "filter", icon: "filter", width: 230,
      label: quickFilter === "all" ? t("ตัวกรอง", "Filter") : `${t("ตัวกรอง", "Filter")}: ${activeFilter.label}`,
      active: quickFilter !== "all", onClear: () => setQuickFilter("all"), clearLabel: t("ล้างตัวกรอง", "Clear filter"),
      items: FILTER_DEFS.map((f): MenuItem => ({ type: "radio", key: f.key, label: f.label, icon: f.icon, checked: quickFilter === f.key, onSelect: () => setQuickFilter(f.key), hint: filterCounts[f.key] })),
    },
    {
      key: "work", icon: "bolt", label: t("ทำงาน", "Actions"), width: 240,
      items: [
        ...(canTasks ? [{ key: "board", icon: "presentation", label: t("ส่งขึ้นกระดาน", "Send to board"), title: t("ติ๊กเลือกใบงานแล้วส่งขึ้นกระดานวางแผนของแคมเปญ", "Select sheets and send them to a campaign planning board"), onSelect: () => startPick("board") }] : []),
        ...(canOrder ? [{ key: "order", icon: "shopping-cart", label: t("ลงออเดอร์", "Add orders"), title: t("ติ๊กเลือกใบงานแล้วลงเป็นออเดอร์ลูกค้า (ใบสั่งขาย) + จับชุด", "Select sheets and add them as customer orders"), onSelect: () => startPick("order") }] : []),
        ...(canEdit ? [
          ...(canTasks || canOrder ? [{ type: "divider", key: "d1" }] : []),
          { type: "submenu", key: "summary", icon: "file-text", label: t("สรุปงาน", "Summary"), width: 320, bare: true,
            render: (close: () => void) => <SummaryListMenu reloadKey={summaryReload} onNew={() => { close(); startPick("summary"); }} onOpen={(id) => { close(); openSummary(id); }} /> },
        ] : []),
      ] as MenuItem[],
    },
    {
      key: "view", icon: "layout-dashboard", label: t("มุมมอง", "View"), width: 240,
      items: [
        { type: "radio", key: "v-board", icon: "layout-kanban", label: t("บอร์ดตามสถานะ", "Board by status"), checked: viewMode === "board", onSelect: () => changeViewMode("board") },
        { type: "radio", key: "v-gallery", icon: "photo", label: t("การ์ดรูปใหญ่", "Large image cards"), checked: viewMode === "gallery", onSelect: () => changeViewMode("gallery") },
        { type: "radio", key: "v-ideas", icon: "bulb", label: t("ไอเดีย (ยังไม่ใช่งานจริง)", "Ideas (not real jobs yet)"), checked: viewMode === "ideas", onSelect: () => changeViewMode("ideas") },
        { type: "divider", key: "d1" },
        ...(viewMode === "board" ? [
          { type: "section", key: "s-size", label: t("ขนาดการ์ด", "Card size") },
          { type: "radio", key: "c-compact", icon: "layout-grid", label: t("การ์ดเล็ก (มีรูป)", "Small cards (with image)"), checked: cardSize === "compact", onSelect: () => changeCardSize("compact") },
          { type: "radio", key: "c-row", icon: "list", label: t("แถวย่อ", "Compact rows"), checked: cardSize === "row", onSelect: () => changeCardSize("row") },
          { type: "divider", key: "d2" },
          { type: "submenu", key: "cols", icon: "columns", label: t("คอลัมน์ที่โชว์", "Columns shown"), width: 260,
            hint: hiddenBoardColumns.length ? t(`ซ่อน ${hiddenBoardColumns.length}`, `${hiddenBoardColumns.length} hidden`) : undefined,
            render: () => (
              <div className="p-0.5">
                <div className="px-2 py-1 text-[11px] font-medium text-slate-400">{t("ติ๊ก = โชว์บนบอร์ด", "Checked = shown on the board")}</div>
                {allBoardColumns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100">
                    <input type="checkbox" checked={!hiddenSet.has(c.key)} onChange={() => toggleHiddenCol(c.key)} className="h-3.5 w-3.5" />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <span className="text-[11px] tabular-nums text-slate-400">{c.sheets.length}</span>
                  </label>
                ))}
                <div className="mt-1 flex gap-1 border-t border-slate-100 pt-1.5">
                  <button type="button" onClick={() => saveHiddenCols([])} className="h-7 flex-1 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{t("แสดงทั้งหมด", "Show all")}</button>
                  <button type="button" onClick={() => saveHiddenCols(DEFAULT_HIDDEN_COLS)} className="h-7 flex-1 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">{t("ค่าเริ่มต้น", "Default")}</button>
                </div>
              </div>
            ) },
          ...(allFolded ? [] : [{ key: "fold-all", icon: "minus", label: t("พับทุกคอลัมน์", "Fold all columns"), onSelect: () => saveFoldedCols(boardColumns.map((c) => c.key)) }]),
          ...(foldedCols.length > 0 ? [{ key: "unfold-all", icon: "maximize", label: t("กางทุกคอลัมน์", "Expand all columns"), hint: foldedCols.length, onSelect: () => saveFoldedCols([]) }] : []),
        ] : [
          { type: "submenu", key: "gcols", icon: "layout-grid", label: t("การ์ดต่อแถว", "Cards per row"), hint: galleryCols, width: 220,
            render: () => <div className="p-2"><GalleryColumnsControl cols={galleryCols} onChange={setGalleryCols} /></div> },
        ]),
        { type: "divider", key: "d3" },
        { type: "toggle", key: "strip", icon: "color-swatch", label: t("แถบสีแบรนด์", "Brand strip"), on: brandStrip, onSelect: toggleBrandStrip,
          title: t("แถบสีแบรนด์ด้านซ้ายการ์ด (จำค่าของคุณ) — เปลี่ยนสีแบรนด์ได้ที่เมนูแบรนด์", "Brand color strip on the left of each card (remembered for you)") },
      ] as MenuItem[],
    },
    {
      key: "settings", icon: "settings", label: t("ตั้งค่า", "Settings"), width: 230,
      items: [
        ...(isDesktop ? [{ type: "submenu", key: "hover", icon: "eye", label: t("ชี้การ์ดแล้วโชว์", "Card hover preview"), hint: hoverPref.on ? t("เปิด", "On") : t("ปิด", "Off"), width: 300,
          render: () => <SheetHoverSettingsPanel pref={hoverPref} /> }] : []),
        { key: "status", icon: "arrows-shuffle", label: t("จัดการสถานะ", "Manage statuses"), onSelect: () => setStatusMgr(true) },
        ...(canEdit ? [{ key: "checklist", icon: "list-check", label: t("Checklist งานใหม่", "New job checklist"), onSelect: () => setChecklistCfg(true),
          title: t("ข้อ ⏳ รออะไรอยู่ ที่ใส่ให้ทุกงานใหม่ (ตอนสร้างงานยังติ๊กออก/เพิ่มเฉพาะงานได้)", "Checklist items added to every new job") }] : []),
        { key: "brands", icon: "tag", label: t("ตั้งค่าแบรนด์", "Brand settings"), onSelect: () => setBrandSettingsOpen(true) },
      ] as MenuItem[],
    },
  ] as MenuDef[]).filter((m) => m.items.some((i) => i.type !== "divider" && i.type !== "section"));

  // การ์ดใบงาน (ของกลางในโมดูล ./dashboard-cards) — แกลเลอรี/บอร์ด ใช้ค่าร่วมชุดเดียวกัน
  // ⏳ ติ๊ก "รออะไรอยู่" บนการ์ด → อัปเดตสรุปของใบนั้นในรายการทันที (ไม่ต้องโหลดทั้งหน้า)
  const onWaitingChange = (id: string, s: ChecklistSummary) => setSheets((items) => items.map((it) => (it.id === id ? { ...it, waiting_items: s } : it)));
  // มือถือ/แท็บเล็ต + มีสิทธิ์แก้: กดค้างที่การ์ด = เปลี่ยนสถานะเร็ว (จอคอมใช้ลากการ์ดเหมือนเดิม)
  const onCardLongPress = !isDesktop && canEdit && !pickMode ? (s: DesignSheetListItem) => setQuickStatusFor(s) : undefined;
  const cardProps = { statusInfo, statusMeta, pickedIds, pickMode, canPick, togglePicked, openDetail, hoverPref, hoverOn, brandTheme, canEditWaiting: canEdit, onWaitingChange, brandStrip, onLongPress: onCardLongPress };
  const renderGalleryCard = (sheet: DesignSheetListItem) => <GalleryCard key={sheet.id} sheet={sheet} {...cardProps} />;
  // หน้า "วันนี้" (มือถือ) ใช้การ์ดแถวย่อเสมอ — ตัวเดียวกับบอร์ด
  const renderRowCard = (sheet: DesignSheetListItem) => (
    <BoardCard key={sheet.id} sheet={sheet} {...cardProps} draggingSheetId={null} movingSheetId={movingSheetId} cardSize="row" isDesktop={isDesktop}
      handleCardDragStart={handleCardDragStart} setDraggingSheetId={setDraggingSheetId} setDropTargetStatus={setDropTargetStatus} />
  );
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
          <div ref={sticky.headerRef} style={sticky.style}
            className={`relative z-[15] -mx-3 -mt-1.5 mb-1.5 flex items-center justify-between gap-2 px-3 py-1.5 ${sticky.stuck ? "border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur" : ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              <BrandSlot theme={brandTheme} id="header_left" className="shrink-0" />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold leading-tight text-slate-900">{t("แผนที่ภารกิจงานออกแบบ", "Design mission map")}</h1>
                <p className="truncate text-[11px] text-slate-400">{scopeLabel} · {activeJobs} {t("งานเดินอยู่", "active")}{urgentJobs > 0 ? <> · <span className="text-rose-500">{urgentJobs} {t("ใกล้ครบ", "due soon")}</span></> : null}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5" ref={moreAnchorRef}>
              <DeviceModeToggle mode={deviceMode} viewport={viewport} onChange={setDeviceMode} compact />
            </div>
          </div>
        ) : (
        /* หัวทั้งก้อน sticky แบบเหลือแค่แถบล่าง (ปุ่ม) — ป้าย/คำอธิบายเลื่อนหายไปเอง · ตอนติด: ซ่อนข้อความเดิม (ยังกินที่เท่าเดิม ไม่กระตุก) แล้วโชว์ชื่อหน้าแบบย่อแทน */
        <div ref={sticky.headerRef} style={sticky.style}
          className={`relative z-[15] -mt-2 mb-2 flex flex-wrap items-end justify-between gap-3 pb-2 pt-2 ${isDesktop ? "-mx-6 px-6" : "-mx-4 px-4"} ${sticky.stuck ? "border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur" : ""}`}>
          <div className="relative min-w-0 flex items-start gap-2">
            {sticky.stuck && (
              <div className="absolute inset-x-0 bottom-0 flex h-9 min-w-0 items-center gap-2">
                <span className="truncate text-base font-semibold text-slate-900">{t("แผนที่ภารกิจงานออกแบบ", "Design mission map")}</span>
                <span className="shrink-0 truncate text-xs text-slate-400">{scopeLabel} · {activeJobs} {t("งานเดินอยู่", "active")}{urgentJobs > 0 ? <> · <span className="text-rose-500">{urgentJobs} {t("ใกล้ครบ", "due soon")}</span></> : null}</span>
              </div>
            )}
            <BrandSlot theme={brandTheme} id="header_left" className={`shrink-0 mt-1 ${sticky.stuck ? "invisible" : ""}`} />
            <div className={`min-w-0 ${sticky.stuck ? "invisible" : ""}`}>
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
          <div ref={sticky.keepRef} className="flex flex-wrap items-center gap-2">
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
            <LineInboxButton count={inboxCount.pending} onClick={() => setInboxOpen(true)} />
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
        <BrandBar isPhone={isPhone} isDesktop={isDesktop} loading={loading} groups={groups} selectedBrandKey={selectedBrandKey} setSelectedBrandKey={pickBrand}
          favKeys={brandPrefs.fav} favBrands={favBrands} onToggleFav={toggleFavBrand} brandMark={brandMark} brandTheme={brandTheme} brandSummaries={brandSummaries} setBrandSettingsOpen={setBrandSettingsOpen} setCreateOpen={setCreateOpen} />

        {/* ป๊อปอัปตั้งค่าแบรนด์ (เรียง/ซ่อน) — บันทึกรายคน */}
        <BrandSettingsModal brandSettingsOpen={brandSettingsOpen} setBrandSettingsOpen={setBrandSettingsOpen} orderedAll={orderedAll} brandPrefs={brandPrefs} topBrands={topBrands} moveBrand={moveBrand} brandMark={brandMark} toggleHiddenBrand={toggleHiddenBrand} />

        {/* บอร์ด (เต็มกว้าง) — แถวการ์ดสถิติ 4 ใบเอาออกแล้ว (เจ้าของขอ 2026-11-07 · จำนวนต่อแบบดูได้ในเมนูตัวกรอง) */}
        <div className="space-y-4">

          <main className="min-w-0 space-y-4">
            {/* มือถือ ปุ่ม "วันนี้" แถบล่าง = รวมงานที่ต้องสนใจ (แทนบอร์ด · แถบแบรนด์ยังใช้กรองได้) */}
            {isPhone && phoneView === "today" ? (
              <PhoneTodayView sheets={scopedSheets} statusMeta={statusMeta} renderRow={renderRowCard} scopeLabel={scopeLabel} />
            ) : (
            <section data-gg-panel className={`min-w-0 rounded-lg border border-white/70 bg-white/80 shadow-sm backdrop-blur ${isPhone ? "p-3" : "p-4"}`}>
              {!isPhone && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{t("เส้นทางสถานะจาก Workflow กลาง", "Status path from the central Workflow")}</h2>
                  <p className="text-xs text-slate-400">{scopeLabel} • {filteredSheets.length.toLocaleString("th-TH")} {t("งานที่โหลดมา", "jobs loaded")}{loadedLimitNote ? <> • <span className="text-amber-600">{loadedLimitNote}</span></> : null}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> {t("ด่วน", "Urgent")}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {t("ใกล้ครบ", "Due soon")}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("ปิดงาน", "Closed")}</span>
                  </div>
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
                      {([["board", "i:layout-kanban", t("บอร์ดตามสถานะ", "Board by status")], ["gallery", "i:photo", t("การ์ดรูปใหญ่", "Large image cards")], ["ideas", "i:bulb", t("ไอเดีย", "Ideas")]] as const).map(([key, icon, label]) => (
                        <button key={key} type="button" onClick={() => changeViewMode(key)} title={label} aria-label={label}
                          className={`inline-flex h-8 w-9 items-center justify-center rounded text-sm transition ${viewMode === key ? "bg-slate-900 text-white" : "text-slate-600"}`}><Icon value={icon} className="text-[16px]" /></button>
                      ))}
                    </div>
                  </div>
                  {/* ตัวเลขสรุป 3 ช่อง (เจ้าของเลือกแบบ widget 2026-11-10) — แตะ = กรองเฉพาะกลุ่มนั้น · แตะซ้ำ = เลิกกรอง · นับตามแบรนด์ที่เลือก · หน้าไอเดียไม่ใช้ */}
                  {viewMode !== "ideas" && <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "overdue", label: t("เกินกำหนด", "Overdue"), on: "border-rose-500 bg-rose-500 text-white", off: "border-rose-200 bg-rose-50 text-rose-700" },
                      { key: "due2", label: t("ส่งใน 2 วัน", "Due in 2 days"), on: "border-amber-500 bg-amber-500 text-white", off: "border-amber-200 bg-amber-50 text-amber-800" },
                      { key: "await_quote", label: t("รอลูกค้าตอบราคา", "Awaiting quote reply"), on: "border-slate-900 bg-slate-900 text-white", off: "border-slate-200 bg-white text-slate-700" },
                    ] as const).map((k) => {
                      const on = quickFilter === k.key;
                      return (
                        <button key={k.key} type="button" onClick={() => setQuickFilter(on ? "all" : k.key)} aria-pressed={on}
                          className={`flex min-w-0 flex-col items-start rounded-xl border px-2.5 py-2 text-left transition active:scale-[0.98] ${on ? k.on : k.off}`}>
                          <span className="text-xl font-semibold leading-tight tabular-nums">{filterCounts[k.key]}</span>
                          <span className="w-full truncate text-[11px] leading-tight">{k.label}</span>
                        </button>
                      );
                    })}
                  </div>}
                  {/* งานที่ยังไม่ตั้ง Deadline = ตัวเลขข้างบนนับไม่ได้ → บอกให้รู้ + แตะดูรายการไปตั้งทีละใบ */}
                  {viewMode !== "ideas" && (filterCounts.nodl > 0 || quickFilter !== "all") && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {filterCounts.nodl > 0 && (
                        <button type="button" onClick={() => setQuickFilter(quickFilter === "nodl" ? "all" : "nodl")}
                          className={`rounded-full border px-2.5 py-1 ${quickFilter === "nodl" ? "border-slate-900 bg-slate-900 text-white" : "border-dashed border-slate-300 text-slate-500"}`}>
                          {t(`ยังไม่ตั้งวันส่ง ${filterCounts.nodl} ใบ`, `${filterCounts.nodl} without a deadline`)}
                        </button>
                      )}
                      {quickFilter !== "all" && quickFilter !== "nodl" && (
                        <button type="button" onClick={() => setQuickFilter("all")} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          <Icon value="i:x" className="text-[11px]" /> {t("ล้างตัวกรอง", "Clear filter")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] max-w-sm flex-1">
                  <Icon value="i:search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("ค้นหารหัส / ชื่องาน / แบรนด์...", "Search code / job name / brand...")}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                {/* แถบเมนู (ของกลาง components/menu-bar): ชี้แล้วเมนูโผล่ — ตัวกรอง · ทำงาน · มุมมอง · ตั้งค่า (เจ้าของขอ 2026-11-07 ให้แถบไม่รก) */}
                <MenuBar menus={toolbarMenus} />
                {pickMode && (
                  <button type="button" onClick={exitPickMode}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700">
                    {pickPurpose === "board" ? t("กำลังเลือก: ส่งขึ้นกระดาน", "Selecting: send to board") : pickPurpose === "order" ? t("กำลังเลือก: ลงออเดอร์", "Selecting: add orders") : t("กำลังเลือก: สรุปงาน", "Selecting: summary")}
                    <Icon value="i:x" className="text-[13px]" />
                  </button>
                )}
              </div>
              )}

              {viewMode === "ideas" ? (
                /* ── 💡 ไอเดีย (ยังไม่ใช่งานจริง) — ใช้ช่องค้นหา + แบรนด์ที่เลือกในแถบซ้ายร่วมกัน · เริ่มงานจริงแล้วเปิดใบงานใหม่ให้ ── */
                <IdeasView canEdit={canEdit} search={search} brandId={selectedBrand ? selectedBrand.key : null}
                  onPromoted={(id) => { refreshDashboard(); openDetail(id); }} />
              ) : loading ? (
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
                <StatusBoard boardColumns={boardColumns} cardSize={cardSize} renderBoardCard={renderBoardCard} renderGalleryCard={renderGalleryCard} isDesktop={isDesktop} isPhone={isPhone} dropTargetStatus={dropTargetStatus} handleColumnDragOver={handleColumnDragOver} handleColumnDragLeave={handleColumnDragLeave} handleColumnDrop={handleColumnDrop} brandTheme={brandTheme} foldedCols={foldedSet} onToggleFold={toggleFoldCol} expandedCols={expandedCols} setExpandedCols={setExpandedCols} phoneCol={phoneCol} setPhoneStatus={setPhoneStatus} stickyTop={sticky.below} />
              )}
              {isPhone && viewMode === "board" && filteredSheets.length > 0 && <p className="mt-3 text-center text-[11px] text-slate-400">{t("ปัดซ้าย-ขวาตรงรายการ = ดูสถานะถัดไป", "Swipe the list left/right to see the next status")}{onCardLongPress ? t(" · กดค้างที่การ์ด = เปลี่ยนสถานะเร็ว", " · Press and hold a card to change its status") : ""}</p>}
            </section>
            )}

          </main>
        </div>
        {/* มือถือ: ปุ่ม ＋ ลอยมุมล่างขวา (ซ่อนตอนอยู่โหมดเลือกส่งขึ้นกระดาน — แถบล่างใช้พื้นที่นั้น) */}
        {isPhone && !pickMode && (
          <button type="button" onClick={() => setCreateOpen(true)} title={t("เพิ่มงานใหม่", "Add new job")} aria-label={t("เพิ่มงานใหม่", "Add new job")}
            className="fixed bottom-[76px] right-4 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-900 text-2xl leading-none text-white shadow-lg shadow-slate-900/30 active:scale-95">＋</button>
        )}
        {/* มือถือ: แถบล่าง บอร์ด · วันนี้ · ไลน์ · เมนู (เจ้าของเลือกแบบ widget 2026-11-10) — ซ่อนตอนโหมดเลือก (แถบเลือกไว้ N ใบใช้ที่นั้น) */}
        {isPhone && !pickMode && (
          <nav className="sticky bottom-0 z-[55] -mx-3 -mb-3 mt-3 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label={t("เมนูล่าง", "Bottom menu")}>
            {([
              { key: "board", icon: "folders", label: t("บอร์ด", "Board"), on: phoneView === "board", onClick: () => setPhoneView("board") },
              { key: "today", icon: "calendar", label: t("วันนี้", "Today"), on: phoneView === "today", onClick: () => setPhoneView("today"), badge: filterCounts.overdue + filterCounts.due2 },
              { key: "line", icon: "chat", label: t("ไลน์", "LINE"), on: inboxOpen, onClick: () => setInboxOpen(true), badge: inboxCount.pending },
              { key: "menu", icon: "list", label: t("เมนู", "Menu"), on: moreOpen, onClick: () => setMoreOpen(true) },
            ] as { key: string; icon: string; label: string; on: boolean; onClick: () => void; badge?: number }[]).map((b) => (
              <button key={b.key} type="button" onClick={b.onClick} aria-pressed={b.on}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${b.on ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                <Icon name={b.icon} size={20} />
                {b.label}
                {!!b.badge && <span className="absolute right-[calc(50%-20px)] top-1 rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">{b.badge}</span>}
              </button>
            ))}
          </nav>
        )}
        {/* เมนู (เดิมปุ่ม ⋯ บนหัว) — แผ่นเลื่อนจากล่าง กดง่ายด้วยนิ้วโป้ง */}
        {isPhone && (
          <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("เมนู", "Menu")} backKey="dd-menu">
            <div className="space-y-0.5 pb-1">
            <div className="px-1 py-0.5"><RecordTasksButton moduleKey="design_sheets" canEdit={canEdit} /></div>
            <button type="button" className={menuItem} onClick={() => { setInboxOpen(true); setMoreOpen(false); }}>
              <Icon name="chat" /> {t("งานจากไลน์", "Jobs from LINE")}{inboxCount.pending > 0 ? ` (${inboxCount.pending})` : ""}
            </button>
            <a href="/master/design-sheets" className={menuItem}>📄 {t("กลับ Design Sheets", "Back to Design Sheets")}</a>
            <button type="button" className={menuItem} onClick={() => { refreshDashboard(); setMoreOpen(false); }}>🔄 {t("รีเฟรชข้อมูล", "Refresh data")}</button>
            {selectedBrandId && <button type="button" className={menuItem} onClick={() => { setThemeBuilderOpen(true); setMoreOpen(false); }}>🎨 {t("ปรับธีม", "Theme")} {selectedBrand?.name}</button>}
            <button type="button" className={menuItem} onClick={() => { setStatusMgr(true); setMoreOpen(false); }}>🔀 {t("จัดการสถานะ", "Manage statuses")}</button>
            <button type="button" className={menuItem} onClick={() => { changeCardSize(cardSize === "row" ? "compact" : "row"); setMoreOpen(false); }}>
              {cardSize === "row" ? t("▦ การ์ดเล็ก (มีรูป)", "▦ Small cards (with image)") : t("☰ การ์ดแถวย่อ", "☰ Compact rows")}
            </button>
            <button type="button" className={menuItem} onClick={() => { toggleBrandStrip(); setMoreOpen(false); }}>
              <Icon name="design" /> {brandStrip ? t("ปิดแถบสีแบรนด์", "Hide brand strip") : t("เปิดแถบสีแบรนด์", "Show brand strip")}
            </button>
            {canTasks && <button type="button" className={menuItem} onClick={() => { if (pickMode) exitPickMode(); else startPick("board"); setMoreOpen(false); }}>{pickMode ? t("✕ ออกจากโหมดเลือก", "✕ Exit select mode") : t("🎨 ส่งขึ้นกระดาน", "🎨 Send to board")}</button>}
            {canEdit && !pickMode && <button type="button" className={menuItem} onClick={() => { startPick("summary"); setMoreOpen(false); }}>📋 {t("สรุปงานใหม่ (เลือกใบงาน)", "New summary (pick sheets)")}</button>}
            {canOrder && !pickMode && <button type="button" className={menuItem} onClick={() => { startPick("order"); setMoreOpen(false); }}><Icon name="cart" /> {t("ลงออเดอร์ (เลือกใบงาน)", "Add orders (pick sheets)")}</button>}
            {canEdit && <button type="button" className={menuItem} onClick={() => { setMoreOpen(false); setSummaryMenuOpen(true); }}>📂 {t("สรุปที่บันทึกไว้", "Saved summaries")}</button>}
            <button type="button" className={menuItem} onClick={() => { setBrandSettingsOpen(true); setMoreOpen(false); }}>⚙️ {t("ตั้งค่าแบรนด์", "Brand settings")}</button>
            </div>
          </BottomSheet>
        )}
        {/* กดค้างที่การ์ด → เปลี่ยนสถานะเร็ว (ของกลาง DesignStatusSheet · บันทึกผ่าน moveSheetToStatus ตัวเดียวกับลากการ์ดบนจอคอม) */}
        {quickStatusFor && (
          <DesignStatusSheet open onClose={() => setQuickStatusFor(null)} statusMeta={statusMeta} own={sheetIsOwn(quickStatusFor)} current={quickStatusFor.status}
            subtitle={`${quickStatusFor.code} · ${quickStatusFor.name}`} onPick={(key) => void moveSheetToStatus(quickStatusFor.id, key)} />
        )}
      </div>
  );

  return (
    <BrandThemedShell theme={brandTheme}>
      <DevicePreviewFrame layout={layout} viewport={viewport} onExitPreview={() => setDeviceMode("auto")}>{body}</DevicePreviewFrame>

      {/* แถบล่าง "เลือกไว้ N ใบ" (Bulk action bar) — โผล่เฉพาะโหมดเลือก */}
      <PickActionBar pickMode={pickMode} pickPurpose={pickPurpose} pickedIds={pickedIds} filteredSheets={filteredSheets} canPick={canPick} setPickedIds={setPickedIds} exitPickMode={exitPickMode} openSummary={openSummary} setCampaignPickOpen={setCampaignPickOpen}
        onOrder={() => void openOrderFromPicked()} orderLoading={orderLoading} />

      {/* 📦 ลงออเดอร์จากใบงานที่ติ๊ก (ของกลาง) */}
      {orderSeed && <OrderBatchEntryModal open seedLines={orderSeed.seeds} brand={orderSeed.brand} title="ลงออเดอร์จากใบงานออกแบบ" onClose={() => setOrderSeed(null)} />}

      {/* เลือกแคมเปญปลายทาง (ของกลาง) */}
      <CampaignBoardPicker open={campaignPickOpen} onClose={() => setCampaignPickOpen(false)} sheetIds={Array.from(pickedIds)} />

      {/* 📋 ดรอปดาวน์สรุปงาน (สรุปใหม่ + สรุปที่บันทึกไว้) — มือถือยึดปุ่ม ⋯ · จอคอมอยู่ในเมนู "ทำงาน → สรุปงาน" */}
      <FloatingDropdown anchorRef={moreAnchorRef} open={summaryMenuOpen} onClose={() => setSummaryMenuOpen(false)} minWidth={300} maxWidth={380}>
        <SummaryListMenu reloadKey={summaryReload} onNew={() => { setSummaryMenuOpen(false); startPick("summary"); }} onOpen={(id) => openSummary(id)} />
      </FloatingDropdown>
      {summaryBuilder && (
        <DesignSheetSummaryBuilder open summaryId={summaryBuilder.id} initialSheetIds={summaryBuilder.sheetIds}
          onClose={() => setSummaryBuilder(null)} onChanged={() => setSummaryReload((k) => k + 1)} />
      )}

      {/* ⚙️ ตั้งค่า → Checklist งานใหม่ = ค่าใช้บ่อยของ ⏳ รออะไรอยู่ (ตัวเดียวกับ ⚙️ ในใบงาน) · สวิตช์ "ใบใหม่" = ใส่ให้ทุกงานใหม่ */}
      {checklistCfg && <ChecklistPresetsEditor presetType={DESIGN_WAITING.presetType} open onClose={() => setChecklistCfg(false)} title={t("Checklist งานใหม่", "New job checklist")} />}

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
        <DesignSheetDetail detailOnly createMode defaultBrandId={selectedBrand?.id ?? null} prefill={createPrefill}
          onDetailClose={() => {
            setCreateOpen(false); silentRefresh();
            // เปิดจากกล่องงานจากไลน์ → กลับไปที่กล่อง (ทำงานถัดไปต่อได้เลย) + โหลดป้ายจำนวนใหม่
            if (createPrefill) { setCreatePrefill(null); setInboxKey((k) => k + 1); setInboxOpen(true); }
          }} />
      )}

      {/* 📥 กล่องงานจากไลน์ (ร่างจากกลุ่มส่งงานออกแบบ) */}
      {inboxOpen && (
        <LineInboxDrawer open={inboxOpen} onClose={() => {
          setInboxOpen(false);
          if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("inbox")) {
            const url = new URL(window.location.href); url.searchParams.delete("inbox"); window.history.replaceState(null, "", url.toString());
          }
        }}
          canEdit={canEdit} isAdmin={isAdmin} sheets={mergeSheets}
          onConvert={convertFromInbox}
          onOpenSheet={(id) => { setInboxOpen(false); openDetail(id); }}
          onChanged={() => setInboxKey((k) => k + 1)} />
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