"use client";

/**
 * 📝 DetailInsertButton (ของกลาง) — ปุ่ม "＋ แทรก" ข้างหัวข้อช่องคำอธิบาย → ป๊อปเลือกรายละเอียดแล้วพิมพ์บรรทัดลงให้ตรงตำแหน่งที่เลือก
 *   เปิดใช้ที่ทะเบียนฟิลด์: ui_style.insert_details = true (ตอนนี้ = Description ของ Parent SKU) — ต่อสายใน components/master-crud ที่เดียว
 *   หน้าตา (เจ้าของเลือก 2026-10-17): ซ้าย = เลือก · ขวา = ตัวอย่างคำอธิบาย (คลิกระหว่างบรรทัดเลือกตำแหน่ง · ดูไทย/EN · 🙈 ซ่อนบรรทัดเดิม · คลิกบรรทัดใหม่เพื่อแก้ก่อนแทรก)
 *   แท็บ: 📝 ข้อความ · 🧵 วัสดุ · 🔢 ช่อง · 📏 ขนาด/น้ำหนัก/หูหิ้ว/สาย · 🎒 ใส่อะไรได้ (การ์ดรูป)
 *     ขนาด/ใส่อะไรได้ = ดึงค่าจากช่องของสินค้ามาให้ · แก้ในป๊อป = บันทึกกลับช่องนั้นด้วย (onApply.fields) · โชว์เฉพาะช่องที่ฟอร์มมีและแก้ได้ (writable)
 *     "ล้าง" ในแท็บขนาด/ใส่อะไรได้ = คืนค่าเดิมของสินค้า (ไม่ลบข้อมูลจริง)
 *   ⚙️ รูปแบบบรรทัดกลาง (คำนำหน้า · คำเชื่อม "และ" · ชื่ออังกฤษในวงเล็บ) = /api/detail-insert/templates ใช้ทุกสินค้า ทุกคน
 *   ✏️ ทุกรายการ → ป๊อปเล็กแก้ชื่อไทย/อังกฤษ (🌐 แปล) · รูปแบบบรรทัดช่อง · ขนาด+รูป (ของที่ใส่ได้) · ลบ = ซ่อนจากรายการกลาง (กู้ได้)
 *   🪜 โหมด "ทีละขั้น" (เจ้าของ 2026-11-15 · ค่าเริ่ม · สลับกลับ "แบบแท็บ" ได้ จำต่อคน): วัตถุดิบ → ช่อง → จุดเด่น → ขนาด/น้ำหนัก → ใส่อะไรได้ → ตรวจแล้วแทรก
 *     ข้ามได้ทุกขั้น (ข้าม = ไม่ใส่เรื่องนั้น) · ใช้เนื้อหาแท็บเดิม (ไม่มีหน้าซ้ำ) · กติกาขั้น = lib/detail-snippets availableSteps/stepAfter
 *     วัตถุดิบ: เลือกแล้ว + ค้นหา + ใช้บ่อย (ดูทั้งหมด = รายการเต็ม) · แนะนำจากข้อมูลวัสดุฝ่ายผลิต (parent.materials · suggestMaterials — คนกดเลือกเอง)
 *     ช่อง: เพิ่มช่องแบบใหม่ได้ทันที (เก็บเข้าคลังกลาง หรือใช้ครั้งนี้) · 📏 ใส่ขนาดช่อง → ต่อท้ายบรรทัด + บันทึกเป็น "ช่องใส่ของ" (compartments · ครบ 3 ด้าน) → ขั้นใส่อะไรได้เช็กจากขนาดนี้
 *     🌐 ภาษาหน้าจอ ไทย/English สลับในป๊อปได้ (เริ่มตามภาษาของบัญชี · ไม่เปลี่ยนภาษาทั้งระบบ) — พนักงานที่อ่านไทยไม่ออกใช้ได้
 *     ✨ เฟส 2: แท็บ "AI ดูรูป" ในขั้นจุดเด่น (components/detail-insert-ai · ส่ง aiParentId) — 7 ข้อ ไทย+อังกฤษ · ติ๊ก/ชอบ/ไม่ชอบ + ความจำ · ศูนย์ AI ai.desc_highlights
 *     ⏭ ทำหลายตัวต่อกัน (หน้าดู): ปุ่ม "แทรก + ตัวถัดไปที่ยังว่าง" (onApplyNext) → master-crud ไปรุ่นถัดไปในรายการที่ช่องนี้ยังว่าง แล้วเปิดป๊อปให้เอง (autoOpen)
 *     📋 เฟส 3: เติมจากข้อมูล (สี จาก SKU ลูก · รับประกัน · วิธีดูแลจากวัสดุ) ในขั้นตรวจ · AI เตือน Description เดิมไม่ตรงรูป + แทนที่ของเดิมทั้งหมดได้
 * กฎคิดบรรทัด: lib/detail-snippets.ts · วัสดุ: lib/product-materials.ts · ใส่อะไรได้: lib/product-fits.ts · ช่องใส่ของ: lib/fit-check.ts
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useTickCatalog } from "@/components/tick-list-field";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { useViewPref } from "@/lib/use-view-pref";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { parseVariants, resolvePhrase, variantSearchText, variantsOf, VARIANT_MODE_LABEL, type VariantMode } from "@/lib/phrase-variants";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { useSWRLite } from "@/lib/swr-lite";
import { useLang } from "@/components/i18n";
import { usePermission } from "@/components/auth";
import { DetailInsertAi, EMPTY_AI, aiPicked, type AiState } from "@/components/detail-insert-ai";
import { Icon } from "@/components/icon";
import {
  availableSteps,
  stepAfter,
  STEP_TABS,
  slotDimsText,
  careLines,
  colorLine,
  warrantyLine,
  type ColorEntry,
  type InsertStep,
  type SlotDims,
  DEFAULT_INSERT_TEMPLATES,
  DEFAULT_SLOT_TEMPLATE,
  DEFAULT_SLOT_TEMPLATE_EN,
  LINE_KIND_LABEL,
  DEFAULT_LINE_ORDER,
  type OrderKind,
  alreadyMentions,
  arrangeEn,
  arrangeRows,
  arrangeTh,
  composeLines,
  isNewRow,
  isSlot,
  isPhrase,
  isStyle,
  isLifestyle,
  freeLines,
  lifestylePrompt,
  moveNewBlock,
  newBlockAt,
  newRowKey,
  oldRowIndex,
  oldRowsMoved,
  type RowKey,
  joinList,
  normalizeInsertTemplates,
  pickProfile,
  profileAllows,
  INSERT_TABS,
  slotText,
  splitLines,
  type BracketKind,
  type InsertProfile,
  type InsertTemplates,
  type LineKind,
  type SnippetItem,
} from "@/lib/detail-snippets";
import { hasMaterialPage, type MaterialRow } from "@/lib/product-materials";
import { MaterialQuickPick } from "@/components/material-quick-pick";
import { fitSizeOptions, parseFits, parseSizeDims, sizeDimsFor, type FitItem, type FitPick } from "@/lib/product-fits";
import { translateContent } from "@/lib/content-translate";
import { bestFit, findCompartment, fitTargetOf, isWindowName, parseCompartments, upsertCompartments, type Compartment } from "@/lib/fit-check";

// กด "🔗 มีหน้า" ที่วัสดุ = เปิดระเบียนวัสดุ (drawer ตัวจริงของหน้า master · แก้คำอธิบาย/วิธีดูแล/รูปได้) — ต้อง dynamic กัน import วนกับ master-crud
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Tab = "phrase" | "material" | "slot" | "size" | "fit" | "lifestyle" | "ai";
type CatalogKind = "phrase" | "slot" | "material" | "fit" | "style" | "lifestyle";
type FitRow = FitItem & { kind?: string | null; image_key?: string | null; width_cm?: number | null; height_cm?: number | null; depth_cm?: number | null; is_soft?: boolean | null; size_estimated?: boolean | null; size_dims?: unknown };

const SNIP = "product_highlight_items";
const MAT = "product_materials";
const FIT = "product_fit_items";
const TPL_KEY = "detail-insert-templates";
const HIDE_KEY = "detail-insert-hide-old";
const catalogOf = (k: CatalogKind) => (k === "material" ? MAT : k === "fit" ? FIT : SNIP);
const imgUrl = (key: string, w = 240) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** ช่องตัวเลขของสินค้า (คอลัมน์ size_length_cm = กว้าง ตามป้ายทุกที่) */
const NUM_FIELDS = [
  { k: "w", field: "size_length_cm", label: "กว้าง", en: "Length", unit: "ซม." },
  { k: "h", field: "size_height_cm", label: "สูง", en: "Height", unit: "ซม." },
  { k: "d", field: "size_thickness_cm", label: "หนา", en: "Width", unit: "ซม." },
  { k: "g", field: "weight_g", label: "น้ำหนัก", en: "Weight", unit: "กรัม" },
  { k: "hd", field: "handle_drop_cm", label: "หูหิ้ว", en: "Handle drop", unit: "ซม." },
  { k: "s1", field: "strap_drop_cm", label: "สายสะพาย", en: "Strap drop", unit: "ซม." },
  { k: "s2", field: "strap_drop_max_cm", label: "สายยาวสุด", en: "Strap max", unit: "ซม." },
] as const;
type NumK = (typeof NUM_FIELDS)[number]["k"];
type SizeLine = "size" | "weight" | "handle" | "strap";
const SIZE_LINE_KEYS: Record<SizeLine, NumK[]> = { size: ["w", "h", "d"], weight: ["g"], handle: ["hd"], strap: ["s1", "s2"] };

const TABS: { key: Tab; label: string; en: string; hint: string; hintEn: string }[] = [
  { key: "phrase", label: "📝 ข้อความ", en: "📝 Phrases", hint: "ติ๊กได้หลายข้อ — ได้บรรทัดละข้อ เรียงตามลำดับที่กด", hintEn: "Tick as many as you like — one line each, in the order you tick" },
  { key: "material", label: "🧵 วัสดุ", en: "🧵 Material", hint: "ติ๊กได้หลายตัว — รวมเป็นบรรทัดเดียว · วัสดุที่มีหน้า ลูกค้ากดดูบนเว็บได้", hintEn: "Pick one or more — they go on one line · materials with a page link on the web shop" },
  { key: "slot", label: "🔢 ช่อง", en: "🔢 Pockets", hint: "พิมพ์แค่จำนวน — ช่องที่ใส่ตัวเลขรวมเป็นบรรทัดเดียว", hintEn: "Type how many — pockets with a number go on one line" },
  { key: "size", label: "📏 ขนาด/น้ำหนัก", en: "📏 Size/weight", hint: "ดึงค่าจากช่องของสินค้ามาให้ · แก้ตรงนี้ = แก้ช่องของสินค้าด้วย", hintEn: "Filled from the product · editing here also updates the product" },
  { key: "fit", label: "🎒 ใส่อะไรได้", en: "🎒 What fits", hint: "กดการ์ดเพื่อเลือก (เลือกขนาดได้) · เลือกตรงนี้ = แก้ช่อง \"ใส่อะไรได้บ้าง\" ของสินค้าด้วย", hintEn: "Tap a card to pick (sizes available) · also updates the product's \"What fits\" field" },
  { key: "ai", label: "✨ AI ดูรูป", en: "✨ AI from photos", hint: "AI ดูรูปสินค้าแล้วเสนอจุดเด่น 7 ข้อ (ไทย + อังกฤษ) · ติ๊กเลือก · ชอบ/ไม่ชอบ = AI จำไว้", hintEn: "AI reads the photos and suggests 7 highlights (Thai + English) · tick to use · like/dislike is remembered" },
  { key: "lifestyle", label: "🌿 Lifestyle / อื่นๆ", en: "🌿 Lifestyle / other", hint: "เลือกสไตล์ → ติ๊กข้อความ (บรรทัดละข้อ เรียงตามลำดับที่กด) · พิมพ์เองได้ · คัดลอก prompt ไปถาม ChatGPT", hintEn: "Pick a style → tick lines (one each, in tick order) · or type your own · copy a prompt for ChatGPT" },
];

/** 🪜 โหมดทีละขั้น — ชื่อขั้น + คำอธิบาย (ไทย/อังกฤษ) */
const STEP_LABEL: Record<InsertStep, [string, string]> = {
  material: ["วัตถุดิบ", "Material"],
  slot: ["ช่อง", "Pockets"],
  highlight: ["จุดเด่น", "Highlights"],
  size: ["ขนาด/น้ำหนัก", "Size/weight"],
  fit: ["ใส่อะไรได้", "What fits"],
  review: ["ตรวจแล้วแทรก", "Review & insert"],
};
const STEP_HINT: Record<InsertStep, [string, string]> = {
  material: ["เลือกวัสดุหลักของสินค้า — รวมเป็นบรรทัดเดียว · ไม่มี = กดข้าม", "Pick the main materials — one line · none = skip"],
  slot: ["ใส่จำนวนช่อง · เพิ่มช่องแบบใหม่ได้ · กดไม้บรรทัดเพื่อใส่ขนาดช่อง (เช่น ช่องใส)", "Set pocket counts · add a new kind · tap the ruler to add a pocket size (e.g. clear pocket)"],
  highlight: ["ติ๊กจุดเด่นของสินค้า (บรรทัดละข้อ) · แท็บ AI ช่วยคิดจากรูป (ถ้าผู้ดูแลเปิดให้)", "Tick the product's highlights (one line each) · the AI tab suggests from photos (if enabled for you)"],
  size: ["ดึงจากข้อมูลสินค้าให้แล้ว · แก้ตรงนี้ = แก้ของสินค้าด้วย", "Filled from the product · edits here also update the product"],
  fit: ["ระบบเช็กจากขนาดช่องให้ · กดการ์ดเพื่อเลือก", "Checked against the pocket sizes · tap a card to pick"],
  review: ["ดูตัวอย่างด้านขวา ลาก ⠿ สลับบรรทัดได้ แล้วกด แทรก", "Check the preview, drag ⠿ to reorder, then press Insert"],
};
const SIZE_LINE_EN = { size: "size", weight: "weight", handle: "handle drop", strap: "strap length" } as const;
const INSERT_MODES = ["steps", "tabs"] as const;
type InsertMode = (typeof INSERT_MODES)[number];
const SIDE_EN: Record<string, string> = { inside: "Inside", outside: "Outside", "": "No position" };

export type DetailInsertResult = {
  th: string;
  en?: string;
  /** ช่องอื่นของสินค้าที่เปลี่ยนในป๊อป (ตัวเลข = number หรือ null · fits = รายการหรือ null) */
  fields?: Record<string, unknown>;
};

const numStr = (v: unknown): string => {
  const n = Number(v);
  return v == null || v === "" || !isFinite(n) || n <= 0 ? "" : String(Math.round(n * 100) / 100);
};
/** 🖼 ขนาดรูปการ์ด "ใส่อะไรได้" (เจ้าของ 2026-10-19 "ขอที่ตั้งขนาดรูป") — จำต่อคน (ของกลาง useViewPref) */
const FIT_SIZES = ["s", "m", "l"] as const;
type FitSize = (typeof FIT_SIZES)[number];
const FIT_SIZE_LABEL: Record<FitSize, string> = { s: "เล็ก", m: "กลาง", l: "ใหญ่" };
const FIT_SIZE_EN: Record<FitSize, string> = { s: "S", m: "M", l: "L" };
const FIT_GRID: Record<FitSize, string> = { s: "grid-cols-4 sm:grid-cols-7", m: "grid-cols-3 sm:grid-cols-5", l: "grid-cols-2 sm:grid-cols-3" };
const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
const readHide = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

/** รูปแบบบรรทัดกลาง (แคชข้ามป๊อป) */
function useInsertTemplates() {
  return useSWRLite<InsertTemplates>(TPL_KEY, async () => {
    const j = await apiFetch("/api/detail-insert/templates").then((r) => r.json());
    return normalizeInsertTemplates(j.data);
  }, { dedupeMs: 60000 });
}

type CategoryRow = { id: string; name: string; parent_id?: string | null; is_active?: boolean | null };

/** หมวดสินค้า (ผูกชุดรายการ) — แคชข้ามป๊อป */
function useCategories() {
  return useSWRLite<CategoryRow[]>("insert-categories", async () => {
    const j = await apiFetch("/api/master-v2/product_categories?limit=1000").then((r) => r.json());
    return ((j.data ?? []) as CategoryRow[]).filter((c) => c.is_active !== false);
  }, { dedupeMs: 300000 });
}

/** ชื่อหมวดพร้อมหมวดแม่ "Louis Montini › เข็มขัด" (ชื่อหมวดซ้ำกันได้หลายที่) */
function categoryPath(id: string, byId: Map<string, CategoryRow>): string {
  const parts: string[] = [];
  let cur: string | null | undefined = id;
  for (let i = 0; cur && i < 4; i++) {
    const c = byId.get(cur);
    if (!c) break;
    parts.unshift(c.name);
    cur = c.parent_id;
  }
  return parts.join(" › ");
}

const SIDE_LABEL: Record<string, string> = { inside: "ด้านใน", outside: "ด้านนอก", "": "ไม่ระบุตำแหน่ง" };
// เจ้าของขอ: ด้านนอกอยู่บน → ด้านใน → ไม่ระบุ (ทั้งในแท็บช่องและบรรทัดที่แทรก — lib/detail-snippets slotGroups)
const sideRank = (s: string | null | undefined) => (s === "outside" ? 0 : s === "inside" ? 1 : 2);

export function DetailInsertButton({
  thText,
  enText,
  hasEn,
  saveLabel,
  values,
  writable,
  onApply,
  fieldKey,
  enFieldKey,
  copyFromApi,
  currentId,
  aiParentId,
  onApplyNext,
  autoOpen,
  onAutoOpened,
}: {
  thText: string;
  enText: string;
  /** มีช่องคำอธิบายภาษาอังกฤษคู่กัน (ui_style.lang_en) */
  hasEn: boolean;
  /** หน้า "ดู" = บันทึกทันที → ปุ่มเขียน "แทรกและบันทึก" */
  saveLabel?: string;
  /** ค่าปัจจุบันของระเบียน (ขนาด/น้ำหนัก/หูหิ้ว/สาย/fits) */
  values?: Record<string, unknown>;
  /** ช่องที่ป๊อปบันทึกกลับได้ (มีในฟอร์ม + แก้ได้) — ไม่มี = ไม่โชว์แท็บนั้น */
  writable?: string[];
  onApply: (next: DetailInsertResult) => Promise<boolean> | boolean;
  /** ⧉ คัดลอกจากรุ่นอื่น: ชื่อช่องไทย/อังกฤษในระเบียน + API ระเบียน (เช่น /api/master-v2/parent-skus) · ไม่ส่ง = ไม่มีปุ่ม */
  fieldKey?: string;
  enFieldKey?: string;
  copyFromApi?: string;
  currentId?: string | null;
  /** ✨ Parent SKU id สำหรับแท็บ AI ดูรูป (ไม่ส่ง = ไม่มีแท็บ AI) */
  aiParentId?: string | null;
  /** ⏭ หลังแทรกสำเร็จ ไปรายการถัดไปที่ช่องนี้ยังว่าง (หน้าดูของ master-crud) — ไม่ส่ง = ไม่มีปุ่ม */
  onApplyNext?: () => void;
  /** เปิดป๊อปให้เอง (มาถึงรายการถัดไปจากปุ่ม ⏭) — เปิดแล้วเรียก onAutoOpened */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  return (
    <>
      <button
        type="button"
        data-detail-insert
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title={lang === "en" ? "Add material / pockets / highlights / size / what fits to the description, step by step" : "เลือกรายละเอียดสำเร็จรูป / วัสดุ / จำนวนช่อง / ขนาด / ใส่อะไรได้ แล้วแทรกลงคำอธิบายตรงตำแหน่งที่เลือก (ทำทีละขั้นได้)"}
        className="ml-1.5 inline-flex items-center rounded-full border border-orange-300 px-2 py-[1px] align-middle text-[10.5px] font-medium text-orange-600 hover:bg-orange-50"
      >
        {lang === "en" ? "＋ Insert" : "＋ แทรก"}
      </button>
      {open && (
        <DetailInsertModal
          thText={thText}
          enText={enText}
          hasEn={hasEn}
          saveLabel={saveLabel}
          values={values ?? {}}
          writable={writable ?? []}
          onApply={onApply}
          onClose={() => setOpen(false)}
          copyFrom={copyFromApi && fieldKey ? { api: copyFromApi, fieldKey, enFieldKey: enFieldKey ?? null, currentId: currentId ?? null } : null}
          aiParentId={aiParentId ?? null}
          onApplyNext={onApplyNext}
        />
      )}
    </>
  );
}

function DetailInsertModal({
  thText,
  enText,
  hasEn,
  saveLabel,
  values,
  writable,
  onApply,
  onClose,
  copyFrom,
  aiParentId,
  onApplyNext,
}: {
  thText: string;
  enText: string;
  hasEn: boolean;
  saveLabel?: string;
  values: Record<string, unknown>;
  writable: string[];
  onApply: (next: DetailInsertResult) => Promise<boolean> | boolean;
  onClose: () => void;
  copyFrom?: CopyFromCfg | null;
  aiParentId?: string | null;
  onApplyNext?: () => void;
}) {
  const toast = useToast();
  // 🌐 ภาษาหน้าจอของป๊อป — เริ่มตามภาษาของบัญชี · สลับในป๊อปได้ (ไม่เปลี่ยนภาษาทั้งระบบ · ไม่ต้องรีโหลด)
  const { lang: appLang } = useLang();
  const [uiLang, setUiLang] = useState<"th" | "en">(appLang === "en" ? "en" : "th");
  const isEn = uiLang === "en";
  const t = (th: string, enText: string) => (isEn ? enText : th);
  /** ชื่อรายการตามภาษาหน้าจอ (อังกฤษว่าง = ไทย) */
  const nm = (x: { name: string; name_en?: string | null }) => (isEn && x.name_en?.trim() ? x.name_en : x.name);
  const { data: snipRows, loading: snipLoading, revalidate: reloadSnips, mutate: mutateSnips } = useTickCatalog(SNIP);
  const { data: matRows, loading: matLoading, revalidate: reloadMats, mutate: mutateMats } = useTickCatalog(MAT);
  const { data: fitRows, loading: fitLoading, revalidate: reloadFits, mutate: mutateFits } = useTickCatalog(FIT);
  const { data: tplData, revalidate: reloadTpl } = useInsertTemplates();
  const { data: catRows } = useCategories();
  const baseTpl = tplData ?? DEFAULT_INSERT_TEMPLATES;
  const snips = (snipRows ?? []) as unknown as SnippetItem[];
  const mats = (matRows ?? []) as unknown as MaterialRow[];
  // ตุ๊กตา/ฟิกเกอร์ = ระบบคำนวณจากช่องใส่ของเอง (ไม่ติ๊ก — เหมือน FIT_CFG)
  const allFits = ((fitRows ?? []) as FitRow[]).filter((x) => x.kind !== "doll");
  const allPhrase = snips.filter(isPhrase);
  // 🌿 Lifestyle: สไตล์ (kind style) + ข้อความของแต่ละสไตล์ (kind lifestyle · parent_id)
  const styles = snips.filter(isStyle);
  const lifeItems = snips.filter(isLifestyle) as (SnippetItem & { parent_id?: string | null })[];
  const allSlot = snips.filter(isSlot);

  // 🗂 ชุดรายการตามประเภทสินค้า (⚙️ › ชุดตามประเภท) — เลือกให้เองจากหมวดของสินค้า · สลับได้ในป๊อป
  const categories = useMemo(() => catRows ?? [], [catRows]);
  const parentOf = useMemo(() => new Map(categories.map((c) => [c.id, c.parent_id ?? null])), [categories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const productCat = typeof values.category_id === "string" ? values.category_id : null;
  const autoProfile = pickProfile(baseTpl.profiles, productCat, parentOf);
  const [profileSel, setProfileSel] = useState<string | null>(null); // null = อัตโนมัติ · "__all" = ไม่กรอง
  const profile: InsertProfile | null = profileSel === null ? autoProfile : profileSel === "__all" ? null : baseTpl.profiles.find((p) => p.id === profileSel) ?? null;
  const phraseItems = allPhrase.filter((x) => profileAllows(profile, "phrase", x.id));
  // 🔢 ช่องแบบใหม่ที่ "ใช้ครั้งนี้" (ไม่เก็บเข้าคลังกลาง) — ต่อท้ายรายการช่อง
  const [tmpSlots, setTmpSlots] = useState<SnippetItem[]>([]);
  const slotItems = [...allSlot.filter((x) => profileAllows(profile, "slot", x.id)), ...tmpSlots];
  const visMats = mats.filter((x) => profileAllows(profile, "material", x.id));
  const fitItems = allFits.filter((x) => profileAllows(profile, "fit", x.id));

  const numFields = NUM_FIELDS.filter((f) => writable.includes(f.field) && (!profile?.sizeFields || profile.sizeFields.includes(f.k)));
  const has = (k: NumK) => numFields.some((f) => f.k === k);
  const canFit = writable.includes("fits");
  const canAiPerm = usePermission("ai.caption");
  // ใครเห็นแท็บ AI = ถามหลังบ้าน (รายชื่อ "ใครใช้ได้" ในศูนย์ AI ก่อน · ไม่ได้ตั้ง = สิทธิ์ ai.caption) — ถามครั้งเดียวต่อการเปิดป๊อป
  //   ระหว่างรอคำตอบใช้สิทธิ์ ai.caption เดาไปก่อน (คนที่มีสิทธิ์ไม่ต้องรอ · คนที่อยู่ในรายชื่อแต่ไม่มีสิทธิ์ เห็นเมื่อคำตอบมา)
  const wantAi = !!aiParentId;
  const [aiAllowed, setAiAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!wantAi) return;
    let off = false;
    apiFetch("/api/ai/desc-highlights?check=1").then((r) => r.json()).then((j) => { if (!off) setAiAllowed(j?.data?.allowed !== false); }).catch(() => { /* ถามไม่ได้ = ให้หลังบ้านตัดสินตอนกด */ });
    return () => { off = true; };
  }, [wantAi]);
  const canAi = wantAi && (aiAllowed ?? canAiPerm);
  const tabs = TABS.filter((t) => (t.key === "ai" ? canAi : (t.key === "size" ? numFields.length > 0 : t.key === "fit" ? canFit : true) && (!profile?.tabs || profile.tabs.includes(t.key))));

  const lines = useMemo(() => splitLines(thText), [thText]);
  const enLines = useMemo(() => splitLines(enText), [enText]);
  // 🪜 โหมดทีละขั้น (ค่าเริ่ม) / แบบแท็บ — จำต่อคน · ขั้นที่ใช้ได้ตามแท็บที่ป๊อปเปิดให้
  const modePref = useViewPref<InsertMode>("detail_insert_mode", INSERT_MODES, "steps");
  const stepMode = modePref.view === "steps";
  const steps = availableSteps(tabs.map((x) => x.key));
  const [stepSel, setStepSel] = useState<InsertStep>("material");
  const step: InsertStep = steps.includes(stepSel) ? stepSel : steps[0];
  const [skipped, setSkipped] = useState<InsertStep[]>([]);
  const [tab, setTab] = useState<Tab>("phrase");
  const [q, setQ] = useState("");
  const [phraseIds, setPhraseIds] = useState<string[]>([]);
  // 🌿 Lifestyle: สไตล์ที่เปิดดู · ข้อความที่ติ๊ก (ลำดับกด · ข้ามสไตล์ได้) · ข้อความพิมพ์เอง
  const [styleId, setStyleId] = useState<string | null>(null);
  const [lifeIds, setLifeIds] = useState<string[]>([]);
  const [lifeTh, setLifeTh] = useState("");
  const [lifeEn, setLifeEn] = useState("");
  const curStyle = styles.find((x) => x.id === styleId) ?? styles[0] ?? null;
  const styleItems = curStyle ? lifeItems.filter((x) => x.parent_id === curStyle.id) : [];
  // 📝 ข้อความหลายแบบ: ชื่อแบบที่เลือกต่อข้อความ (ว่าง = แบบแรก) — เลือกแบบแล้วติ๊กข้อนั้นให้เอง
  const [phrasePick, setPhrasePick] = useState<Record<string, string>>({});
  const choosePhrase = (id: string, label: string) => {
    setPhrasePick((p) => ({ ...p, [id]: label }));
    setPhraseIds((p) => (p.includes(id) ? p : [...p, id]));
  };
  const [matIds, setMatIds] = useState<string[]>([]);
  const [slotN, setSlotN] = useState<Record<string, string>>({});
  const [at, setAt] = useState(lines.length);
  const [withEn, setWithEn] = useState(hasEn);   // ค่าเริ่ม = ติ๊ก (เจ้าของ 2026-10-19)
  const [view, setView] = useState<"th" | "en">(() => (uiLang === "en" && hasEn ? "en" : "th"));
  const [hideOld, setHideOld] = useState(readHide);
  const fitSize = useViewPref<FitSize>("detail_insert_fit_size", FIT_SIZES, "m");
  // 🔤 รายการ: ซ่อนชื่ออังกฤษเป็นค่าเริ่ม (เจ้าของ 2026-10-19 "ดูรก") · กด EN สลับดู — จำต่อคน
  const enPref = useViewPref<"hide" | "show">("detail_insert_show_en", ["hide", "show"] as const, "hide");
  const showEn = enPref.view === "show";
  // ⧉ บรรทัดที่คัดลอกจากรุ่นอื่น (ใส่ก่อนบรรทัดอื่น · ลากย้ายในตัวอย่างได้)
  const [copied, setCopied] = useState<{ th: string; en: string | null }[]>([]);
  const [copyOpen, setCopyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ kind: CatalogKind; item: Record<string, unknown> | null } | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [matOpen, setMatOpen] = useState<string | null>(null);
  // ชื่ออังกฤษในวงเล็บ — เปิด/ปิดเฉพาะรอบนี้ (ไม่แตะ = ตามรูปแบบกลาง)
  const [enBr, setEnBr] = useState<Partial<Record<BracketKind, boolean>>>({});
  const tpl: InsertTemplates = useMemo(
    () => ({ ...baseTpl, enInBrackets: { phrase: enBr.phrase ?? baseTpl.enInBrackets.phrase, material: enBr.material ?? baseTpl.enInBrackets.material, slot: enBr.slot ?? baseTpl.enInBrackets.slot, fit: enBr.fit ?? baseTpl.enInBrackets.fit } }),
    [baseTpl, enBr]
  );
  // แก้บรรทัดใหม่เองก่อนแทรก (จับคู่ด้วยข้อความเดิม — เลือกรายการเปลี่ยน = บรรทัดใหม่ ไม่ใช้ที่แก้ไว้)
  const [edits, setEdits] = useState<{ th: Record<string, string>; en: Record<string, string> }>({ th: {}, en: {} });
  const [editing, setEditing] = useState<string | null>(null);

  // 📏 ตัวเลขของสินค้า — เปิดแท็บ = ตั้งใจใส่บรรทัด · บรรทัดที่คำอธิบายมีอยู่แล้ว เริ่มแบบไม่ติ๊ก (กันซ้ำ)
  const numOrig = useMemo(() => Object.fromEntries(NUM_FIELDS.map((f) => [f.k, numStr(values[f.field])])) as Record<NumK, string>, [values]);
  const [num, setNum] = useState<Record<NumK, string>>(numOrig);
  const [sizeSeen, setSizeSeen] = useState(false);
  const useInit = () => Object.fromEntries((Object.keys(SIZE_LINE_KEYS) as SizeLine[]).map((k) => [k, !alreadyMentions(thText, k)])) as Record<SizeLine, boolean>;
  const [use, setUse] = useState<Record<SizeLine, boolean>>(useInit);
  // 🎒 ใส่อะไรได้ — เริ่มจากที่สินค้าเลือกไว้
  const fitOrig = useMemo(() => parseFits(values.fits), [values.fits]);
  const [fits, setFits] = useState<FitPick[]>(fitOrig);
  const [fitSeen, setFitSeen] = useState(false);
  const [useFit, setUseFit] = useState(() => !alreadyMentions(thText, "fit"));
  // 🧵 วัตถุดิบแบบไม่รก (โหมดทีละขั้น): ดูทั้งหมด = รายการเต็มแบบเดิม
  const [matAll, setMatAll] = useState(false);
  // ✨ AI ดูรูป (state อยู่ที่นี่ — ล้างหน้า/ข้ามขั้นได้)
  const [aiState, setAiState] = useState<AiState>(EMPTY_AI);
  // 📋 เติมจากข้อมูล (ขั้นตรวจ) — สี / รับประกัน / วิธีดูแล · แทนที่ Description เดิมทั้งหมด
  const [info, setInfo] = useState<{ color: boolean; warranty: boolean; care: boolean }>({ color: false, warranty: false, care: false });
  const [facts, setFacts] = useState<{ colors: ColorEntry[]; warranty: string | null } | null>(null);
  const [dropOld, setDropOld] = useState(false);
  // 🔢 ขนาดช่อง (📏) ต่อช่อง + เพิ่มช่องแบบใหม่
  const [slotDims, setSlotDims] = useState<Record<string, { w: string; h: string; d: string }>>({});
  const [newSlot, setNewSlot] = useState<{ name: string; side: string; save: boolean }>({ name: "", side: "inside", save: true });
  const [slotErr, setSlotErr] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);

  const openTab = (k: Tab) => {
    setTab(k);
    setQ("");
    if (k === "size") setSizeSeen(true);
    if (k === "fit") setFitSeen(true);
  };
  /** 🪜 ไปขั้น s — เปิดแท็บของขั้นนั้น (จุดเด่น: อยู่ Lifestyle อยู่แล้ว = คงไว้) */
  const goStep = (s: InsertStep) => {
    setStepSel(s);
    const ks = STEP_TABS[s].filter((k) => tabs.some((x) => x.key === k));
    if (ks.length && !ks.includes(tab)) openTab(ks[0]);
  };
  const nextStep = () => {
    setSkipped((p) => p.filter((x) => x !== step));
    goStep(stepAfter(steps, step, 1));
  };
  /** ข้าม = ไม่ใส่เรื่องนี้ (ล้างที่เลือกในขั้นนี้ · ขนาด/ใส่อะไรได้ คืนค่าเดิมของสินค้า) */
  const skipStep = () => {
    STEP_TABS[step].forEach((k) => clearTab(k));
    if (step === "slot") setSlotDims({});
    setSkipped((p) => (p.includes(step) ? p : [...p, step]));
    goStep(stepAfter(steps, step, 1));
  };
  const switchMode = (m: InsertMode) => {
    modePref.setView(m);
    void modePref.saveDefault(m);
    if (m === "steps") goStep(steps.find((s) => STEP_TABS[s].includes(tab)) ?? steps[0]);
  };
  // เปิดป๊อปในโหมดทีละขั้น → เริ่มที่ขั้นแรก (แท็บเริ่มต้นเดิม = ข้อความ)
  const stepInit = useRef(false);
  useEffect(() => {
    if (!stepMode || stepInit.current || !tabs.length) return;
    stepInit.current = true;
    goStep(steps[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepMode, tabs.length]);
  // 📋 ข้อมูลจริงสำหรับ "เติมจากข้อมูล" (สี/รับประกัน) — โหลดครั้งเดียวตอนเปิดป๊อป (ระเบียน Parent SKU เท่านั้น)
  const factsId = aiParentId ?? copyFrom?.currentId ?? null;
  useEffect(() => {
    if (!factsId) return;
    let off = false;
    apiFetch(`/api/parent-skus/${encodeURIComponent(factsId)}/desc-facts`).then((r) => r.json()).then((j) => { if (!off && j.data) setFacts(j.data); }).catch(() => { /* ไม่มีข้อมูล = ไม่โชว์ตัวเลือก */ });
    return () => { off = true; };
  }, [factsId]);
  // ชุดที่เลือกไม่มีแท็บที่เปิดอยู่ → ย้ายไปแท็บแรกของชุด
  const tabKeys = tabs.map((t) => t.key).join(",");
  useEffect(() => {
    const keys = tabKeys.split(",").filter(Boolean) as Tab[];
    if (keys.length && !keys.includes(tab)) setTab(keys[0]);
  }, [tabKeys, tab]);

  // 📐 ตรวจซ้ำว่าของใส่ได้จริงไหม (ของกลาง lib/fit-check เหมือนระบบเทียบขนาด) — เทียบช่องด้านในที่วัดไว้ · ยังไม่วัด = เทียบขนาดนอก
  const compsSaved = useMemo(() => parseCompartments(values.compartments), [values.compartments]);
  //    📏 ขนาดช่องที่ใส่ในขั้น "ช่อง" (ครบ 3 ด้าน) → บันทึกเป็น "ช่องใส่ของ" ของสินค้า (ใช้เช็กใส่อะไรได้ทั้งป๊อปนี้และบนเว็บ)
  //       ค่าเริ่ม: สินค้าวัดช่องไว้แล้ว = บันทึก (อัปเดตช่องชื่อเดียวกัน) · ยังไม่เคยวัด = ไม่บันทึก จนกว่าจะติ๊กเอง
  //       (กันกรณีวัดแค่ช่องใสช่องเดียว แล้วระบบ/เว็บเข้าใจว่ากระเป๋ามีแค่ช่องเล็กนั้น)
  const canComp = writable.includes("compartments");
  const hadComps = !!compsSaved?.length;
  const [saveComps, setSaveComps] = useState(hadComps);
  const dimEntries = slotItems.flatMap((it) => {
    const d = slotDims[it.id];
    return d && (Math.floor(Number(slotN[it.id])) || 0) > 0 ? [{ name: it.name, name_en: it.name_en ?? null, w: d.w, h: d.h, d: d.d, window: isWindowName(it.name, it.name_en) }] : [];
  });
  const fullDims = dimEntries.filter((d) => Number(d.w) > 0 && Number(d.h) > 0 && Number(d.d) > 0).length;
  const compsNext = canComp && saveComps ? upsertCompartments(compsSaved, dimEntries) : null;
  const comps = compsNext ?? compsSaved;
  const outer: Compartment | null = Number(num.w) > 0 && Number(num.h) > 0 && Number(num.d) > 0 ? { id: "outer", name: t("ขนาดนอก", "Outer size"), w: Number(num.w), h: Number(num.h), d: Number(num.d) } : null;
  //    ยังไม่เคยวัดช่อง แต่เพิ่งใส่บางช่อง → เทียบขนาดนอกด้วย (ช่องหลักยังไม่ได้วัด)
  const boxes: Compartment[] = comps && comps.length ? [...comps, ...(!hadComps && outer ? [outer] : [])] : outer ? [outer] : [];
  const boxBasis = comps && comps.length ? "inner" : outer ? "outer" : "none";
  //    เลือกขนาด (เช่น สมาร์ทโฟน ถึง 6.7 นิ้ว) → ใช้ขนาดของตัวเลือกนั้น (size_dims) · ไม่เลือก/ไม่มี = ขนาดหลักของรายการ
  const fitCheck = (it: FitRow, size?: string | null) => {
    const sd = sizeDimsFor(it.size_dims, size);
    const t = fitTargetOf((sd ? { ...it, width_cm: sd.w, height_cm: sd.h, depth_cm: sd.d } : it) as Parameters<typeof fitTargetOf>[0]);
    if (!t) return { kind: "nosize" as const, t: null };
    if (!boxes.length) return { kind: "nobag" as const, t };
    const r = bestFit(t, boxes);
    return r ? { kind: r.status, t } : { kind: "no" as const, t };
  };
  const badFits = fits.flatMap((p) => {
    const it = fitItems.find((x) => x.id === p.id);
    return it && fitCheck(it, p.size).kind === "no" ? [p.size ? `${it.name} ${p.size}` : it.name] : [];
  });

  // บรรทัดเรียงตาม "ลำดับที่กด" (เจ้าของ 2026-10-19: กดอันไหนก่อน ขึ้นอันนั้นก่อน ไม่ต้องเรียงตามรายการ)
  //   ข้อความ = บรรทัดละข้อตามลำดับกด · วัสดุ/ใส่อะไรได้ = ชื่อในบรรทัดเรียงตามลำดับกด (ใส่อะไรได้: ของที่สินค้ามีอยู่แล้วมาก่อน)
  //   ช่อง ยังเรียง ด้านนอก → ด้านใน → ไม่ระบุ (เจ้าของขอไว้ c02cb342) · ลาก ⠿ ในรายการ = จัดลำดับการโชว์ในรายการเท่านั้น
  const byClick = <T extends { id: string }>(ids: string[], items: T[]) => ids.flatMap((id) => items.filter((x) => x.id === id));
  const fitEntries = fits.flatMap((p) => {
    const it = fitItems.find((x) => x.id === p.id);
    return it ? [{ th: it.name, en: it.name_en, size: p.size }] : [];
  });
  // 📋 เติมจากข้อมูล (ขั้นตรวจ) — สีจาก SKU ลูก · รับประกัน · วิธีดูแลของวัสดุที่เลือก (ฟรี ไม่ใช้ AI · lib/detail-snippets)
  const pickedMats = byClick(matIds, visMats);
  const infoColor = facts ? colorLine(facts.colors, tpl) : null;
  const infoWarranty = facts?.warranty ? warrantyLine(facts.warranty) : null;
  const infoCare = careLines(pickedMats);
  const infoLines = [
    ...(info.color && infoColor ? [infoColor] : []),
    ...(info.warranty && infoWarranty ? [infoWarranty] : []),
    ...(info.care ? infoCare : []),
  ];
  const sel = {
    phrases: byClick(phraseIds, phraseItems).map((x) => resolvePhrase(x, phrasePick[x.id])),
    materials: byClick(matIds, visMats),
    slots: slotItems.map((item) => ({ item, n: Math.floor(Number(slotN[item.id])) || 0, dims: (slotDims[item.id] ?? null) as SlotDims | null })).filter((p) => p.n > 0),
    size: sizeSeen && use.size && has("w") ? { w: num.w, h: num.h, d: num.d } : null,
    weight: sizeSeen && use.weight && has("g") ? num.g : null,
    handle: sizeSeen && use.handle && has("hd") ? num.hd : null,
    strap: sizeSeen && use.strap && (has("s1") || has("s2")) ? { min: num.s1, max: num.s2 } : null,
    fits: fitSeen && useFit ? fitEntries : null,
    copied,
    lifestyle: [...byClick(lifeIds, lifeItems).map((x) => ({ th: x.name, en: x.name_en ?? null })), ...freeLines(lifeTh, lifeEn)],
    ai: aiPicked(aiState),
    info: infoLines,
  };
  const out = composeLines(sel, tpl);
  /** บรรทัดที่เลือกจากขั้นอื่น (ส่งให้ AI เลี่ยงเรื่องซ้ำ) */
  const chosenTh = composeLines({ ...sel, ai: null, copied: null }, tpl).th.map((l) => l.replace(/^- /, ""));
  // ⠿ ลำดับทุกบรรทัดในตัวอย่าง (บรรทัดเดิม + บรรทัดใหม่ · lib/detail-snippets arrangeRows)
  //   custom = null → ยังไม่เคยลาก: บรรทัดใหม่เป็นก้อนเดียวที่ตำแหน่ง at (เหมือนเดิม) · ลาก/↑↓ แล้ว = จำลำดับทั้งหมด
  const [custom, setCustom] = useState<RowKey[] | null>(null);
  const pairByKey = new Map(out.pairs.map((p) => [newRowKey(p.th), p]));
  const rows = arrangeRows(lines.length, out.pairs.map((p) => newRowKey(p.th)), at, custom);
  const pairs = rows.flatMap((k) => (isNewRow(k) && pairByKey.has(k) ? [pairByKey.get(k)!] : []));
  const thOf = (k: RowKey) => {
    const p = pairByKey.get(k);
    return p ? edits.th[p.th] ?? p.th : null;
  };
  const enOf = (k: RowKey) => {
    const p = pairByKey.get(k);
    return p?.en ? edits.en[p.en] ?? p.en : null;
  };
  const finalTh = pairs.map((p) => edits.th[p.th] ?? p.th).filter((l) => l.trim());
  const finalEn = pairs.flatMap((p) => (p.en ? [edits.en[p.en] ?? p.en] : [])).filter((l) => l.trim());
  const reordered = oldRowsMoved(rows);
  const enAligned = enLines.length === lines.length;
  // ตำแหน่งก้อนบรรทัดใหม่ (ไม่มีบรรทัดใหม่ = ตำแหน่งที่จะแทรก · กระจายอยู่หลายที่ = null)
  const blockPos = pairs.length ? newBlockAt(rows) : at;
  /** ย้ายบรรทัดใหม่ทั้งก้อนไปหลังบรรทัดเดิม oldBefore บรรทัด (บนสุด/ท้ายสุด/คลิกช่องระหว่างบรรทัด) */
  const placeAt = (oldBefore: number) => {
    setAt(oldBefore);
    if (custom) setCustom(moveNewBlock(rows, oldBefore));
  };
  const dragRow = (from: number, to: number) => setCustom(moveItem(rows, from, to));
  // ↑↓ บนบรรทัดใหม่: โชว์บรรทัดเดิม = ขยับทีละแถว · ซ่อนบรรทัดเดิม = สลับกับบรรทัดใหม่ตัวข้าง ๆ (เหมือนเดิม)
  const newIdx = rows.map((r, n) => (isNewRow(r) ? n : -1)).filter((n) => n >= 0);
  const canMove = (i: number, dir: -1 | 1) => (hideOld ? newIdx[newIdx.indexOf(i) + dir] !== undefined : i + dir >= 0 && i + dir < rows.length);
  const movePair = (i: number, dir: -1 | 1) => {
    if (!canMove(i, dir)) return;
    if (!hideOld) {
      setCustom(moveItem(rows, i, i + dir));
      return;
    }
    const j = newIdx[newIdx.indexOf(i) + dir];
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setCustom(next);
  };

  // 🔄 ช่องของสินค้าที่จะบันทึกกลับ (เทียบค่าเดิม)
  const fields: Record<string, unknown> = {};
  const changes: string[] = [];
  for (const f of numFields) {
    if (num[f.k] === numOrig[f.k]) continue;
    fields[f.field] = num[f.k] === "" ? null : Number(num[f.k]);
    changes.push(`${t(f.label, f.en)} ${numOrig[f.k] || t("ว่าง", "empty")}→${num[f.k] || t("ว่าง", "empty")}`);
  }
  if (canFit && JSON.stringify(fits) !== JSON.stringify(fitOrig)) {
    fields.fits = fits.length ? fits : null;
    changes.push(t(`ใส่อะไรได้ (${fits.length} รายการ)`, `What fits (${fits.length} items)`));
  }
  if (compsNext) {
    fields.compartments = compsNext;
    changes.push(t(`ขนาดช่อง (${dimEntries.length} ช่อง)`, `Pocket sizes (${dimEntries.length})`));
  }
  const picked = finalTh.length > 0;
  const dirty = picked || reordered || changes.length > 0 || (dropOld && lines.length > 0);
  const enAppend = withEn && enLines.length > 0 && enLines.length !== lines.length;

  const needle = q.trim().toLowerCase();
  const match = (x: { name: string; name_en?: string | null }) => !needle || `${x.name} ${x.name_en ?? ""}`.toLowerCase().includes(needle);
  const matchPhrase = (x: SnippetItem) => !needle || variantSearchText(x).toLowerCase().includes(needle);

  // ล้าง: แท็บรายการ = เอาที่เลือกออก · ขนาด/ใส่อะไรได้ = คืนค่าเดิมของสินค้า + ไม่ใส่บรรทัด (ไม่ลบข้อมูลจริง)
  const clearTab = (t: Tab) => {
    if (t === "phrase") { setPhraseIds([]); setPhrasePick({}); }
    if (t === "lifestyle") { setLifeIds([]); setLifeTh(""); setLifeEn(""); }
    if (t === "ai") setAiState((p) => ({ ...p, items: p.items.map((x) => ({ ...x, on: false })) }));
    if (t === "material") setMatIds([]);
    if (t === "slot") { setSlotN({}); setSlotDims({}); }
    if (t === "size") {
      setNum(numOrig);
      setUse({ size: false, weight: false, handle: false, strap: false });
    }
    if (t === "fit") {
      setFits(fitOrig);
      setUseFit(false);
    }
  };
  const clearAll = () => {
    (["phrase", "material", "slot", "size", "fit", "lifestyle", "ai"] as Tab[]).forEach(clearTab);
    setEdits({ th: {}, en: {} });
    setCustom(null);
    setCopied([]);
  };
  const tabCount = (t: Tab) =>
    t === "ai" ? sel.ai.length : t === "lifestyle" ? sel.lifestyle.length : t === "phrase" ? sel.phrases.length : t === "material" ? sel.materials.length : t === "slot" ? sel.slots.length : t === "size" ? [sel.size, sel.weight, sel.handle, sel.strap].filter((x) => x != null && x !== "").length : sel.fits?.length ?? 0;
  const tabDirty = (t: Tab) => tabCount(t) > 0 || (t === "size" && numFields.some((f) => num[f.k] !== numOrig[f.k])) || (t === "fit" && JSON.stringify(fits) !== JSON.stringify(fitOrig));

  // 📏 ขนาดช่อง: เปิด = เติมขนาดเดิมของช่องชื่อเดียวกัน (ถ้าวัดไว้) · ปิด = ไม่ใส่ขนาด
  const toggleDims = (it: SnippetItem) =>
    setSlotDims((p) => {
      if (p[it.id]) {
        const next = { ...p };
        delete next[it.id];
        return next;
      }
      const c = findCompartment(compsSaved, it.name);
      return { ...p, [it.id]: { w: c ? String(c.w) : "", h: c ? String(c.h) : "", d: c ? String(c.d) : "" } };
    });
  /** ＋ ช่องแบบใหม่: พิมพ์ไทยหรืออังกฤษ → แปลอีกภาษาให้ · เก็บเข้าคลังกลาง (ทุกสินค้าเลือกได้ · audit ที่ API กลาง) หรือใช้ครั้งนี้ */
  const addNewSlot = async () => {
    const raw = newSlot.name.replace(/\s+/g, " ").trim();
    if (!raw) { setSlotErr(t("พิมพ์ชื่อช่องก่อน", "Type a pocket name first")); return; }
    if (slotItems.some((x) => x.name === raw || x.name_en === raw)) { setSlotErr(t("มีช่องชื่อนี้อยู่แล้ว — ใส่จำนวนที่รายการด้านบน", "This pocket already exists — set its count above")); return; }
    setSlotErr("");
    setAddingSlot(true);
    try {
      const thai = /[฀-๿]/.test(raw);
      const other = (await translateContent([raw], thai ? "en" : "th", { place: "product" }).catch(() => [""]))[0]?.trim() ?? "";
      const name = thai ? raw : other || raw;
      const nameEn = thai ? other || null : raw;
      const side = newSlot.side || null;
      let id = `tmp:${Date.now()}`;
      if (newSlot.save) {
        const r = await apiFetch(`/api/master-v2/${SNIP}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, name_en: nameEn, kind: "slot", slot_side: side, sort_order: 500, is_active: true }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error || !j.data?.id) throw new Error(j.error || (r.status === 403 ? t("ไม่มีสิทธิ์เพิ่มรายการกลาง — ติ๊ก \"ใช้ครั้งนี้\" แทน", "No permission to add to the shared list — untick \"Save\" to use it once") : t("เพิ่มช่องไม่สำเร็จ", "Couldn't add the pocket")));
        id = String(j.data.id);
        await reloadSnips(true);
        toast.success(t(`เพิ่ม "${name}" เข้าคลังกลางแล้ว (ใช้ได้ทุกรุ่น)`, `Added "${nameEn || name}" to the shared list`));
      } else {
        setTmpSlots((p) => [...p, { id, name, name_en: nameEn, kind: "slot", slot_side: side }]);
      }
      setSlotN((p) => ({ ...p, [id]: "1" }));
      setNewSlot((p) => ({ ...p, name: "" }));
    } catch (e) {
      setSlotErr(e instanceof Error ? e.message : t("เพิ่มช่องไม่สำเร็จ", "Couldn't add the pocket"));
    } finally {
      setAddingSlot(false);
    }
  };

  /** 🌐 พิมพ์เอง (Lifestyle/อื่น ๆ): แปลช่องที่ว่างจากอีกช่อง บรรทัดต่อบรรทัด — คนที่พิมพ์อังกฤษได้ไทยให้ด้วย (กรอกทั้ง 2 ช่อง = แปลจากภาษาหน้าจอทับอีกช่อง) */
  const [lifeBusy, setLifeBusy] = useState(false);
  const translateFree = async () => {
    const hasTh = !!lifeTh.trim(), hasEnTxt = !!lifeEn.trim();
    const fromTh = hasTh && !hasEnTxt ? true : !hasTh && hasEnTxt ? false : !isEn;
    const src = (fromTh ? lifeTh : lifeEn).split("\n").map((x) => x.trim()).filter(Boolean);
    if (!src.length) return;
    setLifeBusy(true);
    try {
      const got = await translateContent(src, fromTh ? "en" : "th", { place: "product" });
      const text = got.map((x, i) => x.trim() || src[i]).join("\n");
      if (fromTh) { setLifeTh(src.join("\n")); setLifeEn(text); } else { setLifeEn(src.join("\n")); setLifeTh(text); }
    } catch {
      toast.error(t("แปลไม่สำเร็จ — ลองใหม่อีกครั้ง", "Translation failed — try again"));
    } finally {
      setLifeBusy(false);
    }
  };

  const apply = async (next = false) => {
    if (!dirty) {
      toast.warning(t("ยังไม่ได้เลือกรายละเอียด", "Nothing picked yet"));
      return;
    }
    // ประกอบตามลำดับในตัวอย่าง (ไม่ได้ลาก = เหมือนแทรกก้อนที่ตำแหน่งเดิมทุกอย่าง) · อังกฤษ: ใส่บรรทัดใหม่ หรือบรรทัดเดิมถูกสลับ (บรรทัดเท่าไทย = สลับตาม)
    // 🔁 แทนที่ของเดิมทั้งหมด (เช่น AI เตือนว่า Description เดิมไม่ตรงรูป) = เหลือเฉพาะบรรทัดใหม่ · ย้อนได้จากประวัติเวอร์ชัน
    const th = dropOld ? finalTh.join("\n") : picked || reordered ? arrangeTh(rows, lines, thOf).join("\n") : thText;
    const addEn = picked && withEn && hasEn && finalEn.length > 0;
    const en = dropOld ? (hasEn ? (withEn ? finalEn.join("\n") : "") : undefined)
      : addEn || (hasEn && reordered && enAligned) ? arrangeEn(rows, lines, enLines, addEn ? enOf : () => null).join("\n") : undefined;
    setSaving(true);
    try {
      const ok = await onApply({ th, en, ...(changes.length ? { fields } : {}) });
      if (ok !== false) {
        onClose();
        if (next) onApplyNext?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadOf = (k: CatalogKind) => (k === "material" ? reloadMats(true) : k === "fit" ? reloadFits(true) : reloadSnips(true));
  const onEdited = async (k: CatalogKind, id: string, created: boolean) => {
    await reloadOf(k);
    if (!created) return;
    if (k === "phrase") setPhraseIds((p) => [...p, id]);
    if (k === "material") setMatIds((p) => [...p, id]);
    if (k === "fit") setFits((p) => [...p, { id }]);
    if (k === "lifestyle") setLifeIds((p) => [...p, id]);
    if (k === "style") setStyleId(id);
  };
  const onDeleted = async (k: CatalogKind, id: string) => {
    await reloadOf(k);
    setPhraseIds((p) => p.filter((x) => x !== id));
    setMatIds((p) => p.filter((x) => x !== id));
    setSlotN((p) => ({ ...p, [id]: "" }));
    setFits((p) => p.filter((x) => x.id !== id));
    setLifeIds((p) => p.filter((x) => x !== id));
  };
  // 📋 prompt ถาม ChatGPT (ชื่อสินค้า + สไตล์ + ตัวอย่างข้อความ + คำอธิบายตอนนี้)
  const copyPrompt = async () => {
    const product = [values.name_th, values.code].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).join(" · ");
    const text = lifestylePrompt({ product: product || null, style: curStyle ? { name: curStyle.name, name_en: curStyle.name_en } : null, examples: styleItems.map((x) => x.name), description: thText });
    try {
      await navigator.clipboard.writeText(text);
      toast.success("คัดลอก prompt แล้ว — วางใน ChatGPT ได้เลย");
    } catch {
      window.prompt("คัดลอกข้อความนี้ไปวางใน ChatGPT", text);
    }
  };

  // ⠿ ลากจัดลำดับรายการกลาง (ทุกสินค้าใช้ลำดับเดียวกัน · ลำดับการโชว์ในรายการ — บรรทัดที่แทรกเรียงตามลำดับที่กด) — เขียน sort_order เฉพาะแถวที่เปลี่ยน
  const reorder = async (k: CatalogKind, visible: { id: string }[], from: number, to: number) => {
    const full = (k === "material" ? mats : k === "fit" ? ((fitRows ?? []) as FitRow[]) : snips) as unknown as { id: string; sort_order?: number | null }[];
    const vis = new Set(visible.map((x) => x.id));
    const moved = moveItem(visible, from, to);
    let n = 0;
    const next = full.map((x) => {
      if (!vis.has(x.id)) return x;
      const target = moved[n++];
      return full.find((y) => y.id === target.id) ?? x;
    });
    const withOrder = next.map((x, i) => ({ ...x, sort_order: (i + 1) * 10 }));
    const jobs = withOrder.filter((x, i) => next[i].sort_order !== x.sort_order);
    (k === "material" ? mutateMats : k === "fit" ? mutateFits : mutateSnips)(withOrder as never);
    try {
      await Promise.all(
        jobs.map(async (x) => {
          const j = await apiFetch(`/api/master-v2/${catalogOf(k)}/${x.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: x.sort_order }) }).then((r) => r.json());
          if (j.error) throw new Error(j.error);
        })
      );
    } catch {
      toast.error("บันทึกลำดับไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
    await reloadOf(k);
  };
  // ชุดรายการ: บันทึกจากป๊อป ✏️ (ติ๊ก "ใช้กับชุด")
  const saveProfiles = async (next: InsertProfile[]): Promise<boolean> => {
    try {
      const r = await apiFetch("/api/detail-insert/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: { ...baseTpl, profiles: next } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || (r.status === 403 ? "ไม่มีสิทธิ์แก้ชุดรายการ" : "บันทึกชุดไม่สำเร็จ"));
      await reloadTpl(true);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกชุดไม่สำเร็จ");
      return false;
    }
  };

  const loading = (snipLoading && !snipRows) || (matLoading && !matRows) || (fitLoading && !fitRows);
  const tabInfo = TABS.find((t) => t.key === tab)!;
  const bracketKind: BracketKind | null = tab === "phrase" ? "phrase" : tab === "material" ? "material" : tab === "slot" ? "slot" : tab === "fit" ? "fit" : null;
  const dupKind: LineKind | null = tab === "material" ? "material" : tab === "fit" ? "fit" : null;

  const editBtn = (kind: CatalogKind, item: Record<string, unknown>, cls = "") => (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditor({ kind, item }); }} title={t("แก้ / ลบ รายการนี้ (รายการกลาง)", "Edit / delete this item (shared list)")} aria-label={`${t("แก้", "Edit")} ${String(item.name)}`}
      className={`shrink-0 rounded px-1 text-[13px] text-slate-400 hover:bg-white hover:text-slate-700 ${cls}`}>✏️</button>
  );
  const addBtn = (kind: CatalogKind, label: string, labelEn: string) => (
    <button type="button" onClick={() => setEditor({ kind, item: null })} className="mt-1 text-xs text-orange-600 hover:underline">{t(`＋ เพิ่ม${label}ใหม่`, `＋ New ${labelEn}`)}</button>
  );
  const rowCls = (on: boolean) => `flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`;
  const dupNote = (kind: LineKind) =>
    alreadyMentions(thText, kind, baseTpl) ? <span className="text-[11px] text-amber-700">{t(`⚠️ คำอธิบายมีเรื่อง "${LINE_KIND_LABEL[kind]}" อยู่แล้ว — อาจซ้ำ`, `⚠️ The description already mentions this — it may repeat`)}</span> : null;
  /** ชื่อ 2 บรรทัดตามภาษาหน้าจอ — อังกฤษ: ชื่ออังกฤษเป็นหลัก ไม่โชว์ไทยซ้อน */
  const twoLines = (x: { name: string; name_en?: string | null }, on: boolean) => <NameTwoLines th={nm(x)} en={isEn ? x.name : x.name_en} on={on} showEn={isEn ? false : showEn} noEnText={t("ไม่มีอังกฤษ", "no English name")} />;
  // 🪜 โหมดทีละขั้น: วัตถุดิบแบบไม่รก · หน้าสรุปตอนตรวจ
  const compactMat = stepMode && tab === "material" && !matAll;
  const reviewing = stepMode && step === "review";
  const matHint = typeof values.materials === "string" ? values.materials.replace(/\s+/g, " ").trim() : "";
  const stepCount = (s: InsertStep) => STEP_TABS[s].reduce((n, k) => n + (tabs.some((x) => x.key === k) ? tabCount(k) : 0), 0);

  // ─── ตัวอย่าง: ไทย = ลาก ⠿ สลับได้ทุกบรรทัด · คลิกช่องระหว่างบรรทัด = ย้ายบรรทัดใหม่ทั้งก้อน · อังกฤษ = ดูอย่างเดียว (เรียงตามไทย) ───
  const { rowProps, handleProps, rowCls: dragCls } = useDragReorder(dragRow);
  const firstNew = rows.findIndex(isNewRow);
  const hereRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    hereRef.current?.scrollIntoView({ block: "nearest" });
  }, [firstNew, pairs.length, view, hideOld]);
  const setHide = (v: boolean) => {
    setHideOld(v);
    try {
      localStorage.setItem(HIDE_KEY, v ? "1" : "0");
    } catch {
      /* เบราว์เซอร์ไม่ให้จำ = ไม่เป็นไร */
    }
  };
  const commitEdit = (orig: string, value: string) => {
    const lang = view;
    setEdits((p) => {
      const m = { ...p[lang] };
      if (value.trim() === orig.trim()) delete m[orig];
      else m[orig] = value;
      return { ...p, [lang]: m };
    });
    setEditing(null);
  };
  const editInput = (key: string, orig: string, shown: string) => (
    <input key={key} autoFocus defaultValue={shown} aria-label="แก้บรรทัดนี้"
      onBlur={(e) => commitEdit(orig, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitEdit(orig, (e.target as HTMLInputElement).value); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); }
      }}
      className="my-0.5 h-7 w-full rounded border border-orange-300 bg-white px-1.5 text-[13px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-400" />
  );
  const editedMark = (orig: string, edited: boolean) =>
    edited ? (
      <button type="button" onClick={() => commitEdit(orig, orig)} title="คืนเป็นข้อความเดิม" className="shrink-0 px-1 text-[11px] text-slate-400 hover:text-slate-700">แก้แล้ว ↺</button>
    ) : (
      <span className="hidden shrink-0 px-1 text-[11px] text-orange-400 group-hover:inline">✎</span>
    );

  /** บรรทัดใหม่ (สีส้ม): ⠿ ลาก · คลิกแก้ · ↑↓ — i = ตำแหน่งในลำดับทั้งหมด */
  const newRowEl = (k: RowKey, i: number) => {
    const p = pairByKey.get(k);
    if (!p) return null;
    const orig = p.th;
    const shown = edits.th[orig] ?? orig;
    const ek = `th:${orig}`;
    return (
      <div key={k} {...rowProps(i)} ref={i === firstNew ? hereRef : undefined} data-insert-here={i === firstNew ? "" : undefined} data-insert-row="new"
        className={`group my-px flex items-start gap-0.5 rounded-md border border-dashed border-orange-300 bg-orange-50 px-0.5 ${dragCls(i)}`}>
        <DragHandle {...handleProps(i)} title="ลากเพื่อสลับบรรทัด" className="pt-1 text-[13px]" />
        {editing === ek ? (
          editInput(ek, orig, shown)
        ) : (
          <button type="button" onClick={() => setEditing(ek)} title="คลิกเพื่อแก้บรรทัดนี้ (เฉพาะรุ่นนี้)" data-insert-line
            className={`flex-1 rounded px-1 text-left hover:bg-white ${shown.trim() ? "text-orange-700" : "text-slate-400 line-through"}`}>
            {shown.trim() ? shown : orig}
          </button>
        )}
        <span className="flex shrink-0 items-center">
          <button type="button" onClick={() => movePair(i, -1)} disabled={!canMove(i, -1)} aria-label="ย้ายบรรทัดขึ้น" title="ย้ายขึ้น" data-insert-up
            className="rounded px-1 text-[12px] leading-5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20">↑</button>
          <button type="button" onClick={() => movePair(i, 1)} disabled={!canMove(i, 1)} aria-label="ย้ายบรรทัดลง" title="ย้ายลง" data-insert-down
            className="rounded px-1 text-[12px] leading-5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20">↓</button>
        </span>
        {editedMark(orig, edits.th[orig] !== undefined)}
      </div>
    );
  };
  /** บรรทัดเดิม: ⠿ ลากสลับได้ (บันทึกตอนกดแทรก) */
  const oldRowEl = (k: RowKey, i: number) => (
    <div key={k} {...rowProps(i)} data-insert-row="old" className={`flex items-start gap-0.5 rounded ${dragCls(i)}`}>
      <DragHandle {...handleProps(i)} title="ลากเพื่อสลับบรรทัด" className="pt-px text-[13px]" />
      <div className="flex-1 whitespace-pre-wrap px-1 text-slate-600">{lines[oldRowIndex(k)] || " "}</div>
    </div>
  );
  const gapEl = (oldBefore: number, key: string) => (
    <button key={key} type="button" onClick={() => placeAt(oldBefore)} title={pairs.length ? "ย้ายบรรทัดใหม่ทั้งหมดมาตรงนี้" : "แทรกตรงนี้"} data-insert-gap={oldBefore}
      className="group flex h-2.5 w-full items-center rounded hover:h-5 hover:bg-orange-50">
      <span className="hidden pl-5 text-[10.5px] text-orange-600 group-hover:inline">⤵ {pairs.length ? "ย้ายบรรทัดใหม่มาตรงนี้" : "แทรกตรงนี้"}</span>
    </button>
  );
  const emptyMark = (
    <div key="mark" ref={hereRef} data-insert-here className="my-0.5 rounded-md border border-dashed border-orange-300 bg-orange-50 px-2 py-1 text-[11.5px] text-orange-600">
      ⤵ บรรทัดใหม่จะอยู่ตรงนี้
    </div>
  );
  const hiddenRun = (n: number, i: number) => (
    <button key={`h${i}`} type="button" {...rowProps(i)} onClick={() => setHide(false)} title="กดเพื่อโชว์บรรทัดเดิม (ลากบรรทัดสีส้มมาวางตรงนี้ได้)"
      className={`my-0.5 w-full rounded px-2 py-0.5 text-left text-[11.5px] text-slate-400 hover:bg-slate-50 ${dragCls(i)}`}>
      ⋯ ซ่อน {n} บรรทัดเดิม
    </button>
  );

  // ไทย: วาดตามลำดับ rows · ซ่อนบรรทัดเดิม = รวบบรรทัดเดิมที่ติดกันเป็น "⋯ ซ่อน N" (ยังเป็นที่วางตอนลากได้)
  const thBody: React.ReactNode[] = [];
  {
    let oldSeen = 0;
    let runN = 0;
    let runAt = -1;
    const flush = () => {
      if (runN > 0) thBody.push(hiddenRun(runN, runAt));
      runN = 0;
    };
    rows.forEach((k, i) => {
      if (isNewRow(k)) {
        flush();
        thBody.push(newRowEl(k, i));
        return;
      }
      const markHere = !pairs.length && oldSeen === at;
      if (markHere) {
        flush();
        thBody.push(emptyMark);
      }
      if (hideOld) {
        if (runN === 0) runAt = i;
        runN++;
      } else {
        if (!markHere && !(i > 0 && isNewRow(rows[i - 1]))) thBody.push(gapEl(oldSeen, `g${i}`));
        thBody.push(oldRowEl(k, i));
      }
      oldSeen++;
    });
    flush();
    if (!pairs.length && oldSeen === at) thBody.push(emptyMark);
    else if (!hideOld && rows.length && !isNewRow(rows[rows.length - 1])) thBody.push(gapEl(oldSeen, "gend"));
  }

  // อังกฤษ (ดูอย่างเดียว · กติกาเดียวกับตอนบันทึก arrangeEn): บรรทัดเท่าไทย = เรียงตามไทย · ไม่เท่า = เดิม + บรรทัดใหม่ต่อท้าย
  const enItems: { key: string; neu: boolean; text: string; orig: string }[] = (() => {
    const neu = (k: RowKey) => {
      const p = pairByKey.get(k);
      return withEn && p?.en ? [{ key: k, neu: true, text: edits.en[p.en] ?? p.en, orig: p.en }] : [];
    };
    if (enAligned) return rows.flatMap((k) => (isNewRow(k) ? neu(k) : [{ key: k, neu: false, text: enLines[oldRowIndex(k)] ?? "", orig: "" }]));
    return [...enLines.map((t, i) => ({ key: `o:${i}`, neu: false, text: t, orig: "" })), ...rows.filter(isNewRow).flatMap(neu)];
  })();
  const enBody: React.ReactNode[] = [];
  {
    let runN = 0;
    let runKey = "";
    const flush = () => {
      if (runN > 0)
        enBody.push(
          <button key={`h${runKey}`} type="button" onClick={() => setHide(false)} title="กดเพื่อโชว์บรรทัดเดิม" className="my-0.5 w-full rounded px-2 py-0.5 text-left text-[11.5px] text-slate-400 hover:bg-slate-50">
            ⋯ ซ่อน {runN} บรรทัดเดิม
          </button>
        );
      runN = 0;
    };
    for (const it of enItems) {
      if (it.neu) {
        flush();
        const ek = `en:${it.orig}`;
        enBody.push(
          editing === ek ? (
            editInput(ek, it.orig, it.text)
          ) : (
            <div key={it.key} className="group my-px flex items-start gap-1 rounded-md border border-dashed border-orange-300 bg-orange-50 px-0.5">
              <button type="button" onClick={() => setEditing(ek)} title="คลิกเพื่อแก้บรรทัดนี้ (เฉพาะรุ่นนี้)" data-insert-line
                className={`flex-1 rounded px-1 text-left hover:bg-white ${it.text.trim() ? "text-orange-700" : "text-slate-400 line-through"}`}>
                {it.text.trim() ? it.text : it.orig}
              </button>
              {editedMark(it.orig, edits.en[it.orig] !== undefined)}
            </div>
          )
        );
        continue;
      }
      if (hideOld) {
        if (runN === 0) runKey = it.key;
        runN++;
        continue;
      }
      enBody.push(<div key={it.key} className="whitespace-pre-wrap px-2 text-slate-600">{it.text || " "}</div>);
    }
    flush();
    if (picked && !enItems.some((x) => x.neu))
      enBody.push(
        <p key="none" className="my-0.5 rounded-md border border-dashed border-orange-300 bg-orange-50 px-2 py-1 text-[11.5px] text-orange-600">
          {withEn ? "ไม่มีบรรทัดอังกฤษ (รายการยังไม่มีชื่ออังกฤษ)" : "ไม่ได้ติ๊กใส่ภาษาอังกฤษ"}
        </p>
      );
  }

  return (
    <ERPModal
      open
      onClose={onClose}
      size="xl"
      defaultExpanded={false}
      hasUnsavedChanges={dirty}
      title={t("แทรกรายละเอียด", "Insert details")}
      description={stepMode
        ? t("ทำทีละขั้น ข้ามได้ทุกขั้น · ขวา = ตัวอย่างคำอธิบาย ลาก ⠿ สลับบรรทัดได้ · คลิกบรรทัดสีส้มเพื่อแก้ก่อนแทรก", "Go step by step, skip any step · right = preview, drag ⠿ to reorder · click an orange line to edit it")
        : t("ซ้าย = เลือกรายละเอียด · ขวา = ตัวอย่างคำอธิบาย ลาก ⠿ สลับบรรทัดได้ทุกบรรทัด · คลิกบรรทัดสีส้มเพื่อแก้ก่อนแทรก", "Left = pick details · right = preview, drag ⠿ to reorder · click an orange line to edit it")}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={clearAll} disabled={!dirty} className="h-9 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40" data-insert-clear-all>
            {t("ล้างทั้งหมด", "Clear all")}
          </button>
          <span className="mr-auto text-xs text-slate-500">
            {picked ? t(`จะแทรก ${finalTh.length} บรรทัด`, `${finalTh.length} lines to insert`) : reordered ? t("จัดลำดับบรรทัดใหม่", "Lines reordered") : t("ยังไม่ได้เลือกบรรทัด", "No lines picked yet")}
            {picked && reordered && t(" · จัดลำดับบรรทัดเดิมใหม่", " · existing lines reordered")}
            {changes.length > 0 && t(` · อัปเดตช่องสินค้า ${changes.length} ช่อง`, ` · ${changes.length} product fields updated`)}
          </span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            {t("ยกเลิก", "Cancel")}
          </button>
          {onApplyNext && (
            <button type="button" onClick={() => void apply(true)} disabled={saving || !dirty} data-detail-insert-apply-next
              title={t("แทรกแล้วไปรุ่นถัดไปในรายการที่ช่องนี้ยังว่าง (เปิดป๊อปให้เอง)", "Insert, then go to the next item in the list whose field is empty")}
              className="h-9 rounded-lg border border-orange-300 px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50">
              {t("แทรก + ตัวถัดไปที่ยังว่าง ▶", "Insert + next empty ▶")}
            </button>
          )}
          <button type="button" onClick={() => void apply()} disabled={saving || !dirty} data-detail-insert-apply
            className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? t("กำลังบันทึก…", "Saving…") : saveLabel ?? t("แทรก", "Insert")}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-detail-insert-modal>
        {/* ─── ซ้าย: เลือก ─── */}
        <div className="min-w-0 space-y-2.5">
          {/* 🪜 ทีละขั้น / แบบแท็บ · 🌐 ภาษาหน้าจอ */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <span className="inline-flex overflow-hidden rounded-md border border-slate-200" data-insert-mode>
              {INSERT_MODES.map((m) => (
                <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={modePref.view === m} data-insert-mode-opt={m}
                  className={`px-2.5 py-1 ${m !== "steps" ? "border-l border-slate-200" : ""} ${modePref.view === m ? "bg-orange-50 font-medium text-orange-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {m === "steps" ? t("ทีละขั้น", "Step by step") : t("แบบแท็บ", "Tabs")}
                </button>
              ))}
            </span>
            <span className="inline-flex overflow-hidden rounded-md border border-slate-200" data-insert-ui-lang title={t("ภาษาหน้าจอของป๊อปนี้ (ไม่เปลี่ยนภาษาทั้งระบบ)", "Language of this window only")}>
              {(["th", "en"] as const).map((l) => (
                <button key={l} type="button" onClick={() => { setUiLang(l); if (hasEn) { setView(l); setEditing(null); } }} aria-pressed={uiLang === l} data-insert-ui-lang-opt={l}
                  className={`px-2.5 py-1 ${l === "en" ? "border-l border-slate-200" : ""} ${uiLang === l ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {l === "th" ? "ไทย" : "English"}
                </button>
              ))}
            </span>
          </div>
          {baseTpl.profiles.length > 0 && !reviewing && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600" data-insert-profile>
              <span>🗂 {t("ชุดรายการ", "Item set")}</span>
              <select value={profileSel ?? "__auto"} onChange={(e) => setProfileSel(e.target.value === "__auto" ? null : e.target.value)} aria-label={t("ชุดรายการ", "Item set")}
                className="h-7 max-w-full rounded-md border border-slate-200 px-1.5 text-[12px]">
                <option value="__auto">
                  {`${t("อัตโนมัติ", "Auto")}: ${autoProfile ? autoProfile.name : t("ทั้งหมด", "All")}${productCat && catById.get(productCat) ? ` (${t("หมวด", "category")} ${catById.get(productCat)!.name})` : ""}`}
                </option>
                {baseTpl.profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__all">{t("ทั้งหมด (ไม่กรอง)", "All (no filter)")}</option>
              </select>
              {profile && <span className="text-[11px] text-slate-400">{t("โชว์เฉพาะรายการของชุดนี้", "Showing this set's items only")}</span>}
            </div>
          )}
          {stepMode ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5" data-insert-steps>
                {steps.map((s, i) => {
                  const cur = s === step;
                  const skip = skipped.includes(s);
                  const n = s === "review" ? 0 : stepCount(s);
                  return (
                    <button key={s} type="button" onClick={() => goStep(s)} aria-current={cur ? "step" : undefined} data-insert-step={s}
                      className={`h-8 rounded-full border px-2.5 text-[12px] font-medium ${cur ? "border-orange-300 bg-orange-50 text-orange-700" : skip ? "border-slate-200 bg-white text-slate-400 line-through" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {i + 1}. {t(STEP_LABEL[s][0], STEP_LABEL[s][1])}
                      {n > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white no-underline">{n}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-slate-500" data-insert-step-hint>{t(STEP_HINT[step][0], STEP_HINT[step][1])}</p>
              {step === "highlight" && STEP_TABS.highlight.filter((k) => tabs.some((x) => x.key === k)).length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5" data-insert-highlight-tabs>
                  {STEP_TABS.highlight.flatMap((k) => tabs.filter((x) => x.key === k)).map((x) => (
                    <button key={x.key} type="button" onClick={() => openTab(x.key)} data-insert-tab={x.key}
                      className={`h-7 rounded-lg border px-2.5 text-[12px] ${tab === x.key ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {t(x.label, x.en)}
                      {tabCount(x.key) > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white">{tabCount(x.key)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {tabs.map((x) => (
                <button key={x.key} type="button" onClick={() => openTab(x.key)} data-insert-tab={x.key}
                  className={`h-8 rounded-lg border px-2.5 text-[12.5px] font-medium ${tab === x.key ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {t(x.label, x.en)}
                  {tabCount(x.key) > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white">{tabCount(x.key)}</span>}
                </button>
              ))}
              <button type="button" onClick={() => setTplOpen(true)} title={t("ตั้งรูปแบบบรรทัด (คำนำหน้า · คำเชื่อม และ · ชื่ออังกฤษในวงเล็บ) — ใช้กับทุกสินค้า", "Line format (prefix · joiner · English in brackets) — all products")} data-insert-tpl
                className="ml-auto h-8 rounded-lg border border-slate-200 px-2.5 text-[12.5px] text-slate-600 hover:bg-slate-50">⚙️ {t("รูปแบบบรรทัด", "Line format")}</button>
            </div>
          )}
          {!reviewing && <div className="flex flex-wrap items-center gap-2">
            {!stepMode && <p className="min-w-0 flex-1 text-[11.5px] text-slate-500">{t(tabInfo.hint, tabInfo.hintEn)}</p>}
            <button type="button" onClick={() => clearTab(tab)} disabled={!tabDirty(tab)} data-insert-clear
              title={tab === "size" || tab === "fit" ? t("คืนตัวเลข/ของที่ใส่ได้ เป็นค่าเดิมของสินค้า และไม่ใส่บรรทัดของหน้านี้", "Restore the product's values and add no line from this page") : t("เอาที่เลือกในหน้านี้ออกทั้งหมด (หน้าอื่นไม่เปลี่ยน)", "Remove everything picked on this page")}
              className="h-7 shrink-0 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600">
              🧹 {tab === "size" || tab === "fit" ? t("ล้างหน้านี้ (คืนค่าเดิม)", "Clear (restore)") : t("ล้างหน้านี้", "Clear page")}
            </button>
            {tab !== "size" && tab !== "slot" && tab !== "ai" && !compactMat && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา…", "Search…")}
                className="h-8 w-28 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            )}
            {!isEn && (
              <button type="button" onClick={() => { const v = showEn ? "hide" : "show"; enPref.setView(v); void enPref.saveDefault(v); }} aria-pressed={showEn} data-insert-show-en
                title={showEn ? "ซ่อนชื่ออังกฤษในรายการ" : "แสดงชื่ออังกฤษในรายการ"}
                className={`h-7 shrink-0 rounded-md border px-2 text-[11.5px] font-medium ${showEn ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>EN</button>
            )}
            {stepMode && (
              <button type="button" onClick={() => setTplOpen(true)} title={t("ตั้งรูปแบบบรรทัด — ใช้กับทุกสินค้า", "Line format — all products")} data-insert-tpl
                className="ml-auto h-7 shrink-0 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:bg-slate-50">⚙️ {t("รูปแบบบรรทัด", "Line format")}</button>
            )}
          </div>}
          {copyFrom && !reviewing && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCopyOpen(true)} data-insert-copy-from
                className="h-7 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50">⧉ {t("คัดลอกจากรุ่นอื่น", "Copy from another model")}</button>
              {copied.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11.5px] text-orange-700" data-insert-copied>
                  {t(`คัดลอกมา ${copied.length} บรรทัด`, `${copied.length} lines copied`)}
                  <button type="button" onClick={() => setCopied([])} title={t("เอาบรรทัดที่คัดลอกออก", "Remove copied lines")} aria-label={t("เอาบรรทัดที่คัดลอกออก", "Remove copied lines")} className="text-orange-400 hover:text-rose-600">✕</button>
                </span>
              )}
            </div>
          )}
          {(bracketKind || dupKind) && !reviewing && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {bracketKind && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600">
                  <input type="checkbox" checked={tpl.enInBrackets[bracketKind]} onChange={(e) => setEnBr((p) => ({ ...p, [bracketKind]: e.target.checked }))} className="h-3.5 w-3.5 accent-orange-500" data-insert-enbr />
                  {t("ใส่ชื่ออังกฤษในวงเล็บ", "Add the English name in brackets (Thai lines)")} <span className="text-slate-400">{t("เช่น ผ้าไนล่อน (Nylon)", "e.g. ผ้าไนล่อน (Nylon)")}</span>
                </label>
              )}
              {dupKind && dupNote(dupKind)}
            </div>
          )}

          {reviewing ? (
            <ReviewSummary
              steps={steps.filter((s) => s !== "review")}
              skipped={skipped}
              t={t}
              label={(s) => t(STEP_LABEL[s][0], STEP_LABEL[s][1])}
              summary={(s) => {
                const L = (k: "th" | "en") => composeLines(
                  s === "material" ? { phrases: [], materials: sel.materials, slots: [] }
                    : s === "slot" ? { phrases: [], materials: [], slots: sel.slots }
                    : s === "highlight" ? { phrases: sel.phrases, materials: [], slots: [], lifestyle: sel.lifestyle, ai: sel.ai }
                    : s === "size" ? { phrases: [], materials: [], slots: [], size: sel.size, weight: sel.weight, handle: sel.handle, strap: sel.strap }
                    : { phrases: [], materials: [], slots: [], fits: sel.fits },
                  tpl
                )[k];
                const out = isEn ? L("en") : L("th");
                return (out.length ? out : L("th")).map((x) => x.replace(/^- /, ""));
              }}
              onEdit={goStep}
              changes={changes}
            />
          ) : null}
          {reviewing && (
            <div className="space-y-2" data-insert-review-extra>
              {aiState.mismatch && (
                <div className="rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900" data-insert-mismatch>
                  ⚠️ {t("AI เตือน: ", "AI warning: ")}{isEn ? aiState.mismatch.en || aiState.mismatch.th : aiState.mismatch.th}
                  {lines.length > 0 && !dropOld && (
                    <button type="button" onClick={() => setDropOld(true)} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-amber-800 hover:bg-amber-100">{t("แทนที่ของเดิม", "Replace old text")}</button>
                  )}
                </div>
              )}
              {(infoColor || infoWarranty || infoCare.length > 0 || (facts && pickedMats.length > 0)) && (
                <div className="rounded-lg border border-slate-200 px-2.5 py-2" data-insert-info>
                  <div className="mb-1 text-[12px] font-medium text-slate-700">{t("เติมจากข้อมูล (ฟรี)", "Add from product data (free)")}</div>
                  {infoColor && (
                    <label className="flex cursor-pointer items-start gap-2 py-0.5 text-[12px] text-slate-700">
                      <input type="checkbox" checked={info.color} onChange={(e) => setInfo((p) => ({ ...p, color: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-orange-500" data-insert-info-color />
                      <span>{isEn ? infoColor.en ?? infoColor.th : infoColor.th} <span className="text-slate-400">{t("(จาก SKU ลูก)", "(from child SKUs)")}</span></span>
                    </label>
                  )}
                  {infoWarranty && (
                    <label className="flex cursor-pointer items-start gap-2 py-0.5 text-[12px] text-slate-700">
                      <input type="checkbox" checked={info.warranty} onChange={(e) => setInfo((p) => ({ ...p, warranty: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-orange-500" data-insert-info-warranty />
                      <span>{isEn ? infoWarranty.en ?? infoWarranty.th : infoWarranty.th} <span className="text-slate-400">{t("(ช่องรับประกัน)", "(warranty field)")}</span></span>
                    </label>
                  )}
                  {infoCare.length > 0 ? (
                    <label className="flex cursor-pointer items-start gap-2 py-0.5 text-[12px] text-slate-700">
                      <input type="checkbox" checked={info.care} onChange={(e) => setInfo((p) => ({ ...p, care: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-orange-500" data-insert-info-care />
                      <span>{infoCare.map((c) => (isEn ? c.en ?? c.th : c.th)).join(" · ")} <span className="text-slate-400">{t("(จากคลังวัสดุ)", "(from the material list)")}</span></span>
                    </label>
                  ) : pickedMats.length > 0 && (
                    <p className="py-0.5 text-[11.5px] text-slate-400">{t("วัสดุที่เลือกยังไม่มีวิธีดูแลในคลังวัสดุ — กด \"ดูทั้งหมด\" ในขั้นวัตถุดิบ แล้วกด \"เขียนหน้า\" เพื่อเติม", "The picked materials have no care text yet — add it on the material page")}</p>
                  )}
                </div>
              )}
              {lines.length > 0 && (
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] ${dropOld ? "bg-rose-50 text-rose-800" : "text-slate-600"}`} data-insert-drop-old>
                  <input type="checkbox" checked={dropOld} onChange={(e) => setDropOld(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
                  <span>{t(`แทนที่ Description เดิมทั้งหมด (${lines.length} บรรทัด) ด้วยบรรทัดใหม่`, `Replace the whole existing description (${lines.length} lines) with the new lines`)}
                    <span className="block text-[11px] opacity-70">{t("ย้อนกลับได้จากประวัติเวอร์ชันของสินค้า", "You can undo from the product's version history")}</span></span>
                </label>
              )}
            </div>
          )}
          {reviewing ? null : loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className={`${compactMat ? "" : "max-h-[22rem] overflow-auto"} space-y-1 pr-1`}>
              {tab === "ai" && aiParentId && (
                <DetailInsertAi parentId={aiParentId} brandId={typeof values.brand_id === "string" ? values.brand_id : null} isEn={isEn}
                  state={aiState} setState={setAiState} chosen={chosenTh} />
              )}

              {tab === "phrase" && (
                <>
                  <SortList items={phraseItems.filter(matchPhrase)} disabled={!!needle} onMove={(f, t) => void reorder("phrase", phraseItems, f, t)} render={(it, handle) => {
                    const on = phraseIds.includes(it.id);
                    const v = variantsOf(it);
                    const shown = resolvePhrase(it, phrasePick[it.id]);
                    return (
                      <div className={rowCls(on)} data-phrase-row={it.id}>
                        {handle}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setPhraseIds((p) => toggle(p, it.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          {on && phraseIds.length > 1 && <ClickOrder n={phraseIds.indexOf(it.id) + 1} />}
                          {twoLines(shown, on)}
                        </label>
                          {v && (
                            <div className="flex shrink-0 items-center text-[11.5px] text-slate-500" data-phrase-variant={v.mode} title={it.name}>
                              {v.mode === "select" ? (
                                <select value={phrasePick[it.id] || v.variants[0].label} onChange={(e) => choosePhrase(it.id, e.target.value)} aria-label={`เลือกแบบ ${it.name}`}
                                  className="h-6 rounded border border-slate-200 bg-white px-1 text-[11.5px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400">
                                  {v.variants.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}
                                </select>
                              ) : (
                                <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-700">
                                  <input type="checkbox" checked={phrasePick[it.id] === v.variants[1].label} onChange={(e) => choosePhrase(it.id, e.target.checked ? v.variants[1].label : "")} className="h-3.5 w-3.5 accent-orange-500" aria-label={`${it.name}: ${v.variants[1].label}`} />
                                  {v.variants[1].label}
                                </label>
                              )}
                            </div>
                          )}
                        {editBtn("phrase", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  }} />
                  {!phraseItems.filter(matchPhrase).length && <p className="py-3 text-center text-xs text-slate-400">{t("ไม่พบข้อความ", "No phrases found")}</p>}
                  {addBtn("phrase", "ข้อความ", "phrase")}
                </>
              )}

              {compactMat && (
                // ของกลาง MaterialQuickPick (ใช้ร่วมกับป๊อป "ให้ AI คิดรายละเอียด")
                <MaterialQuickPick items={visMats} value={matIds} onChange={setMatIds} lang={isEn ? "en" : "th"} hint={matHint || null}
                  onSeeAll={() => setMatAll(true)} footer={addBtn("material", "วัสดุ", "material")} />
              )}

              {tab === "material" && !compactMat && (
                <>
                  {stepMode && (
                    <button type="button" onClick={() => setMatAll(false)} className="text-[11.5px] text-orange-600 hover:underline" data-mat-less>{t("← กลับแบบย่อ", "← Back to short view")}</button>
                  )}
                  <SortList items={visMats.filter(match)} disabled={!!needle} onMove={(f, to) => void reorder("material", visMats, f, to)} render={(m, handle) => {
                    const on = matIds.includes(m.id);
                    const page = hasMaterialPage(m);
                    return (
                      <div className={rowCls(on)}>
                        {handle}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setMatIds((p) => toggle(p, m.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          {on && matIds.length > 1 && <ClickOrder n={matIds.indexOf(m.id) + 1} />}
                          {twoLines(m, on)}
                        </label>
                        {page ? (
                          <button type="button" onClick={() => setMatOpen(m.id)} data-mat-page={m.id} title={t("เปิดหน้าวัสดุ (แก้คำอธิบาย/วิธีดูแล/รูปได้) — ชื่อวัสดุนี้บนเว็บกดมาหน้านี้", "Open the material page (description / care / photo)")}
                            className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-700 hover:bg-emerald-100 hover:underline">🔗 {t("มีหน้า", "Has page")}</button>
                        ) : (
                          <button type="button" onClick={() => setMatOpen(m.id)} data-mat-page={m.id} title={t("ยังไม่มีคำอธิบายวัสดุ — กดเพื่อเขียน แล้วชื่อวัสดุบนเว็บจะกดดูได้", "No material page yet — write one so the web shop can link it")}
                            className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500 hover:bg-slate-200 hover:text-slate-700">✍️ {t("เขียนหน้า", "Write page")}</button>
                        )}
                        {editBtn("material", m as unknown as Record<string, unknown>)}
                      </div>
                    );
                  }} />
                  {!visMats.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">{t("ไม่พบวัสดุ", "No material found")}</p>}
                  {addBtn("material", "วัสดุ", "material")}
                </>
              )}

              {tab === "slot" && (
                <>
                  <SortList items={[...slotItems].sort((a, b) => sideRank(a.slot_side) - sideRank(b.slot_side))} disabled={tmpSlots.length > 0} onMove={(f, to) => void reorder("slot", [...slotItems].sort((a, b) => sideRank(a.slot_side) - sideRank(b.slot_side)), f, to)}
                    header={(it, i, all) =>
                      slotItems.some((x) => x.slot_side) && (i === 0 || sideRank(all[i - 1].slot_side) !== sideRank(it.slot_side)) ? (
                        <p className="px-1 pt-1.5 text-[11px] font-semibold text-slate-500" data-slot-group={it.slot_side ?? ""}>{isEn ? SIDE_EN[it.slot_side ?? ""] ?? SIDE_EN[""] : SIDE_LABEL[it.slot_side ?? ""] ?? SIDE_LABEL[""]}</p>
                      ) : null
                    }
                    render={(it, handle) => {
                    const n = Math.floor(Number(slotN[it.id])) || 0;
                    const tmp = it.id.startsWith("tmp:");
                    const dims = slotDims[it.id];
                    const dimTxt = slotDimsText(dims, isEn ? "en" : "th");
                    return (
                      <div className={`${rowCls(n > 0)} flex-wrap`} data-slot-row={it.id}>
                        {handle}
                        <span className={`min-w-0 flex-1 text-sm ${n > 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          <span className="block leading-snug">
                            {nm(it)}
                            {tmp && <span className="ml-1 rounded-full bg-violet-50 px-1.5 text-[10.5px] font-normal text-violet-700">{t("ใช้ครั้งนี้", "this time only")}</span>}
                          </span>
                          {showEn && !isEn && <span className={`block truncate text-[11px] font-normal leading-snug ${it.name_en ? "text-slate-400" : "text-slate-300"}`}>{it.name_en || "ไม่มีอังกฤษ"}</span>}
                          {n > 0 && (
                            <span className="block text-[11px] font-normal text-slate-400">
                              → {slotText(it, n, "th", tpl)}{slotDimsText(dims, "th")}
                              {" · "}
                              {slotText(it, n, "en", tpl) ? `${slotText(it, n, "en", tpl)}${slotDimsText(dims, "en")}` : t("— (ยังไม่มีอังกฤษ)", "— (no English name yet)")}
                            </span>
                          )}
                        </span>
                        {n > 0 && (
                          <button type="button" onClick={() => toggleDims(it)} aria-pressed={!!dims} data-slot-dims-toggle={it.id}
                            title={dims ? t("เอาขนาดช่องออก", "Remove pocket size") : t("ใส่ขนาดช่อง (เช่น ช่องใส) — ต่อท้ายบรรทัด + ใช้เช็กใส่อะไรได้", "Add pocket size (e.g. clear pocket) — added to the line and used for the fit check")}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[15px] ${dims ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                            <Icon name="ruler" />
                          </button>
                        )}
                        <input aria-label={`${t("จำนวน", "Count")} ${nm(it)}`} type="number" inputMode="numeric" min={0} max={99} step={1} value={slotN[it.id] ?? ""} placeholder="0"
                          onChange={(e) => setSlotN((p) => ({ ...p, [it.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                          className="h-8 w-14 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        <span className="w-8 text-xs text-slate-400">{t("ช่อง", "pcs")}</span>
                        {!tmp && editBtn("slot", it as unknown as Record<string, unknown>)}
                        {tmp && (
                          <button type="button" onClick={() => { setTmpSlots((p) => p.filter((x) => x.id !== it.id)); setSlotN((p) => ({ ...p, [it.id]: "" })); }} aria-label={t("เอาช่องนี้ออก", "Remove this pocket")}
                            className="shrink-0 rounded px-1 text-slate-400 hover:text-rose-600"><Icon name="cancel" /></button>
                        )}
                        {dims && n > 0 && (
                          <div className="flex basis-full flex-wrap items-center gap-1.5 pl-6 text-[11.5px] text-slate-600" data-slot-dims={it.id}>
                            <span>{t("ขนาดด้านใน", "Inside size")}</span>
                            {(["w", "h", "d"] as const).map((k, i) => (
                              <Fragment key={k}>
                                {i > 0 && <span className="text-slate-400">×</span>}
                                <input aria-label={`${nm(it)} ${k === "w" ? t("กว้าง", "width") : k === "h" ? t("สูง", "height") : t("หนา", "depth")}`} inputMode="decimal" value={dims[k]}
                                  placeholder={k === "w" ? t("กว้าง", "W") : k === "h" ? t("สูง", "H") : t("หนา", "D")}
                                  onChange={(e) => setSlotDims((p) => ({ ...p, [it.id]: { ...p[it.id], [k]: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) } }))}
                                  className="h-7 w-14 rounded border border-slate-200 px-1.5 text-right text-[12px] tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                              </Fragment>
                            ))}
                            <span className="text-slate-400">{t("ซม.", "cm")}</span>
                            <span className="basis-full text-[10.5px] text-slate-400">
                              {!dimTxt ? t("ใส่กว้าง + สูง เพื่อต่อท้ายบรรทัด", "Enter width + height to add it to the line")
                                : !canComp ? t("ต่อท้ายบรรทัดให้แล้ว", "Added to the line")
                                : Number(dims.d) > 0 ? (saveComps ? t("ต่อท้ายบรรทัด + บันทึกเป็นช่องใส่ของของสินค้า (ใช้เช็กใส่อะไรได้)", "Added to the line + saved as a product pocket (used for the fit check)") : t("ต่อท้ายบรรทัดแล้ว (ยังไม่บันทึกเป็นช่องใส่ของ — ติ๊กด้านล่าง)", "Added to the line (not saved as a pocket — tick below)"))
                                : t("ต่อท้ายบรรทัดแล้ว · ใส่ความหนาด้วย = บันทึกเป็นช่องใส่ของ + เช็กใส่อะไรได้", "Added to the line · add depth to save it as a pocket and check what fits")}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }} />
                  {!slotItems.length && <p className="py-3 text-center text-xs text-slate-400">{t("ยังไม่มีช่อง", "No pockets yet")}</p>}
                  {canComp && fullDims > 0 && (
                    <label className="mt-1 flex cursor-pointer items-start gap-1.5 rounded-lg bg-sky-50 px-2 py-1.5 text-[11.5px] text-sky-900" data-slot-save-comps>
                      <input type="checkbox" checked={saveComps} onChange={(e) => setSaveComps(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-orange-500" />
                      <span>
                        {t(`บันทึกขนาด ${fullDims} ช่องเป็น "ช่องใส่ของ" ของสินค้าด้วย (ใช้เช็กใส่อะไรได้ · โชว์บนเว็บ)`, `Also save ${fullDims} pocket size(s) as product pockets (used for the fit check · shown on the web shop)`)}
                        {!hadComps && <span className="block text-sky-700/80">{t("สินค้านี้ยังไม่ได้วัดช่องอื่น — ถ้าบันทึกแค่ช่องนี้ ระบบจะคิดว่ากระเป๋ามีแค่ช่องนี้ (วัดช่องหลักด้วยจะแม่นกว่า)", "Other pockets aren't measured yet — saving only this one makes the system think the bag has just this pocket (measure the main pocket too)")}</span>}
                      </span>
                    </label>
                  )}
                  {/* ＋ ช่องแบบใหม่ (ช่องแปลก ๆ) — พิมพ์ไทยหรืออังกฤษ แปลให้ · เก็บเข้าคลังกลาง หรือใช้ครั้งนี้ */}
                  <div className="mt-1.5 space-y-1.5 rounded-lg bg-slate-50 p-2" data-slot-new>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input value={newSlot.name} onChange={(e) => { setNewSlot((p) => ({ ...p, name: e.target.value })); setSlotErr(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNewSlot(); } }}
                        placeholder={t("ช่องแบบใหม่ เช่น ช่องใส่ปากกา", "New pocket, e.g. pen holder")} aria-label={t("ชื่อช่องแบบใหม่", "New pocket name")} data-slot-new-name
                        className="h-8 min-w-[10rem] flex-1 rounded-md border border-slate-200 bg-white px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      <select value={newSlot.side} onChange={(e) => setNewSlot((p) => ({ ...p, side: e.target.value }))} aria-label={t("ตำแหน่งช่อง", "Pocket position")} data-slot-new-side
                        className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[12.5px]">
                        <option value="outside">{t("ด้านนอก", "Outside")}</option>
                        <option value="inside">{t("ด้านใน", "Inside")}</option>
                        <option value="">{t("ไม่ระบุ", "No position")}</option>
                      </select>
                      <button type="button" onClick={() => void addNewSlot()} disabled={addingSlot} data-slot-new-add
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-orange-300 bg-white px-2.5 text-[12.5px] font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50">
                        <Icon name="add" /> {addingSlot ? t("กำลังเพิ่ม…", "Adding…") : t("เพิ่มช่อง", "Add pocket")}
                      </button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-slate-600">
                      <input type="checkbox" checked={newSlot.save} onChange={(e) => setNewSlot((p) => ({ ...p, save: e.target.checked }))} className="h-3.5 w-3.5 accent-orange-500" data-slot-new-save />
                      {t("เก็บเข้าคลังกลาง (สินค้าอื่นเลือกได้ด้วย) · ไม่ติ๊ก = ใช้ครั้งนี้", "Save to the shared list (other products can use it) · unticked = this time only")}
                    </label>
                    {slotErr && <p className="text-[11.5px] text-rose-600" data-slot-new-err>{slotErr}</p>}
                  </div>
                  <button type="button" onClick={() => setEditor({ kind: "slot", item: null })} className="mt-1 text-xs text-orange-600 hover:underline">
                    {t("＋ เพิ่มช่องแบบละเอียด (รูปแบบบรรทัด · ใช้กับชุด)", "＋ New pocket with full settings")}
                  </button>
                </>
              )}

              {tab === "size" && (
                <div className="space-y-1.5" data-insert-size>
                  {numFields
                    .filter((f) => f.k !== "s2")
                    .map((f) => {
                      const ks: NumK[] = f.k === "s1" ? (["s1", "s2"] as NumK[]).filter(has) : [f.k];
                      const changed = ks.some((k) => num[k] !== numOrig[k]);
                      const box = (k: NumK, label: string) => (
                        <input key={k} aria-label={label} inputMode="decimal" value={num[k]} placeholder="0"
                          onChange={(e) => setNum((p) => ({ ...p, [k]: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) }))}
                          className="h-8 w-16 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      );
                      return (
                        <div key={f.k} className={rowCls(changed)}>
                          <span className="w-20 shrink-0 leading-tight">
                            <span className="block text-sm text-slate-700">{t(f.label, f.en)}</span>
                            {!isEn && <span className="block text-[10.5px] text-slate-400">{f.en}</span>}
                          </span>
                          {f.k === "s1" ? (
                            <span className="flex items-center gap-1">
                              {has("s1") && box("s1", t("สายสะพายสั้นสุด", "Shortest strap"))}
                              {has("s1") && has("s2") && <span className="text-xs text-slate-400">–</span>}
                              {has("s2") && box("s2", t("สายสะพายยาวสุด", "Longest strap"))}
                            </span>
                          ) : (
                            box(f.k, t(f.label, f.en))
                          )}
                          <span className="w-10 shrink-0 text-xs text-slate-400">{isEn ? (f.k === "g" ? "g" : "cm") : f.unit}</span>
                          <span className={`min-w-0 flex-1 truncate text-right text-[11px] ${changed ? "text-orange-700" : "text-slate-400"}`}>
                            {changed ? `${t("เดิม", "was")} ${ks.map((k) => numOrig[k] || t("ว่าง", "empty")).join("–")}` : ks.some((k) => numOrig[k]) ? t("ตรงกับสินค้า", "Same as product") : t("สินค้ายังไม่กรอก", "Not filled on product")}
                          </span>
                        </div>
                      );
                    })}
                  {has("s1") && has("s2") && <p className="text-[11px] text-slate-400">{t("สาย: ใส่ 2 ค่า = ปรับได้ (เช่น 100–120) · สายเส้นเดียว ใส่ช่องแรกช่องเดียว", "Strap: 2 values = adjustable (e.g. 100–120) · fixed strap = first box only")}</p>}
                  <div className="space-y-1 pt-1 text-[12.5px] text-slate-600">
                    {(["size", "weight", "handle", "strap"] as SizeLine[])
                      .filter((k) => SIZE_LINE_KEYS[k].some(has))
                      .map((k) => (
                        <div key={k} className="flex flex-wrap items-center gap-x-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={use[k]} onChange={(e) => setUse((p) => ({ ...p, [k]: e.target.checked }))} className="h-4 w-4 accent-orange-500" data-insert-use={k} />
                            {t(`ใส่บรรทัด${LINE_KIND_LABEL[k]}`, `Add ${SIZE_LINE_EN[k]} line`)}
                          </label>
                          {dupNote(k)}
                          {(() => {
                            const one = composeLines(
                              { phrases: [], materials: [], slots: [], size: k === "size" ? { w: num.w, h: num.h, d: num.d } : null, weight: k === "weight" ? num.g : null, handle: k === "handle" ? num.hd : null, strap: k === "strap" ? { min: num.s1, max: num.s2 } : null },
                              tpl
                            );
                            return one.th.length ? (
                              <span className={`basis-full pl-6 text-[11px] ${use[k] ? "text-slate-500" : "text-slate-300"}`} data-insert-size-preview={k}>
                                {one.th[0].replace(/^- /, "")} · {one.en[0]?.replace(/^- /, "") ?? "—"}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    <p className="text-[11px] text-slate-400">{t("ไม่ติ๊ก = ไม่ใส่บรรทัด แต่ตัวเลขที่แก้ยังบันทึกกลับช่องของสินค้า", "Unticked = no line, but edited numbers are still saved to the product")}</p>
                  </div>
                </div>
              )}

              {tab === "lifestyle" && (
                <>
                  <div className="flex flex-wrap items-center gap-1" data-life-styles>
                    {styles.map((st) => {
                      const on = st.id === curStyle?.id;
                      const n = lifeIds.filter((id) => lifeItems.some((x) => x.id === id && x.parent_id === st.id)).length;
                      return (
                        <span key={st.id} className="inline-flex items-center">
                          <button type="button" onClick={() => setStyleId(st.id)} data-life-style={st.id} aria-pressed={on} title={st.name_en ?? undefined}
                            className={`h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-orange-400 bg-orange-50 font-medium text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                            {nm(st)}{n ? ` · ${n}` : ""}
                          </button>
                          {on && editBtn("style", st as unknown as Record<string, unknown>)}
                        </span>
                      );
                    })}
                    <button type="button" onClick={() => setEditor({ kind: "style", item: null })} className="h-7 rounded-full border border-dashed border-orange-300 px-2.5 text-[12px] text-orange-600 hover:bg-orange-50">{t("＋ สไตล์ใหม่", "＋ New style")}</button>
                  </div>
                  {curStyle?.name_en && !isEn && <p className="px-1 text-[11px] text-slate-400">{curStyle.name_en}</p>}
                  {!styles.length && <p className="py-2 text-center text-xs text-slate-400">{t("ยังไม่มีสไตล์ — กด \"＋ สไตล์ใหม่\"", "No styles yet — press \"＋ New style\"")}</p>}
                  {curStyle && (
                    <SortList items={styleItems.filter(match)} disabled={!!needle} onMove={(f, to) => void reorder("lifestyle", styleItems, f, to)} render={(it, handle) => {
                      const on = lifeIds.includes(it.id);
                      return (
                        <div className={rowCls(on)} data-life-row={it.id}>
                          {handle}
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={on} onChange={() => setLifeIds((p) => toggle(p, it.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                            {on && lifeIds.length > 1 && <ClickOrder n={lifeIds.indexOf(it.id) + 1} />}
                            {twoLines(it, on)}
                          </label>
                          {editBtn("lifestyle", it as unknown as Record<string, unknown>)}
                        </div>
                      );
                    }} />
                  )}
                  {curStyle && !styleItems.filter(match).length && <p className="py-2 text-center text-xs text-slate-400">{t("ยังไม่มีข้อความในสไตล์นี้", "No lines in this style yet")}</p>}
                  {curStyle && addBtn("lifestyle", `ข้อความ (${curStyle.name})`, `line (${nm(curStyle)})`)}
                  <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2" data-life-free>
                    <p className="text-[11.5px] font-medium text-slate-600">✍️ {t("อื่น ๆ — พิมพ์เอง", "Other — type your own")} <span className="font-normal text-slate-400">{t("(บรรทัดละข้อ)", "(one per line)")}</span></p>
                    {(() => {
                      const thBox = (
                        <textarea key="th" value={lifeTh} onChange={(e) => setLifeTh(e.target.value)} rows={2} placeholder={t("เช่น ใส่ไปคาเฟ่ก็ปัง ใส่ไปทำงานก็ดี", "Thai (one per line) — or type English below and press Translate")} aria-label={t("ข้อความพิมพ์เอง ไทย", "Your own lines, Thai")}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      );
                      const enBox = hasEn ? (
                        <textarea key="en" value={lifeEn} onChange={(e) => setLifeEn(e.target.value)} rows={2} placeholder={t("อังกฤษ (บรรทัดตรงกับไทย) — เว้นว่างได้", "English (one per line, same order as Thai)")} aria-label={t("ข้อความพิมพ์เอง อังกฤษ", "Your own lines, English")}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      ) : null;
                      return isEn ? <>{enBox}{thBox}</> : <>{thBox}{enBox}</>;
                    })()}
                    <div className="flex flex-wrap items-center gap-2">
                      {hasEn && (
                        <button type="button" onClick={() => void translateFree()} disabled={lifeBusy || (!lifeTh.trim() && !lifeEn.trim())} data-life-translate
                          title={t("แปลช่องที่ว่างจากอีกช่อง (บรรทัดต่อบรรทัด)", "Fill the empty box by translating the other one, line by line")}
                          className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-100 disabled:opacity-40">🌐 {lifeBusy ? t("กำลังแปล…", "Translating…") : t("แปลอีกภาษาให้", "Translate the other language")}</button>
                      )}
                      <button type="button" onClick={() => void copyPrompt()} data-life-prompt
                        className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-100">📋 {t("คัดลอก prompt ถาม ChatGPT", "Copy a ChatGPT prompt")}</button>
                      <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="text-[11.5px] text-slate-500 hover:text-blue-600 hover:underline">{t("เปิด ChatGPT ↗", "Open ChatGPT ↗")}</a>
                    </div>
                    <p className="text-[10.5px] text-slate-400">{t("prompt มีชื่อสินค้า + สไตล์ที่เลือก + คำอธิบายตอนนี้ · ได้คำตอบแล้ววางกลับในช่องด้านบน (บรรทัดละข้อ)", "The prompt has the product name, the style and the current description · paste the answer back above (one per line)")}</p>
                  </div>
                </>
              )}

              {tab === "fit" && (
                <>
                  <div className="rounded-md bg-slate-50 px-2 py-1 text-[11.5px] text-slate-600" data-fit-bag>
                    📐 {boxBasis === "inner"
                      ? <>{t("ช่องด้านใน", "Inside pockets")}: {(comps ?? []).map((c) => `${(isEn && c.name_en) || c.name || t("ช่อง", "pocket")} ${c.w}×${c.h}×${c.d}`).join(" · ")} {t("ซม.", "cm")}{compsNext && <span className="ml-1 text-orange-600">{t("(รวมขนาดที่ใส่ในขั้นช่อง)", "(includes sizes from the Pockets step)")}</span>}</>
                      : boxBasis === "outer"
                        ? <>{t("กระเป๋า (ขนาดนอก)", "Bag (outer size)")}: {num.w}×{num.h}×{num.d} {t("ซม.", "cm")} <span className="text-slate-400">{t("— ยังไม่วัดช่องด้านใน ใส่ได้จริงอาจน้อยกว่านี้ · ใส่ขนาดช่องได้ที่ขั้น \"ช่อง\" (ปุ่มไม้บรรทัด)", "— inside pockets not measured, real fit may be less · add pocket sizes in the Pockets step (ruler)")}</span></>
                        : <span className="text-slate-400">{t("ยังไม่มีขนาดกระเป๋า — ใส่ กว้าง/สูง/หนา ที่ขั้นขนาด หรือขนาดช่องที่ขั้นช่อง แล้วระบบจะตรวจว่าใส่ได้ไหม", "No bag size yet — add length/height/width in Size, or pocket sizes in Pockets, and the system will check what fits")}</span>}
                  </div>
                  {badFits.length > 0 && (
                    <p className="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700" data-fit-warn>
                      {t(`⚠️ เลือกไว้แต่ขนาดอาจไม่พอ: ${badFits.join(", ")} — ตรวจขนาดกระเป๋า/ของอีกครั้ง`, `⚠️ Picked but may not fit: ${badFits.join(", ")} — check the sizes again`)}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500" data-fit-size>
                    🖼 {t("ขนาดรูป", "Card size")}
                    <span className="inline-flex overflow-hidden rounded-md border border-slate-200">
                      {FIT_SIZES.map((z) => (
                        <button key={z} type="button" onClick={() => { fitSize.setView(z); void fitSize.saveDefault(z); }} aria-pressed={fitSize.view === z} data-fit-size-opt={z}
                          className={`px-2 py-0.5 ${z !== "s" ? "border-l border-slate-200" : ""} ${fitSize.view === z ? "bg-orange-50 font-medium text-orange-700" : "bg-white hover:bg-slate-50"}`}>
                          {isEn ? FIT_SIZE_EN[z] : FIT_SIZE_LABEL[z]}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className={`grid gap-1 ${FIT_GRID[fitSize.view]}`} data-insert-fit-grid>
                    <SortList items={fitItems.filter(match)} disabled={!!needle} onMove={(f, to) => void reorder("fit", fitItems, f, to)} render={(it, handle) => {
                      const pick = fits.find((p) => p.id === it.id);
                      const opts = fitSizeOptions(it);
                      const flip = () => setFits((p) => (pick ? p.filter((x) => x.id !== it.id) : [...p, { id: it.id }]));
                      return (
                        <div className={`relative h-full rounded-lg border p-1 ${pick ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300" : "border-slate-200 hover:border-slate-300"}`}>
                          <button type="button" onClick={flip} aria-pressed={!!pick} aria-label={`${t("เลือก", "Pick")} ${nm(it)}`} className="block w-full text-left">
                            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-slate-50">
                              {it.image_key ? <img src={imgUrl(it.image_key, 160)} alt="" className="h-full w-full object-contain" /> : <span className="text-xl opacity-40">🎒</span>}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] font-medium leading-tight text-slate-700" title={nm(it)}>{nm(it)}</div>
                            {showEn && !isEn && fitSize.view !== "s" && <div className="truncate text-[9.5px] leading-tight text-slate-400" title={it.name_en ?? ""}>{it.name_en || "ไม่มีอังกฤษ"}</div>}
                            {(() => {
                              const c = fitCheck(it, pick?.size);
                              const dims = c.t ? `${c.t.w}×${c.t.h}×${c.t.d}` : "";
                              const tone = c.kind === "roomy" ? "text-emerald-700" : c.kind === "snug" ? "text-amber-700" : c.kind === "no" ? "text-rose-600" : "text-slate-400";
                              const mark = c.kind === "roomy" ? t("✓ ใส่ได้", "✓ Fits") : c.kind === "snug" ? t("≈ พอดี", "≈ Snug") : c.kind === "no" ? t("⚠️ ไม่พอ", "⚠️ Too big") : c.kind === "nosize" ? t("ไม่มีขนาด", "No size") : "";
                              return (
                                <div className={`truncate text-[9.5px] leading-tight ${tone}`} data-fit-check={c.kind} title={c.kind === "nosize" ? t("ใส่ขนาดของที่ ✏️ เพื่อให้ระบบตรวจว่าใส่ได้ไหม", "Add the item's size (✏️) so the system can check") : `${pick?.size ? `${pick.size}: ` : ""}${dims} ${t("ซม.", "cm")}${c.t?.estimated ? t(" (ค่าประมาณ)", " (estimate)") : ""}`}>
                                  {mark}{dims ? ` · ${dims}` : ""}
                                </div>
                              );
                            })()}
                          </button>
                          <span className={`pointer-events-none absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] ${pick ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"}`}>{pick ? "✓" : ""}</span>
                          {editBtn("fit", it as unknown as Record<string, unknown>, "absolute right-0.5 top-0.5 bg-white/80 text-[11px]")}
                          {handle && <span className="absolute bottom-0.5 right-0.5 text-[11px]">{handle}</span>}
                          {pick && opts.length > 0 && (
                            <select aria-label={`${t("ขนาด", "Size")} ${nm(it)}`} value={pick.size ?? ""} onChange={(e) => setFits((p) => p.map((x) => (x.id === it.id ? (e.target.value ? { id: it.id, size: e.target.value } : { id: it.id }) : x)))}
                              className="mt-0.5 h-6 w-full rounded border border-slate-200 px-0.5 text-[10.5px]">
                              <option value="">{t("ไม่ระบุขนาด", "No size")}</option>
                              {opts.map((o) => {
                                const oc = fitCheck(it, o);
                                const m = oc.kind === "roomy" ? " ✓" : oc.kind === "snug" ? t(" ≈ พอดี", " ≈ snug") : oc.kind === "no" ? t(" ⚠️ ไม่พอ", " ⚠️ too big") : "";
                                return <option key={o} value={o}>{o}{m}</option>;
                              })}
                            </select>
                          )}
                        </div>
                      );
                    }} />
                  </div>
                  {!fitItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">{t("ไม่พบรายการ", "Nothing found")}</p>}
                  {addBtn("fit", "ของที่ใส่ได้", "item")}
                  {!needle && fitItems.length > 1 && <p className="text-[10.5px] text-slate-400">{t("ลาก ⠿ มุมการ์ดเพื่อจัดลำดับ (ใช้กับทุกสินค้า)", "Drag ⠿ on a card corner to reorder (all products)")}</p>}
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-[12.5px] text-slate-600">
                    <input type="checkbox" checked={useFit} onChange={(e) => setUseFit(e.target.checked)} className="h-4 w-4 accent-orange-500" data-insert-use="fit" />
                    {t(`ใส่บรรทัด "${baseTpl.prefix.fit.th || "ใส่ได้"} …" ลงคำอธิบาย`, `Add a "${baseTpl.prefix.fit.en || "Fits:"} …" line to the description`)}
                  </label>
                </>
              )}
            </div>
          )}
          {!reviewing && !compactMat && (tab === "phrase" || tab === "slot" || tab === "material" || tab === "fit" || tab === "lifestyle") && (
            <a href={`/m/${catalogOf(tab === "slot" ? "slot" : tab)}`} target="_blank" rel="noreferrer" className="block text-right text-[11px] text-slate-400 hover:text-blue-600 hover:underline">
              {t("ดูรายการกลางทั้งหมด (รวมที่ลบไปแล้ว) ↗", "Open the full shared list (incl. deleted) ↗")}
            </a>
          )}
          {/* 🪜 ย้อนกลับ · ข้าม · ถัดไป (ขั้นตรวจ = ปุ่มแทรกด้านล่าง) */}
          {stepMode && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5" data-insert-step-nav>
              {step !== steps[0] && (
                <button type="button" onClick={() => goStep(stepAfter(steps, step, -1))} data-insert-step-back
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="back" /> {t("ย้อนกลับ", "Back")}
                </button>
              )}
              {step !== "review" && (
                <>
                  <button type="button" onClick={skipStep} data-insert-step-skip title={t("ไม่ใส่เรื่องนี้ (ล้างที่เลือกในขั้นนี้)", "Leave this out (clears this step)")}
                    className="ml-auto h-9 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100">{t("ข้ามขั้นนี้", "Skip step")}</button>
                  <button type="button" onClick={nextStep} data-insert-step-next
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-4 text-sm font-medium text-orange-700 hover:bg-orange-100">
                    {t("ถัดไป", "Next")} <span aria-hidden>→</span>
                  </button>
                </>
              )}
              {step === "review" && <span className="ml-auto text-[11.5px] text-slate-500">{t("พร้อมแล้ว กด แทรก ด้านล่าง", "All set — press Insert below")}</span>}
            </div>
          )}
        </div>

        {/* ─── ขวา: ตัวอย่างคำอธิบาย ─── */}
        <div className="min-w-0 space-y-2 rounded-xl bg-slate-50/80 p-2.5 md:sticky md:top-0 md:self-start">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
            <span className="flex-1 font-medium text-slate-700">{t("ตัวอย่างคำอธิบาย", "Description preview")}</span>
            <button type="button" onClick={() => setHide(!hideOld)} title={hideOld ? t("โชว์บรรทัดเดิมทั้งหมด", "Show existing lines") : t("ซ่อนบรรทัดเดิม ดูเฉพาะบรรทัดใหม่", "Hide existing lines, show new ones only")} data-insert-hide
              className={`rounded px-1.5 ${hideOld ? "bg-slate-800 text-white" : "hover:bg-slate-200/60"}`}>{hideOld ? t("🙈 ซ่อนบรรทัดเดิม", "🙈 Existing hidden") : t("👁 บรรทัดเดิม", "👁 Existing lines")}</button>
            {view === "th" && (
              <>
                <button type="button" onClick={() => placeAt(0)} title={t("ย้ายบรรทัดใหม่ทั้งหมดไปบนสุด", "Move all new lines to the top")} className={`rounded px-1.5 ${blockPos === 0 ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>{t("บนสุด", "Top")}</button>
                <button type="button" onClick={() => placeAt(lines.length)} title={t("ย้ายบรรทัดใหม่ทั้งหมดไปท้ายสุด", "Move all new lines to the end")} className={`rounded px-1.5 ${blockPos === lines.length ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>{t("ท้ายสุด", "End")}</button>
              </>
            )}
            {hasEn && (
              <span className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                {(["th", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => { setView(l); setEditing(null); }} data-insert-view={l}
                    className={`px-2 py-0.5 text-[11px] ${view === l ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l === "th" ? t("ไทย", "Thai") : "EN"}</button>
                ))}
              </span>
            )}
          </div>
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 text-[13px] leading-snug" data-detail-insert-preview>
            {view === "th" ? thBody : enBody}
            {!(view === "en" ? enLines : lines).length && !hideOld && <p className="px-2 text-[11.5px] text-slate-400">{view === "en" ? t("คำอธิบายอังกฤษยังว่าง", "English description is empty") : t("คำอธิบายยังว่าง — จะใส่เป็นบรรทัดแรก", "Description is empty — new lines go first")}</p>}
          </div>
          {view === "th" && lines.length + pairs.length > 1 && (
            <p className="text-[11px] text-slate-400">
              {t("ลาก ⠿ สลับได้ทุกบรรทัด", "Drag ⠿ to reorder any line")}{hideOld && lines.length ? t(" (กด 👁 บรรทัดเดิม เพื่อลากบรรทัดเดิมด้วย)", " (press 👁 to move existing lines too)") : ""}
              {picked ? t(" · คลิกบรรทัดสีส้มเพื่อแก้คำเฉพาะรุ่นนี้ (ลบข้อความทั้งหมด = ไม่ใส่บรรทัดนั้น)", " · click an orange line to edit it for this model (empty = leave it out)") : ""}
              {custom && (
                <button type="button" onClick={() => setCustom(null)} className="ml-1 text-slate-500 underline hover:text-slate-800" data-insert-reset-order>{t("↺ คืนลำดับเดิม", "↺ Reset order")}</button>
              )}
            </p>
          )}
          {view === "en" && <p className="text-[11px] text-slate-400">{t("ลำดับฝั่งอังกฤษตามภาษาไทย (บรรทัดไม่เท่ากัน = บรรทัดใหม่ต่อท้าย) · สลับเป็น \"ไทย\" เพื่อลากจัดลำดับ", "English follows the Thai order (different line counts = new lines at the end) · switch to Thai to drag")}</p>}
          {reordered && (
            <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[11.5px] text-sky-800" data-insert-reordered>
              {t(`🔀 จัดลำดับบรรทัดเดิมใหม่ — บันทึกตอนกด "${saveLabel ?? "แทรก"}"`, `🔀 Existing lines reordered — saved when you press "${saveLabel ?? "Insert"}"`)}
              {hasEn && enText.trim() ? (enAligned ? t(" · คำอธิบายอังกฤษสลับตาม", " · English follows") : t(" · คำอธิบายอังกฤษบรรทัดไม่เท่าไทย = คงลำดับเดิม", " · English line count differs = order kept")) : ""}
            </p>
          )}

          {changes.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-800" data-insert-writeback>
              🔄 {t("บันทึกกลับช่องของสินค้าด้วย", "Also saved to the product")}: {changes.join(" · ")}
            </p>
          )}

          {hasEn && (
            <div className="space-y-1 text-xs text-slate-600">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={withEn} onChange={(e) => setWithEn(e.target.checked)} className="h-4 w-4 accent-orange-500" data-insert-with-en />
                <span>{t("ใส่ภาษาอังกฤษในคำอธิบายอังกฤษด้วย", "Also add the English lines to the English description")}</span>
              </label>
              {!enText.trim() && <p className="pl-6 text-slate-400">{t("คำอธิบายอังกฤษยังว่าง — ติ๊กแล้วจะได้แค่บรรทัดใหม่ หรือปล่อยไว้แล้วกด 🌐 แปลทั้งหมด ทีหลัง", "English description is empty — ticked = only the new lines, or press 🌐 Translate all later")}</p>}
              {withEn && out.enMissing > 0 && <p className="pl-6 text-amber-700">{t(`⚠️ ${out.enMissing} บรรทัดยังไม่มีชื่ออังกฤษ — ฝั่งอังกฤษจะข้ามบรรทัดนั้น (กด ✏️ ที่รายการเพื่อใส่ชื่ออังกฤษ)`, `⚠️ ${out.enMissing} lines have no English name — skipped on the English side (use ✏️ to add one)`)}</p>}
              {enAppend && <p className="pl-6 text-slate-400">{t("จำนวนบรรทัดอังกฤษไม่เท่าภาษาไทย — ฝั่งอังกฤษจะต่อท้ายให้", "English line count differs from Thai — new English lines go at the end")}</p>}
              {isEn && picked && <p className="pl-6 text-amber-700" data-insert-thai-check>{t("", "Thai lines come from the shared lists or auto-translation — ask a Thai reader to check before publishing.")}</p>}
            </div>
          )}
        </div>
      </div>

      {copyOpen && copyFrom && (
        <CopyFromDialog cfg={copyFrom} hasEn={hasEn} showEn={showEn} currentTh={thText} onClose={() => setCopyOpen(false)}
          onPick={(picked) => {
            setCopied((p) => [...p, ...picked.filter((x) => !p.some((y) => y.th === x.th))]);
            setCopyOpen(false);
          }} />
      )}
      {editor && (
        <CatalogItemDialog
          kind={editor.kind}
          item={editor.item}
          existing={editor.kind === "material" ? mats : editor.kind === "fit" ? allFits : editor.kind === "slot" ? allSlot : editor.kind === "style" ? styles : editor.kind === "lifestyle" ? styleItems : allPhrase}
          profiles={baseTpl.profiles}
          allIds={(editor.kind === "material" ? mats : editor.kind === "fit" ? allFits : editor.kind === "slot" ? allSlot : editor.kind === "style" ? styles : editor.kind === "lifestyle" ? lifeItems : allPhrase).map((x) => x.id)}
          parentId={curStyle?.id ?? null}
          styles={styles}
          currentProfileId={profile?.id ?? null}
          onProfiles={saveProfiles}
          onClose={() => setEditor(null)}
          onSaved={(id, created) => void onEdited(editor.kind, id, created)}
          onDeleted={(id) => void onDeleted(editor.kind, id)}
        />
      )}
      {matOpen && (
        <MasterRecordDrawer
          moduleKey={MAT}
          recordId={matOpen}
          title="วัสดุ"
          icon="🧵"
          onClose={() => setMatOpen(null)}
          onChanged={() => void reloadMats(true)}
        />
      )}
      {tplOpen && (
        <TemplateDialog
          value={baseTpl}
          catalogs={{ phrase: allPhrase, material: mats, slot: allSlot, fit: allFits, style: styles, lifestyle: lifeItems }}
          categories={categories}
          onClose={() => setTplOpen(false)}
          onSaved={() => {
            setEnBr({});
            void reloadTpl(true);
          }}
        />
      )}
    </ERPModal>
  );
}

/* ─────────── ⚙️ รูปแบบบรรทัดกลาง ─────────── */

const SAMPLE = {
  material: [{ id: "a", name: "ผ้าไนล่อน", name_en: "Nylon" }, { id: "b", name: "หนังวัวแท้", name_en: "Genuine cowhide" }],
  slots: ["ช่องหลัก 2 ช่อง", "ช่องซิป 1 ช่อง", "ช่องใส่บัตร 4 ช่อง"],
  // ตัวอย่างช่องครบ 3 ตำแหน่ง (นอก/ใน/ไม่ระบุ) — ให้เห็นลำดับบรรทัดทุกชนิด
  slotPicks: [
    { item: { id: "so", name: "ช่องซิปด้านหน้า", name_en: "Front zip pocket", kind: "slot", slot_side: "outside" }, n: 1 },
    { item: { id: "si", name: "ช่องใส่บัตร", name_en: "card slot", kind: "slot", slot_side: "inside" }, n: 4 },
    { item: { id: "sn", name: "ช่องใส่ปากกา", name_en: "pen slot", kind: "slot" }, n: 1 },
  ],
};
/** ชื่อแถวในตารางลำดับบรรทัด (ข้อความสำเร็จรูป = ไม่มีคำนำหน้า) */
const ORDER_LABEL = (k: OrderKind) => (k === "phrase" ? "ข้อความ (ติ๊ก)" : k === "lifestyle" ? "Lifestyle / อื่นๆ" : k === "ai" ? "จุดเด่น (AI ดูรูป)" : k === "info" ? "เติมจากข้อมูล (สี/รับประกัน/วิธีดูแล)" : LINE_KIND_LABEL[k]);

type CatalogLists = Record<CatalogKind, { id: string; name: string; name_en?: string | null }[]>;

function TemplateDialog({ value, catalogs, categories, onClose, onSaved }: { value: InsertTemplates; catalogs: CatalogLists; categories: CategoryRow[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<InsertTemplates>(value);
  const [pane, setPane] = useState<"format" | "profiles">("format");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(t) !== JSON.stringify(value);
  const setJoin = (k: keyof InsertTemplates["joiner"], v: string) => setT((p) => ({ ...p, joiner: { ...p.joiner, [k]: v } }));
  const setPre = (k: LineKind, lang: "th" | "en", v: string) => setT((p) => ({ ...p, prefix: { ...p.prefix, [k]: { ...p.prefix[k], [lang]: v } } }));
  // ⠿ ลำดับบรรทัดที่แทรก (ลาก / ↑↓) — ตัวอย่างขวาเรียงตามทันที
  const moveOrder = (from: number, to: number) => setT((p) => (to < 0 || to >= p.order.length ? p : { ...p, order: moveItem(p.order, from, to) }));
  const orderChanged = JSON.stringify(t.order) !== JSON.stringify(DEFAULT_LINE_ORDER);
  const ex = composeLines(
    {
      phrases: [{ id: "p", name: "ผลิตในประเทศไทย", name_en: "Made in Thailand" }],
      materials: SAMPLE.material,
      slots: SAMPLE.slotPicks,
      size: { w: 30, h: 20, d: 10 },
      weight: 450,
      handle: 12,
      strap: { min: 100, max: 120 },
      fits: [{ th: "แท็บเล็ต", en: "Tablet", size: "11 นิ้ว" }, { th: "เอกสาร A4", en: "A4 documents" }],
      lifestyle: [{ th: "อินสไปร์จากยุค 2000s สไตล์สาวแซ่บ", en: "Inspired by bold 2000s looks" }],
    },
    t
  );
  const slotEx = { th: joinList(SAMPLE.slots, "th", t), en: joinList(["2 main compartments", "1 zip pocket", "4 card slots"], "en", t) };

  const save = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/detail-insert/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || (r.status === 403 ? "ไม่มีสิทธิ์แก้รูปแบบบรรทัด" : "บันทึกไม่สำเร็จ"));
      toast.success("บันทึกรูปแบบบรรทัดแล้ว — ใช้กับทุกสินค้า");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const inp = "h-8 w-full rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  const shown = (s: string) => s.replace(/ /g, "␣");
  return (
    <ERPModal
      open
      onClose={onClose}
      size="xl"
      defaultExpanded={false}
      hasUnsavedChanges={dirty}
      title="⚙️ รูปแบบบรรทัด · ชุดรายการ"
      description="ตั้งครั้งเดียว ใช้กับทุกสินค้า ทุกคน (มีประวัติว่าใครแก้) · บรรทัดที่แทรกไปแล้วไม่เปลี่ยนตาม"
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setT(DEFAULT_INSERT_TEMPLATES)} className="h-9 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100">คืนค่าเริ่มต้น</button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} data-tpl-save
            className="h-9 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      }
    >
      <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-slate-200 text-[12.5px]">
        {([["format", "✍️ รูปแบบบรรทัด"], ["profiles", "🗂 ชุดตามประเภทสินค้า"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPane(k)} data-tpl-pane={k}
            className={`px-3 py-1.5 ${pane === k ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}{k === "profiles" && t.profiles.length ? ` (${t.profiles.length})` : ""}</button>
        ))}
      </div>
      {pane === "profiles" ? (
        <ProfilesEditor profiles={t.profiles} onChange={(profiles) => setT((p) => ({ ...p, profiles }))} catalogs={catalogs} categories={categories} />
      ) : (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]" data-tpl-dialog>
        <div className="space-y-4">
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold text-slate-600">คำเชื่อมเมื่อมีหลายรายการ</h4>
            <p className="text-[11px] text-slate-400">2 รายการ = A<b>[คำเชื่อมสุดท้าย]</b>B · 3 รายการขึ้นไป = A<b>[ตัวคั่น]</b>B<b>[คำเชื่อมสุดท้าย]</b>C · เว้นวรรคหน้า/หลังได้ (␣ = เว้นวรรค)</p>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 text-[12px] text-slate-500">
              <span />
              <span>ไทย</span>
              <span>อังกฤษ</span>
              <span>ตัวคั่น</span>
              <input value={t.joiner.sep} onChange={(e) => setJoin("sep", e.target.value)} className={inp} aria-label="ตัวคั่นไทย" />
              <input value={t.joiner.sep_en} onChange={(e) => setJoin("sep_en", e.target.value)} className={inp} aria-label="ตัวคั่นอังกฤษ" />
              <span>คำสุดท้าย</span>
              <input value={t.joiner.last} onChange={(e) => setJoin("last", e.target.value)} className={inp} aria-label="คำเชื่อมสุดท้ายไทย" />
              <input value={t.joiner.last_en} onChange={(e) => setJoin("last_en", e.target.value)} className={inp} aria-label="คำเชื่อมสุดท้ายอังกฤษ" />
            </div>
            <p className="text-[11px] text-slate-400">ตอนนี้: ตัวคั่น &quot;{shown(t.joiner.sep)}&quot; · คำสุดท้าย &quot;{shown(t.joiner.last)}&quot;</p>
          </section>

          <section className="space-y-1">
            <h4 className="text-xs font-semibold text-slate-600">ใส่ชื่ออังกฤษในวงเล็บ (บรรทัดไทย) — ค่าเริ่ม</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-slate-600">
              {(["phrase", "material", "slot", "fit"] as BracketKind[]).map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={t.enInBrackets[k]} onChange={(e) => setT((p) => ({ ...p, enInBrackets: { ...p.enInBrackets, [k]: e.target.checked } }))} className="h-4 w-4 accent-orange-500" />
                  {k === "phrase" ? "ข้อความ" : LINE_KIND_LABEL[k]}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">ในป๊อปแทรกยังกดเปิด/ปิดเฉพาะรอบนั้นได้</p>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-600">ลำดับบรรทัด + คำนำหน้า <span className="font-normal text-slate-400">(ลาก ⠿ หรือ ↑↓ = เรียงบรรทัดที่แทรก · เว้นว่าง = ไม่มีคำนำหน้า)</span></h4>
              {orderChanged && <button type="button" onClick={() => setT((p) => ({ ...p, order: DEFAULT_LINE_ORDER }))} className="ml-auto shrink-0 text-[11px] text-slate-500 hover:text-orange-600 hover:underline" data-order-reset>↺ ลำดับเดิม</button>}
            </div>
            <div className="space-y-1 text-[12px] text-slate-500" data-line-order>
              <SortList items={t.order.map((k) => ({ id: k }))} onMove={moveOrder} render={(it, handle) => {
                const k = it.id as OrderKind;
                const i = t.order.indexOf(k);
                return (
                  <div className="grid grid-cols-[1rem_5.2rem_minmax(0,1fr)_minmax(0,1fr)_2.6rem] items-center gap-1.5" data-order-row={k}>
                    <span className="flex justify-center">{handle}</span>
                    <span className="truncate" title={ORDER_LABEL(k)}><span className="mr-1 text-[10px] text-slate-400">{i + 1}.</span>{ORDER_LABEL(k)}</span>
                    {k === "phrase" || k === "lifestyle" || k === "ai" || k === "info" ? (
                      <span className="col-span-2 px-1 text-[11px] text-slate-400">{k === "lifestyle" ? "บรรทัดละข้อ (ไม่มีคำนำหน้า) — ข้อความของสไตล์ + พิมพ์เอง" : k === "ai" ? "บรรทัดละข้อ (ไม่มีคำนำหน้า) — จุดเด่นที่ติ๊กจาก AI ดูรูป" : k === "info" ? "บรรทัดละข้อ (ไม่มีคำนำหน้า) — สี / รับประกัน / วิธีดูแล จากข้อมูลสินค้า" : "บรรทัดละข้อ (ไม่มีคำนำหน้า) — เรียงตามลำดับที่กด"}</span>
                    ) : (
                      <>
                        <input value={t.prefix[k].th} onChange={(e) => setPre(k, "th", e.target.value)} placeholder="(ไม่มี)" className={inp} aria-label={`คำนำหน้า ${LINE_KIND_LABEL[k]} ไทย`} />
                        <input value={t.prefix[k].en} onChange={(e) => setPre(k, "en", e.target.value)} placeholder="(none)" className={inp} aria-label={`คำนำหน้า ${LINE_KIND_LABEL[k]} อังกฤษ`} />
                      </>
                    )}
                    <span className="flex">
                      <button type="button" disabled={i === 0} onClick={() => moveOrder(i, i - 1)} title="เลื่อนขึ้น" aria-label={`เลื่อน ${ORDER_LABEL(k)} ขึ้น`} className="h-6 w-5 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-25">↑</button>
                      <button type="button" disabled={i === t.order.length - 1} onClick={() => moveOrder(i, i + 1)} title="เลื่อนลง" aria-label={`เลื่อน ${ORDER_LABEL(k)} ลง`} className="h-6 w-5 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-25">↓</button>
                    </span>
                  </div>
                );
              }} />
            </div>
          </section>
        </div>

        <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 text-[12.5px] md:self-start" data-tpl-example>
          <h4 className="text-xs font-semibold text-slate-600">ตัวอย่าง</h4>
          <div className="space-y-0.5 text-slate-700" data-tpl-example-th>
            {ex.th.map((l) => <div key={l}>{l}</div>)}
          </div>
          <div className="space-y-0.5 border-t border-slate-200 pt-2 text-slate-500">
            {ex.en.map((l) => <div key={l}>{l}</div>)}
          </div>
          <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-400">คำเชื่อม 3 รายการ: {slotEx.th} · {slotEx.en}</p>
        </div>
      </div>
      )}
    </ERPModal>
  );
}

/* ─────────── 🗂 ชุดรายการตามประเภทสินค้า ─────────── */

const KIND_TITLE: Record<CatalogKind, string> = { phrase: "📝 ข้อความ", material: "🧵 วัสดุ", slot: "🔢 ช่อง", fit: "🎒 ใส่อะไรได้", style: "🌿 สไตล์", lifestyle: "🌿 Lifestyle" };

function ProfilesEditor({ profiles, onChange, catalogs, categories }: { profiles: InsertProfile[]; onChange: (p: InsertProfile[]) => void; catalogs: CatalogLists; categories: CategoryRow[] }) {
  const [selId, setSelId] = useState<string | null>(profiles[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [catQ, setCatQ] = useState("");
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sel = profiles.find((p) => p.id === selId) ?? null;
  const update = (id: string, patch: Partial<InsertProfile>) => onChange(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const id = `p${Date.now().toString(36)}`;
    onChange([...profiles, { id, name, categoryIds: [], tabs: null, items: {}, sizeFields: null }]);
    setSelId(id);
    setNewName("");
  };
  /** ติ๊ก/เอาติ๊กออก ในลิสต์ที่ null = ทั้งหมด → ครบทุกตัว = กลับเป็น null */
  const toggleIn = (list: string[] | null | undefined, all: string[], v: string): string[] | null => {
    const cur = list ?? all;
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return all.every((x) => next.includes(x)) ? null : next;
  };
  const cats = categories
    .map((c) => ({ id: c.id, path: categoryPath(c.id, byId) }))
    .filter((c) => !catQ.trim() || c.path.toLowerCase().includes(catQ.trim().toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path, "th"));
  const tabLabel = (k: string) => TABS.find((x) => x.key === k)?.label ?? k;

  return (
    <div className="space-y-4" data-profiles-editor>
      <p className="text-[12px] text-slate-500">
        ชุดรายการ = กำหนดว่าสินค้าแต่ละประเภทเห็นแท็บ/รายการอะไรในป๊อปแทรก · ผูกกับหมวดสินค้า (หมวดย่อยข้างใต้ได้ชุดเดียวกัน) · สินค้าที่ไม่ตรงชุดไหน = เห็นทั้งหมด
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {profiles.map((p) => (
          <button key={p.id} type="button" onClick={() => setSelId(p.id)} data-profile-chip={p.id}
            className={`h-8 rounded-full border px-3 text-[12.5px] ${selId === p.id ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {p.name} <span className="text-[11px] text-slate-400">· {p.categoryIds.length} หมวด</span>
          </button>
        ))}
        <span className="flex items-center gap-1">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อชุดใหม่ เช่น กระเป๋าสตางค์" maxLength={40} aria-label="ชื่อชุดใหม่"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            className="h-8 w-44 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <button type="button" onClick={add} disabled={!newName.trim()} data-profile-add className="h-8 rounded-md bg-slate-800 px-2.5 text-xs text-white disabled:opacity-40">＋ เพิ่มชุด</button>
        </span>
      </div>

      {sel && (
        <div className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value.slice(0, 40) })} aria-label="ชื่อชุด"
                className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <button type="button" onClick={() => { onChange(profiles.filter((p) => p.id !== sel.id)); setSelId(profiles.find((p) => p.id !== sel.id)?.id ?? null); }}
                className="h-8 rounded-md px-2 text-xs text-rose-600 hover:bg-rose-50" data-profile-delete>🗑 ลบชุด</button>
            </div>
            <div>
              <h5 className="mb-1 text-xs font-semibold text-slate-600">แท็บที่โชว์</h5>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-slate-600">
                {INSERT_TABS.map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={!sel.tabs || sel.tabs.includes(k)} onChange={() => update(sel.id, { tabs: toggleIn(sel.tabs, INSERT_TABS, k) as InsertProfile["tabs"] })} className="h-4 w-4 accent-orange-500" />
                    {tabLabel(k)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h5 className="mb-1 text-xs font-semibold text-slate-600">ช่องในแท็บขนาด</h5>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-slate-600">
                {NUM_FIELDS.map((f) => (
                  <label key={f.k} className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={!sel.sizeFields || sel.sizeFields.includes(f.k)} onChange={() => update(sel.id, { sizeFields: toggleIn(sel.sizeFields, NUM_FIELDS.map((x) => x.k), f.k) })} className="h-4 w-4 accent-orange-500" />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h5 className="mb-1 text-xs font-semibold text-slate-600">ใช้กับหมวดสินค้า <span className="font-normal text-slate-400">({sel.categoryIds.length} หมวด · หมวดชื่อซ้ำ ติ๊กได้ทุกอัน)</span></h5>
            <div className="mb-1 flex flex-wrap gap-1">
              {sel.categoryIds.map((cid) => (
                <span key={cid} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700">
                  {categoryPath(cid, byId) || cid}
                  <button type="button" onClick={() => update(sel.id, { categoryIds: sel.categoryIds.filter((x) => x !== cid) })} aria-label="เอาหมวดออก" className="text-orange-400 hover:text-orange-700">✕</button>
                </span>
              ))}
            </div>
            <input value={catQ} onChange={(e) => setCatQ(e.target.value)} placeholder="ค้นหาหมวด…" aria-label="ค้นหาหมวด"
              className="mb-1 h-8 w-full rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-slate-100 p-1">
              {cats.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[12px] text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" checked={sel.categoryIds.includes(c.id)} onChange={() => update(sel.id, { categoryIds: sel.categoryIds.includes(c.id) ? sel.categoryIds.filter((x) => x !== c.id) : [...sel.categoryIds, c.id] })} className="h-3.5 w-3.5 accent-orange-500" />
                  {c.path}
                </label>
              ))}
              {!cats.length && <p className="px-1 text-[11px] text-slate-400">ไม่พบหมวด</p>}
            </div>
          </div>
        </div>
      )}

      {profiles.length > 0 && (
        <div>
          <h5 className="mb-1 text-xs font-semibold text-slate-600">รายการในแต่ละชุด <span className="font-normal text-slate-400">(ติ๊ก = โชว์ในชุดนั้น · &quot;ทุกรายการ&quot; = รายการเพิ่มใหม่โชว์อัตโนมัติ)</span></h5>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-200" data-profile-matrix>
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">รายการ</th>
                  {profiles.map((p) => <th key={p.id} className="px-2 py-1 text-center font-medium">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {(["phrase", "material", "slot", "fit"] as CatalogKind[]).map((k) => {
                  const all = catalogs[k].map((x) => x.id);
                  return (
                    <Fragment key={k}>
                      <tr className="border-t border-slate-200 bg-slate-50/60">
                        <td className="px-2 py-1 font-semibold text-slate-600">{KIND_TITLE[k]}</td>
                        {profiles.map((p) => (
                          <td key={p.id} className="px-2 py-1 text-center">
                            <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-500">
                              <input type="checkbox" checked={!p.items[k]} onChange={(e) => update(p.id, { items: { ...p.items, [k]: e.target.checked ? null : [...all] } })} className="h-3.5 w-3.5 accent-orange-500" />
                              ทุกรายการ
                            </label>
                          </td>
                        ))}
                      </tr>
                      {catalogs[k].map((it) => (
                        <tr key={it.id} className="border-t border-slate-100">
                          <td className="px-2 py-0.5 text-slate-700">{it.name}</td>
                          {profiles.map((p) => (
                            <td key={p.id} className="px-2 py-0.5 text-center">
                              <input type="checkbox" checked={profileAllows(p, k, it.id)} onChange={() => update(p.id, { items: { ...p.items, [k]: toggleIn(p.items[k], all, it.id) } })} aria-label={`${p.name}: ${it.name}`} className="h-3.5 w-3.5 accent-orange-500" />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── ⧉ คัดลอกจากรุ่นอื่น ─────────── */

type CopyFromCfg = { api: string; fieldKey: string; enFieldKey: string | null; currentId: string | null };

/** เลือกรุ่น → อ่านคำอธิบาย (ไทย + อังกฤษ) ของรุ่นนั้น → ติ๊กบรรทัด → ใส่ลงตัวอย่าง (ยังไม่บันทึกจนกด แทรก) */
function CopyFromDialog({ cfg, hasEn, showEn, currentTh, onClose, onPick }: {
  cfg: CopyFromCfg; hasEn: boolean; showEn: boolean; currentTh: string;
  onClose: () => void; onPick: (lines: { th: string; en: string | null }[]) => void;
}) {
  const [src, setSrc] = useState<ParentSkuPickerValue | null>(null);
  const [rows, setRows] = useState<{ th: string; en: string | null; has: boolean }[] | null>(null);
  const [enLoose, setEnLoose] = useState<string[]>([]);   // อังกฤษบรรทัดไม่เท่าไทย = จับคู่ไม่ได้ (โชว์ให้ดูอย่างเดียว)
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mine = useMemo(() => new Set(splitLines(currentTh).map((l) => l.trim())), [currentTh]);
  const load = async (v: ParentSkuPickerValue | null) => {
    setSrc(v); setRows(null); setErr(null); setPick(new Set()); setEnLoose([]);
    if (!v) return;
    if (cfg.currentId && v.id === cfg.currentId) { setErr("นี่คือรุ่นที่เปิดอยู่ — เลือกรุ่นอื่น"); return; }
    setLoading(true);
    try {
      const j = await apiFetch(`${cfg.api}/${encodeURIComponent(v.id)}`).then((r) => r.json());
      const rec = (j?.data ?? {}) as Record<string, unknown>;
      const th = splitLines(String(rec[cfg.fieldKey] ?? ""));
      const en = cfg.enFieldKey ? splitLines(String(rec[cfg.enFieldKey] ?? "")) : [];
      const paired = en.length === th.length;
      const list = th.map((t, i) => ({ th: t, en: paired ? en[i] ?? null : null, has: mine.has(t.trim()) }));
      setRows(list);
      setEnLoose(paired ? [] : en);
      setPick(new Set(list.flatMap((x, i) => (x.has ? [] : [i]))));
    } catch { setErr("โหลดคำอธิบายของรุ่นนี้ไม่สำเร็จ — ลองใหม่"); }
    finally { setLoading(false); }
  };
  const flip = (i: number) => setPick((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const chosen = (rows ?? []).filter((_, i) => pick.has(i));
  return (
    <ERPModal open onClose={onClose} size="md" defaultExpanded={false} title="⧉ คัดลอกจากรุ่นอื่น"
      description="เลือกรุ่น → ติ๊กบรรทัดที่ต้องการ → ใส่ลงตัวอย่าง (ยังไม่บันทึกจนกด แทรก)"
      footer={<div className="flex w-full items-center gap-2">
        <span className="flex-1 text-[11.5px] text-slate-500">{rows ? `เลือก ${chosen.length} จาก ${rows.length} บรรทัด` : ""}</span>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => onPick(chosen.map(({ th, en }) => ({ th, en })))} disabled={!chosen.length} data-copy-apply
          className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">ใส่ {chosen.length} บรรทัด</button>
      </div>}>
      <div className="space-y-2 text-sm" data-copy-dialog>
        <ParentSkuPicker value={src} onChange={(v) => void load(v)} disableCreate placeholder="ค้นหารุ่น (รหัส / ชื่อ)…" />
        {err && <p className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">⚠ {err}</p>}
        {loading && <div className="space-y-1.5" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-md bg-slate-100" />)}</div>}
        {rows && !loading && (rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">รุ่นนี้ยังไม่มีคำอธิบาย</p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-[11.5px] text-slate-500">
              <button type="button" onClick={() => setPick(new Set(rows.map((_, i) => i)))} className="hover:text-orange-600 hover:underline">เลือกทั้งหมด</button>
              <button type="button" onClick={() => setPick(new Set())} className="hover:text-orange-600 hover:underline">ไม่เลือก</button>
              {hasEn && cfg.enFieldKey && <span className="ml-auto">{enLoose.length ? "อังกฤษบรรทัดไม่ตรงกับไทย — คัดลอกเฉพาะไทย" : "อังกฤษคัดลอกคู่กันให้"}</span>}
            </div>
            <div className="max-h-80 space-y-1 overflow-auto pr-1">
              {rows.map((r, i) => (
                <label key={i} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${pick.has(i) ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`} data-copy-row={i}>
                  <input type="checkbox" checked={pick.has(i)} onChange={() => flip(i)} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-slate-700">{r.th}</span>
                    {showEn && r.en && <span className="block truncate text-[11px] leading-snug text-slate-400">{r.en}</span>}
                  </span>
                  {r.has && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10.5px] text-slate-500">มีแล้ว</span>}
                </label>
              ))}
            </div>
          </>
        ))}
      </div>
    </ERPModal>
  );
}

/** ชื่อในรายการ: ไทยบน · อังกฤษตัวเล็กข้างล่าง (เจ้าของ 2026-10-19 "จะได้ดูสวย") */
function NameTwoLines({ th, en, on, showEn = true, noEnText = "ไม่มีอังกฤษ" }: { th: string; en?: string | null; on: boolean; showEn?: boolean; noEnText?: string }) {
  return (
    <span className="min-w-0 flex-1" title={!showEn && en ? en : undefined}>
      <span className={`block text-sm leading-snug ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{th}</span>
      {showEn && <span className={`block truncate text-[11px] leading-snug ${en ? "text-slate-400" : "text-slate-300"}`} title={en ?? ""}>{en || noEnText}</span>}
    </span>
  );
}

/** 🪜 ขั้น "ตรวจแล้วแทรก" — สรุปทีละขั้น (บรรทัดที่จะได้ / ข้าม / ยังไม่ได้เลือก) · กด "แก้" กลับไปขั้นนั้น */
function ReviewSummary({
  steps,
  skipped,
  t,
  label,
  summary,
  onEdit,
  changes,
}: {
  steps: InsertStep[];
  skipped: InsertStep[];
  t: (th: string, en: string) => string;
  label: (s: InsertStep) => string;
  summary: (s: InsertStep) => string[];
  onEdit: (s: InsertStep) => void;
  changes: string[];
}) {
  return (
    <div className="space-y-1.5" data-insert-review>
      {steps.map((s, i) => {
        const got = summary(s);
        const skip = skipped.includes(s) && !got.length;
        return (
          <div key={s} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2" data-insert-review-step={s}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${got.length ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-400"}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-slate-700">{label(s)}</div>
              {got.length ? (
                got.map((l, k) => <div key={k} className="text-[12px] leading-snug text-slate-600">- {l}</div>)
              ) : (
                <div className="text-[11.5px] text-slate-400">{skip ? t("ข้าม — ไม่ใส่เรื่องนี้", "Skipped — left out") : t("ยังไม่ได้เลือก", "Nothing picked")}</div>
              )}
            </div>
            <button type="button" onClick={() => onEdit(s)} className="shrink-0 rounded-md px-2 py-0.5 text-[11.5px] text-orange-600 hover:bg-orange-50" data-insert-review-edit={s}>{t("แก้", "Edit")}</button>
          </div>
        );
      })}
      {changes.length > 0 && <p className="text-[11.5px] text-amber-700">🔄 {t("บันทึกกลับช่องของสินค้าด้วย", "Also saved to the product")}: {changes.join(" · ")}</p>}
    </div>
  );
}

/** เลขลำดับที่กด (บรรทัดที่แทรกเรียงตามเลขนี้) */
function ClickOrder({ n }: { n: number }) {
  return <span title={`กดเป็นลำดับที่ ${n} — บรรทัดเรียงตามลำดับที่กด`} data-click-order={n} className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold leading-none text-white">{n}</span>;
}

/* ─────────── ⠿ ลิสต์ลากจัดลำดับ (ใช้ของกลาง useDragReorder) ─────────── */

function SortList<T extends { id: string }>({
  items,
  render,
  onMove,
  disabled,
  header,
}: {
  items: T[];
  render: (item: T, handle: React.ReactNode) => React.ReactNode;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  header?: (item: T, i: number, all: T[]) => React.ReactNode;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onMove);
  return (
    <>
      {items.map((it, i) => (
        <Fragment key={it.id}>
          {header?.(it, i, items)}
          <div {...rowProps(i)} className={`rounded-lg ${rowCls(i)}`}>
            {render(it, disabled || items.length < 2 ? null : <DragHandle {...handleProps(i)} title="ลากเพื่อจัดลำดับ (ใช้กับทุกสินค้า)" />)}
          </div>
        </Fragment>
      ))}
    </>
  );
}

/* ─────────── ✏️ ป๊อปแก้/เพิ่ม/ลบ รายการกลาง ─────────── */

const KIND_LABEL: Record<CatalogKind, string> = { phrase: "ข้อความสำเร็จรูป", slot: "ช่อง", material: "วัสดุ", fit: "ของที่ใส่ได้", style: "สไตล์", lifestyle: "ข้อความ Lifestyle" };
const PLACEHOLDER: Record<CatalogKind, { th: string; en: string }> = {
  phrase: { th: "เช่น ผลิตในประเทศไทย", en: "Made in Thailand" },
  slot: { th: "เช่น ช่องใส่บัตรเครดิต", en: "card slot" },
  material: { th: "เช่น หนังวัวแท้", en: "Genuine cowhide" },
  fit: { th: "เช่น iPad", en: "iPad" },
  style: { th: "เช่น Y2K", en: "Y2K" },
  lifestyle: { th: "เช่น อินสไปร์จากยุค 2000s สไตล์สาวแซ่บ", en: "Inspired by bold 2000s looks" },
};

function CatalogItemDialog({
  kind,
  item,
  existing,
  profiles,
  allIds,
  currentProfileId,
  onProfiles,
  onClose,
  onSaved,
  onDeleted,
  parentId,
  styles,
}: {
  kind: CatalogKind;
  item: Record<string, unknown> | null;
  existing: { id: string; name: string }[];
  profiles: InsertProfile[];
  allIds: string[];
  currentProfileId: string | null;
  onProfiles: (next: InsertProfile[]) => Promise<boolean>;
  onClose: () => void;
  onSaved: (id: string, created: boolean) => void;
  onDeleted: (id: string) => void;
  /** 🌿 ข้อความ Lifestyle ใหม่ → ใส่ในสไตล์นี้ */
  parentId?: string | null;
  styles?: { id: string; name: string }[];
}) {
  const toast = useToast();
  const s = (k: string) => String(item?.[k] ?? "");
  const styleInit = String(item?.parent_id ?? parentId ?? "");
  const [styleSel, setStyleSel] = useState(styleInit);
  const [name, setName] = useState(s("name"));
  const [nameEn, setNameEn] = useState(s("name_en"));
  const [tpl, setTpl] = useState(s("template"));
  const [tplEn, setTplEn] = useState(s("template_en"));
  const [sizes, setSizes] = useState(s("sizes"));
  const [imageKey, setImageKey] = useState(s("image_key"));
  const [dimW, setDimW] = useState(s("width_cm"));
  const [dimH, setDimH] = useState(s("height_cm"));
  const [dimD, setDimD] = useState(s("depth_cm"));
  const [soft, setSoft] = useState(item?.is_soft === true);
  // 📐 ขนาดของต่อตัวเลือกขนาด (size_dims) — เช่น สมาร์ทโฟน ถึง 6.1 / 6.7 นิ้ว ยาวไม่เท่ากัน
  type DimStr = { w: string; h: string; d: string };
  const sdInit = useMemo<Record<string, DimStr>>(
    () => Object.fromEntries(Object.entries(parseSizeDims(item?.size_dims)).map(([k, v]) => [k, { w: String(v.w), h: String(v.h), d: String(v.d) }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [sizeDims, setSizeDims] = useState<Record<string, DimStr>>(sdInit);
  const sizeList = fitSizeOptions({ sizes });
  const sdDirty = JSON.stringify(sizeDims) !== JSON.stringify(sdInit);
  const dimNum = (v: string | undefined) => (Number(v) > 0 ? Math.round(Number(v) * 10) / 10 : null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [side, setSide] = useState(s("slot_side"));
  // 📝 ข้อความหลายแบบ: ข้อความเดียว / Dropdown หลายแบบ / ติ๊กสลับ 2 แบบ (lib/phrase-variants)
  type VRow = { label: string; th: string; en: string };
  const vInit = useMemo(() => parseVariants(item?.variant_mode, item?.variants), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const vRowsInit = useMemo<VRow[]>(
    () => (vInit ? vInit.variants.map((x) => ({ label: x.label, th: x.th, en: x.en ?? "" })) : [{ label: "", th: s("name"), en: s("name_en") }, { label: "", th: "", en: "" }]),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [vMode, setVMode] = useState<"one" | VariantMode>(vInit?.mode ?? "one");
  const [vRows, setVRows] = useState<VRow[]>(vRowsInit);
  const [vTranslating, setVTranslating] = useState<number | null>(null);
  const vDirty = vMode !== (vInit?.mode ?? "one") || (vMode !== "one" && JSON.stringify(vRows) !== JSON.stringify(vRowsInit));
  const setVRow = (i: number, patch: Partial<VRow>) => setVRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const translateRow = async (i: number) => {
    const th = vRows[i]?.th.trim();
    if (!th) { toast.warning("พิมพ์ประโยคไทยก่อน"); return; }
    setVTranslating(i);
    try { const [en] = await translateContent([th], "en", { place: "product" }); if (en) setVRow(i, { en }); else toast.warning("แปลไม่ได้ — พิมพ์เองได้เลย"); }
    catch { toast.error("แปลไม่สำเร็จ — พิมพ์เองได้เลย"); }
    finally { setVTranslating(null); }
  };
  const fileRef = useRef<HTMLInputElement | null>(null);
  const id = item ? String(item.id) : "";
  const catalog = catalogOf(kind);
  // ใช้กับชุด: ของเดิม = ชุดที่โชว์รายการนี้อยู่ · ของใหม่ = ชุด "ทุกรายการ" + ชุดที่เปิดอยู่
  const inInit = useMemo(
    () => profiles.filter((p) => (item ? profileAllows(p, kind, id) : !p.items[kind] || p.id === currentProfileId)).map((p) => p.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [inProfiles, setInProfiles] = useState<string[]>(inInit);
  const profilesDirty = JSON.stringify([...inProfiles].sort()) !== JSON.stringify([...inInit].sort());
  const dirty = name !== s("name") || nameEn !== s("name_en") || tpl !== s("template") || tplEn !== s("template_en") || sizes !== s("sizes") || imageKey !== s("image_key") || side !== s("slot_side") || profilesDirty || dimW !== s("width_cm") || dimH !== s("height_cm") || dimD !== s("depth_cm") || soft !== (item?.is_soft === true) || sdDirty || vDirty || (kind === "lifestyle" && styleSel !== styleInit);

  const translate = async () => {
    if (!name.trim()) {
      toast.warning("พิมพ์ชื่อไทยก่อน");
      return;
    }
    setTranslating(true);
    try {
      const [en] = await translateContent([name.trim()], "en", { place: "product" });
      if (en) setNameEn(en);
      else toast.warning("แปลไม่ได้ — พิมพ์เองได้เลย");
    } catch {
      toast.error("แปลไม่สำเร็จ — พิมพ์เองได้เลย");
    } finally {
      setTranslating(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.warning("เลือกไฟล์รูปเท่านั้น");
      return;
    }
    setUploading(true);
    try {
      // รูปที่มีในคลังแล้ว → ถาม "ใช้รูปเดิม / อัปโหลดใหม่" ก่อนส่ง (ของกลาง uploadImagesWithDupCheck)
      const r = await uploadImagesWithDupCheck([file], {
        folder: "fit-items", max: 600,
        target: name.trim() ? `รูป ${name.trim()}` : "รูปของรายการนี้",
        existingKeys: imageKey ? [imageKey] : [],
        onError: (_, e) => toast.error(e.message || "อัปโหลดรูปไม่สำเร็จ"),
      });
      const key = r?.keys[0];
      if (key) setImageKey(key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const n = name.trim();
    if (!n) {
      toast.warning("กรอกชื่อภาษาไทย");
      return;
    }
    if (existing.some((x) => x.id !== id && x.name.trim().toLowerCase() === n.toLowerCase())) {
      toast.warning(`มี "${n}" อยู่แล้ว — เลือกในรายการได้เลย`);
      return;
    }
    const body: Record<string, unknown> = { name: n, name_en: nameEn.trim() || null };
    if (kind === "slot") Object.assign(body, { template: tpl.trim() || null, template_en: tplEn.trim() || null, slot_side: side || null });
    if (kind === "lifestyle") {
      if (!styleSel) { toast.warning("เลือกสไตล์ก่อน"); return; }
      body.parent_id = styleSel;
    }
    if (kind === "phrase") {
      if (vMode === "one") Object.assign(body, { variant_mode: null, variants: null });
      else {
        const rows = (vMode === "toggle" ? vRows.slice(0, 2) : vRows)
          .map((r, i) => ({ label: vMode === "toggle" && i === 0 ? "" : r.label.trim(), th: r.th.trim(), en: r.en.trim() || null }))
          .filter((r) => r.th);
        const labels = rows.map((r) => r.label).filter(Boolean);
        if (new Set(labels).size !== labels.length) { toast.warning("ชื่อแบบซ้ำกัน — ตั้งชื่อไม่ให้ซ้ำ"); return; }
        if (!parseVariants(vMode, rows)) {
          toast.warning(vMode === "toggle" ? "ใส่ประโยคทั้ง 2 แบบ และชื่อช่องติ๊ก (เช่น ทอลาย)" : "ต้องมีอย่างน้อย 2 แบบ และทุกแบบต้องมีชื่อแบบ + ประโยคไทย");
          return;
        }
        Object.assign(body, { variant_mode: vMode, variants: rows });
      }
    }
    if (kind === "fit") {
      const dimsChanged = dimW !== s("width_cm") || dimH !== s("height_cm") || dimD !== s("depth_cm") || sdDirty;
      // เก็บเฉพาะตัวเลือกที่ยังอยู่ในรายการขนาด + ครบ 3 ด้าน
      const sd = Object.fromEntries(sizeList.flatMap((k) => {
        const v = sizeDims[k];
        const w = dimNum(v?.w), h = dimNum(v?.h), d = dimNum(v?.d);
        return w && h && d ? [[k, { w, h, d }]] : [];
      }));
      Object.assign(body, { sizes: sizes.trim() || null, image_key: imageKey || null, width_cm: dimNum(dimW), height_cm: dimNum(dimH), depth_cm: dimNum(dimD), is_soft: soft, size_dims: Object.keys(sd).length ? sd : null, ...(dimsChanged ? { size_estimated: false } : {}) });
    }
    if (!item) Object.assign(body, { sort_order: 500, is_active: true, ...(kind === "phrase" || kind === "slot" || kind === "style" || kind === "lifestyle" ? { kind } : {}) });
    setBusy(true);
    try {
      const r = await apiFetch(item ? `/api/master-v2/${catalog}/${id}` : `/api/master-v2/${catalog}`, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      const newId = item ? id : String(j.data?.id ?? "");
      // ใช้กับชุด → แก้ชุดรายการ (ชุด "ทุกรายการ" ที่เอาออก = เปลี่ยนเป็นลิสต์ทุกตัวยกเว้นตัวนี้)
      if (newId && (profilesDirty || (!item && inProfiles.length))) {
        const all = allIds.includes(newId) ? allIds : [...allIds, newId];
        const next = profiles.map((p) => {
          const want = inProfiles.includes(p.id);
          const list = p.items[kind];
          if (want) return list && !list.includes(newId) ? { ...p, items: { ...p.items, [kind]: [...list, newId] } } : p;
          return { ...p, items: { ...p.items, [kind]: (list ?? all).filter((x) => x !== newId) } };
        });
        if (JSON.stringify(next) !== JSON.stringify(profiles)) await onProfiles(next);
      }
      toast.success(item ? `แก้ "${n}" แล้ว — ใช้ได้ทุกรุ่น` : `เพิ่ม "${n}" เข้ารายการกลางแล้ว (ใช้ได้ทุกรุ่น)`);
      if (newId) onSaved(newId, !item);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/master-v2/${catalog}/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "ลบไม่สำเร็จ");
      toast.success(`ลบ "${s("name")}" ออกจากรายการแล้ว (กู้คืนได้ที่หน้ารายการกลาง)`);
      onDeleted(id);
      setAskDelete(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const input = "h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  return (
    <>
      <ERPModal
        open
        onClose={onClose}
        size="sm"
        defaultExpanded={false}
        hasUnsavedChanges={dirty}
        title={item ? `แก้${KIND_LABEL[kind]}` : `เพิ่ม${KIND_LABEL[kind]}ใหม่`}
        description="แก้ที่นี่ = แก้รายการกลาง ใช้ได้ทุกรุ่น · ข้อความที่แทรกลงสินค้าไปแล้วไม่เปลี่ยนตาม"
        footer={
          <div className="flex items-center gap-2">
            {item && (
              <button type="button" onClick={() => setAskDelete(true)} disabled={busy} className="h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50">
                🗑 ลบ
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={busy || uploading} data-catalog-save
              className="h-9 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50">
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        }
      >
        <div className="space-y-3" data-catalog-editor={kind}>
          {kind === "fit" && (
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {imageKey ? <img src={imgUrl(imageKey, 200)} alt="" className="h-full w-full object-contain" /> : <span className="text-3xl opacity-40">🎒</span>}
              </div>
              <div className="space-y-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} data-catalog-image />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {uploading ? "กำลังอัปโหลด…" : imageKey ? "🖼 เปลี่ยนรูป" : "🖼 ใส่รูป"}
                </button>
                {imageKey && (
                  <button type="button" onClick={() => setImageKey("")} className="ml-1.5 h-8 rounded-md px-2 text-xs text-slate-500 hover:text-rose-600">เอารูปออก</button>
                )}
                <p className="text-[11px] text-slate-400">รูปช่วยให้เลือกง่าย (ย่ออัตโนมัติ)</p>
              </div>
            </div>
          )}
          {kind === "phrase" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">แบบข้อความ</label>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[12.5px]" data-phrase-mode>
                {([["one", "ข้อความเดียว"], ["select", VARIANT_MODE_LABEL.select], ["toggle", VARIANT_MODE_LABEL.toggle]] as const).map(([m, l], i) => (
                  <button key={m} type="button" onClick={() => setVMode(m)} data-phrase-mode-opt={m}
                    className={`px-3 py-1.5 ${i ? "border-l border-slate-200" : ""} ${vMode === m ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{kind === "phrase" && vMode !== "one" ? "ชื่อหัวข้อ (เช่น ซิป · ผ้าซับใน)" : "ชื่อ (ไทย)"}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus placeholder={PLACEHOLDER[kind].th} className={input} />
          </div>
          {kind === "phrase" && vMode !== "one" && (
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5" data-phrase-variants>
              <p className="text-[11.5px] text-slate-500">{vMode === "select" ? "แต่ละแบบ = ทั้งประโยค · แบบแรก = ค่าเริ่ม" : "ไม่ติ๊ก = ประโยคแรก · ติ๊ก = ประโยคที่ 2"} · อังกฤษว่างได้</p>
              {(vMode === "toggle" ? vRows.slice(0, 2) : vRows).map((r, i) => (
                <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-1.5" data-variant-row={i}>
                  {vMode === "toggle" && i === 0
                    ? <span className="pt-2 text-[12px] text-slate-500">ไม่ติ๊ก</span>
                    : <input value={r.label} onChange={(e) => setVRow(i, { label: e.target.value.slice(0, 40) })} placeholder={vMode === "toggle" ? "ชื่อช่องติ๊ก" : `แบบ ${i + 1}`} aria-label={`ชื่อแบบ ${i + 1}`} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-orange-400" />}
                  <div className="space-y-1">
                    <input value={r.th} onChange={(e) => setVRow(i, { th: e.target.value.slice(0, 300) })} placeholder="ประโยคไทย" aria-label={`ประโยคไทย แบบ ${i + 1}`} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    <div className="flex gap-1">
                      <input value={r.en} onChange={(e) => setVRow(i, { en: e.target.value.slice(0, 300) })} placeholder="ประโยคอังกฤษ" aria-label={`ประโยคอังกฤษ แบบ ${i + 1}`} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                      <button type="button" onClick={() => void translateRow(i)} disabled={vTranslating !== null} className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">{vTranslating === i ? "…" : "🌐"}</button>
                    </div>
                  </div>
                  {vMode === "select" && vRows.length > 2
                    ? <button type="button" onClick={() => setVRows((p) => p.filter((_, j) => j !== i))} title="ลบแบบนี้" aria-label={`ลบแบบ ${i + 1}`} className="h-8 w-7 rounded text-slate-300 hover:bg-rose-50 hover:text-rose-600">✕</button>
                    : <span className="w-7" />}
                </div>
              ))}
              {vMode === "select" && vRows.length < 12 && (
                <button type="button" onClick={() => setVRows((p) => [...p, { label: "", th: "", en: "" }])} className="text-[12px] text-orange-600 hover:underline" data-variant-add>＋ เพิ่มแบบ</button>
              )}
            </div>
          )}
          <div className={kind === "phrase" && vMode !== "one" ? "hidden" : ""}>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่ออังกฤษ <span className="font-normal text-slate-400">(ฝั่งคำอธิบายอังกฤษ / เว็บ /en)</span></label>
            <div className="flex gap-1.5">
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={160} placeholder={PLACEHOLDER[kind].en} className={input} />
              <button type="button" onClick={() => void translate()} disabled={translating} className="h-9 shrink-0 rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {translating ? "กำลังแปล…" : "🌐 แปล"}
              </button>
            </div>
          </div>
          {kind === "slot" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ตำแหน่งช่อง <span className="font-normal text-slate-400">(แยกบรรทัด &quot;ด้านในกระเป๋า:&quot; / &quot;ด้านนอก:&quot;)</span></label>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[12.5px]" data-slot-side>
                {([["inside", "ด้านใน"], ["outside", "ด้านนอก"], ["", "ไม่ระบุ"]] as const).map(([v, l]) => (
                  <button key={v || "none"} type="button" onClick={() => setSide(v)} data-side={v || "none"}
                    className={`px-3 py-1.5 ${side === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {kind === "lifestyle" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">สไตล์</label>
              <select value={styleSel} onChange={(e) => setStyleSel(e.target.value)} aria-label="สไตล์" className={`${input} bg-white`} data-life-style-select>
                <option value="">— เลือกสไตล์ —</option>
                {(styles ?? []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
          )}
          {profiles.length > 0 && kind !== "style" && kind !== "lifestyle" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ใช้กับชุด <span className="font-normal text-slate-400">(โชว์รายการนี้ในป๊อปของสินค้าประเภทไหน)</span></label>
              <div className="flex flex-wrap gap-1" data-item-profiles>
                {profiles.map((p) => {
                  const on = inProfiles.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => setInProfiles((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))} aria-pressed={on}
                      className={`h-7 rounded-full border px-2.5 text-[12px] ${on ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      {on ? "✓ " : ""}{p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {kind === "slot" && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
              <p className="text-[11.5px] text-slate-500">รูปแบบบรรทัด — <code>{"{name}"}</code> = ชื่อ · <code>{"{n}"}</code> = จำนวน · เว้นว่าง = แบบมาตรฐาน</p>
              <input value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder={DEFAULT_SLOT_TEMPLATE} className={input} aria-label="รูปแบบบรรทัดไทย" />
              <input value={tplEn} onChange={(e) => setTplEn(e.target.value)} placeholder={DEFAULT_SLOT_TEMPLATE_EN} className={input} aria-label="รูปแบบบรรทัดอังกฤษ" />
              <p className="text-[11px] text-slate-400">
                ตัวอย่าง 6 ช่อง: {slotText({ id: "x", name: name || "ช่อง", name_en: nameEn, kind: "slot", template: tpl, template_en: tplEn }, 6, "th")}
                {" · "}
                {slotText({ id: "x", name: name || "ช่อง", name_en: nameEn, kind: "slot", template: tpl, template_en: tplEn }, 6, "en") ?? "— (ยังไม่มีอังกฤษ)"}
              </p>
            </div>
          )}
          {kind === "fit" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ขนาดของ (ซม.) <span className="font-normal text-slate-400">— ใช้ตรวจว่าใส่กระเป๋าได้ไหม (เหมือนระบบเทียบขนาด)</span></label>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500" data-fit-dims>
                {([["กว้าง", dimW, setDimW], ["สูง", dimH, setDimH], ["หนา", dimD, setDimD]] as const).map(([l, v, set]) => (
                  <label key={l} className="flex items-center gap-1">
                    {l}
                    <input value={v} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} inputMode="decimal" placeholder="0" aria-label={`${l} (ซม.)`}
                      className="h-8 w-16 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </label>
                ))}
                <label className="ml-1 flex cursor-pointer items-center gap-1">
                  <input type="checkbox" checked={soft} onChange={(e) => setSoft(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                  นุ่ม บีบได้
                </label>
              </div>
              {item?.size_estimated === true && <p className="mt-1 text-[11px] text-amber-700">ขนาดตอนนี้เป็นค่าประมาณ — แก้เป็นขนาดจริงได้เลย</p>}
            </div>
          )}
          {kind === "fit" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ขนาดให้เลือก <span className="font-normal text-slate-400">(คั่นด้วยจุลภาค · ไม่มี = เว้นว่าง)</span></label>
              <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="เช่น 11 นิ้ว, 13 นิ้ว" className={input} />
              {sizeList.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2" data-fit-size-dims>
                  <p className="text-[11.5px] text-slate-500">ขนาดของแต่ละตัวเลือก (ซม.) — ใช้ตรวจตอนเลือกขนาดนั้น · เว้นว่าง = ใช้ขนาดของด้านบน</p>
                  {sizeList.map((k) => {
                    const v = sizeDims[k] ?? { w: "", h: "", d: "" };
                    const set = (f: keyof DimStr, x: string) => setSizeDims((p) => ({ ...p, [k]: { ...v, [f]: x.replace(/[^\d.]/g, "").slice(0, 6) } }));
                    return (
                      <div key={k} className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                        <span className="w-24 truncate font-medium text-slate-700" title={k}>{k}</span>
                        {([["กว้าง", "w"], ["สูง", "h"], ["หนา", "d"]] as const).map(([l, f]) => (
                          <label key={f} className="flex items-center gap-1">
                            {l}
                            <input value={v[f]} onChange={(e) => set(f, e.target.value)} inputMode="decimal" placeholder="0" aria-label={`${k} ${l} (ซม.)`}
                              className="h-7 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {kind === "material" && item && (
            <a href={`/m/${MAT}?open=${id}`} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-600 hover:underline">
              {hasMaterialPage(item as unknown as MaterialRow) ? "แก้หน้าวัสดุ (คำอธิบาย/วิธีดูแล/รูป) ↗" : "เขียนหน้าวัสดุ (คำอธิบาย/วิธีดูแล) → ชื่อวัสดุบนเว็บกดดูได้ ↗"}
            </a>
          )}
        </div>
      </ERPModal>
      <ConfirmDialog
        open={askDelete}
        onClose={() => setAskDelete(false)}
        onConfirm={() => void remove()}
        variant="danger"
        loading={busy}
        title={`ลบ "${s("name")}"?`}
        message={`เอาออกจากรายการให้เลือก (ทุกรุ่น) — ข้อความที่แทรกลงสินค้าไปแล้วยังอยู่ครบ · กู้คืนได้ที่หน้ารายการกลาง`}
        confirmText="ลบออกจากรายการ"
      />
    </>
  );
}
