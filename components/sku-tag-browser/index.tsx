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
import { withImageWidth } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { Pager } from "@/components/pager";
import { hasOpenDrawer } from "@/lib/drawer-history";
import { SkuWizard } from "@/app/master/skus/sku-wizard";
import { MaterialRequestButton } from "@/components/material-request";
// ของกลาง bulk edit — type อย่างเดียว (ไม่กิน runtime); ตัว modal โหลดแบบ dynamic ด้านล่าง (กัน data-table เข้า bundle หน้านี้)
import type { BulkEditField } from "@/components/data-table";
import type { BrowseTree, BrowseGroup, BrowseTag, SkuCard } from "@/app/api/sku-browser/route";
// drawer เก่าตัวจริงของ MasterCRUD — โหลดเฉพาะตอนเปิด (master-crud หนัก) กันบวม bundle
// loading: โชว์ "กำลังเปิด…" ทันทีระหว่างโหลดก้อนโค้ดครั้งแรก (ไม่ให้รู้สึกค้าง)
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[140] bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl px-5 py-3 text-sm text-slate-500 shadow-2xl inline-flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" /> กำลังเปิด…
      </div>
    </div>
  ),
});
// 🛒 กล่องพักสินค้าจาก Taobao — โหลดเฉพาะตอนกดปุ่ม (ไม่ให้ถ่วง bundle หน้าหลัก)
const TaobaoBrowser = nextDynamic(() => import("@/components/taobao-browser").then((m) => m.TaobaoBrowser), {
  ssr: false,
  loading: () => <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>,
});
// ป๊อปอัป bulk edit ของกลาง — โหลดเฉพาะตอนกด "แก้ไขข้อมูล" (data-table ใหญ่ ไม่เอาเข้า bundle หน้านี้)
const BulkEditAllModal = nextDynamic(() => import("@/components/data-table").then((m) => ({ default: m.BulkEditAllModal })), { ssr: false });
// ป๊อปอัปพิมพ์บาร์โค้ด/QR — โหลดเฉพาะตอนกด (jsbarcode/qrcode ไม่เข้า bundle หน้านี้)
const BarcodePrintModal = nextDynamic(() => import("@/components/barcode-print/modal").then((m) => ({ default: m.BarcodePrintModal })), { ssr: false });
// ตัวจัดการ SKU ซ้ำ (รวม/ยุบ) — โหลดเฉพาะตอนกด
const SkuMergeModal = nextDynamic(() => import("@/components/sku-merge").then((m) => ({ default: m.SkuMergeModal })), { ssr: false });
// ตรวจรูปที่ไฟล์หายจากที่เก็บ — โหลดเฉพาะตอนกด
const MissingImagesModal = nextDynamic(() => import("@/components/missing-images").then((m) => ({ default: m.MissingImagesModal })), { ssr: false });

type Crumb = { id: string; name: string };

// ── สถานะการเดินเก็บใน history.state (__skuNav) — รอดตอน refresh + ปุ่ม Back ย้อนได้ ──
type SkuNav = { gp: Crumb[]; tf: TagFilterValue; sp?: "all" | "recent" | "trash" | null; page?: number; en?: "skus" | "parent-skus" };
function savedNav(): SkuNav | null {
  if (typeof window === "undefined") return null;
  try { return (window.history.state as { __skuNav?: SkuNav } | null)?.__skuNav ?? null; } catch { return null; }
}
// อัปเดตสถานะในรายการประวัติปัจจุบัน (ไม่เพิ่มรายการใหม่) — ใช้ตอนเปลี่ยนหน้า/สลับชนิด
function patchNav(p: Partial<SkuNav>): void {
  if (typeof window === "undefined") return;
  try {
    const cur = savedNav() ?? { gp: [], tf: EMPTY_FILTER };
    window.history.replaceState({ ...(window.history.state ?? {}), __skuNav: { ...cur, ...p } }, "");
  } catch { /* ignore */ }
}

const CARD_FIELDS: { key: string; label: string }[] = [
  { key: "image",  label: "รูป" }, { key: "code", label: "รหัส" }, { key: "name", label: "ชื่อ" },
  { key: "price",  label: "ราคาขาย" }, { key: "stock", label: "สต๊อกคงเหลือ" }, { key: "tags", label: "แท็ก" }, { key: "status", label: "สถานะ" },
];
const DEFAULT_CARD_FIELDS = CARD_FIELDS.map((f) => f.key);
const CORE_KEYS = new Set(DEFAULT_CARD_FIELDS);   // 7 ฟิลด์หลัก (เรนเดอร์พิเศษ) — ที่เหลือ = ฟิลด์เพิ่มจาก Field Registry
const CORE_COLUMNS = new Set(["id", "code", "name_th", "list_price", "is_active", "cover_image_r2_key"]);
function fmtCell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
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
  if (!c.image) w.push("ไม่มีรูป");
  if (c.variant_count == null && (c.list_price == null || c.list_price <= 0)) w.push("ไม่มีราคา");   // Parent ไม่มีราคา = ไม่เตือน
  if (c.tags.length === 0) w.push("ไม่มีแท็ก");
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
  const [tree, setTree] = useState<BrowseTree | null>(null);
  const [groupPath, setGroupPath] = useState<Crumb[]>(nav0?.gp ?? []);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(nav0?.tf ?? EMPTY_FILTER);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("code");
  const [special, setSpecial] = useState<"all" | "recent" | "trash" | null>(nav0?.sp ?? null);   // โฟลเดอร์พิเศษ: ทั้งหมด / ล่าสุด / ถังขยะ
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);   // กรองเฉพาะ SKU ที่ข้อมูลไม่ครบ
  const [selected, setSelected] = useState<Set<string>>(new Set());   // เลือกหลายตัว (bulk)
  const [printOpen, setPrintOpen] = useState(false);                  // ป๊อปอัปพิมพ์บาร์โค้ด/QR
  const [view, setView] = useState<"card" | "table">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sku-browser-view") === "table") return "table";
    return "card";
  });
  const setViewPersist = (v: "card" | "table") => { setView(v); try { localStorage.setItem("sku-browser-view", v); } catch { /* ignore */ } };

  const [cards, setCards] = useState<SkuCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(nav0?.page ?? 0);   // แบ่งหน้า (0-based) — ใช้ Pager ของกลาง แทน "โหลดเพิ่ม"
  const [loadingCards, setLoadingCards] = useState(false);

  const [cardFields, setCardFields] = useState<string[]>(DEFAULT_CARD_FIELDS);
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
  // คัดลอก SKU (หลังยืนยัน) → รีเฟรช + เด้งเปิดตัวใหม่ที่เพิ่งสร้าง
  const doCopy = async (id: string) => {
    try {
      const res = await apiFetch("/api/skus/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? "คัดลอกไม่สำเร็จ");
      toast.success(`คัดลอกเป็น ${j.code} แล้ว — เปิดให้แก้ไขต่อได้เลย`);
      await reloadFirst();
      if (j.id) setPeekId(String(j.id));   // เด้งไปที่ SKU ตัวใหม่
    } catch (e) { toast.error(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ"); }
  };

  const childGroups = (tree?.groups ?? []).filter((g) => g.parent_group_id === currentGroupId);
  const childTags   = (tree?.tags   ?? []).filter((t) => t.group_id === currentGroupId);

  // ผูกการเดินเข้ากลุ่ม/แท็กกับประวัติเบราว์เซอร์ → ปุ่ม Back ย้อนทีละชั้น (ไม่เด้งออกหน้าเลย)
  const pushNav = useCallback((gp: Crumb[], tf: TagFilterValue, sp: "all" | "recent" | "trash" | null = null) => {
    setGroupPath(gp); setTagFilter(tf); setSpecial(sp); setPage(0);   // เดินที่ใหม่ = เริ่มหน้า 1
    try { window.history.pushState({ __skuNav: { gp, tf, sp, page: 0, en: entityRef.current } }, ""); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // ปิด drawer (ของกลาง drawer-history) ก็ยิง popstate เหมือนกัน — ไม่ใช่การ "ย้อนการเดิน" ของหน้านี้
      // → ต้องไม่แตะหน้า/โฟลเดอร์ที่กำลังดู (เดิมเด้งกลับหน้า 1 หลังปิดสินค้าที่หน้า 4/70)
      if (hasOpenDrawer()) return;
      const s = (e.state as { __skuNav?: SkuNav } | null)?.__skuNav;
      setGroupPath(s?.gp ?? []); setTagFilter(s?.tf ?? EMPTY_FILTER); setSpecial(s?.sp ?? null);   // ไม่มี state ของเรา = กลับถึงราก
      setPage(s?.page ?? 0); if (s?.en) setEntity(s.en);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openGroup   = (g: BrowseGroup) => pushNav([...groupPath, { id: g.id, name: g.name }], EMPTY_FILTER);
  const openTag     = (t: BrowseTag)   => pushNav(groupPath, { tagIds: [t.id], none: false });
  const openSpecial = (kind: "all" | "recent" | "trash") => { setSearch(""); pushNav([], EMPTY_FILTER, kind); };
  const goRoot      = () => { setSearch(""); pushNav([], EMPTY_FILTER); };
  const goCrumb   = (i: number) => pushNav(groupPath.slice(0, i + 1), EMPTY_FILTER);
  const clearTags = () => pushNav(groupPath, EMPTY_FILTER);

  // ── เลือกหลายตัว + bulk ──
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
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
      if ((j.total ?? 0) > ids.length) toast.success(`เลือกได้สูงสุด ${ids.length.toLocaleString("th-TH")} รายการ (กรองให้แคบลงถ้าต้องการมากกว่านี้)`);
    } catch { toast.error("เลือกทั้งหมดไม่สำเร็จ"); } finally { setSelectingAll(false); }
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
    if (!res.ok || !j || j.error) throw new Error(j?.error ?? "แก้ไม่สำเร็จ");
    return (j.affected as number) ?? ids.length;
  }, [apiPath]);
  const bulkAddTag = async (tagId: string) => {
    const ids = [...selected]; if (!tagId || ids.length === 0) return;
    try {
      const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, links: ids.map((src_id) => ({ src_id, tgt_id: tagId })) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`ติดแท็กให้ ${ids.length} รายการแล้ว`); clearSel(); void reloadFirst();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ติดแท็กไม่สำเร็จ"); }
  };
  const bulkStatus = async (active: boolean) => {
    const ids = [...selected]; if (ids.length === 0) return;
    try { const n = await bulkUpdateCentral(ids, { is_active: active }); toast.success(`${active ? "เปิด" : "ปิด"}ใช้งาน ${n} รายการแล้ว`); clearSel(); void reloadFirst(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
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
    const lines = [["รหัส", "ชื่อ", "ราคาขาย", "สต๊อก", "แท็ก", "สถานะ"].join(",")]
      .concat(rows.map((c) => [c.code, c.name, c.list_price ?? "", c.qty_on_hand ?? "", c.tags.join("|"), c.is_active ? "ใช้งาน" : "ปิด"].map(esc).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "skus-export.csv"; a.click(); URL.revokeObjectURL(a.href);
    toast.success(`Export ${rows.length} รายการแล้ว`);
  };

  const saveCard = async (fields: string[], target: "me" | "all") => {
    try {
      const res = await apiFetch("/api/card-layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: CARD_SCOPE, fields, target }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setCardFields(fields); setCustomizeOpen(false);
      toast.success(target === "all" ? "บันทึกเป็นค่าเริ่มต้นของทุกคนแล้ว" : "บันทึกการ์ดของคุณแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const resetCard = async () => {
    try {
      await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}&target=me`, { method: "DELETE" });
      const j = await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json());
      setCardFields(((j.default as string[] | null) && (j.default as string[]).length ? (j.default as string[]) : DEFAULT_CARD_FIELDS));
      setCustomizeOpen(false); toast.success("รีเซ็ตการ์ดแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "รีเซ็ตไม่สำเร็จ"); }
  };

  return (
    <div>
      {/* สลับ SKU / Parent SKU + ปุ่มเพิ่ม — ซ่อนในโหมดเลือก (pick) เพราะขอซื้อได้เฉพาะ SKU */}
      {!pick && (
      <div className="flex items-center gap-1 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => { setTaobao(false); setEntity("skus"); patchNav({ en: "skus", page: 0 }); }} className={`h-9 px-4 text-sm ${!taobao && entity === "skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🏷️ SKU</button>
          <button onClick={() => { setTaobao(false); setEntity("parent-skus"); patchNav({ en: "parent-skus", page: 0 }); }} className={`h-9 px-4 text-sm border-l border-slate-200 ${!taobao && entity === "parent-skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>📦 Parent SKU</button>
          {/* กล่องพักของที่ดูดมาจาก Taobao — ยังไม่เข้า SKU จนกว่าจะกดจับคู่/สร้าง */}
          <button onClick={() => { setTaobao(true); setSelected(new Set()); }} title={t("สินค้าที่เครื่องมือ taobao-catalog ส่งเข้ามา — รอจับคู่กับ SKU", "Items pulled by the taobao-catalog tool — waiting to match a SKU")}
            className={`h-9 px-4 text-sm border-l border-slate-200 ${taobao ? "bg-orange-50 text-orange-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🛒 {t("จาก Taobao", "From Taobao")}</button>
        </div>
        {/* ปุ่มเพิ่ม — ตามแท็บที่เปิด */}
        {!taobao && <button onClick={() => setAddOpen(true)}
          className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">
          ＋ {t("เพิ่ม", "Add")} {entity === "parent-skus" ? "Parent SKU" : "SKU"}
        </button>}
        {!taobao && entity === "skus" && (
          <button onClick={() => setMergeOpen(true)} title={t("รวม SKU ที่ซ้ำกัน เข้าเป็นตัวเดียว (โอนรูป/แท็ก/สต๊อก/BOM ให้ตัวหลัก)", "Merge duplicate SKUs into one (moves images/tags/stock/BOM to the main one)")}
            className="h-9 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 whitespace-nowrap">
            🔗 {t("จัดการ SKU ซ้ำ", "Merge duplicates")}
          </button>
        )}
        {/* ขอเพิ่มวัตถุดิบ — พนักงานกรอกเท่าที่รู้ ยังไม่สร้าง SKU (ของกลาง material-request) */}
        {!taobao && entity === "skus" && <MaterialRequestButton />}
        {!taobao && <button onClick={() => setMissingOpen(true)} title={t("ตรวจว่ามีสินค้าตัวไหนรูปเสีย (ไฟล์หายจากที่เก็บ) บ้าง", "Find products whose image files are missing from storage")}
          className="h-9 px-3 text-sm border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 whitespace-nowrap">
          🔎 {t("ตรวจรูปหาย", "Find broken images")}
        </button>}
        {!taobao && <button onClick={() => openSpecial("trash")} title={t("ดูรายการที่ลบ/ปิดใช้งานไว้ (กู้คืนได้)", "View deleted/disabled items (restorable)")}
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
      {taobao ? <TaobaoBrowser /> : (<>

      {/* search + กรองแท็ก (ของกลาง) + ปรับการ์ด */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ค้นหา SKU ทั้งหมด (รหัส / ชื่อ) — หาได้จากทุกกลุ่ม", "Search all SKUs (code / name) — across every group")}
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label={t("กรองแท็ก", "Filter tags")} showNone={false} />
        {!pick && <button onClick={() => setCustomizeOpen(true)}
          className="h-10 px-3 text-[13px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ {t("ปรับการ์ด", "Card settings")}</button>}
      </div>

      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap">
        <button onClick={goRoot} className={`hover:underline ${groupPath.length === 0 && !cardsMode ? "text-slate-700 font-medium" : "text-indigo-600"}`}>🏠 {t("ทั้งหมด", "All")}</button>
        {search.trim() && <><span className="text-slate-300">›</span><span className="text-slate-500">{t("ค้นหา", "Search")} “{search.trim()}”</span></>}
        {!search.trim() && tagFilter.tagIds.length > 0 && (
          <>
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium">🔖 {tagFilter.tagIds.map((id) => tagNameById.get(id) ?? "แท็ก").join(", ")}</span>
            <button onClick={clearTags} className="text-slate-400 hover:text-rose-500 text-xs ml-1">✕</button>
          </>
        )}
        {special && (
          <span className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium">{special === "all" ? "📋 ทั้งหมด" : special === "trash" ? "🗑 ถังขยะ" : "🕒 ล่าสุด"}</span>
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
        loadingCards ? <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
        : cards.length === 0 ? <div className="text-center py-16 text-slate-400 text-sm">ไม่พบ SKU</div>
        : <>
            {total > LIMIT && (
              <div className="mb-2 pb-2 border-b border-slate-100">
                <Pager page={page} pageSize={LIMIT} total={total} onPage={goPage} unitLabel={entity === "parent-skus" ? "Parent SKU" : "SKU"} />
              </div>
            )}
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-[12px] text-slate-400">{total.toLocaleString("th-TH")} รายการ{onlyIncomplete ? ` · ข้อมูลไม่ครบในหน้านี้ ${shown.length.toLocaleString("th-TH")}` : ""}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {!pick && <button onClick={allShownSelected ? clearSel : selectAllShown}
                  className={`h-8 px-2.5 text-[12px] rounded-lg border ${allShownSelected ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {allShownSelected ? `☑ ${t("เลือกแล้ว", "Selected")}` : `☐ ${t("เลือกทั้งหมด", "Select all")}`}
                </button>}
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                  <button onClick={() => setViewPersist("card")} className={`h-8 px-2.5 text-[12px] ${view === "card" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>▦ {t("การ์ด", "Cards")}</button>
                  <button onClick={() => setViewPersist("table")} className={`h-8 px-2.5 text-[12px] border-l border-slate-200 ${view === "table" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>☰ {t("ตาราง", "Table")}</button>
                </div>
                <button onClick={() => setOnlyIncomplete((v) => !v)}
                  className={`h-8 px-2.5 text-[12px] rounded-lg border ${onlyIncomplete ? "bg-amber-50 border-amber-300 text-amber-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>⚠️ {t("เฉพาะข้อมูลไม่ครบ", "Incomplete only")}</button>
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span>{t("เรียง", "Sort")}</span>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white">
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{t(s.label, s.en)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {onlyIncomplete && <p className="text-[11px] text-amber-600 mb-2">{t(`กรองเฉพาะในหน้านี้ (${cards.length.toLocaleString("th-TH")} ตัว) — เลื่อนหน้าด้านล่างเพื่อตรวจหน้าถัดไป`, `Filtered within this page only (${cards.length.toLocaleString("en-US")}) — go to the next page to check more`)}</p>}
            {shown.length === 0
              ? <div className="text-center py-12 text-slate-400 text-sm">{t("หน้านี้ไม่มีรายการที่ข้อมูลไม่ครบ 🎉", "Nothing incomplete on this page 🎉")}</div>
              : view === "table"
                ? <SkuTable rows={shown} selected={pick ? pickedSet : selected} selectMode={selectMode}
                    onToggle={pick ? ((id) => { const c = shown.find((x) => x.id === id); if (c) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(id); } }) : toggleSel}
                    onOpen={(id) => { if (pick) { const c = shown.find((x) => x.id === id); if (c) onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(id); return; } setPeekId(id); }}
                    sortKey={sortKey} onSort={(k) => { setSortKey(k); setPage(0); patchNav({ page: 0 }); }} />
                : <div className="grid gap-3 select-none" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                    {shown.map((c) => (
                      <SkuCardView key={c.id} c={c} fields={cardFields} extraDefs={extraDefs}
                        // pick: ติ๊กตามที่ผู้เรียกเลือกไว้ · manage: ติ๊กตามระบบ bulk
                        selected={pick ? pickedSet.has(c.id) : selected.has(c.id)} selectMode={pick ? true : selectMode}
                        onClick={() => { if (justDragged.current) return; if (pick) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(c.id); return; } if (selectMode) return; setPeekId(c.id); }}
                        onPointerDownCard={() => { if (!pick && selectMode) beginDrag(c.id, selected.has(c.id)); }}
                        onPointerDownHandle={() => { if (pick) { onPick?.(c as { id: string; code?: string; name?: string; image?: string | null }); onPickSku?.(c.id); return; } beginDrag(c.id, selected.has(c.id)); }}
                        onPointerEnter={() => dragOver(c.id)} />
                    ))}
                  </div>}
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
                  <div className="flex items-center justify-between"><span className="text-2xl">{g.icon || "📁"}</span><span className="text-slate-300">›</span></div>
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
            <option value="">🏷️ ติดแท็ก…</option>
            {(tree?.tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => bulkStatus(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">เปิดใช้งาน</button>
          <button onClick={() => bulkStatus(false)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">ปิดใช้งาน</button>
          <button onClick={exportCsv} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">⬇ Export CSV</button>
          <button onClick={() => setPrintOpen(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white text-indigo-700 font-medium hover:bg-indigo-50">🏷️ พิมพ์บาร์โค้ด</button>
          <button onClick={clearSel} className="text-[12px] px-2 py-1 rounded-lg hover:bg-white/15">ยกเลิก</button>
        </div>
      )}
      {bulkEditOpen && bulkFields.length > 0 && (
        <BulkEditAllModal
          fields={bulkFields}
          count={selected.size}
          title={`แก้ ${selected.size.toLocaleString("th-TH")} รายการที่เลือก`}
          note={`จะแก้เฉพาะ ${selected.size.toLocaleString("th-TH")} รายการที่เลือกไว้ — เลือกข้อมูลที่จะแก้แล้วใส่ค่าใหม่`}
          applyLabel="บันทึก"
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
              ? { entityType: "parent_skus_v2", title: "รูปภาพเพิ่มเติม", maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }
              : { entityType: "skus_v2", title: "รูปภาพเพิ่มเติม", maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }}
            extraRowActions={isParent ? undefined : [{
              label: "คัดลอก", icon: "⧉",
              onClick: (row) => setCopyPending({ id: String(row.id), code: String(row.code ?? row.id) }),
            }]}
            recordId={peekId}
            navIds={cards.map((c) => c.id)}
            onClose={() => setPeekId(null)}
            onChanged={() => void reloadFirst()}
          />
        );
      })()}
    </div>
  );
}

function SkuCardView({ c, fields, extraDefs, selected, selectMode, onClick, onPointerDownCard, onPointerDownHandle, onPointerEnter }: {
  c: SkuCard; fields: string[]; extraDefs: FieldDef[]; selected: boolean; selectMode: boolean;
  onClick: () => void; onPointerDownCard: () => void; onPointerDownHandle: () => void; onPointerEnter: () => void;
}) {
  const has = (k: string) => fields.includes(k);
  const showTopRow = has("code") || has("status");
  const showPriceRow = has("price") || has("stock");
  const warns = cardWarnings(c);
  return (
    <div role="button" tabIndex={0}
      onClick={onClick}
      onPointerDown={(e) => { if (e.button === 0) onPointerDownCard(); }}
      onPointerEnter={onPointerEnter}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`relative text-left rounded-xl border bg-white overflow-hidden hover:shadow-sm transition cursor-pointer ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
      <span
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPointerDownHandle(); }}
        onClick={(e) => { e.stopPropagation(); }}
        title="เลือก / ลากคลุมเพื่อเลือกหลายรายการ"
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] cursor-pointer ${selected ? "bg-indigo-600 border-indigo-600 text-white" : selectMode ? "bg-white border-slate-300 text-slate-300" : "bg-white/90 border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
      {has("image") && (
        <div className="relative h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
          {c.image
            ? <img src={withImageWidth(c.image, 320) ?? c.image} alt={c.code} loading="lazy" draggable={false} className="w-full h-full object-contain" />
            : <span className="text-3xl text-slate-300">🏷️</span>}
          {c.image_from_child && <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-slate-800/70 text-white" title="Parent ยังไม่มีรูปของตัวเอง — โชว์รูปจาก SKU ลูก">ตัวอย่างจากลูก</span>}
        </div>
      )}
      <div className="p-2.5">
        {warns.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {warns.map((x) => <span key={x} className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⚠ {x}</span>)}
          </div>
        )}
        {showTopRow && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {has("code") && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c.code}</span>}
            {has("status") && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? "ใช้งาน" : "ปิด"}</span>}
          </div>
        )}
        {has("name") && <p className="text-[12px] text-slate-700 mt-1" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}>{c.name || "—"}</p>}
        {c.variant_count != null ? (
          <div className="mt-1.5 text-[12px] text-indigo-600">📦 {c.variant_count.toLocaleString("th-TH")} ตัวลูก (SKU)</div>
        ) : showPriceRow ? (
          <div className="flex items-center justify-between mt-1.5">
            {has("price") ? <span className="text-[13px] font-medium text-slate-800">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</span> : <span />}
            {has("stock") && <span className="text-[11px] text-slate-400">สต๊อก {c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</span>}
          </div>
        ) : null}
        {has("tags") && c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {c.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
            {c.tags.length > 3 && <span className="text-[10px] text-slate-400">+{c.tags.length - 3}</span>}
          </div>
        )}
        {extraDefs.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5">
            {extraDefs.map((d) => <p key={d.key} className="text-[10px] text-slate-500 truncate"><span className="text-slate-400">{d.label}:</span> {fmtCell(c.extra?.[d.key])}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

// มุมมองตาราง — ใช้ข้อมูลชุดเดียวกับการ์ด (filter/sort/เลือก เหมือนกัน)
// หัวคอลัมน์ที่กดเรียงได้ — เรียงที่เซิร์ฟเวอร์ (ครบทุกหน้า ไม่ใช่แค่หน้าที่เห็น) · กดซ้ำ = สลับน้อย→มาก/มาก→น้อย
function SortTh({ label, ascKey, descKey, sortKey, onSort, align = "left" }: {
  label: string; ascKey: string; descKey: string; sortKey: string; onSort: (k: string) => void; align?: "left" | "right";
}) {
  const asc = sortKey === ascKey, desc = sortKey === descKey;
  const on = asc || desc;
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button type="button" onClick={() => onSort(asc ? descKey : ascKey)} title={`เรียงตาม${label}`}
        className={`inline-flex items-center gap-1 hover:text-slate-800 ${on ? "text-indigo-600 font-semibold" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}<span className={`text-[10px] ${on ? "" : "text-slate-300"}`}>{asc ? "▲" : desc ? "▼" : "⇅"}</span>
      </button>
    </th>
  );
}

function SkuTable({ rows, selected, selectMode, onToggle, onOpen, sortKey, onSort }: {
  rows: SkuCard[]; selected: Set<string>; selectMode: boolean; onToggle: (id: string) => void; onOpen: (id: string) => void;
  sortKey: string; onSort: (col: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-[12px]">
          <tr className="text-left">
            <th className="px-2 py-2 w-8"></th>
            <th className="px-2 py-2 w-12">รูป</th>
            <SortTh label="รหัส" ascKey="code" descKey="code_desc" sortKey={sortKey} onSort={onSort} />
            <SortTh label="ชื่อ" ascKey="name" descKey="name_desc" sortKey={sortKey} onSort={onSort} />
            <SortTh label="ราคาขาย" ascKey="price_asc" descKey="price_desc" sortKey={sortKey} onSort={onSort} align="right" />
            <th className="px-3 py-2 font-medium text-right">สต๊อก</th>
            <th className="px-3 py-2 font-medium">แท็ก</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
            <th className="px-3 py-2 font-medium">เตือน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const w = cardWarnings(c);
            const sel = selected.has(c.id);
            return (
              <tr key={c.id} onClick={() => (selectMode ? onToggle(c.id) : onOpen(c.id))}
                className={`border-t border-slate-100 cursor-pointer ${sel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <td className="px-2 py-1.5" onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}>
                  <span className={`inline-flex w-4 h-4 rounded border items-center justify-center text-[10px] cursor-pointer ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
                </td>
                <td className="px-2 py-1.5">
                  {c.image
                    ? <img src={withImageWidth(c.image, 80) ?? c.image} alt="" loading="lazy" className="w-9 h-9 rounded object-cover border border-slate-200" />
                    : <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs">—</div>}
                </td>
                <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap">{c.code}</td>
                <td className="px-3 py-1.5"><span className="block max-w-[260px] truncate">{c.name || "—"}</span></td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 2).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
                    {c.tags.length > 2 && <span className="text-[10px] text-slate-400">+{c.tags.length - 2}</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? "ใช้งาน" : "ปิด"}</span></td>
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
  const [sel, setSel] = useState<string[]>(value);
  const [target, setTarget] = useState<"me" | "all">("me");
  const toggle = (k: string) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  return (
    <ERPModal open onClose={onClose} title="ปรับแต่งการ์ด SKU" size="sm"
      footer={
        <div className="flex items-center justify-between w-full">
          <button onClick={onReset} className="h-9 px-3 text-[13px] text-slate-500 hover:underline">รีเซ็ตเป็นค่าเริ่มต้น</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => onSave(sel, target)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
          </div>
        </div>
      }>
      <p className="text-[12px] text-slate-500 mb-2">เลือกฟิลด์ที่จะโชว์บนการ์ด</p>
      <div className="flex flex-col gap-1.5 mb-3">
        {CARD_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4" /> {f.label}
          </label>
        ))}
      </div>
      {avail.length > 0 && (
        <div className="mb-4 pt-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-500 mb-2">＋ เพิ่มฟิลด์อื่นของ SKU <span className="text-[10px] text-slate-400">(จากทะเบียน field — ไม่ตายตัว)</span></p>
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
        <p className="text-[12px] text-slate-500 mb-1.5">บันทึกให้</p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "me"} onChange={() => setTarget("me")} /> เฉพาะฉัน</label>
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "all"} onChange={() => setTarget("all")} /> ทุกคน (ต้องมีสิทธิ์)</label>
        </div>
      </div>
    </ERPModal>
  );
}

// (คลิกการ์ด/แถว → ใช้ MasterRecordDrawer ของกลาง = drawer เก่าตัวจริงของ MasterCRUD)

// ── เพิ่ม Parent SKU (modal เล็ก) — SKU ใช้ Wizard เต็ม, Parent ใช้ตัวนี้ ──
const PARENT_FAMILIES: [string, string][] = [
  ["general", "ทั่วไป"], ["bag", "กระเป๋า"], ["belt", "เข็มขัด"], ["jewelry", "เครื่องประดับ"], ["spare", "อะไหล่"],
];
function ParentSkuCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [brandId, setBrandId] = useState("");
  const [family, setFamily] = useState("general");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setBrands(j.data as { id: string; name: string }[]); }).catch(() => {});
  }, []);
  const save = async () => {
    if (!code.trim()) { toast.error("กรอกรหัส Parent SKU"); return; }
    if (!nameTh.trim()) { toast.error("กรอกชื่อสินค้า"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/parent-skus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name_th: nameTh.trim(), brand_id: brandId || null, product_family: family, is_active: true }),
      });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "สร้างไม่สำเร็จ");
      toast.success("สร้าง Parent SKU แล้ว"); onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" title="＋ เพิ่ม Parent SKU"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : "สร้าง"}</button>
      </div>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-slate-500">รหัส Parent SKU *</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น CVB16" className="mt-0.5 w-full h-9 px-2 text-sm font-mono border border-slate-200 rounded-lg" /></label>
        <label className="block"><span className="text-xs text-slate-500">ชื่อสินค้า (ไทย) *</span>
          <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
        <label className="block"><span className="text-xs text-slate-500">แบรนด์</span>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">— ไม่ระบุ —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        <label className="block"><span className="text-xs text-slate-500">หมวดสินค้า</span>
          <select value={family} onChange={(e) => setFamily(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
            {PARENT_FAMILIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">สร้างแล้วแก้รายละเอียดเพิ่ม (รูป/ราคา/แท็ก) ได้ที่การ์ด</p>
    </ERPModal>
  );
}
