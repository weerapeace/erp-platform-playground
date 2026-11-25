"use client";

/**
 * SkuTagBrowser — ของกลาง "เลือกดู SKU ตามกลุ่มแท็ก"
 *
 * - drill-down: กลุ่มหลัก → กลุ่มย่อย/แท็ก (ตามรูปที่ออกแบบ)
 * - TagGroupFilter (ของกลางเดียวกับจัดซื้อ): กรองหลายแท็กพร้อมกัน
 * - การ์ด SKU: เรียงลำดับ · โหลดเพิ่ม · กดการ์ด → ดู/แก้ SKU (SkuFormModal) · ปรับฟิลด์การ์ด
 * - ค้นหา SKU ทั้งหมด · ดึงผ่าน /api/sku-browser (RPC กลาง erp_skus_tag_page)
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { SPEC_EXPORT_IDS_KEY, SPEC_EXPORT_PATH } from "@/lib/spec-export";   // 📤 ส่งออกรายละเอียด (หลายรุ่น → Excel)
import { useOpenParam } from "@/lib/open-param";
import { withImageWidth } from "@/lib/r2-image";
import { formatAmount } from "@/lib/money";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { Pager } from "@/components/pager";
import { useGalleryColumns, CardGrid, CardViewBar, GALLERY_LABEL, useCtrlWheel } from "@/components/gallery-columns";   // มุมมองการ์ดกลาง (Ctrl+ลูกกลิ้ง ย่อ/ขยาย)
import { useUserPref } from "@/lib/use-user-pref";
import { useAuth, usePermission } from "@/components/auth";
import { useFileDrop } from "@/components/file-drop";
import { usePhotoCapture } from "@/components/photo-capture";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { uploadGalleryFile, removeGalleryFile, GALLERY_MAX_ITEMS } from "@/lib/gallery-upload";

/** ข้อมูลลากรูปลงการ์ด/แถว 1 รายการ (null = ไม่มีสิทธิ์แก้ / โหมดเลือก) */
type ImgTarget = {
  zone: Record<string, unknown>; over: boolean; up: UploadProgressState | null; touch: boolean;
  camera: () => void; library: () => void;
} | null;
import { useViewportLayout } from "@/components/device-view";
import { ScrollTabs } from "@/components/scroll-tabs";
import { BottomSheet } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";

// 🔍 ขั้นซูมรูปในโหมดตาราง (1 = 36px) — Ctrl+ลูกกลิ้ง / ปุ่ม − % +
const TBL_ZOOMS = [0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const TBL_IMG_BASE = 36;
function nextTblZoom(z: number, d: 1 | -1): number {
  let i = TBL_ZOOMS.findIndex((s) => s >= z - 0.001);
  if (i < 0) i = TBL_ZOOMS.length - 1;
  return TBL_ZOOMS[Math.max(0, Math.min(TBL_ZOOMS.length - 1, i + d))];
}
import { EmptyState } from "@/components/state-views";
import { useStepHistory, readStep, patchStep } from "@/lib/use-step-history";   // ปุ่ม Back ย้อนทีละก้าว (ของกลาง)
import { SkuWizard } from "@/app/master/skus/sku-wizard";
import { MaterialRequestButton } from "@/components/material-request";
import { ParentSkuCreateModal } from "@/components/parent-sku-create-modal";
// ของกลาง bulk edit — type อย่างเดียว (ไม่กิน runtime); ตัว modal โหลดแบบ dynamic ด้านล่าง (กัน data-table เข้า bundle หน้านี้)
import type { BulkEditField } from "@/components/data-table";
import type { BrowseTree, BrowseGroup, BrowseTag, SkuCard } from "@/app/api/sku-browser/route";
import { Icon } from "@/components/icon";
// drawer เก่าตัวจริงของ MasterCRUD — โหลดเฉพาะตอนเปิด (master-crud หนัก) กันบวม bundle
// loading: โชว์ "กำลังเปิด…" ทันทีระหว่างโหลดก้อนโค้ดครั้งแรก (ไม่ให้รู้สึกค้าง)
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[140] bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl px-5 py-3 text-sm text-slate-500 shadow-2xl inline-flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" /> {tr("กำลังเปิด…", "Opening…")}
      </div>
    </div>
  ),
});
// 📦 Bundle (กลุ่ม SKU ที่จับรวมกัน) — โหลดเฉพาะตอนกดปุ่ม
// 🎨 Swatch (รูปแผ่นตัวอย่าง กดบนรูปเปิด SKU) — โหลดเฉพาะตอนกดปุ่ม
const SwatchBrowser = nextDynamic(() => import("@/components/sku-swatch-browser").then((m) => m.SwatchBrowser), {
  ssr: false, loading: () => <div className="py-12 text-center text-sm text-slate-400">{tr("กำลังโหลด Swatch…", "Loading swatches…")}</div>,
});
const BundleBrowser = nextDynamic(() => import("@/components/sku-bundle-browser").then((m) => m.BundleBrowser), {
  ssr: false, loading: () => <div className="py-12 text-center text-sm text-slate-400">{tr("กำลังโหลด Bundle…", "Loading bundles…")}</div>,
});
// 🛒 กล่องพักสินค้าจาก Taobao — โหลดเฉพาะตอนกดปุ่ม (ไม่ให้ถ่วง bundle หน้าหลัก)
const TaobaoBrowser = nextDynamic(() => import("@/components/taobao-browser").then((m) => m.TaobaoBrowser), {
  ssr: false,
  loading: () => <div className="text-center py-16 text-slate-400 text-sm">{tr("กำลังโหลด…", "Loading…")}</div>,
});
// ป๊อปอัป bulk edit ของกลาง — โหลดเฉพาะตอนกด "แก้ไขข้อมูล" (data-table ใหญ่ ไม่เอาเข้า bundle หน้านี้)
const BulkEditAllModal = nextDynamic(() => import("@/components/data-table").then((m) => ({ default: m.BulkEditAllModal })), { ssr: false });
// ป๊อปอัป "ส่งเข้า Bundle" ของกลาง (ตัวเดียวกับแท็บ Swatch) — โหลดเฉพาะตอนกด
const BundleAddModal = nextDynamic(() => import("@/components/bundle-add-modal").then((m) => ({ default: m.BundleAddModal })), { ssr: false });
// ป๊อปอัปพิมพ์บาร์โค้ด/QR — โหลดเฉพาะตอนกด (jsbarcode/qrcode ไม่เข้า bundle หน้านี้)
const BarcodePrintModal = nextDynamic(() => import("@/components/barcode-print/modal").then((m) => ({ default: m.BarcodePrintModal })), { ssr: false });
// ตัวจัดการ SKU ซ้ำ (รวม/ยุบ) — โหลดเฉพาะตอนกด
const SkuMergeModal = nextDynamic(() => import("@/components/sku-merge").then((m) => ({ default: m.SkuMergeModal })), { ssr: false });
// ตรวจรูปที่ไฟล์หายจากที่เก็บ — โหลดเฉพาะตอนกด
const MissingImagesModal = nextDynamic(() => import("@/components/missing-images").then((m) => ({ default: m.MissingImagesModal })), { ssr: false });

type Crumb = { id: string; name: string };

// ── สถานะการเดินเก็บในประวัติเบราว์เซอร์ (ของกลาง lib/use-step-history · key "sku-nav") — รอดตอน refresh + ปุ่ม Back ย้อนได้ ──
const NAV_KEY = "sku-nav";
type SkuNav = { gp: Crumb[]; tf: TagFilterValue; sp?: "all" | "recent" | "trash" | null; page?: number; en?: "skus" | "parent-skus" };
function savedNav(): SkuNav | null { return readStep<SkuNav>(NAV_KEY); }
// อัปเดตสถานะในรายการประวัติปัจจุบัน (ไม่เพิ่มรายการใหม่) — ใช้ตอนเปลี่ยนหน้า/สลับชนิด
function patchNav(p: Partial<SkuNav>): void { patchStep<SkuNav>(NAV_KEY, p, { gp: [], tf: EMPTY_FILTER }); }

const CARD_FIELDS: { key: string; label: string }[] = [
  { key: "image", get label() { return tr("รูป", "Image"); } }, { key: "code", get label() { return tr("รหัส", "Code"); } }, { key: "name", get label() { return tr("ชื่อ", "Name"); } },
  { key: "price", get label() { return tr("ราคาขาย", "Selling price"); } }, { key: "buy_price", get label() { return tr("ราคาซื้อ (ล่าสุด)", "Buying price (latest)"); } }, { key: "stock", get label() { return tr("สต๊อกคงเหลือ", "Stock on hand"); } }, { key: "tags", get label() { return tr("แท็ก", "Tags"); } }, { key: "status", get label() { return tr("สถานะ", "Status"); } },
];
/** ข้อความราคาซื้อ (ฝั่ง server ส่งมาเฉพาะคนที่มีสิทธิ์ดูต้นทุน — ไม่มี = "—") */
function fmtBuy(bp: SkuCard["buy_price"]): string { return bp && bp.price > 0 ? formatAmount(bp.price, bp.currency) : "—"; }
const DEFAULT_CARD_FIELDS = CARD_FIELDS.map((f) => f.key);
const CORE_KEYS = new Set(DEFAULT_CARD_FIELDS);   // 7 ฟิลด์หลัก (เรนเดอร์พิเศษ) — ที่เหลือ = ฟิลด์เพิ่มจาก Field Registry
const CORE_COLUMNS = new Set(["id", "code", "name_th", "list_price", "is_active", "cover_image_r2_key"]);
function fmtCell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? tr("ใช่", "Yes") : tr("ไม่", "No");
  if (typeof v === "number") return v.toLocaleString("th-TH");
  return String(v);
}
type FieldDef = { key: string; label: string };
const CARD_SCOPE = "sku-browser";
const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };
const LIMIT = 60;   // โหลดหน้าละ 60 (เดิม 120) — เห็นเร็วขึ้น แล้วค่อย "โหลดเพิ่ม"

const SORTS = [
  { key: "code",       label: "รหัส (A→Z)",     en: "Code (A→Z)",   by: "code",       dir: "asc"  },
  { key: "code_desc",  label: "รหัส (Z→A)",     en: "Code (Z→A)",   by: "code",       dir: "desc" },
  { key: "name",       label: "ชื่อ (A→Z)",      en: "Name (A→Z)",   by: "name_th",    dir: "asc"  },
  { key: "name_desc",  label: "ชื่อ (Z→A)",      en: "Name (Z→A)",   by: "name_th",    dir: "desc" },
  { key: "price_desc", label: "ราคา (สูง→ต่ำ)",  en: "Price (high→low)", by: "list_price", dir: "desc" },
  { key: "price_asc",  label: "ราคา (ต่ำ→สูง)",  en: "Price (low→high)", by: "list_price", dir: "asc"  },
  { key: "newest",     label: "ใหม่ล่าสุด",      en: "Newest",       by: "created_at", dir: "desc" },
] as const;

/** เช็คว่าการ์ดนี้ข้อมูลไม่ครบตรงไหน (ไว้โชว์ป้ายเตือน + กรอง) */
function cardWarnings(c: SkuCard): string[] {
  const w: string[] = [];
  if (!c.image) w.push(tr("ไม่มีรูป", "No image"));
  if (c.variant_count == null && (c.list_price == null || c.list_price <= 0)) w.push(tr("ไม่มีราคา", "No price"));   // Parent ไม่มีราคา = ไม่เตือน
  if (c.tags.length === 0) w.push(tr("ไม่มีแท็ก", "No tags"));
  return w;
}

// ── แปลงฟิลด์จาก Field Registry → BulkEditField (ของกลาง) ──
// เลือกเฉพาะชนิดที่แก้แบบหลายรายการได้อย่างปลอดภัย (text/number/boolean/select/relation) — ไม่ hardcode รายฟิลด์
type RegField = {
  column_name: string | null; field_label: string; field_label_en?: string | null; ui_field_type: string; data_type: string;
  is_visible: boolean; is_sensitive: boolean; is_editable: boolean; is_bulk_editable: boolean;
  options: unknown; relation_config: Record<string, unknown> | null;
};
const NO_BULK = new Set(["id", "code", "created_at", "updated_at", "created_by", "cover_image_r2_key"]);
/** ชื่อฟิลด์ตามภาษาปัจจุบัน — ไม่มีชื่ออังกฤษในทะเบียน = ใช้ไทยเหมือนเดิม */
const regLabel = (f: { field_label: string; field_label_en?: string | null }) => tr(f.field_label, f.field_label_en || f.field_label);
function parseOptions(opt: unknown): { value: string; label: string }[] | undefined {
  const arr = Array.isArray(opt) ? opt
    : (opt && typeof opt === "object" && Array.isArray((opt as { choices?: unknown }).choices)) ? (opt as { choices: unknown[] }).choices
    : null;
  if (!arr) return undefined;
  const out = arr.map((o) => {
    if (o && typeof o === "object") { const r = o as Record<string, unknown>; const v = String(r.value ?? r.key ?? ""); return { value: v, label: String(r.label ?? r.name ?? v) }; }
    const v = String(o); return { value: v, label: v };
  }).filter((o) => o.value);
  return out.length ? out : undefined;
}
function toBulkField(f: RegField): BulkEditField | null {
  const col = f.column_name; if (!col || NO_BULK.has(col)) return null;
  const ui = (f.ui_field_type || "").toLowerCase(); const dt = (f.data_type || "").toLowerCase();
  const label = regLabel(f);
  if ((ui.includes("relation") || ui.includes("many2one") || ui.includes("picker")) && f.relation_config && Object.keys(f.relation_config).length) {
    return { key: col, label, type: "relation", relationConfig: f.relation_config as unknown as BulkEditField["relationConfig"] };
  }
  if (["boolean", "toggle", "switch", "checkbox"].includes(ui) || dt === "boolean") return { key: col, label, type: "boolean" };
  if (["select", "status", "enum", "dropdown"].includes(ui)) { const options = parseOptions(f.options); if (options) return { key: col, label, type: "select", options }; }
  if (["number", "currency", "integer", "decimal", "float"].includes(ui) || ["number", "numeric", "integer", "bigint", "double precision", "real"].includes(dt)) return { key: col, label, type: "number" };
  return { key: col, label, type: "text" };
}

export function SkuTagBrowser({ mode = "manage", onPickSku, onPick, entity: entityProp, pickedIds }: {
  mode?: "manage" | "pick";
  onPickSku?: (skuId: string) => void;
  onPick?: (row: { id: string; code?: string; name?: string; image?: string | null }) => void;   // คืนข้อมูลการ์ดเต็ม (ใช้ตอนเอาไปวางบนกระดาน)
  entity?: "skus" | "parent-skus";                                                                // บังคับชนิด (ไม่ส่ง = ผู้ใช้สลับเองได้)
  pickedIds?: string[];                                                                           // โหมดเลือก: id ที่ผู้เรียกเลือกไว้แล้ว (โชว์ติ๊กบนการ์ด)
} = {}) {
  const pick = mode === "pick";   // โหมดเลือกสินค้า (หน้าขอซื้อ) — กดการ์ด → onPickSku แทนเปิด drawer แก้ไข
  const t = useT();
  const toast = useToast();
  // สถานะการเดิน (กลุ่ม/แท็ก/หน้า/ชนิด) เก็บใน history.state → refresh แล้วอยู่ที่เดิม + ปุ่ม Back ย้อนได้
  const nav0 = savedNav();
  // entityProp = บังคับชนิดจากผู้เรียก (เช่น ป๊อปเลือก Parent SKU) · ไม่ส่ง = ใช้ค่าที่เคยเลือกไว้
  const [entity, setEntity] = useState<"skus" | "parent-skus">(entityProp ?? nav0?.en ?? "skus");   // ดูตาม SKU หรือ Parent SKU (ของกลางตัวเดียว)
  useEffect(() => { if (entityProp && entityProp !== entity) setEntity(entityProp); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityProp]);
  const entityRef = useRef(entity); entityRef.current = entity;   // ให้ pushNav อ่านค่าล่าสุดโดยไม่ต้องผูก dep
  const [taobao, setTaobao] = useState(false);   // 🛒 โหมดกล่องพัก "สินค้าจาก Taobao" (ไม่ใช้แท็ก/กลุ่ม — คนละชุดข้อมูล)
  // มาจากลิงก์ "อยู่บนแผ่น Swatch" ในหน้า SKU: /master/skus?swatch=<id>&spot=<id>
  const [swatchOpen, setSwatchOpen] = useState<{ id: string; spotId: string | null } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sid = sp.get("swatch");
    if (!sid) return;
    setSwatch(true); setSwatchOpen({ id: sid, spotId: sp.get("spot") });
  }, []);
  const [swatch, setSwatch] = useState(false);   // 🎨 โหมด Swatch (รูปแผ่นตัวอย่าง — คนละชุดข้อมูล)
  const [bundle, setBundle] = useState(false);   // 📦 โหมด Bundle (กลุ่ม SKU ที่จับรวมกัน — คนละชุดข้อมูล)
  // มาจากลิงก์ "ดูในกล่องพัก" ในหน้า SKU: /master/skus?taobao=1&focus=<id>&tb_status=matched
  const [taobaoOpen, setTaobaoOpen] = useState<{ focusId: string | null; status: "new" | "matched" | "rejected" } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("taobao") !== "1") return;
    const st = sp.get("tb_status");
    setTaobao(true);
    setTaobaoOpen({ focusId: sp.get("focus"), status: st === "matched" || st === "rejected" ? st : "new" });
  }, []);
  const [tree, setTree] = useState<BrowseTree | null>(null);
  const [groupPath, setGroupPath] = useState<Crumb[]>(nav0?.gp ?? []);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(nav0?.tf ?? EMPTY_FILTER);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("code");
  const [special, setSpecial] = useState<"all" | "recent" | "trash" | null>(nav0?.sp ?? null);   // โฟลเดอร์พิเศษ: ทั้งหมด / ล่าสุด / ถังขยะ
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);   // กรองเฉพาะ SKU ที่ข้อมูลไม่ครบ
  const [selected, setSelected] = useState<Set<string>>(new Set());   // เลือกหลายตัว (bulk)
  const [printOpen, setPrintOpen] = useState(false);                  // ป๊อปอัปพิมพ์บาร์โค้ด/QR
  const [bundleAddOpen, setBundleAddOpen] = useState(false);          // ป๊อปอัปส่ง SKU ที่ติ๊กเข้า Bundle
  const [view, setView] = useState<"card" | "table">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sku-browser-view") === "table") return "table";
    return "card";
  });
  const setViewPersist = (v: "card" | "table") => { setView(v); try { localStorage.setItem("sku-browser-view", v); } catch { /* ignore */ } };
  // ขนาดการ์ด (ของกลาง) — จำรายคน · โหมดเลือก (ป๊อปอัป) จำแยก เพราะกล่องแคบกว่าหน้าเต็ม
  const gallery = useGalleryColumns(pick ? "sku-browser-pick" : "sku-browser", 6);
  const isPhone = useViewportLayout() === "phone";   // 📱 มือถือ: แท็บเลื่อน · ＋ ลอย · เมนู ⋯ · ตารางแบบแถวกะทัดรัด
  const [moreOpen, setMoreOpen] = useState(false);
  // 🔍 ขนาดรูปในโหมดตาราง (เจ้าของขอ 2026-11-22 "ctrl + scroll ขยายตาราง" · เลือกแบบ "ขยายแค่รูป") — จำกับบัญชี
  const [tblZoom, setTblZoomRaw] = useUserPref<number>("sku_table_img_zoom", 1, (v) => (typeof v === "number" && v >= TBL_ZOOMS[0] && v <= TBL_ZOOMS[TBL_ZOOMS.length - 1] ? v : null));
  const stepTblZoom = (d: 1 | -1) => setTblZoomRaw(nextTblZoom(tblZoom, d));
  const tblWheelRef = useCtrlWheel((dir) => stepTblZoom(dir === 1 ? -1 : 1), view === "table");

  const [cards, setCards] = useState<SkuCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(nav0?.page ?? 0);   // แบ่งหน้า (0-based) — ใช้ Pager ของกลาง แทน "โหลดเพิ่ม"
  const [loadingCards, setLoadingCards] = useState(false);

  const [cardFields, setCardFields] = useState<string[]>(DEFAULT_CARD_FIELDS);
  const [costAllowed, setCostAllowed] = useState(false);   // server บอกว่าคนนี้เห็นราคาซื้อได้ (products.cost.view) → โชว์คอลัมน์
  const [availFields, setAvailFields] = useState<FieldDef[]>([]);   // ฟิลด์ SKU ทั้งหมด (จาก Field Registry — ไม่ hardcode)
  const [bulkFields, setBulkFields] = useState<BulkEditField[]>([]);   // ฟิลด์ที่ "แก้หลายรายการ" ได้ (จาก Field Registry §18)
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);               // เปิดฟอร์มเพิ่ม (SKU=Wizard / Parent=modal เล็ก)
  const [mergeOpen, setMergeOpen] = useState(false);           // เปิดตัวจัดการ SKU ซ้ำ (รวม/ยุบ)
  const [missingOpen, setMissingOpen] = useState(false);       // ตรวจรูปที่ไฟล์หายจากที่เก็บ
  const [copyPending, setCopyPending] = useState<{ id: string; code: string } | null>(null);  // ยืนยันก่อนคัดลอก
  const [peekId, setPeekId] = useState<string | null>(null);   // คลิกการ์ด/แถว → drawer เก่าตัวจริง (ของกลาง: ดู/แก้ทุกฟิลด์)
  const [parentPeekId, setParentPeekId] = useState<string | null>(null);   // กดชิป "📦 Parent" บนการ์ด/แถว SKU → drawer Parent (ของกลางตัวเดียวกัน)
  // ลิงก์ตรงถึงสินค้า `?open=<id>` (จาก Global Search / หน้าอื่น) — หน้า SKU เปิดแท็บ "เลือกดูตามแท็ก" เป็นค่าเริ่มต้น
  // ตารางกลางไม่ได้ mount → ต้องเปิด drawer จากตรงนี้เอง (เฉพาะโหมดจัดการ ไม่ใช่ตอนถูกฝังเป็น picker)
  useOpenParam(mode === "manage", (id) => setPeekId(id));

  // ชุดฟิลด์การ์ด (ครั้งเดียว)
  useEffect(() => {
    apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json())
      .then((j) => { const f = (j.mine ?? j.default) as string[] | null; if (f && f.length) setCardFields(f); }).catch(() => {});
  }, []);
  // อุ่นโค้ด drawer เก่า (ก้อนใหญ่) ล่วงหน้าหลังหน้าโหลดเสร็จ → คลิกการ์ดแล้วเปิดทันที ไม่ต้องรอโหลดก้อนโค้ด
  useEffect(() => {
    const t = setTimeout(() => { void import("@/components/master-crud"); }, 1200);
    return () => clearTimeout(t);
  }, []);
  // ต้นไม้แท็ก + ฟิลด์ทะเบียน + รีเซ็ตการเดิน — เปลี่ยนเมื่อสลับ entity (SKU/Parent)
  // คงคำค้นไว้ (ไม่ setSearch("")) → พิมพ์ WK44 แล้วสลับ SKU↔Parent ยังค้นต่อในอีกฝั่ง
  // ⚠️ รอบแรก (mount/refresh) ต้อง "ไม่" รีเซ็ต ไม่งั้นจะล้างกลุ่ม/แท็ก/หน้าที่กู้คืนจาก history ทิ้ง → เด้งกลับหน้าแรก
  const firstEntityRef = useRef(true);
  useEffect(() => {
    if (firstEntityRef.current) { firstEntityRef.current = false; }   // refresh — คงการเดินที่ restore มา
    else { setGroupPath([]); setTagFilter(EMPTY_FILTER); patchNav({ gp: [], tf: EMPTY_FILTER }); }   // สลับ SKU↔Parent จริง — เริ่มเดินใหม่
    apiFetch(`/api/sku-browser?entity=${entity}`).then((r) => r.json()).then((j) => setTree(j.tree ?? { groups: [], tags: [] })).catch(() => {});
    apiFetch(`/api/admin/field-registry-v2?module=${entity === "parent-skus" ? "parent-skus-v2" : "skus-v2"}`).then((r) => r.json())
      .then((j) => {
        const all = (j.fields ?? []) as RegField[];
        // ฟิลด์เพิ่มบนการ์ด (visible + ไม่ sensitive + ไม่ใช่ core)
        setAvailFields(all.filter((f) => f.column_name && f.is_visible && !f.is_sensitive && !CORE_COLUMNS.has(f.column_name as string))
          .map((f) => ({ key: f.column_name as string, label: regLabel(f) })));
        // ฟิลด์ที่แก้หลายรายการได้ (§18) — ใช้ is_bulk_editable ถ้าตั้งค่าไว้, ไม่งั้น editable & ไม่ sensitive
        const anyFlagged = all.some((f) => f.is_bulk_editable === true);
        setBulkFields(all
          .filter((f) => f.column_name && !f.is_sensitive && f.is_editable !== false && (anyFlagged ? f.is_bulk_editable === true : true))
          .map(toBulkField).filter((x): x is BulkEditField => !!x));
      }).catch(() => {});
  }, [entity]);

  const tagNameById = useMemo(() => new Map((tree?.tags ?? []).map((t) => [t.id, t.name])), [tree]);
  const fieldLabels = useMemo(() => new Map(availFields.map((f) => [f.key, f.label])), [availFields]);
  const extraDefs = useMemo<FieldDef[]>(() => cardFields.filter((k) => !CORE_KEYS.has(k)).map((k) => ({ key: k, label: fieldLabels.get(k) ?? k })), [cardFields, fieldLabels]);
  const cardsMode = !!search.trim() || tagFilter.tagIds.length > 0 || special !== null;
  const currentGroupId = groupPath.length ? groupPath[groupPath.length - 1].id : null;
  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const shown = onlyIncomplete ? cards.filter((c) => cardWarnings(c).length > 0) : cards;

  // ดึงการ์ดหนึ่งหน้า (off = ตำแหน่งเริ่ม)
  const fetchPage = useCallback(async (off: number) => {
    const p = new URLSearchParams();
    if (special === "trash") p.set("trash", "1");   // ถังขยะ — เฉพาะรายการที่ปิด/ลบแล้ว
    else if (special) p.set("all", "1");            // โฟลเดอร์ ทั้งหมด/ล่าสุด — โชว์ทุกรายการ (ไม่กรองแท็ก)
    if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
    if (search.trim()) p.set("search", search.trim());
    // "ล่าสุด" = เรียงตามแก้ไขล่าสุดเสมอ · อื่น ๆ ใช้การเรียงที่เลือก
    const eBy = special === "recent" ? "updated_at" : sort.by;
    const eDir = special === "recent" ? "desc" : sort.dir;
    p.set("sort", eBy); p.set("dir", eDir);
    p.set("limit", String(LIMIT)); p.set("offset", String(off));
    p.set("entity", entity);
    const extra = cardFields.filter((k) => !CORE_KEYS.has(k));
    if (extra.length) p.set("fields", extra.join(","));
    const j = await apiFetch(`/api/sku-browser?${p.toString()}`).then((r) => r.json());
    setCostAllowed(j.cost_allowed === true);
    return { cards: (j.cards ?? []) as SkuCard[], total: Number(j.total ?? 0) };
  }, [tagFilter, search, sort, cardFields, entity, special]);

  // เปลี่ยน filter/search/sort → กลับหน้าแรก (ข้ามรอบแรก ไม่งั้นหน้าที่กู้คืนมาตอน refresh จะโดนรีเซ็ต)
  const firstFetchRef = useRef(true);
  useEffect(() => {
    if (firstFetchRef.current) { firstFetchRef.current = false; return; }
    setPage(0); patchNav({ page: 0 });
  }, [fetchPage]);

  // โหลดหน้าปัจจุบัน (แทนที่รายการเดิม — ไม่ต่อท้ายแบบ "โหลดเพิ่ม")
  useEffect(() => {
    if (!cardsMode) { setCards([]); setTotal(0); return; }
    let alive = true;
    setLoadingCards(true); setSelected(new Set());
    fetchPage(page * LIMIT).then((r) => { if (!alive) return; setCards(r.cards); setTotal(r.total); })
      .catch(() => {}).finally(() => { if (alive) setLoadingCards(false); });
    return () => { alive = false; };
  }, [cardsMode, fetchPage, page]);

  const goPage = (p: number) => {
    setPage(p); patchNav({ page: p });   // จำหน้าไว้ใน history → refresh แล้วยังอยู่หน้าเดิม
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reloadFirst = async () => { try { const r = await fetchPage(page * LIMIT); setCards(r.cards); setTotal(r.total); } catch { /* ignore */ } };

  // 🖼 ลากรูป (หลายรูป) มาวางบนการ์ด/แถว · Ctrl+V ตอนชี้ · มือถือแตะถ่าย/เลือกรูป → เข้าแกลเลอรีของตัวนั้น (เจ้าของขอ 2026-11-23)
  //   ของกลาง: useFileDrop · usePhotoCapture · lib/gallery-upload (กติกาเดียวกับกล่องรูปในลิ้นชัก) · UploadProgress · toast "ย้อนกลับ"
  const canEditImg = usePermission("products.edit") && !pick;
  const { user: me } = useAuth();
  const [imgUp, setImgUp] = useState<Record<string, UploadProgressState>>({});
  const imgBusyRef = useRef<Set<string>>(new Set());
  const capTarget = useRef<string | null>(null);
  const galleryEntity = entity === "parent-skus" ? "parent_skus_v2" : "skus_v2";
  const uploadImgs = async (id: string, files: File[]) => {
    if (!canEditImg) return;
    if (imgBusyRef.current.has(id)) { toast.error(t("รายการนี้กำลังอัปรูปอยู่ รอสักครู่", "Still uploading to this item")); return; }
    const code = cards.find((x) => x.id === id)?.code ?? "";
    const imgs = files.filter((f) => (f.type || "").startsWith("image/")).slice(0, GALLERY_MAX_ITEMS);
    if (!imgs.length) { toast.error(t("ลากได้เฉพาะไฟล์รูป", "Images only")); return; }
    imgBusyRef.current.add(id);
    const added: string[] = [];
    let count = 0;
    let err: string | null = null;
    for (const [i, f] of imgs.entries()) {
      setImgUp((p) => ({ ...p, [id]: { label: t("กำลังอัปโหลด", "Uploading"), name: f.name, size: f.size, count: { current: i + 1, total: imgs.length }, pct: imgs.length > 1 ? Math.round((i / imgs.length) * 100) : null } }));
      try {
        const aid = await uploadGalleryFile(f, { entityType: galleryEntity, entityId: id, actor: me?.name ?? null });
        count += 1;
        if (aid) added.push(aid);
      } catch (e) {
        err = e instanceof Error ? e.message : t("อัปโหลดไม่สำเร็จ", "Upload failed");
        if (err.includes("สูงสุด")) break;   // เต็ม 9 รูปแล้ว — ไฟล์ที่เหลือไม่ต้องลอง
      }
    }
    imgBusyRef.current.delete(id);
    setImgUp((p) => { const n = { ...p }; delete n[id]; return n; });
    await reloadFirst();
    if (count > 0) {
      const msg = t(`เพิ่ม ${count} รูปให้ ${code} แล้ว`, `Added ${count} image(s) to ${code}`);
      if (added.length === count) {
        toast.action(msg, t("ย้อนกลับ", "Undo"), async () => {
          for (const a of [...added].reverse()) { try { await removeGalleryFile(a, me?.name ?? null); } catch { /* ข้ามรูปที่ลบไม่ได้ */ } }
          await reloadFirst();
          toast.success(t("เอารูปที่เพิ่งเพิ่มออกแล้ว", "Removed the images just added"));
        });
      } else toast.success(msg);
    }
    if (err) toast.error(err);
  };
  const imgDrop = useFileDrop((files, key) => { void uploadImgs(key, files); }, { accept: "image/", disabled: !canEditImg, onReject: () => toast.error(t("ลากได้เฉพาะไฟล์รูป", "Images only")) });
  const imgCap = usePhotoCapture({ onFiles: (fs) => { const id = capTarget.current; if (id) void uploadImgs(id, fs); }, disabled: !canEditImg });
  const imgTarget = (id: string) => canEditImg ? {
    zone: imgDrop.zone(id), over: imgDrop.over === id, up: imgUp[id] ?? null,
    touch: imgCap.touch,
    camera: () => { capTarget.current = id; imgCap.openCamera(); },
    library: () => { capTarget.current = id; imgCap.openLibrary(); },
  } : null;
  // คัดลอก SKU (หลังยืนยัน) → รีเฟรช + เด้งเปิดตัวใหม่ที่เพิ่งสร้าง
  const doCopy = async (id: string) => {
    try {
      const res = await apiFetch("/api/skus/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? tr("คัดลอกไม่สำเร็จ", "Copy failed"));
      toast.success(tr(`คัดลอกเป็น ${j.code} แล้ว — เปิดให้แก้ไขต่อได้เลย`, `Copied as ${j.code} — opened for editing`));
      await reloadFirst();
      if (j.id) setPeekId(String(j.id));   // เด้งไปที่ SKU ตัวใหม่
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  const childGroups = (tree?.groups ?? []).filter((g) => g.parent_group_id === currentGroupId);
  const childTags   = (tree?.tags   ?? []).filter((t) => t.group_id === currentGroupId);

  // ผูกการเดินเข้ากลุ่ม/แท็กกับประวัติเบราว์เซอร์ → ปุ่ม Back (รวมปุ่มย้อนของเมาส์) ย้อนทีละชั้น — ของกลาง useStepHistory
  // (ปิด drawer ของกลางก็ยิง popstate — ของกลางข้ามให้แล้ว ไม่เด้งกลับหน้า 1)
  const steps = useStepHistory<SkuNav>(NAV_KEY, (s) => {
    setGroupPath(s?.gp ?? []); setTagFilter(s?.tf ?? EMPTY_FILTER); setSpecial(s?.sp ?? null);   // ไม่มีก้าวของเรา = กลับถึงราก
    setPage(s?.page ?? 0); if (s?.en) setEntity(s.en);
  });
  const pushStep = steps.push;
  const pushNav = useCallback((gp: Crumb[], tf: TagFilterValue, sp: "all" | "recent" | "trash" | null = null) => {
    setGroupPath(gp); setTagFilter(tf); setSpecial(sp); setPage(0);   // เดินที่ใหม่ = เริ่มหน้า 1
    pushStep({ gp, tf, sp, page: 0, en: entityRef.current });
  }, [pushStep]);

  const openGroup   = (g: BrowseGroup) => pushNav([...groupPath, { id: g.id, name: g.name }], EMPTY_FILTER);
  const openTag     = (t: BrowseTag)   => pushNav(groupPath, { tagIds: [t.id], none: false });
  const openSpecial = (kind: "all" | "recent" | "trash") => { setSearch(""); pushNav([], EMPTY_FILTER, kind); };
  const goRoot      = () => { setSearch(""); pushNav([], EMPTY_FILTER); };
  const goCrumb   = (i: number) => pushNav(groupPath.slice(0, i + 1), EMPTY_FILTER);
  const clearTags = () => pushNav(groupPath, EMPTY_FILTER);

  // ── เลือกหลายตัว + bulk ──
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  // 📤 ส่งออกรายละเอียด — ส่งรุ่นที่เลือก (หรือไม่เลือก = เปิดหน้าเปล่าให้เลือกเอง) ไปหน้าส่งออก
  const router = useRouter();
  const openSpecExport = (ids: string[]) => {
    try { sessionStorage.setItem(SPEC_EXPORT_IDS_KEY, JSON.stringify(ids)); } catch { /* เปิดหน้าแล้วเลือกเอง */ }
    router.push(SPEC_EXPORT_PATH);
  };
  const selectAllShown = () => setSelected(new Set(shown.map((c) => c.id)));
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id));

  // โหมดเลือก = มีของเลือกอยู่ ≥1 → คลิกการ์ดทั้งใบ = toggle (ไม่เปิด drawer)
  // ⚠️ โหมด pick (เลือกไปวางกระดาน) ต้องไม่เข้าโหมด bulk ของหน้าจัดการ ไม่งั้นกดการ์ดแล้วไม่ส่งค่ากลับ
  const selectMode = !pick && selected.size > 0;
  const pickedSet = useMemo(() => new Set(pickedIds ?? []), [pickedIds]);
  // ลากคลุมเลือก: เริ่มจาก checkbox (หรือลากการ์ดในโหมดเลือก) แล้วลากผ่านการ์ดอื่น
  const dragRef = useRef<{ active: boolean; mode: boolean; moved: boolean }>({ active: false, mode: true, moved: false });
  const justDragged = useRef(false);
  const applyDrag = useCallback((id: string) => setSelected((s) => { const n = new Set(s); if (dragRef.current.mode) n.add(id); else n.delete(id); return n; }), []);
  const beginDrag = useCallback((id: string, currentlySelected: boolean) => { dragRef.current = { active: true, mode: !currentlySelected, moved: false }; applyDrag(id); }, [applyDrag]);
  const dragOver = useCallback((id: string) => { if (dragRef.current.active) { dragRef.current.moved = true; applyDrag(id); } }, [applyDrag]);
  useEffect(() => {
    const up = () => {
      if (!dragRef.current.active) return;
      if (dragRef.current.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0); }
      dragRef.current.active = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // เลือกทั้งหมด "ทุกหน้า" (ตามตัวกรองปัจจุบัน) — ดึง id ทั้งหมดจาก API (เบา)
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const p = new URLSearchParams();
      if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
      if (search.trim()) p.set("search", search.trim());
      p.set("entity", entity); p.set("ids", "1");
      const j = await apiFetch(`/api/sku-browser?${p.toString()}`).then((r) => r.json());
      const ids = (j.ids ?? []) as string[];
      setSelected(new Set(ids));
      if ((j.total ?? 0) > ids.length) toast.success(tr(`เลือกได้สูงสุด ${ids.length.toLocaleString("th-TH")} รายการ (กรองให้แคบลงถ้าต้องการมากกว่านี้)`, `Selected the maximum of ${ids.length.toLocaleString("th-TH")} items (narrow the filter for more)`));
    } catch { toast.error(tr("เลือกทั้งหมดไม่สำเร็จ", "Select all failed")); } finally { setSelectingAll(false); }
  };

  // ── bulk: ใช้ของกลางทั้งหมด (ไม่ hardcode) ──
  const junction = entity === "parent-skus" ? "parent_skus_v2_product_family_m2m" : "skus_v2_product_family_m2m";
  const apiPath = entity === "parent-skus" ? "parent-skus" : "skus";
  // ของกลาง: แก้หลายรายการผ่าน route กลาง /api/master-v2/<entity>/bulk-update (edits ราย id → group + validate สิทธิ์ฟิลด์ + audit ฝั่ง server)
  const bulkUpdateCentral = useCallback(async (ids: string[], changes: Record<string, unknown>): Promise<number> => {
    const res = await apiFetch(`/api/master-v2/${apiPath}/bulk-update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: ids.map((id) => ({ id, changes })) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) throw new Error(j?.error ?? tr("แก้ไม่สำเร็จ", "Update failed"));
    return (j.affected as number) ?? ids.length;
  }, [apiPath]);
  const bulkAddTag = async (tagId: string) => {
    const ids = [...selected]; if (!tagId || ids.length === 0) return;
    try {
      const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, links: ids.map((src_id) => ({ src_id, tgt_id: tagId })) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(tr(`ติดแท็กให้ ${ids.length} รายการแล้ว`, `Tagged ${ids.length} items`)); clearSel(); void reloadFirst();
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("ติดแท็กไม่สำเร็จ", "Tagging failed")); }
  };
  const bulkStatus = async (active: boolean) => {
    const ids = [...selected]; if (ids.length === 0) return;
    try { const n = await bulkUpdateCentral(ids, { is_active: active }); toast.success(active ? tr(`เปิดใช้งาน ${n} รายการแล้ว`, `Activated ${n} items`) : tr(`ปิดใช้งาน ${n} รายการแล้ว`, `Deactivated ${n} items`)); clearSel(); void reloadFirst(); }
    catch (e) { toast.error(e instanceof Error ? e.message : tr("ทำรายการไม่สำเร็จ", "Action failed")); }
  };
  // ป๊อปอัป bulk edit ของกลาง onApply → ยิง route กลาง
  const applyBulkEdit = async (changes: Record<string, unknown>): Promise<{ affected: number }> => {
    const affected = await bulkUpdateCentral([...selected], changes);
    void reloadFirst();
    return { affected };
  };
  const exportCsv = () => {
    const rows = shown.filter((c) => selected.has(c.id)); if (rows.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const costCols = costAllowed ? ["ราคาซื้อล่าสุด", "สกุลเงินซื้อ", "ที่มาราคาซื้อ"] : [];
    const lines = [["รหัส", "ชื่อ", "ราคาขาย", ...costCols, "สต๊อก", "แท็ก", "สถานะ"].join(",")]
      .concat(rows.map((c) => [c.code, c.name, c.list_price ?? "",
        ...(costAllowed ? [c.buy_price?.price ?? "", c.buy_price?.currency ?? "", c.buy_price?.label ?? ""] : []),
        c.qty_on_hand ?? "", c.tags.join("|"), c.is_active ? "ใช้งาน" : "ปิด"].map(esc).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "skus-export.csv"; a.click(); URL.revokeObjectURL(a.href);
    toast.success(tr(`Export ${rows.length} รายการแล้ว`, `Exported ${rows.length} items`));
  };

  const saveCard = async (fields: string[], target: "me" | "all") => {
    try {
      const res = await apiFetch("/api/card-layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: CARD_SCOPE, fields, target }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || tr("บันทึกไม่สำเร็จ", "Save failed"));
      setCardFields(fields); setCustomizeOpen(false);
      toast.success(target === "all" ? tr("บันทึกเป็นค่าเริ่มต้นของทุกคนแล้ว", "Saved as everyone's default") : tr("บันทึกการ์ดของคุณแล้ว", "Your card layout saved"));
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  const resetCard = async () => {
    try {
      await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}&target=me`, { method: "DELETE" });
      const j = await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json());
      setCardFields(((j.default as string[] | null) && (j.default as string[]).length ? (j.default as string[]) : DEFAULT_CARD_FIELDS));
      setCustomizeOpen(false); toast.success(tr("รีเซ็ตการ์ดแล้ว", "Card layout reset"));
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("รีเซ็ตไม่สำเร็จ", "Reset failed")); }
  };

  return (
    <div {...(canEditImg ? imgDrop.guard : {})}>
      {canEditImg && imgCap.ui}
      {/* สลับ SKU / Parent SKU + ปุ่มเพิ่ม — ซ่อนในโหมดเลือก (pick) เพราะขอซื้อได้เฉพาะ SKU */}
      {/* 📱 มือถือ (เจ้าของเลือก 2026-11-22 แบบ A): แท็บเลื่อนซ้ายขวา · ปุ่ม ＋ ลอยมุมขวาล่าง · ปุ่มรองรวมในเมนู ⋯ (แผ่นเลื่อนขึ้นจากล่าง) */}
      {!pick && isPhone && (() => {
        const plain = !taobao && !bundle && !swatch;
        const tabs: { key: string; label: string; on: boolean; go: () => void }[] = [
          { key: "skus", label: "🏷️ SKU", on: plain && entity === "skus", go: () => { setTaobao(false); setBundle(false); setSwatch(false); setEntity("skus"); patchNav({ en: "skus", page: 0 }); } },
          { key: "parent-skus", label: "📦 Parent SKU", on: plain && entity === "parent-skus", go: () => { setTaobao(false); setBundle(false); setSwatch(false); setEntity("parent-skus"); patchNav({ en: "parent-skus", page: 0 }); } },
          { key: "taobao", label: `🛒 ${t("จาก Taobao", "From Taobao")}`, on: taobao, go: () => { setTaobao(true); setBundle(false); setSwatch(false); setSelected(new Set()); } },
          { key: "bundle", label: "📦 Bundle", on: bundle, go: () => { setBundle(true); setTaobao(false); setSwatch(false); setSelected(new Set()); } },
          { key: "swatch", label: "🎨 Swatch", on: swatch, go: () => { setSwatch(true); setBundle(false); setTaobao(false); setSelected(new Set()); } },
        ];
        const act = (fn: () => void) => () => { setMoreOpen(false); fn(); };
        const item = "w-full flex items-center gap-3 px-4 py-3 text-[14px] text-slate-700 text-left border-b border-slate-100 active:bg-slate-50";
        return (
          <>
            <ScrollTabs activeKey={tabs.find((x) => x.on)?.key ?? null} className="mb-2 pb-0.5">
              {tabs.map((x) => (
                <button key={x.key} data-tab-key={x.key} type="button" onClick={x.go}
                  className={`shrink-0 h-8 px-3 rounded-full border text-[13px] whitespace-nowrap ${x.on ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 bg-white text-slate-600"}`}>{x.label}</button>
              ))}
            </ScrollTabs>
            {plain && (
              <button type="button" onClick={() => setAddOpen(true)}
                className="fixed bottom-[76px] right-4 z-40 inline-flex h-12 items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white shadow-lg active:scale-95">
                ＋ {t("เพิ่ม", "Add")} {entity === "parent-skus" ? "Parent SKU" : "SKU"}
              </button>
            )}
            <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("เมนูเพิ่มเติม", "More")} backKey="sku-more">
              <div className="-mx-4">
                {plain && entity === "skus" && <button type="button" className={item} onClick={act(() => setMergeOpen(true))}>🔗 {t("จัดการ SKU ซ้ำ", "Merge duplicates")}</button>}
                {plain && entity === "skus" && <div className="px-4 py-2 border-b border-slate-100"><MaterialRequestButton /></div>}
                {plain && entity === "parent-skus" && <button type="button" className={item} onClick={act(() => openSpecExport(selected.size ? [...selected] : []))}>📤 {t("ส่งออกรายละเอียด", "Export details")}</button>}
                {plain && <button type="button" className={item} onClick={act(() => setMissingOpen(true))}>🔎 {t("ตรวจรูปหาย", "Find broken images")}</button>}
                {plain && <button type="button" className={item} onClick={act(() => setCustomizeOpen(true))}>⚙️ {t("ปรับการ์ด", "Customize cards")}</button>}
                {plain && <button type="button" className={item} onClick={act(() => openSpecial("trash"))}>🗑 {t("ถังขยะ", "Trash")}</button>}
              </div>
            </BottomSheet>
          </>
        );
      })()}
      {!pick && !isPhone && (
      <div className="flex items-center gap-1 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => { setTaobao(false); setBundle(false); setSwatch(false); setEntity("skus"); patchNav({ en: "skus", page: 0 }); }} className={`h-9 px-4 text-sm ${!taobao && !bundle && !swatch && entity === "skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🏷️ SKU</button>
          <button onClick={() => { setTaobao(false); setBundle(false); setSwatch(false); setEntity("parent-skus"); patchNav({ en: "parent-skus", page: 0 }); }} className={`h-9 px-4 text-sm border-l border-slate-200 ${!taobao && !bundle && !swatch && entity === "parent-skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>📦 Parent SKU</button>
          {/* กล่องพักของที่ดูดมาจาก Taobao — ยังไม่เข้า SKU จนกว่าจะกดจับคู่/สร้าง */}
          <button onClick={() => { setTaobao(true); setBundle(false); setSwatch(false); setSelected(new Set()); }} title={t("สินค้าที่เครื่องมือ taobao-catalog ส่งเข้ามา — รอจับคู่กับ SKU", "Items pulled by the taobao-catalog tool — waiting to match a SKU")}
            className={`h-9 px-4 text-sm border-l border-slate-200 ${taobao ? "bg-orange-50 text-orange-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🛒 {t("จาก Taobao", "From Taobao")}</button>
          {/* 📦 Bundle — กลุ่ม SKU ที่จับรวมกัน แต่ละตัวมีลิงก์ Taobao ของตัวเอง */}
          <button onClick={() => { setBundle(true); setTaobao(false); setSwatch(false); setSelected(new Set()); }} title={t("จับกลุ่ม SKU หลายตัวเป็นชุดเดียว — ตั้งชื่อได้ · ลิงก์ Taobao แยกรายตัว", "Group several SKUs into one set — optional name · per-item Taobao link")}
            className={`h-9 px-4 text-sm border-l border-slate-200 ${bundle ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>📦 Bundle</button>
          {/* 🎨 Swatch — รูปแผ่นตัวอย่างจริง (การ์ดสีผ้า/ด้าย/อะไหล่) กดบนรูปแล้วเปิด SKU ของชิ้นนั้น */}
          <button onClick={() => { setSwatch(true); setBundle(false); setTaobao(false); setSelected(new Set()); }} title={t("รูปแผ่นตัวอย่างจริง — กดที่ชิ้นบนรูปเพื่อเปิด SKU", "Real sample sheets — click a piece on the photo to open its SKU")}
            className={`h-9 px-4 text-sm border-l border-slate-200 ${swatch ? "bg-pink-50 text-pink-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🎨 Swatch</button>
        </div>
        {/* ปุ่มเพิ่ม — ตามแท็บที่เปิด */}
        {!taobao && !bundle && !swatch && <button onClick={() => setAddOpen(true)}
          className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">
          ＋ {t("เพิ่ม", "Add")} {entity === "parent-skus" ? "Parent SKU" : "SKU"}
        </button>}
        {!taobao && !bundle && !swatch && entity === "skus" && (
          <button onClick={() => setMergeOpen(true)} title={t("รวม SKU ที่ซ้ำกัน เข้าเป็นตัวเดียว (โอนรูป/แท็ก/สต๊อก/BOM ให้ตัวหลัก)", "Merge duplicate SKUs into one (moves images/tags/stock/BOM to the main one)")}
            className="h-9 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 whitespace-nowrap">
            🔗 {t("จัดการ SKU ซ้ำ", "Merge duplicates")}
          </button>
        )}
        {/* ขอเพิ่มวัตถุดิบ — พนักงานกรอกเท่าที่รู้ ยังไม่สร้าง SKU (ของกลาง material-request) */}
        {!taobao && !bundle && !swatch && entity === "skus" && <MaterialRequestButton />}
        {!taobao && !bundle && !swatch && entity === "parent-skus" && !pick && (
          <button onClick={() => openSpecExport(selected.size ? [...selected] : [])}
            title={t("รวมรายละเอียดหลายรุ่น (ไทย/อังกฤษ) เป็นไฟล์ Excel — ติ๊กการ์ดก่อนกด = ส่งรุ่นที่ติ๊กไปด้วย", "Combine many models' details (TH/EN) into an Excel file — tick cards first to bring them along")}
            className="h-9 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 whitespace-nowrap">
            📤 {t("ส่งออกรายละเอียด", "Export details")}
          </button>
        )}
        {!taobao && !bundle && !swatch && <button onClick={() => setMissingOpen(true)} title={t("ตรวจว่ามีสินค้าตัวไหนรูปเสีย (ไฟล์หายจากที่เก็บ) บ้าง", "Find products whose image files are missing from storage")}
          className="h-9 px-3 text-sm border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 whitespace-nowrap">
          🔎 {t("ตรวจรูปหาย", "Find broken images")}
        </button>}
        {!taobao && !bundle && !swatch && <button onClick={() => openSpecial("trash")} title={t("ดูรายการที่ลบ/ปิดใช้งานไว้ (กู้คืนได้)", "View deleted/disabled items (restorable)")}
          className={`h-9 px-3 text-sm rounded-lg whitespace-nowrap border ${special === "trash" ? "border-rose-300 bg-rose-50 text-rose-600 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          🗑 {t("ถังขยะ", "Trash")}
        </button>}
      </div>
      )}
      {/* ฟอร์มเพิ่ม: SKU = Wizard เต็ม · Parent = modal เล็ก */}
      {mergeOpen && <SkuMergeModal onClose={() => setMergeOpen(false)} onDone={() => { setMergeOpen(false); void reloadFirst(); }} />}
      {missingOpen && <MissingImagesModal onClose={() => { setMissingOpen(false); void reloadFirst(); }} />}
      {addOpen && entity === "skus" && <SkuWizard open onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); void reloadFirst(); }} />}
      {addOpen && entity === "parent-skus" && <ParentSkuCreateModal onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); void reloadFirst(); }} />}
      {copyPending && (
        <ConfirmDialog open onClose={() => setCopyPending(null)}
          title={t("คัดลอก SKU", "Duplicate SKU")} message={t(`คัดลอก "${copyPending.code}" เป็น SKU ตัวใหม่? (รหัสจะตั้งให้อัตโนมัติ แก้รายละเอียดได้ภายหลัง)`, `Duplicate "${copyPending.code}" as a new SKU? (code is auto-generated, details editable later)`)}
          confirmText={t("คัดลอก", "Duplicate")} onConfirm={() => { const id = copyPending.id; setCopyPending(null); void doCopy(id); }} />
      )}
      {/* 🛒 กล่องพักสินค้าจาก Taobao — โหมดแยก (ไม่ใช้แท็ก/กลุ่ม) */}
      {taobao ? <TaobaoBrowser focusId={taobaoOpen?.focusId ?? null} initialStatus={taobaoOpen?.status} /> : bundle ? <BundleBrowser /> : swatch ? <SwatchBrowser openId={swatchOpen?.id ?? null} focusSpotId={swatchOpen?.spotId ?? null} /> : (<>

      {/* search + กรองแท็ก (ของกลาง) + ปรับการ์ด */}
      {/* 📱 มือถือ: ติดบนจอตอนเลื่อนลง · ปรับการ์ดย้ายเข้าเมนู ⋯ */}
      <div className={`flex items-center gap-2 mb-3 ${isPhone && !pick ? "sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur" : ""}`}>
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-0 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ค้นหา SKU ทั้งหมด (รหัส / ชื่อ) — หาได้จากทุกกลุ่ม", "Search all SKUs (code / name) — across every group")}
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label={t("กรองแท็ก", "Filter tags")} showNone={false} />
        {!pick && !isPhone && <button onClick={() => setCustomizeOpen(true)}
          className="h-10 px-3 text-[13px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ {t("ปรับการ์ด", "Card settings")}</button>}
        {!pick && isPhone && <button type="button" onClick={() => setMoreOpen(true)} aria-label={t("เมนูเพิ่มเติม", "More")}
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center border border-slate-200 rounded-lg text-slate-600 text-lg leading-none">⋯</button>}
      </div>

      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap">
        <button onClick={goRoot} className={`hover:underline ${groupPath.length === 0 && !cardsMode ? "text-slate-700 font-medium" : "text-indigo-600"}`}>🏠 {t("ทั้งหมด", "All")}</button>
        {search.trim() && <><span className="text-slate-300">›</span><span className="text-slate-500">{t("ค้นหา", "Search")} “{search.trim()}”</span></>}
        {!search.trim() && tagFilter.tagIds.length > 0 && (
          <>
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium">🔖 {tagFilter.tagIds.map((id) => tagNameById.get(id) ?? t("แท็ก", "Tag")).join(", ")}</span>
            <button onClick={clearTags} className="text-slate-400 hover:text-rose-500 text-xs ml-1">✕</button>
          </>
        )}
        {special && (
          <span className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium">{special === "all" ? t("📋 ทั้งหมด", "📋 All") : special === "trash" ? t("🗑 ถังขยะ", "🗑 Trash") : t("🕒 ล่าสุด", "🕒 Recent")}</span>
          </span>
        )}
        {!cardsMode && groupPath.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <button onClick={() => goCrumb(i)} className={`hover:underline ${i === groupPath.length - 1 ? "text-slate-700 font-medium" : "text-indigo-600"}`}>{c.name}</button>
          </span>
        ))}
      </div>

      {/* body */}
      {cardsMode ? (
        loadingCards ? (view === "table"
          ? <div className="text-center py-16 text-slate-400 text-sm">{t("กำลังโหลด…", "Loading…")}</div>
          : <CardGrid gallery={gallery} loading />)
        : cards.length === 0 ? <EmptyState icon="🏷️" title={t("ไม่พบ SKU", "No SKUs found")} hint={t("ลองเปลี่ยนคำค้นหรือตัวกรองแท็ก", "Try another search or tag filter")} />
        : <>
            {total > LIMIT && (
              <div className="mb-2 pb-2 border-b border-slate-100">
                <Pager page={page} pageSize={LIMIT} total={total} onPage={goPage} unitLabel={entity === "parent-skus" ? "Parent SKU" : "SKU"} />
              </div>
            )}
            {/* แถบเครื่องมือการ์ดกลาง: จำนวน · ปุ่มของหน้า · สลับการ์ด/ตาราง · ขนาดการ์ด (− N +) */}
            <CardViewBar gallery={gallery}
              count={<>{total.toLocaleString("th-TH")} {t("รายการ", "items")}{onlyIncomplete ? t(` · ข้อมูลไม่ครบในหน้านี้ ${shown.length.toLocaleString("th-TH")}`, ` · incomplete on this page ${shown.length.toLocaleString("th-TH")}`) : ""}</>}
              view={view === "table" ? "table" : "cards"} onView={(v) => setViewPersist(v === "table" ? "table" : "card")}>
                {!pick && <button onClick={allShownSelected ? clearSel : selectAllShown}
                  className={`h-8 px-2.5 text-[12px] rounded-lg border ${allShownSelected ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {allShownSelected ? `☑ ${t("เลือกแล้ว", "Selected")}` : `☐ ${t("เลือกทั้งหมด", "Select all")}`}
                </button>}
                <button onClick={() => setOnlyIncomplete((v) => !v)}
                  className={`h-8 px-2.5 text-[12px] rounded-lg border ${onlyIncomplete ? "bg-amber-50 border-amber-300 text-amber-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>⚠️ {t("เฉพาะข้อมูลไม่ครบ", "Incomplete only")}</button>
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span>{t("เรียง", "Sort")}</span>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white">
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{t(s.label, s.en)}</option>)}
                  </select>
                </div>
                {/* 🔍 ขนาดรูปในตาราง (Ctrl+ลูกกลิ้งบนตารางก็ได้) — การ์ดใช้ตัวปรับขนาดการ์ดของกลางอยู่แล้ว */}
                {view === "table" && (
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600" title={t("ขนาดรูปในตาราง — Ctrl + หมุนลูกกลิ้งบนตารางก็ได้", "Image size — or Ctrl + scroll on the table")}>
                    <button type="button" onClick={() => stepTblZoom(-1)} disabled={tblZoom <= TBL_ZOOMS[0]} aria-label={t("รูปเล็กลง", "Smaller images")} className="h-8 w-7 hover:bg-slate-50 disabled:opacity-40">−</button>
                    <button type="button" onClick={() => setTblZoomRaw(1)} className="h-8 min-w-[3rem] px-1 tabular-nums hover:bg-slate-50" title={t("กลับขนาดปกติ", "Reset size")}>{Math.round(tblZoom * 100)}%</button>
                    <button type="button" onClick={() => stepTblZoom(1)} disabled={tblZoom >= TBL_ZOOMS[TBL_ZOOMS.length - 1]} aria-label={t("รูปใหญ่ขึ้น", "Bigger images")} className="h-8 w-7 hover:bg-slate-50 disabled:opacity-40">+</button>
                  </div>
                )}
            </CardViewBar>
            {onlyIncomplete && <p className="text-[11px] text-amber-600 mb-2">{t(`กรองเฉพาะในหน้านี้ (${cards.length.toLocaleString("th-TH")} ตัว) — เลื่อนหน้าด้านล่างเพื่อตรวจหน้าถัดไป`, `Filtered within this page only (${cards.length.toLocaleString("en-US")}) — go to the next page to check more`)}</p>}
            {shown.length === 0
              ? <div className="text-center py-12 text-slate-400 text-sm">{t("หน้านี้ไม่มีรายการที่ข้อมูลไม่ครบ 🎉", "Nothing incomplete on this page 🎉")}</div>
              : view === "table"
                ? <SkuTable rows={shown} imgTargetOf={imgTarget} selected={pick ? pickedSet : selected} selectMode={selectMode} showCost={costAllowed} onOpenParent={(id) => setParentPeekId(id)}
                    imgPx={Math.round(TBL_IMG_BASE * tblZoom)} wheelRef={tblWheelRef} compact={isPhone} attEntity={entity === "parent-skus" ? "parent_skus_v2" : "skus_v2"}
                    onToggle={pick ? ((id) => { const c = shown.find((x) => x.id === id); if (c) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(id); } }) : toggleSel}
                    onOpen={(id) => { if (pick) { const c = shown.find((x) => x.id === id); if (c) onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(id); return; } setPeekId(id); }}
                    sortKey={sortKey} onSort={(k) => { setSortKey(k); setPage(0); patchNav({ page: 0 }); }} />
                : <CardGrid gallery={gallery} className="select-none">
                    {shown.map((c) => (
                      <SkuCardView key={c.id} c={c} img={imgTarget(c.id)} fields={cardFields} extraDefs={extraDefs} thumbW={gallery.thumbW(320)} onOpenParent={(id) => setParentPeekId(id)}
                        // pick: ติ๊กตามที่ผู้เรียกเลือกไว้ · manage: ติ๊กตามระบบ bulk
                        selected={pick ? pickedSet.has(c.id) : selected.has(c.id)} selectMode={pick ? true : selectMode}
                        onClick={() => { if (justDragged.current) return; if (pick) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(c.id); return; } if (selectMode) return; setPeekId(c.id); }}
                        onPointerDownCard={() => { if (!pick && selectMode) beginDrag(c.id, selected.has(c.id)); }}
                        onPointerDownHandle={() => { if (pick) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(c.id); return; } beginDrag(c.id, selected.has(c.id)); }}
                        onPointerEnter={() => dragOver(c.id)} />
                    ))}
                  </CardGrid>}
            {total > LIMIT && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Pager page={page} pageSize={LIMIT} total={total} onPage={goPage} unitLabel={entity === "parent-skus" ? "Parent SKU" : "SKU"} />
              </div>
            )}
          </>
      ) : (
        (childGroups.length === 0 && childTags.length === 0)
          ? <div className="text-center py-16 text-slate-400 text-sm">{t("ยังไม่มีกลุ่มย่อย/แท็กในนี้", "No sub-groups or tags here yet")}</div>
          : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {currentGroupId === null && (
                <>
                  <button onClick={() => openSpecial("all")}
                    className="text-left rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 hover:border-indigo-400 hover:shadow-sm transition">
                    <div className="flex items-center justify-between"><span className="text-2xl">📋</span><span className="text-indigo-300">›</span></div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{t("ทั้งหมด", "All")}</p>
                    <p className="text-[11px] text-indigo-500">{t("ดูทุกรายการ", "See everything")} →</p>
                  </button>
                  <button onClick={() => openSpecial("recent")}
                    className="text-left rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 hover:border-indigo-400 hover:shadow-sm transition">
                    <div className="flex items-center justify-between"><span className="text-2xl">🕒</span><span className="text-indigo-300">›</span></div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{t("ล่าสุด", "Recent")}</p>
                    <p className="text-[11px] text-indigo-500">{t("สร้าง/แก้ไขล่าสุด", "Recently created/edited")} →</p>
                  </button>
                </>
              )}
              {childGroups.map((g) => (
                <button key={g.id} onClick={() => openGroup(g)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl inline-flex"><Icon value={g.icon || "i:folder"} /></span><span className="text-slate-300">›</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{g.name}</p>
                  <p className="text-[11px] text-slate-400">{t("กลุ่ม", "Group")}</p>
                </button>
              ))}
              {childTags.map((tg) => (
                <button key={tg.id} onClick={() => openTag(tg)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl">🏷️</span><span className="text-[11px] text-slate-400">{tg.sku_count.toLocaleString("th-TH")} SKU</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{tg.name}</p>
                  <p className="text-[11px] text-indigo-500">{t("ดูการ์ด SKU", "View SKU cards")} →</p>
                </button>
              ))}
            </div>
      )}

      </>)}

      {/* แถบจัดการหลายรายการ — ไม่โชว์ในโหมดเลือกไปวางกระดาน (ผู้เรียกมีปุ่มยืนยันของตัวเอง) */}
      {!pick && selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg w-fit mx-auto flex-wrap">
          <span className="text-sm font-medium">{t("เลือก", "Selected")} {selected.size.toLocaleString("th-TH")}</span>
          {!allShownSelected && <button onClick={selectAllShown} className="text-[12px] px-2 py-1 rounded-lg hover:bg-white/15">{t("เลือกที่แสดง", "Select shown")}</button>}
          {total > shown.length && (
            <button onClick={selectAllMatching} disabled={selectingAll} className="text-[12px] px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-60">
              {selectingAll ? t("กำลังเลือก…", "Selecting…") : t(`เลือกทั้งหมด ${total.toLocaleString("th-TH")}`, `Select all ${total.toLocaleString("en-US")}`)}
            </button>
          )}
          {bulkFields.length > 0 && (
            <button onClick={() => setBulkEditOpen(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-medium hover:bg-indigo-50">✏️ {t("แก้ไขข้อมูล", "Bulk edit")}</button>
          )}
          <select onChange={(e) => { const v = e.target.value; e.currentTarget.value = ""; if (v) void bulkAddTag(v); }} defaultValue=""
            className="h-8 px-2 text-[12px] rounded-lg text-slate-700 bg-white">
            <option value="">{t("🏷️ ติดแท็ก…", "🏷️ Add tag…")}</option>
            {(tree?.tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => bulkStatus(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("เปิดใช้งาน", "Activate")}</button>
          <button onClick={() => bulkStatus(false)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">{t("ปิดใช้งาน", "Deactivate")}</button>
          <button onClick={exportCsv} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">⬇ Export CSV</button>
          {entity === "parent-skus" && <button onClick={() => openSpecExport([...selected])} className="text-[12px] px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-medium hover:bg-indigo-50">{t("📤 ส่งออกรายละเอียด", "📤 Export specs")}</button>}
          {entity === "skus" && <button onClick={() => setBundleAddOpen(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-medium hover:bg-indigo-50">{t("📦 ส่งเข้า Bundle", "📦 Add to bundle")}</button>}
          <button onClick={() => setPrintOpen(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-medium hover:bg-indigo-50">{t("🏷️ พิมพ์บาร์โค้ด", "🏷️ Print barcodes")}</button>
          <button onClick={clearSel} className="text-[12px] px-2 py-1 rounded-lg hover:bg-white/15">{t("ยกเลิก", "Cancel")}</button>
        </div>
      )}
      {bulkEditOpen && bulkFields.length > 0 && (
        <BulkEditAllModal
          fields={bulkFields}
          count={selected.size}
          title={t(`แก้ ${selected.size.toLocaleString("th-TH")} รายการที่เลือก`, `Edit ${selected.size.toLocaleString("th-TH")} selected items`)}
          note={t(`จะแก้เฉพาะ ${selected.size.toLocaleString("th-TH")} รายการที่เลือกไว้ — เลือกข้อมูลที่จะแก้แล้วใส่ค่าใหม่`, `Only the ${selected.size.toLocaleString("th-TH")} selected items will change — pick the fields and enter new values`)}
          applyLabel={t("บันทึก", "Save")}
          onApply={applyBulkEdit}
          onClose={() => setBulkEditOpen(false)}
        />
      )}
      {customizeOpen && (
        <CardCustomizeModal value={cardFields} avail={availFields} onClose={() => setCustomizeOpen(false)} onSave={saveCard} onReset={resetCard} />
      )}
      {printOpen && (
        <BarcodePrintModal open={printOpen} onClose={() => setPrintOpen(false)} ids={[...selected]} entity={entity} />
      )}
      {bundleAddOpen && entity === "skus" && (
        <BundleAddModal
          items={[...selected].map((id) => { const c = cards.find((x) => x.id === id); return { sku_id: id, code: c?.code ?? "…", name: c?.name ?? "", image: c?.image ?? null }; })}
          onClose={() => setBundleAddOpen(false)}
          onDone={() => clearSel()} />
      )}
      {peekId && (() => {
        const isParent = entity === "parent-skus";
        // ใช้ "drawer เก่าตัวจริง" ของ MasterCRUD (เหมือนหน้า master เป๊ะ) — ไม่ใช่ RelationPeek
        return (
          <MasterRecordDrawer
            key={peekId}
            moduleKey={isParent ? "parent-skus-v2" : "skus-v2"}
            apiPath={isParent ? "parent-skus" : "skus"}
            title={isParent ? "Parent SKUs" : "SKU"}
            mediaGallery={isParent
              ? { entityType: "parent_skus_v2", title: t("รูปภาพเพิ่มเติม", "More images"), maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }
              : { entityType: "skus_v2", title: t("รูปภาพเพิ่มเติม", "More images"), maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }}
            extraRowActions={isParent ? undefined : [{
              label: t("คัดลอก", "Copy"), icon: "⧉",
              onClick: (row) => setCopyPending({ id: String(row.id), code: String(row.code ?? row.id) }),
            }]}
            recordId={peekId}
            navIds={cards.map((c) => c.id)}
            onClose={() => setPeekId(null)}
            onChanged={() => void reloadFirst()}
          />
        );
      })()}
      {/* 📦 drawer Parent SKU — เปิดจากชิป Parent บนการ์ด/แถว SKU (ของกลาง MasterRecordDrawer ตัวเดียวกับหน้า Parent) */}
      {parentPeekId && (
        <MasterRecordDrawer
          key={"parent-" + parentPeekId}
          moduleKey="parent-skus-v2"
          apiPath="parent-skus"
          title="Parent SKUs"
          mediaGallery={{ entityType: "parent_skus_v2", title: t("รูปภาพเพิ่มเติม", "More images"), maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }}
          recordId={parentPeekId}
          onClose={() => setParentPeekId(null)}
          onChanged={() => void reloadFirst()}
        />
      )}
    </div>
  );
}

function SkuCardView({ c, img = null, fields, extraDefs, thumbW = 320, selected, selectMode, onClick, onPointerDownCard, onPointerDownHandle, onPointerEnter, onOpenParent }: {
  c: SkuCard; fields: string[]; extraDefs: FieldDef[]; selected: boolean; selectMode: boolean;
  /** ลากรูปมาวาง / มือถือแตะถ่าย-เลือกรูป (null = แก้ไม่ได้) */
  img?: ImgTarget;
  /** ความกว้างรูปที่ขอ — การ์ดเล็ก (ซูมออก) ขอรูปเล็ก โหลดเร็ว */
  thumbW?: number;
  onClick: () => void; onPointerDownCard: () => void; onPointerDownHandle: () => void; onPointerEnter: () => void;
  /** กดชิป "📦 Parent" → เปิด drawer Parent (ไม่เปิดการ์ด SKU) */
  onOpenParent?: (parentId: string) => void;
}) {
  const t = useT();
  const has = (k: string) => fields.includes(k);
  const showTopRow = has("code") || has("status");
  const showPriceRow = has("price") || has("stock");
  const warns = cardWarnings(c);
  return (
    <div role="button" tabIndex={0} title={c.name ? `${c.code} · ${c.name}` : c.code}
      {...(img?.zone ?? {})}
      onClick={onClick}
      onPointerDown={(e) => { if (e.button === 0) onPointerDownCard(); }}
      onPointerEnter={onPointerEnter}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`relative text-left rounded-xl border bg-white overflow-hidden hover:shadow-sm transition cursor-pointer ${img?.over ? "border-indigo-500 ring-2 ring-indigo-300" : selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
      {/* 🖼 ลากรูปมาวาง: ไฮไลต์ทั้งการ์ด · กำลังอัป: แถบ UploadProgress ทับล่างการ์ด */}
      {img?.over && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded-xl text-indigo-700 text-[13px] font-medium pointer-events-none">
          <Icon name="upload" size={22} />{c.image ? t("ปล่อยเพื่อเพิ่มรูป", "Drop to add image") : t("ปล่อยเพื่อใส่รูป", "Drop to set image")}
        </div>
      )}
      {img?.up && (
        <div className="absolute inset-x-1.5 bottom-1.5 z-20 rounded-lg border border-slate-200 bg-white/95 p-1.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
          <UploadProgress {...img.up} />
        </div>
      )}
      <span
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPointerDownHandle(); }}
        onClick={(e) => { e.stopPropagation(); }}
        title={t("เลือก / ลากคลุมเพื่อเลือกหลายรายการ", "Select / drag across to select many")}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] cursor-pointer ${selected ? "bg-indigo-600 border-indigo-600 text-white" : selectMode ? "bg-white border-slate-300 text-slate-300" : "bg-white/90 border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
      {has("image") && (
        <div className="relative aspect-[5/4] bg-slate-100 flex items-center justify-center overflow-hidden">
          {c.image
            ? <img src={withImageWidth(c.image, thumbW) ?? c.image} alt={c.code} loading="lazy" draggable={false} className="w-full h-full object-contain" />
            : img
              // ยังไม่มีรูป + แก้ได้: PC = "ลากรูปมาวาง" · มือถือ = ปุ่มถ่ายรูป / เลือกรูป (ของกลาง usePhotoCapture)
              ? (img.touch
                ? <div className="flex flex-col items-center gap-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <button type="button" onClick={img.camera} className="h-8 px-3 rounded-full bg-white border border-slate-200 text-[12px] text-slate-700 inline-flex items-center gap-1"><Icon name="camera" size={14} />{t("ถ่ายรูป", "Take photo")}</button>
                    <button type="button" onClick={img.library} className="h-8 px-3 rounded-full bg-white border border-slate-200 text-[12px] text-slate-700 inline-flex items-center gap-1"><Icon name="photo" size={14} />{t("เลือกรูป", "Choose image")}</button>
                  </div>
                : <div className="flex flex-col items-center gap-1 text-slate-400 text-[12px]"><Icon name="upload" size={22} />{t("ลากรูปมาวาง", "Drop an image")}<span className="text-[10px]">{t("หรือชี้แล้วกด Ctrl+V", "or hover and press Ctrl+V")}</span></div>)
              : <span className="text-3xl text-slate-300">🏷️</span>}
          {c.image_from_child && <span className={`${GALLERY_LABEL} absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-slate-800/70 text-white`} title={t("Parent ยังไม่มีรูปของตัวเอง — โชว์รูปจาก SKU ลูก", "Parent has no image of its own — showing a child SKU image")}>{t("ตัวอย่างจากลูก", "From child")}</span>}
        </div>
      )}
      <div className="p-2.5">
        {warns.length > 0 && (
          <div className={`${GALLERY_LABEL} flex flex-wrap gap-1 mb-1.5`}>
            {warns.map((x) => <span key={x} className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⚠ {x}</span>)}
          </div>
        )}
        {showTopRow && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {has("code") && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c.code}</span>}
            {has("status") && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? t("ใช้งาน", "Active") : t("ปิด", "Off")}</span>}
          </div>
        )}
        {/* การ์ดจำกัด 2 บรรทัดเพื่อให้สูงเท่ากัน — ชี้ที่ชื่อเพื่อดูเต็ม (มุมมองตารางแสดงเต็มอยู่แล้ว) */}
        {has("name") && <p title={c.name || ""} className={`${GALLERY_LABEL} text-[12px] text-slate-700 mt-1`} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}>{c.name || "—"}</p>}
        {/* 📦 Parent SKU ของตัวนี้ — กดเปิด drawer Parent (stopPropagation ไม่ให้เปิดการ์ด SKU) */}
        {c.parent && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenParent?.(c.parent!.id); }} onPointerDown={(e) => e.stopPropagation()}
            title={t(`Parent SKU: ${c.parent.code} · ${c.parent.name || ""} — กดเพื่อเปิด`, `Parent SKU: ${c.parent.code} · ${c.parent.name || ""} — click to open`)}
            className={`${GALLERY_LABEL} mt-1 inline-flex items-center gap-1 max-w-full text-[10px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100`}>
            <span className="shrink-0">📦</span><span className="font-mono truncate">{c.parent.code}</span>
          </button>
        )}
        {c.variant_count != null ? (
          <div className="mt-1.5 text-[12px] text-indigo-600">📦 {c.variant_count.toLocaleString("th-TH")} {t("ตัวลูก (SKU)", "child SKUs")}</div>
        ) : showPriceRow ? (
          <div className="flex items-center justify-between mt-1.5">
            {has("price") ? <span className="text-[13px] font-medium text-slate-800">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</span> : <span />}
            {has("stock") && <span className="text-[11px] text-slate-400">{t("สต๊อก", "Stock")} {c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</span>}
          </div>
        ) : null}
        {c.variant_count == null && has("buy_price") && c.buy_price !== undefined && (
          <div className={`${GALLERY_LABEL} mt-0.5 text-[11px] text-slate-500`} title={c.buy_price?.label ?? t("ยังไม่มีราคาซื้อ (ไม่มี PO / ราคาร้าน / ต้นทุนมาตรฐาน)", "No buying price yet (no PO / supplier price / standard cost)")}>{t("ซื้อ", "Buy")} {fmtBuy(c.buy_price)}</div>
        )}
        {has("tags") && c.tags.length > 0 && (
          <div className={`${GALLERY_LABEL} flex flex-wrap gap-1 mt-1.5`}>
            {c.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
            {c.tags.length > 3 && <span className="text-[10px] text-slate-400">+{c.tags.length - 3}</span>}
          </div>
        )}
        {extraDefs.length > 0 && (
          <div className={`${GALLERY_LABEL} mt-1.5 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5`}>
            {extraDefs.map((d) => <p key={d.key} className="text-[10px] text-slate-500 truncate"><span className="text-slate-400">{d.label}:</span> {fmtCell(c.extra?.[d.key])}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

// มุมมองตาราง — ใช้ข้อมูลชุดเดียวกับการ์ด (filter/sort/เลือก เหมือนกัน)
// หัวคอลัมน์ที่กดเรียงได้ — เรียงที่เซิร์ฟเวอร์ (ครบทุกหน้า ไม่ใช่แค่หน้าที่เห็น) · กดซ้ำ = สลับน้อย→มาก/มาก→น้อย
function SortTh({ label, ascKey, descKey, sortKey, onSort, align = "left", className = "" }: {
  label: string; ascKey: string; descKey: string; sortKey: string; onSort: (k: string) => void; align?: "left" | "right";
  className?: string;
}) {
  const t = useT();
  const asc = sortKey === ascKey, desc = sortKey === descKey;
  const on = asc || desc;
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""} ${className}`}>
      <button type="button" onClick={() => onSort(asc ? descKey : ascKey)} title={t(`เรียงตาม${label}`, `Sort by ${label}`)}
        className={`inline-flex items-center gap-1 hover:text-slate-800 ${on ? "text-indigo-600 font-semibold" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}<span className={`text-[10px] ${on ? "" : "text-slate-300"}`}>{asc ? "▲" : desc ? "▼" : "⇅"}</span>
      </button>
    </th>
  );
}

function SkuTable({ rows, selected, selectMode, onToggle, onOpen, sortKey, onSort, showCost = false, onOpenParent, imgPx = 36, wheelRef, attEntity, compact = false, imgTargetOf }: {
  compact?: boolean;    // 📱 มือถือ = แถวกะทัดรัด
  imgTargetOf?: (id: string) => ImgTarget;   // 🖼 ลากรูปวางลงแถว / มือถือแตะถ่าย-เลือกรูป
  rows: SkuCard[]; selected: Set<string>; selectMode: boolean; onToggle: (id: string) => void; onOpen: (id: string) => void;
  sortKey: string; onSort: (col: string) => void;
  showCost?: boolean;   // มีสิทธิ์ดูต้นทุน → เพิ่มคอลัมน์ "ราคาซื้อ (ล่าสุด)"
  onOpenParent?: (parentId: string) => void;   // กด Parent ในแถว → เปิด drawer Parent
  imgPx?: number;       // ขนาดรูปย่อ (Ctrl+ลูกกลิ้ง / ปุ่ม − % +)
  wheelRef?: (el: HTMLElement | null) => void;   // ติด Ctrl+ลูกกลิ้ง (useCtrlWheel ของกลาง)
  attEntity?: string;   // entity_type ของรูปในแกลเลอรี (skus_v2 / parent_skus_v2) → ป๊อปรูปเลื่อนดูรูปอื่นได้
}) {
  const t = useT();
  const showParent = rows.some((r) => r.parent !== undefined);   // เฉพาะโหมด SKU (Parent เองไม่มีคอลัมน์นี้)
  // 🖼 กดรูป = ป๊อปรูปใหญ่ (ของกลาง ImageLightbox) — เปิดรูปหลักทันที แล้วโหลดรูปอื่นของตัวนั้นมาให้เลื่อนดู
  const [lb, setLb] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const lbReq = useRef(0);
  const openImages = (c: SkuCard) => {
    if (!c.image) return;
    const req = ++lbReq.current;
    setLb({ images: [{ url: c.image, label: c.code }], index: 0 });
    if (!attEntity) return;
    apiFetch(`/api/attachments?entity_type=${attEntity}&entity_id=${encodeURIComponent(c.id)}`).then((r) => r.json()).then((j) => {
      if (req !== lbReq.current) return;
      const imgs = ((j?.data ?? []) as { public_url?: string; content_type?: string | null; file_name?: string }[])
        .filter((a) => a.public_url && (!a.content_type || a.content_type.startsWith("image/")))
        .map((a) => ({ url: a.public_url as string, label: `${c.code} · ${a.file_name ?? ""}` }));
      if (imgs.length > 1) setLb((cur) => (cur ? { images: imgs, index: 0 } : cur));
    }).catch(() => { /* โหลดรูปอื่นไม่ได้ = ดูรูปหลักรูปเดียว */ });
  };
  // ช่องรูปของแถว: มีรูป = HoverImage (ชี้/กด) · ไม่มีรูป + แก้ได้ = PC บอกให้ลากวาง · มือถือ = ปุ่มกล้อง · กำลังอัป = แถบ UploadProgress
  const imgCell = (c: SkuCard, size: number, previewSize?: number) => {
    const it = imgTargetOf?.(c.id) ?? null;
    if (it?.up) return <div style={{ width: Math.max(size, 120) }}><UploadProgress {...it.up} /></div>;
    if (!c.image && it) {
      return it.touch
        ? <button type="button" onClick={(e) => { e.stopPropagation(); it.library(); }} title={t("เพิ่มรูป", "Add image")}
            style={{ width: size, height: size }} className="shrink-0 inline-flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-slate-400"><Icon name="camera" size={16} /></button>
        : <span title={t("ลากรูปมาวางที่แถวนี้ หรือชี้แล้วกด Ctrl+V", "Drop an image on this row, or hover and press Ctrl+V")} style={{ width: size, height: size }} className="shrink-0 inline-flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-slate-400"><Icon name="upload" size={14} /></span>;
    }
    return <HoverImage url={c.image} size={size} previewSize={previewSize} alt={c.code} fallback="—" onOpen={() => openImages(c)} />;
  };
  const lightbox = (
    <ImageLightbox images={lb?.images ?? []} index={lb ? lb.index : -1} onClose={() => { lbReq.current++; setLb(null); }}
      onIndex={(i) => setLb((cur) => (cur ? { ...cur, index: i } : cur))} thumbnails={(lb?.images.length ?? 0) > 1} />
  );
  // 📱 มือถือ: แถวกะทัดรัด (ติ๊ก · รูป · รหัส+ชื่อ · ราคา) ไม่ต้องเลื่อนตารางซ้ายขวา — เจ้าของเลือก 2026-11-22
  if (compact) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {lightbox}
        {rows.map((c) => {
          const sel = selected.has(c.id);
          const w = cardWarnings(c);
          const price = c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : (showCost && c.buy_price ? fmtBuy(c.buy_price) : "—");
          return (
            <div key={c.id} {...(imgTargetOf?.(c.id)?.zone ?? {})} onClick={() => (selectMode ? onToggle(c.id) : onOpen(c.id))}
              className={`flex items-center gap-2.5 px-2.5 py-2 cursor-pointer ${imgTargetOf?.(c.id)?.over ? "bg-indigo-100" : sel ? "bg-indigo-50" : "active:bg-slate-50"}`}>
              <span onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}
                className={`shrink-0 inline-flex w-5 h-5 rounded border items-center justify-center text-[11px] ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
              {imgCell(c, Math.max(40, imgPx))}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px] text-slate-500 truncate">{c.code}{!c.is_active && <span className="ml-1 text-slate-400">· {t("ปิด", "Off")}</span>}</div>
                <div className="text-[13px] text-slate-800 leading-snug line-clamp-2">{c.name || <span className="text-slate-300">—</span>}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] tabular-nums text-slate-700">{price}</div>
                {w.length > 0 && <div className="text-[11px] text-amber-700">⚠ {w.length}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div ref={wheelRef} className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
      {lightbox}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-[12px]">
          <tr className="text-left">
            <th className="px-2 py-2 w-8"></th>
            <th className="px-2 py-2" style={{ width: imgPx + 16 }}>{t("รูป", "Image")}</th>
            <SortTh label={t("รหัส", "Code")} ascKey="code" descKey="code_desc" sortKey={sortKey} onSort={onSort} />
            <SortTh label={t("ชื่อ", "Name")} ascKey="name" descKey="name_desc" sortKey={sortKey} onSort={onSort} className="w-full" />
            {showParent && <th className="px-3 py-2 font-medium whitespace-nowrap" title={t("Parent SKU ของแถวนี้ — กดเพื่อเปิด", "This row's Parent SKU — click to open")}>Parent</th>}
            <SortTh label={t("ราคาขาย", "Price")} ascKey="price_asc" descKey="price_desc" sortKey={sortKey} onSort={onSort} align="right" />
            {showCost && <th className="px-3 py-2 font-medium text-right whitespace-nowrap" title={t("ราคาซื้อล่าสุด — จากใบ PO ล่าสุด ถ้าไม่มีใช้ราคาร้าน ถ้าไม่มีอีกใช้ต้นทุนมาตรฐานใน SKU (ชี้ที่ตัวเลขเพื่อดูที่มา)", "Latest buying price — from the latest PO, else the supplier price, else the SKU's standard cost (hover the number to see the source)")}>{t("ราคาซื้อ", "Buy price")}</th>}
            <th className="px-3 py-2 font-medium text-right">{t("สต๊อก", "Stock")}</th>
            <th className="px-3 py-2 font-medium">{t("แท็ก", "Tags")}</th>
            <th className="px-3 py-2 font-medium">{t("สถานะ", "Status")}</th>
            <th className="px-3 py-2 font-medium">{t("เตือน", "Warnings")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const w = cardWarnings(c);
            const sel = selected.has(c.id);
            return (
              <tr key={c.id} {...(imgTargetOf?.(c.id)?.zone ?? {})} onClick={() => (selectMode ? onToggle(c.id) : onOpen(c.id))}
                className={`border-t border-slate-100 cursor-pointer ${imgTargetOf?.(c.id)?.over ? "bg-indigo-100 outline outline-2 outline-dashed outline-indigo-400 -outline-offset-2" : sel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <td className="px-2 py-1.5" onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}>
                  <span className={`inline-flex w-4 h-4 rounded border items-center justify-center text-[10px] cursor-pointer ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
                </td>
                <td className="px-2 py-1.5">
                  {/* ชี้ = รูปใหญ่ลอย · กด = ป๊อปเต็มจอ (ไม่เปิดลิ้นชัก) — ของกลาง HoverImage */}
                  {imgCell(c, imgPx, Math.max(256, imgPx * 3))}
                </td>
                <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap">{c.code}</td>
                <td className="px-3 py-1.5"><span className="block whitespace-normal break-words leading-snug min-w-[16rem]">{c.name || <span className="text-slate-300">—</span>}</span></td>
                {showParent && (
                  <td className="px-3 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {c.parent
                      ? <button type="button" onClick={() => onOpenParent?.(c.parent!.id)} title={t(`${c.parent.code} · ${c.parent.name || ""} — กดเพื่อเปิด Parent`, `${c.parent.code} · ${c.parent.name || ""} — click to open Parent`)}
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">📦 {c.parent.code}</button>
                      : <span className="text-slate-300 text-[11px]">—</span>}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</td>
                {showCost && (
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap" title={c.buy_price?.label ?? t("ยังไม่มีราคาซื้อ (ไม่มี PO / ราคาร้าน / ต้นทุนมาตรฐาน)", "No buying price yet (no PO / supplier price / standard cost)")}>
                    {c.variant_count != null ? "—" : (
                      <span className={c.buy_price ? "text-slate-700" : "text-slate-300"}>
                        {fmtBuy(c.buy_price)}
                        {c.buy_price && <span className="ml-1 text-[9px] text-slate-400 align-middle">{c.buy_price.source === "po" ? "PO" : c.buy_price.source === "list" ? t("ร้าน", "Supplier") : t("มาตรฐาน", "Standard")}</span>}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 2).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
                    {c.tags.length > 2 && <span className="text-[10px] text-slate-400">+{c.tags.length - 2}</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? t("ใช้งาน", "Active") : t("ปิด", "Off")}</span></td>
                <td className="px-3 py-1.5 whitespace-nowrap">{w.length > 0 ? <span className="text-[11px] text-amber-700" title={w.join(", ")}>⚠ {w.length}</span> : <span className="text-emerald-500 text-[11px]">✓</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardCustomizeModal({ value, avail, onClose, onSave, onReset }: {
  value: string[]; avail: FieldDef[]; onClose: () => void; onSave: (f: string[], t: "me" | "all") => void; onReset: () => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<string[]>(value);
  const [target, setTarget] = useState<"me" | "all">("me");
  const toggle = (k: string) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  return (
    <ERPModal open onClose={onClose} title={t("ปรับแต่งการ์ด SKU", "Customize SKU card")} size="sm"
      footer={
        <div className="flex items-center justify-between w-full">
          <button onClick={onReset} className="h-9 px-3 text-[13px] text-slate-500 hover:underline">{t("รีเซ็ตเป็นค่าเริ่มต้น", "Reset to default")}</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => onSave(sel, target)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("บันทึก", "Save")}</button>
          </div>
        </div>
      }>
      <p className="text-[12px] text-slate-500 mb-2">{t("เลือกฟิลด์ที่จะโชว์บนการ์ด", "Choose fields to show on the card")}</p>
      <div className="flex flex-col gap-1.5 mb-3">
        {CARD_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4" /> {f.label}
          </label>
        ))}
      </div>
      {avail.length > 0 && (
        <div className="mb-4 pt-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-500 mb-2">{t("＋ เพิ่มฟิลด์อื่นของ SKU", "＋ Add other SKU fields")} <span className="text-[10px] text-slate-400">{t("(จากทะเบียน field — ไม่ตายตัว)", "(from the field registry)")}</span></p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-44 overflow-auto pr-1">
            {avail.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4 shrink-0" /> <span className="truncate">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-500 mb-1.5">{t("บันทึกให้", "Save for")}</p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "me"} onChange={() => setTarget("me")} /> {t("เฉพาะฉัน", "Only me")}</label>
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "all"} onChange={() => setTarget("all")} /> {t("ทุกคน (ต้องมีสิทธิ์)", "Everyone (needs permission)")}</label>
        </div>
      </div>
    </ERPModal>
  );
}

// (คลิกการ์ด/แถว → ใช้ MasterRecordDrawer ของกลาง = drawer เก่าตัวจริงของ MasterCRUD)

// ── เพิ่ม Parent SKU = ป๊อปของกลาง ParentSkuCreateModal (components/parent-sku-create-modal) — SKU ใช้ Wizard เต็ม ──
