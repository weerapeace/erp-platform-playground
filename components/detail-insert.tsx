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
 * กฎคิดบรรทัด: lib/detail-snippets.ts · วัสดุ: lib/product-materials.ts · ใส่อะไรได้: lib/product-fits.ts
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useTickCatalog } from "@/components/tick-list-field";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { uploadResizedImage } from "@/components/image-attach";
import { useSWRLite } from "@/lib/swr-lite";
import {
  DEFAULT_INSERT_TEMPLATES,
  DEFAULT_SLOT_TEMPLATE,
  DEFAULT_SLOT_TEMPLATE_EN,
  LINE_KIND_LABEL,
  alreadyMentions,
  arrangeEn,
  arrangeRows,
  arrangeTh,
  composeLines,
  isNewRow,
  isSlot,
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
import { fitSizeOptions, parseFits, type FitItem, type FitPick } from "@/lib/product-fits";
import { translateContent } from "@/lib/content-translate";
import { bestFit, fitTargetOf, parseCompartments, type Compartment } from "@/lib/fit-check";

// กด "🔗 มีหน้า" ที่วัสดุ = เปิดระเบียนวัสดุ (drawer ตัวจริงของหน้า master · แก้คำอธิบาย/วิธีดูแล/รูปได้) — ต้อง dynamic กัน import วนกับ master-crud
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Tab = "phrase" | "material" | "slot" | "size" | "fit";
type CatalogKind = "phrase" | "slot" | "material" | "fit";
type FitRow = FitItem & { kind?: string | null; image_key?: string | null; width_cm?: number | null; height_cm?: number | null; depth_cm?: number | null; is_soft?: boolean | null; size_estimated?: boolean | null };

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

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "phrase", label: "📝 ข้อความ", hint: "ติ๊กได้หลายข้อ — ได้บรรทัดละข้อ" },
  { key: "material", label: "🧵 วัสดุ", hint: "ติ๊กได้หลายตัว — รวมเป็นบรรทัดเดียว · วัสดุที่มีหน้า ลูกค้ากดดูบนเว็บได้" },
  { key: "slot", label: "🔢 ช่อง", hint: "พิมพ์แค่จำนวน — ช่องที่ใส่ตัวเลขรวมเป็นบรรทัดเดียว" },
  { key: "size", label: "📏 ขนาด/น้ำหนัก", hint: "ดึงค่าจากช่องของสินค้ามาให้ · แก้ตรงนี้ = แก้ช่องของสินค้าด้วย" },
  { key: "fit", label: "🎒 ใส่อะไรได้", hint: "กดการ์ดเพื่อเลือก (เลือกขนาดได้) · เลือกตรงนี้ = แก้ช่อง \"ใส่อะไรได้บ้าง\" ของสินค้าด้วย" },
];

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
}) {
  const [open, setOpen] = useState(false);
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
        title="เลือกรายละเอียดสำเร็จรูป / วัสดุ / จำนวนช่อง / ขนาด / ใส่อะไรได้ แล้วแทรกลงคำอธิบายตรงตำแหน่งที่เลือก"
        className="ml-1.5 inline-flex items-center rounded-full border border-orange-300 px-2 py-[1px] align-middle text-[10.5px] font-medium text-orange-600 hover:bg-orange-50"
      >
        ＋ แทรก
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
}: {
  thText: string;
  enText: string;
  hasEn: boolean;
  saveLabel?: string;
  values: Record<string, unknown>;
  writable: string[];
  onApply: (next: DetailInsertResult) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const toast = useToast();
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
  const allPhrase = snips.filter((x) => !isSlot(x));
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
  const slotItems = allSlot.filter((x) => profileAllows(profile, "slot", x.id));
  const visMats = mats.filter((x) => profileAllows(profile, "material", x.id));
  const fitItems = allFits.filter((x) => profileAllows(profile, "fit", x.id));

  const numFields = NUM_FIELDS.filter((f) => writable.includes(f.field) && (!profile?.sizeFields || profile.sizeFields.includes(f.k)));
  const has = (k: NumK) => numFields.some((f) => f.k === k);
  const canFit = writable.includes("fits");
  const tabs = TABS.filter((t) => (t.key === "size" ? numFields.length > 0 : t.key === "fit" ? canFit : true) && (!profile?.tabs || profile.tabs.includes(t.key)));

  const lines = useMemo(() => splitLines(thText), [thText]);
  const enLines = useMemo(() => splitLines(enText), [enText]);
  const [tab, setTab] = useState<Tab>("phrase");
  const [q, setQ] = useState("");
  const [phraseIds, setPhraseIds] = useState<string[]>([]);
  const [matIds, setMatIds] = useState<string[]>([]);
  const [slotN, setSlotN] = useState<Record<string, string>>({});
  const [at, setAt] = useState(lines.length);
  const [withEn, setWithEn] = useState(hasEn && enText.trim() !== "");
  const [view, setView] = useState<"th" | "en">("th");
  const [hideOld, setHideOld] = useState(readHide);
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

  const openTab = (t: Tab) => {
    setTab(t);
    setQ("");
    if (t === "size") setSizeSeen(true);
    if (t === "fit") setFitSeen(true);
  };
  // ชุดที่เลือกไม่มีแท็บที่เปิดอยู่ → ย้ายไปแท็บแรกของชุด
  const tabKeys = tabs.map((t) => t.key).join(",");
  useEffect(() => {
    const keys = tabKeys.split(",").filter(Boolean) as Tab[];
    if (keys.length && !keys.includes(tab)) setTab(keys[0]);
  }, [tabKeys, tab]);

  // 📐 ตรวจซ้ำว่าของใส่ได้จริงไหม (ของกลาง lib/fit-check เหมือนระบบเทียบขนาด) — เทียบช่องด้านในที่วัดไว้ · ยังไม่วัด = เทียบขนาดนอก
  const comps = useMemo(() => parseCompartments(values.compartments), [values.compartments]);
  const outer: Compartment | null = Number(num.w) > 0 && Number(num.h) > 0 && Number(num.d) > 0 ? { id: "outer", name: "ขนาดนอก", w: Number(num.w), h: Number(num.h), d: Number(num.d) } : null;
  const boxes: Compartment[] = comps && comps.length ? comps : outer ? [outer] : [];
  const boxBasis = comps && comps.length ? "inner" : outer ? "outer" : "none";
  const fitCheck = (it: FitRow) => {
    const t = fitTargetOf(it as Parameters<typeof fitTargetOf>[0]);
    if (!t) return { kind: "nosize" as const, t: null };
    if (!boxes.length) return { kind: "nobag" as const, t };
    const r = bestFit(t, boxes);
    return r ? { kind: r.status, t } : { kind: "no" as const, t };
  };
  const badFits = fitItems.filter((it) => fits.some((p) => p.id === it.id) && fitCheck(it).kind === "no");

  // บรรทัดเรียงตามลำดับรายการ (ลาก ⠿ จัดได้) ไม่ใช่ลำดับที่ติ๊ก
  const fitEntries = fitItems
    .map((it) => {
      const p = fits.find((x) => x.id === it.id);
      return p ? { th: it.name, en: it.name_en, size: p.size } : null;
    })
    .filter((x): x is { th: string; en: string | null | undefined; size: string | null | undefined } => !!x);
  const sel = {
    phrases: phraseItems.filter((x) => phraseIds.includes(x.id)),
    materials: visMats.filter((x) => matIds.includes(x.id)),
    slots: slotItems.map((item) => ({ item, n: Math.floor(Number(slotN[item.id])) || 0 })).filter((p) => p.n > 0),
    size: sizeSeen && use.size && has("w") ? { w: num.w, h: num.h, d: num.d } : null,
    weight: sizeSeen && use.weight && has("g") ? num.g : null,
    handle: sizeSeen && use.handle && has("hd") ? num.hd : null,
    strap: sizeSeen && use.strap && (has("s1") || has("s2")) ? { min: num.s1, max: num.s2 } : null,
    fits: fitSeen && useFit ? fitEntries : null,
  };
  const out = composeLines(sel, tpl);
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
    changes.push(`${f.label} ${numOrig[f.k] || "ว่าง"}→${num[f.k] || "ว่าง"}`);
  }
  if (canFit && JSON.stringify(fits) !== JSON.stringify(fitOrig)) {
    fields.fits = fits.length ? fits : null;
    changes.push(`ใส่อะไรได้ (${fits.length} รายการ)`);
  }
  const picked = finalTh.length > 0;
  const dirty = picked || reordered || changes.length > 0;
  const enAppend = withEn && enLines.length > 0 && enLines.length !== lines.length;

  const needle = q.trim().toLowerCase();
  const match = (x: { name: string; name_en?: string | null }) => !needle || `${x.name} ${x.name_en ?? ""}`.toLowerCase().includes(needle);

  // ล้าง: แท็บรายการ = เอาที่เลือกออก · ขนาด/ใส่อะไรได้ = คืนค่าเดิมของสินค้า + ไม่ใส่บรรทัด (ไม่ลบข้อมูลจริง)
  const clearTab = (t: Tab) => {
    if (t === "phrase") setPhraseIds([]);
    if (t === "material") setMatIds([]);
    if (t === "slot") setSlotN({});
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
    (["phrase", "material", "slot", "size", "fit"] as Tab[]).forEach(clearTab);
    setEdits({ th: {}, en: {} });
    setCustom(null);
  };
  const tabCount = (t: Tab) =>
    t === "phrase" ? sel.phrases.length : t === "material" ? sel.materials.length : t === "slot" ? sel.slots.length : t === "size" ? [sel.size, sel.weight, sel.handle, sel.strap].filter((x) => x != null && x !== "").length : sel.fits?.length ?? 0;
  const tabDirty = (t: Tab) => tabCount(t) > 0 || (t === "size" && numFields.some((f) => num[f.k] !== numOrig[f.k])) || (t === "fit" && JSON.stringify(fits) !== JSON.stringify(fitOrig));

  const apply = async () => {
    if (!dirty) {
      toast.warning("ยังไม่ได้เลือกรายละเอียด");
      return;
    }
    // ประกอบตามลำดับในตัวอย่าง (ไม่ได้ลาก = เหมือนแทรกก้อนที่ตำแหน่งเดิมทุกอย่าง) · อังกฤษ: ใส่บรรทัดใหม่ หรือบรรทัดเดิมถูกสลับ (บรรทัดเท่าไทย = สลับตาม)
    const th = picked || reordered ? arrangeTh(rows, lines, thOf).join("\n") : thText;
    const addEn = picked && withEn && hasEn && finalEn.length > 0;
    const en = addEn || (hasEn && reordered && enAligned) ? arrangeEn(rows, lines, enLines, addEn ? enOf : () => null).join("\n") : undefined;
    setSaving(true);
    try {
      const ok = await onApply({ th, en, ...(changes.length ? { fields } : {}) });
      if (ok !== false) onClose();
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
  };
  const onDeleted = async (k: CatalogKind, id: string) => {
    await reloadOf(k);
    setPhraseIds((p) => p.filter((x) => x !== id));
    setMatIds((p) => p.filter((x) => x !== id));
    setSlotN((p) => ({ ...p, [id]: "" }));
    setFits((p) => p.filter((x) => x.id !== id));
  };

  // ⠿ ลากจัดลำดับรายการกลาง (ทุกสินค้าใช้ลำดับเดียวกัน · บรรทัดที่แทรกเรียงตามนี้) — เขียน sort_order เฉพาะแถวที่เปลี่ยน
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
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditor({ kind, item }); }} title="แก้ / ลบ รายการนี้ (รายการกลาง)" aria-label={`แก้ ${String(item.name)}`}
      className={`shrink-0 rounded px-1 text-[13px] text-slate-400 hover:bg-white hover:text-slate-700 ${cls}`}>✏️</button>
  );
  const addBtn = (kind: CatalogKind, label: string) => (
    <button type="button" onClick={() => setEditor({ kind, item: null })} className="mt-1 text-xs text-orange-600 hover:underline">＋ เพิ่ม{label}ใหม่</button>
  );
  const rowCls = (on: boolean) => `flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`;
  const dupNote = (kind: LineKind) =>
    alreadyMentions(thText, kind, baseTpl) ? <span className="text-[11px] text-amber-700">⚠️ คำอธิบายมีเรื่อง &quot;{LINE_KIND_LABEL[kind]}&quot; อยู่แล้ว — อาจซ้ำ</span> : null;

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
      title="แทรกรายละเอียด"
      description="ซ้าย = เลือกรายละเอียด · ขวา = ตัวอย่างคำอธิบาย ลาก ⠿ สลับบรรทัดได้ทุกบรรทัด · คลิกบรรทัดสีส้มเพื่อแก้ก่อนแทรก"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={clearAll} disabled={!dirty} className="h-9 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40" data-insert-clear-all>
            ล้างทั้งหมด
          </button>
          <span className="mr-auto text-xs text-slate-500">
            {picked ? `จะแทรก ${finalTh.length} บรรทัด` : reordered ? "จัดลำดับบรรทัดใหม่" : "ยังไม่ได้เลือกบรรทัด"}
            {picked && reordered && " · จัดลำดับบรรทัดเดิมใหม่"}
            {changes.length > 0 && ` · อัปเดตช่องสินค้า ${changes.length} ช่อง`}
          </span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button type="button" onClick={() => void apply()} disabled={saving || !dirty} data-detail-insert-apply
            className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : saveLabel ?? "แทรก"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-detail-insert-modal>
        {/* ─── ซ้าย: เลือก ─── */}
        <div className="min-w-0 space-y-2.5">
          {baseTpl.profiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600" data-insert-profile>
              <span>🗂 ชุดรายการ</span>
              <select value={profileSel ?? "__auto"} onChange={(e) => setProfileSel(e.target.value === "__auto" ? null : e.target.value)} aria-label="ชุดรายการ"
                className="h-7 max-w-full rounded-md border border-slate-200 px-1.5 text-[12px]">
                <option value="__auto">
                  {`อัตโนมัติ: ${autoProfile ? autoProfile.name : "ทั้งหมด"}${productCat && catById.get(productCat) ? ` (หมวด ${catById.get(productCat)!.name})` : ""}`}
                </option>
                {baseTpl.profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__all">ทั้งหมด (ไม่กรอง)</option>
              </select>
              {profile && <span className="text-[11px] text-slate-400">โชว์เฉพาะรายการของชุดนี้</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => openTab(t.key)} data-insert-tab={t.key}
                className={`h-8 rounded-lg border px-2.5 text-[12.5px] font-medium ${tab === t.key ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {t.label}
                {tabCount(t.key) > 0 && <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-[10.5px] text-white">{tabCount(t.key)}</span>}
              </button>
            ))}
            <button type="button" onClick={() => setTplOpen(true)} title="ตั้งรูปแบบบรรทัด (คำนำหน้า · คำเชื่อม และ · ชื่ออังกฤษในวงเล็บ) — ใช้กับทุกสินค้า" data-insert-tpl
              className="ml-auto h-8 rounded-lg border border-slate-200 px-2.5 text-[12.5px] text-slate-600 hover:bg-slate-50">⚙️ รูปแบบบรรทัด</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[11.5px] text-slate-500">{tabInfo.hint}</p>
            <button type="button" onClick={() => clearTab(tab)} disabled={!tabDirty(tab)} data-insert-clear
              title={tab === "size" || tab === "fit" ? "คืนตัวเลข/ของที่ใส่ได้ เป็นค่าเดิมของสินค้า และไม่ใส่บรรทัดของหน้านี้" : "เอาที่เลือกในหน้านี้ออกทั้งหมด (หน้าอื่นไม่เปลี่ยน)"}
              className="h-7 shrink-0 rounded-md border border-slate-200 px-2 text-[11.5px] text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600">
              🧹 {tab === "size" || tab === "fit" ? "ล้างหน้านี้ (คืนค่าเดิม)" : "ล้างหน้านี้"}
            </button>
            {tab !== "size" && tab !== "slot" && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…"
                className="h-8 w-28 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            )}
          </div>
          {(bracketKind || dupKind) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {bracketKind && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600">
                  <input type="checkbox" checked={tpl.enInBrackets[bracketKind]} onChange={(e) => setEnBr((p) => ({ ...p, [bracketKind]: e.target.checked }))} className="h-3.5 w-3.5 accent-orange-500" data-insert-enbr />
                  ใส่ชื่ออังกฤษในวงเล็บ <span className="text-slate-400">เช่น ผ้าไนล่อน (Nylon)</span>
                </label>
              )}
              {dupKind && dupNote(dupKind)}
            </div>
          )}

          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="max-h-[22rem] space-y-1 overflow-auto pr-1">
              {tab === "phrase" && (
                <>
                  <SortList items={phraseItems.filter(match)} disabled={!!needle} onMove={(f, t) => void reorder("phrase", phraseItems, f, t)} render={(it, handle) => {
                    const on = phraseIds.includes(it.id);
                    return (
                      <div className={rowCls(on)}>
                        {handle}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setPhraseIds((p) => toggle(p, it.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          <span className={`flex-1 text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{it.name}</span>
                          {it.name_en ? <span className="truncate text-[11px] text-slate-400">{it.name_en}</span> : <span className="text-[11px] text-slate-300">ไม่มีอังกฤษ</span>}
                        </label>
                        {editBtn("phrase", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  }} />
                  {!phraseItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบข้อความ</p>}
                  {addBtn("phrase", "ข้อความ")}
                </>
              )}

              {tab === "material" && (
                <>
                  <SortList items={visMats.filter(match)} disabled={!!needle} onMove={(f, t) => void reorder("material", visMats, f, t)} render={(m, handle) => {
                    const on = matIds.includes(m.id);
                    const page = hasMaterialPage(m);
                    return (
                      <div className={rowCls(on)}>
                        {handle}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={on} onChange={() => setMatIds((p) => toggle(p, m.id))} className="h-4 w-4 shrink-0 accent-orange-500" />
                          <span className={`text-sm ${on ? "font-medium text-slate-800" : "text-slate-600"}`}>{m.name}</span>
                          {m.name_en && <span className="truncate text-[11px] text-slate-400">{m.name_en}</span>}
                        </label>
                        {page ? (
                          <button type="button" onClick={() => setMatOpen(m.id)} data-mat-page={m.id} title="เปิดหน้าวัสดุ (แก้คำอธิบาย/วิธีดูแล/รูปได้) — ชื่อวัสดุนี้บนเว็บกดมาหน้านี้"
                            className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] text-emerald-700 hover:bg-emerald-100 hover:underline">🔗 มีหน้า</button>
                        ) : (
                          <button type="button" onClick={() => setMatOpen(m.id)} data-mat-page={m.id} title="ยังไม่มีคำอธิบายวัสดุ — กดเพื่อเขียน แล้วชื่อวัสดุบนเว็บจะกดดูได้"
                            className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500 hover:bg-slate-200 hover:text-slate-700">✍️ เขียนหน้า</button>
                        )}
                        {editBtn("material", m as unknown as Record<string, unknown>)}
                      </div>
                    );
                  }} />
                  {!visMats.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบวัสดุ</p>}
                  {addBtn("material", "วัสดุ")}
                </>
              )}

              {tab === "slot" && (
                <>
                  <SortList items={[...slotItems].sort((a, b) => sideRank(a.slot_side) - sideRank(b.slot_side))} onMove={(f, t) => void reorder("slot", [...slotItems].sort((a, b) => sideRank(a.slot_side) - sideRank(b.slot_side)), f, t)}
                    header={(it, i, all) =>
                      slotItems.some((x) => x.slot_side) && (i === 0 || sideRank(all[i - 1].slot_side) !== sideRank(it.slot_side)) ? (
                        <p className="px-1 pt-1.5 text-[11px] font-semibold text-slate-500" data-slot-group={it.slot_side ?? ""}>{SIDE_LABEL[it.slot_side ?? ""] ?? SIDE_LABEL[""]}</p>
                      ) : null
                    }
                    render={(it, handle) => {
                    const n = Math.floor(Number(slotN[it.id])) || 0;
                    return (
                      <div className={rowCls(n > 0)}>
                        {handle}
                        <span className={`min-w-0 flex-1 text-sm ${n > 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          {it.name}
                          {it.name_en ? <span className="ml-1.5 text-[11px] font-normal text-slate-400">{it.name_en}</span> : <span className="ml-1.5 text-[11px] font-normal text-slate-300">ไม่มีอังกฤษ</span>}
                          {n > 0 && (
                            <span className="block text-[11px] font-normal text-slate-400">
                              → {slotText(it, n, "th", tpl)}
                              {" · "}
                              {slotText(it, n, "en", tpl) ?? "— (ยังไม่มีอังกฤษ)"}
                            </span>
                          )}
                        </span>
                        <input aria-label={`จำนวน ${it.name}`} type="number" inputMode="numeric" min={0} max={99} step={1} value={slotN[it.id] ?? ""} placeholder="0"
                          onChange={(e) => setSlotN((p) => ({ ...p, [it.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                          className="h-8 w-14 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        <span className="w-6 text-xs text-slate-400">ช่อง</span>
                        {editBtn("slot", it as unknown as Record<string, unknown>)}
                      </div>
                    );
                  }} />
                  {!slotItems.length && <p className="py-3 text-center text-xs text-slate-400">ยังไม่มีช่อง</p>}
                  {addBtn("slot", "ช่อง")}
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
                            <span className="block text-sm text-slate-700">{f.label}</span>
                            <span className="block text-[10.5px] text-slate-400">{f.en}</span>
                          </span>
                          {f.k === "s1" ? (
                            <span className="flex items-center gap-1">
                              {has("s1") && box("s1", "สายสะพายสั้นสุด")}
                              {has("s1") && has("s2") && <span className="text-xs text-slate-400">–</span>}
                              {has("s2") && box("s2", "สายสะพายยาวสุด")}
                            </span>
                          ) : (
                            box(f.k, f.label)
                          )}
                          <span className="w-8 shrink-0 text-xs text-slate-400">{f.unit}</span>
                          <span className={`min-w-0 flex-1 truncate text-right text-[11px] ${changed ? "text-orange-700" : "text-slate-400"}`}>
                            {changed ? `เดิม ${ks.map((k) => numOrig[k] || "ว่าง").join("–")}` : ks.some((k) => numOrig[k]) ? "ตรงกับสินค้า" : "สินค้ายังไม่กรอก"}
                          </span>
                        </div>
                      );
                    })}
                  {has("s1") && has("s2") && <p className="text-[11px] text-slate-400">สาย: ใส่ 2 ค่า = ปรับได้ (เช่น 100–120) · สายเส้นเดียว ใส่ช่องแรกช่องเดียว</p>}
                  <div className="space-y-1 pt-1 text-[12.5px] text-slate-600">
                    {(["size", "weight", "handle", "strap"] as SizeLine[])
                      .filter((k) => SIZE_LINE_KEYS[k].some(has))
                      .map((k) => (
                        <div key={k} className="flex flex-wrap items-center gap-x-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={use[k]} onChange={(e) => setUse((p) => ({ ...p, [k]: e.target.checked }))} className="h-4 w-4 accent-orange-500" data-insert-use={k} />
                            ใส่บรรทัด{LINE_KIND_LABEL[k]}
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
                    <p className="text-[11px] text-slate-400">ไม่ติ๊ก = ไม่ใส่บรรทัด แต่ตัวเลขที่แก้ยังบันทึกกลับช่องของสินค้า</p>
                  </div>
                </div>
              )}

              {tab === "fit" && (
                <>
                  <div className="rounded-md bg-slate-50 px-2 py-1 text-[11.5px] text-slate-600" data-fit-bag>
                    📐 {boxBasis === "inner"
                      ? <>ช่องด้านใน: {(comps ?? []).map((c) => `${c.name || "ช่อง"} ${c.w}×${c.h}×${c.d}`).join(" · ")} ซม.</>
                      : boxBasis === "outer"
                        ? <>กระเป๋า (ขนาดนอก): {num.w}×{num.h}×{num.d} ซม. <span className="text-slate-400">— ยังไม่วัดช่องด้านใน ใส่ได้จริงอาจน้อยกว่านี้</span></>
                        : <span className="text-slate-400">ยังไม่มีขนาดกระเป๋า — ใส่ กว้าง/สูง/หนา ที่แท็บขนาด แล้วระบบจะตรวจว่าใส่ได้ไหม</span>}
                  </div>
                  {badFits.length > 0 && (
                    <p className="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700" data-fit-warn>
                      ⚠️ เลือกไว้แต่ขนาดอาจไม่พอ: {badFits.map((x) => x.name).join(", ")} — ตรวจขนาดกระเป๋า/ของอีกครั้ง
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-5" data-insert-fit-grid>
                    <SortList items={fitItems.filter(match)} disabled={!!needle} onMove={(f, t) => void reorder("fit", fitItems, f, t)} render={(it, handle) => {
                      const pick = fits.find((p) => p.id === it.id);
                      const opts = fitSizeOptions(it);
                      const flip = () => setFits((p) => (pick ? p.filter((x) => x.id !== it.id) : [...p, { id: it.id }]));
                      return (
                        <div className={`relative h-full rounded-lg border p-1 ${pick ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300" : "border-slate-200 hover:border-slate-300"}`}>
                          <button type="button" onClick={flip} aria-pressed={!!pick} aria-label={`เลือก ${it.name}`} className="block w-full text-left">
                            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-slate-50">
                              {it.image_key ? <img src={imgUrl(it.image_key, 160)} alt="" className="h-full w-full object-contain" /> : <span className="text-xl opacity-40">🎒</span>}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] font-medium leading-tight text-slate-700" title={it.name}>{it.name}</div>
                            <div className="truncate text-[9.5px] leading-tight text-slate-400" title={it.name_en ?? ""}>{it.name_en || "ไม่มีอังกฤษ"}</div>
                            {(() => {
                              const c = fitCheck(it);
                              const dims = c.t ? `${c.t.w}×${c.t.h}×${c.t.d}` : "";
                              const tone = c.kind === "roomy" ? "text-emerald-700" : c.kind === "snug" ? "text-amber-700" : c.kind === "no" ? "text-rose-600" : "text-slate-400";
                              const mark = c.kind === "roomy" ? "✓ ใส่ได้" : c.kind === "snug" ? "≈ พอดี" : c.kind === "no" ? "⚠️ ไม่พอ" : c.kind === "nosize" ? "ไม่มีขนาด" : "";
                              return (
                                <div className={`truncate text-[9.5px] leading-tight ${tone}`} data-fit-check={c.kind} title={c.kind === "nosize" ? "ใส่ขนาดของที่ ✏️ เพื่อให้ระบบตรวจว่าใส่ได้ไหม" : `${dims} ซม.`}>
                                  {mark}{dims ? ` · ${dims}` : ""}
                                </div>
                              );
                            })()}
                          </button>
                          <span className={`pointer-events-none absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] ${pick ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white"}`}>{pick ? "✓" : ""}</span>
                          {editBtn("fit", it as unknown as Record<string, unknown>, "absolute right-0.5 top-0.5 bg-white/80 text-[11px]")}
                          {handle && <span className="absolute bottom-0.5 right-0.5 text-[11px]">{handle}</span>}
                          {pick && opts.length > 0 && (
                            <select aria-label={`ขนาด ${it.name}`} value={pick.size ?? ""} onChange={(e) => setFits((p) => p.map((x) => (x.id === it.id ? (e.target.value ? { id: it.id, size: e.target.value } : { id: it.id }) : x)))}
                              className="mt-0.5 h-6 w-full rounded border border-slate-200 px-0.5 text-[10.5px]">
                              <option value="">ไม่ระบุขนาด</option>
                              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    }} />
                  </div>
                  {!fitItems.filter(match).length && <p className="py-3 text-center text-xs text-slate-400">ไม่พบรายการ</p>}
                  {addBtn("fit", "ของที่ใส่ได้")}
                  {!needle && fitItems.length > 1 && <p className="text-[10.5px] text-slate-400">ลาก ⠿ มุมการ์ดเพื่อจัดลำดับ (ใช้กับทุกสินค้า)</p>}
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-[12.5px] text-slate-600">
                    <input type="checkbox" checked={useFit} onChange={(e) => setUseFit(e.target.checked)} className="h-4 w-4 accent-orange-500" data-insert-use="fit" />
                    ใส่บรรทัด &quot;{baseTpl.prefix.fit.th || "ใส่ได้"} …&quot; ลงคำอธิบาย
                  </label>
                </>
              )}
            </div>
          )}
          {(tab === "phrase" || tab === "slot" || tab === "material" || tab === "fit") && (
            <a href={`/m/${catalogOf(tab === "slot" ? "slot" : tab)}`} target="_blank" rel="noreferrer" className="block text-right text-[11px] text-slate-400 hover:text-blue-600 hover:underline">
              ดูรายการกลางทั้งหมด (รวมที่ลบไปแล้ว) ↗
            </a>
          )}
        </div>

        {/* ─── ขวา: ตัวอย่างคำอธิบาย ─── */}
        <div className="min-w-0 space-y-2 rounded-xl bg-slate-50/80 p-2.5 md:sticky md:top-0 md:self-start">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
            <span className="flex-1 font-medium text-slate-700">ตัวอย่างคำอธิบาย</span>
            <button type="button" onClick={() => setHide(!hideOld)} title={hideOld ? "โชว์บรรทัดเดิมทั้งหมด" : "ซ่อนบรรทัดเดิม ดูเฉพาะบรรทัดใหม่"} data-insert-hide
              className={`rounded px-1.5 ${hideOld ? "bg-slate-800 text-white" : "hover:bg-slate-200/60"}`}>{hideOld ? "🙈 ซ่อนบรรทัดเดิม" : "👁 บรรทัดเดิม"}</button>
            {view === "th" && (
              <>
                <button type="button" onClick={() => placeAt(0)} title="ย้ายบรรทัดใหม่ทั้งหมดไปบนสุด" className={`rounded px-1.5 ${blockPos === 0 ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>บนสุด</button>
                <button type="button" onClick={() => placeAt(lines.length)} title="ย้ายบรรทัดใหม่ทั้งหมดไปท้ายสุด" className={`rounded px-1.5 ${blockPos === lines.length ? "bg-orange-100 text-orange-700" : "hover:bg-slate-200/60"}`}>ท้ายสุด</button>
              </>
            )}
            {hasEn && (
              <span className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                {(["th", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => { setView(l); setEditing(null); }} data-insert-view={l}
                    className={`px-2 py-0.5 text-[11px] ${view === l ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l === "th" ? "ไทย" : "EN"}</button>
                ))}
              </span>
            )}
          </div>
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 text-[13px] leading-snug" data-detail-insert-preview>
            {view === "th" ? thBody : enBody}
            {!(view === "en" ? enLines : lines).length && !hideOld && <p className="px-2 text-[11.5px] text-slate-400">{view === "en" ? "คำอธิบายอังกฤษยังว่าง" : "คำอธิบายยังว่าง — จะใส่เป็นบรรทัดแรก"}</p>}
          </div>
          {view === "th" && lines.length + pairs.length > 1 && (
            <p className="text-[11px] text-slate-400">
              ลาก ⠿ สลับได้ทุกบรรทัด{hideOld && lines.length ? " (กด 👁 บรรทัดเดิม เพื่อลากบรรทัดเดิมด้วย)" : ""}
              {picked ? " · คลิกบรรทัดสีส้มเพื่อแก้คำเฉพาะรุ่นนี้ (ลบข้อความทั้งหมด = ไม่ใส่บรรทัดนั้น)" : ""}
              {custom && (
                <button type="button" onClick={() => setCustom(null)} className="ml-1 text-slate-500 underline hover:text-slate-800" data-insert-reset-order>↺ คืนลำดับเดิม</button>
              )}
            </p>
          )}
          {view === "en" && <p className="text-[11px] text-slate-400">ลำดับฝั่งอังกฤษตามภาษาไทย (บรรทัดไม่เท่ากัน = บรรทัดใหม่ต่อท้าย) · สลับเป็น &quot;ไทย&quot; เพื่อลากจัดลำดับ</p>}
          {reordered && (
            <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[11.5px] text-sky-800" data-insert-reordered>
              🔀 จัดลำดับบรรทัดเดิมใหม่ — บันทึกตอนกด &quot;{saveLabel ?? "แทรก"}&quot;
              {hasEn && enText.trim() ? (enAligned ? " · คำอธิบายอังกฤษสลับตาม" : " · คำอธิบายอังกฤษบรรทัดไม่เท่าไทย = คงลำดับเดิม") : ""}
            </p>
          )}

          {changes.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-800" data-insert-writeback>
              🔄 บันทึกกลับช่องของสินค้าด้วย: {changes.join(" · ")}
            </p>
          )}

          {hasEn && (
            <div className="space-y-1 text-xs text-slate-600">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={withEn} onChange={(e) => setWithEn(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                <span>ใส่ภาษาอังกฤษในคำอธิบายอังกฤษด้วย</span>
              </label>
              {!enText.trim() && <p className="pl-6 text-slate-400">คำอธิบายอังกฤษยังว่าง — ติ๊กแล้วจะได้แค่บรรทัดใหม่ หรือปล่อยไว้แล้วกด 🌐 แปลทั้งหมด ทีหลัง</p>}
              {withEn && out.enMissing > 0 && <p className="pl-6 text-amber-700">⚠️ {out.enMissing} บรรทัดยังไม่มีชื่ออังกฤษ — ฝั่งอังกฤษจะข้ามบรรทัดนั้น (กด ✏️ ที่รายการเพื่อใส่ชื่ออังกฤษ)</p>}
              {enAppend && <p className="pl-6 text-slate-400">จำนวนบรรทัดอังกฤษไม่เท่าภาษาไทย — ฝั่งอังกฤษจะต่อท้ายให้</p>}
            </div>
          )}
        </div>
      </div>

      {editor && (
        <CatalogItemDialog
          kind={editor.kind}
          item={editor.item}
          existing={editor.kind === "material" ? mats : editor.kind === "fit" ? allFits : editor.kind === "slot" ? allSlot : allPhrase}
          profiles={baseTpl.profiles}
          allIds={(editor.kind === "material" ? mats : editor.kind === "fit" ? allFits : editor.kind === "slot" ? allSlot : allPhrase).map((x) => x.id)}
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
          catalogs={{ phrase: allPhrase, material: mats, slot: allSlot, fit: allFits }}
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
};

type CatalogLists = Record<CatalogKind, { id: string; name: string; name_en?: string | null }[]>;

function TemplateDialog({ value, catalogs, categories, onClose, onSaved }: { value: InsertTemplates; catalogs: CatalogLists; categories: CategoryRow[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<InsertTemplates>(value);
  const [pane, setPane] = useState<"format" | "profiles">("format");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(t) !== JSON.stringify(value);
  const setJoin = (k: keyof InsertTemplates["joiner"], v: string) => setT((p) => ({ ...p, joiner: { ...p.joiner, [k]: v } }));
  const setPre = (k: LineKind, lang: "th" | "en", v: string) => setT((p) => ({ ...p, prefix: { ...p.prefix, [k]: { ...p.prefix[k], [lang]: v } } }));
  const ex = composeLines(
    {
      phrases: [{ id: "p", name: "ผลิตในประเทศไทย", name_en: "Made in Thailand" }],
      materials: SAMPLE.material,
      slots: [],
      size: { w: 30, h: 20, d: 10 },
      strap: { min: 100, max: 120 },
      fits: [{ th: "แท็บเล็ต", en: "Tablet", size: "11 นิ้ว" }, { th: "เอกสาร A4", en: "A4 documents" }],
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
            <h4 className="text-xs font-semibold text-slate-600">คำนำหน้าบรรทัด <span className="font-normal text-slate-400">(เว้นว่าง = ไม่มีคำนำหน้า)</span></h4>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 text-[12px] text-slate-500">
              {(Object.keys(LINE_KIND_LABEL) as LineKind[]).map((k) => (
                <Fragment key={k}>
                  <span>{LINE_KIND_LABEL[k]}</span>
                  <input value={t.prefix[k].th} onChange={(e) => setPre(k, "th", e.target.value)} placeholder="(ไม่มี)" className={inp} aria-label={`คำนำหน้า ${LINE_KIND_LABEL[k]} ไทย`} />
                  <input value={t.prefix[k].en} onChange={(e) => setPre(k, "en", e.target.value)} placeholder="(none)" className={inp} aria-label={`คำนำหน้า ${LINE_KIND_LABEL[k]} อังกฤษ`} />
                </Fragment>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 text-[12.5px] md:self-start" data-tpl-example>
          <h4 className="text-xs font-semibold text-slate-600">ตัวอย่าง</h4>
          <div className="space-y-0.5 text-slate-700">
            {ex.th.map((l) => <div key={l}>{l}</div>)}
            <div>- {slotEx.th}</div>
          </div>
          <div className="space-y-0.5 border-t border-slate-200 pt-2 text-slate-500">
            {ex.en.map((l) => <div key={l}>{l}</div>)}
            <div>- {slotEx.en}</div>
          </div>
        </div>
      </div>
      )}
    </ERPModal>
  );
}

/* ─────────── 🗂 ชุดรายการตามประเภทสินค้า ─────────── */

const KIND_TITLE: Record<CatalogKind, string> = { phrase: "📝 ข้อความ", material: "🧵 วัสดุ", slot: "🔢 ช่อง", fit: "🎒 ใส่อะไรได้" };

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

const KIND_LABEL: Record<CatalogKind, string> = { phrase: "ข้อความสำเร็จรูป", slot: "ช่อง", material: "วัสดุ", fit: "ของที่ใส่ได้" };
const PLACEHOLDER: Record<CatalogKind, { th: string; en: string }> = {
  phrase: { th: "เช่น ผลิตในประเทศไทย", en: "Made in Thailand" },
  slot: { th: "เช่น ช่องใส่บัตรเครดิต", en: "card slot" },
  material: { th: "เช่น หนังวัวแท้", en: "Genuine cowhide" },
  fit: { th: "เช่น iPad", en: "iPad" },
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
}) {
  const toast = useToast();
  const s = (k: string) => String(item?.[k] ?? "");
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
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [side, setSide] = useState(s("slot_side"));
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
  const dirty = name !== s("name") || nameEn !== s("name_en") || tpl !== s("template") || tplEn !== s("template_en") || sizes !== s("sizes") || imageKey !== s("image_key") || side !== s("slot_side") || profilesDirty || dimW !== s("width_cm") || dimH !== s("height_cm") || dimD !== s("depth_cm") || soft !== (item?.is_soft === true);

  const translate = async () => {
    if (!name.trim()) {
      toast.warning("พิมพ์ชื่อไทยก่อน");
      return;
    }
    setTranslating(true);
    try {
      const [en] = await translateContent([name.trim()]);
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
      const up = await uploadResizedImage(file, { folder: "fit-items", max: 600 });
      setImageKey(up.r2_key);
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
    if (kind === "fit") {
      const dim = (v: string) => (Number(v) > 0 ? Math.round(Number(v) * 10) / 10 : null);
      const dimsChanged = dimW !== s("width_cm") || dimH !== s("height_cm") || dimD !== s("depth_cm");
      Object.assign(body, { sizes: sizes.trim() || null, image_key: imageKey || null, width_cm: dim(dimW), height_cm: dim(dimH), depth_cm: dim(dimD), is_soft: soft, ...(dimsChanged ? { size_estimated: false } : {}) });
    }
    if (!item) Object.assign(body, { sort_order: 500, is_active: true, ...(kind === "phrase" || kind === "slot" ? { kind } : {}) });
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อ (ไทย)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus placeholder={PLACEHOLDER[kind].th} className={input} />
          </div>
          <div>
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
          {profiles.length > 0 && (
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
