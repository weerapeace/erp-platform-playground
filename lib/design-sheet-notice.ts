/**
 * 📣 ใบแจ้งลูกค้า (ใบงานออกแบบ แท็บ "แจ้งลูกค้า") — ของกลางแบบ pure (ไม่มี React) เจ้าของขอ 2026-11-06
 *
 * 3 แบบแจ้ง (เพิ่มแบบใหม่ที่ NOTICE_KINDS ที่เดียว):
 *   • yield = ผ้าที่ลูกค้าส่งมา ทำได้กี่ใบ — "แบ่งตามที่สั่ง" (ลดทุกไซส์ลงสัดส่วนเดียวกัน) หรือ "ถ้าทำไซส์เดียว"
 *   • usage = ใช้ผ้ากี่หลาต่อใบ + ต้องเตรียมผ้ารวมเท่าไหร่ตามจำนวนสั่ง
 *   • free  = แจ้งทั่วไป (รูป + คำอธิบายใต้รูป + ข้อความ)
 * ตัวเลขปัดลงเสมอ (ไม่สัญญาลูกค้าเกินที่ทำได้จริง) · "เผื่อเสีย %" คูณเพิ่มจากใช้ต่อใบ
 *
 * ใช้ที่: components/design-sheet-detail/notice-tab.tsx (แก้ไข + พรีวิว) · /print/design-sheet/[id]/notice/[noticeId] (PDF/JPEG + แผงเลือกโชว์)
 *         · API /api/design-sheets/[id]/notices (cleanNotice ฝั่งเซิร์ฟเวอร์ต้องผ่านเสมอ)
 * ตาราง: design_sheet_notices · เทสต์: lib/__tests__/design-sheet-notice.test.ts · คู่มือ: docs/design-sheet-notice.md
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { costUsagePerUnit, type SheetSize } from "@/lib/cost-usage";
import { formatThaiAddress } from "@/lib/thai-address";
import { r2ImageUrl } from "@/lib/r2-image";

// ─────────────────────────── ชนิดใบแจ้ง ───────────────────────────
export type NoticeKind = "yield" | "usage" | "free";
export const NOTICE_KINDS: { key: NoticeKind; label: string; title: string; note: string }[] = [
  { key: "yield", label: "ผ้าที่มา ทำได้กี่ใบ", title: "แจ้งจำนวนที่ผลิตได้จากผ้าที่ได้รับ",
    note: "ผ้าที่ได้รับมาไม่พอสำหรับจำนวนที่สั่งทั้งหมด รบกวนแจ้งว่าต้องการส่งผ้าเพิ่ม หรือให้ผลิตตามจำนวนที่ทำได้ครับ" },
  { key: "usage", label: "ใช้ผ้ากี่หลาต่อใบ", title: "แจ้งปริมาณผ้าที่ใช้ต่อใบ",
    note: "แจ้งปริมาณผ้าที่ใช้ต่อใบ เพื่อให้ลูกค้าเตรียมผ้าได้พอดีครับ" },
  { key: "free", label: "แจ้งทั่วไป", title: "แจ้งรายละเอียดงาน", note: "" },
];
export const noticeKindOf = (k: unknown): NoticeKind => (k === "yield" || k === "usage" ? k : "free");
export const noticeKindMeta = (k: NoticeKind) => NOTICE_KINDS.find((x) => x.key === k) ?? NOTICE_KINDS[2];
export const noticeHasCalc = (k: NoticeKind) => k !== "free";

// ─────────────────────────── ข้อมูลในใบ ───────────────────────────
export type NoticeImage = { url: string; key: string | null; caption: string };
/** 1 แถว = 1 ไซส์ (key = รหัสแท็บตีราคา ถ้าดึงมา · พิมพ์เองได้) */
export type NoticeRow = { key: string; label: string; use: number | null; order: number | null };
export type NoticeCalc = {
  material: string;        // ชื่อวัตถุดิบที่แจ้ง เช่น "ผ้าลายสก็อตแดง (ลูกค้าส่งมา)"
  unit: string;            // หน่วย (ตั้งต้น หลา)
  unit_note: string;       // หมายเหตุหน่วย (ขึ้นในใบ) เช่น "คิดจากหน้ากว้าง 80 ซม." ตอนแปลงผ้าแบบผืนเป็นหลา
  received: number | null; // ผ้าที่ได้รับ (เฉพาะ yield)
  mode: "ratio" | "single";
  waste_pct: number;       // เผื่อเสีย % (0 = ไม่เผื่อ)
  rows: NoticeRow[];
};
export const EMPTY_CALC: NoticeCalc = { material: "", unit: "หลา", unit_note: "", received: null, mode: "ratio", waste_pct: 0, rows: [] };

// ─────────────────────────── สิ่งที่เลือกโชว์ตอนส่งออก ───────────────────────────
export const NOTICE_SHOW_GROUPS = [
  { key: "head", label: "หัวกระดาษ", items: [["logo", "โลโก้บริษัท"], ["company", "ชื่อ-ที่อยู่บริษัท"], ["docno", "เลขใบงาน"], ["job", "ชื่องาน"], ["customer", "แบรนด์ / ลูกค้า"], ["date", "วันที่"]] },
  { key: "img", label: "รูป", items: [["images", "รูป"], ["captions", "คำอธิบายใต้รูป"], ["imgno", "เลขลำดับรูป"]] },
  { key: "table", label: "ตาราง", items: [["matname", "ชื่อวัตถุดิบ"], ["c_use", "ใช้ผ้า/ใบ"], ["c_order", "จำนวนสั่ง"], ["c_need", "ผ้าที่ต้องใช้"], ["c_can", "ทำได้กี่ใบ"], ["total", "แถวรวม"], ["summary", "กล่องสรุป พอ/ขาด"], ["waste", "บอกว่ารวมเผื่อเสียแล้ว"]] },
  { key: "foot", label: "ข้อความ / ท้ายกระดาษ", items: [["note", "ข้อความถึงลูกค้า"], ["sender", "ชื่อผู้แจ้ง"], ["phone", "เบอร์โทรบริษัท"], ["sign", "ช่องลูกค้าเซ็นรับทราบ"]] },
] as const;
export type NoticeShowKey = (typeof NOTICE_SHOW_GROUPS)[number]["items"][number][0];
export const NOTICE_SHOW_KEYS: NoticeShowKey[] = NOTICE_SHOW_GROUPS.flatMap((g) => g.items.map((x) => x[0]));
export type NoticeShow = Record<NoticeShowKey, boolean>;
export const DEFAULT_NOTICE_SHOW: NoticeShow = Object.fromEntries(NOTICE_SHOW_KEYS.map((k) => [k, k !== "sign"])) as NoticeShow;

/** ชุดสำเร็จ — กดทีเดียวติ๊กให้ทั้งชุด */
export const NOTICE_PRESETS: { key: string; label: string; pick: (k: NoticeShowKey) => boolean }[] = [
  { key: "all", label: "ครบทุกอย่าง", pick: () => true },
  { key: "line", label: "แบบสั้น ส่ง LINE", pick: (k) => !(["company", "docno", "c_need", "imgno", "phone", "sign"] as string[]).includes(k) },
  { key: "photo", label: "รูป + ข้อความ", pick: (k) => (["logo", "job", "customer", "date", "images", "captions", "note", "sender"] as string[]).includes(k) },
];
export const presetShow = (key: string): NoticeShow => {
  const p = NOTICE_PRESETS.find((x) => x.key === key) ?? NOTICE_PRESETS[0];
  return Object.fromEntries(NOTICE_SHOW_KEYS.map((k) => [k, p.pick(k)])) as NoticeShow;
};

export type NoticeFormat = {
  paper: "A4" | "A5";
  orientation: "portrait" | "landscape";
  jpg_size: "fit" | "page";        // JPEG: พอดีเนื้อหา (ส่ง LINE) / เท่ากระดาษ
  jpg_quality: "normal" | "high";
  company_id: string | null;       // หัวกระดาษบริษัทไหน (null = บริษัทตั้งต้น)
};
export const DEFAULT_NOTICE_FORMAT: NoticeFormat = { paper: "A4", orientation: "portrait", jpg_size: "fit", jpg_quality: "normal", company_id: null };
export type NoticeDisplay = { show: NoticeShow; fmt: NoticeFormat };
export const DEFAULT_NOTICE_DISPLAY: NoticeDisplay = { show: DEFAULT_NOTICE_SHOW, fmt: DEFAULT_NOTICE_FORMAT };

/** ความกว้างกระดาษบนจอ (px) — ใช้ตอนบันทึก JPEG */
export const noticePageWidthPx = (fmt: NoticeFormat) =>
  fmt.paper === "A5" ? (fmt.orientation === "landscape" ? 794 : 559) : (fmt.orientation === "landscape" ? 1123 : 794);

export type NoticeDoc = {
  kind: NoticeKind;
  title: string;
  images: NoticeImage[];
  img_cols: number;          // 1–4 รูปต่อแถว
  calc: NoticeCalc;
  note: string;
  display: NoticeDisplay;
};
export type NoticeRecord = NoticeDoc & {
  id: string; sheet_id: string; created_by_name: string | null; created_at: string; updated_at: string;
};

export const newNoticeDoc = (kind: NoticeKind, display: NoticeDisplay = DEFAULT_NOTICE_DISPLAY): NoticeDoc => ({
  kind, title: noticeKindMeta(kind).title, images: [], img_cols: 2, calc: { ...EMPTY_CALC, rows: [] }, note: noticeKindMeta(kind).note, display,
});

// ─────────────────────────── ตรวจค่า (ใช้ทั้ง API และหน้าเว็บ) ───────────────────────────
const txt = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numOrNull = (v: unknown, min = 0, max = 1e9): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
/** รูปต้องเป็นลิงก์เว็บ (http/https) หรือลิงก์ในเว็บเรา (/api/r2-image…) — กันลิงก์แปลก ๆ เช่น javascript: */
const safeUrl = (v: unknown): string => {
  const s = txt(v, 2000);
  return /^https?:\/\//i.test(s) || (s.startsWith("/") && !s.startsWith("//")) ? s : "";
};

export function cleanNoticeImages(raw: unknown): NoticeImage[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { url: safeUrl(o.url), key: txt(o.key, 500) || null, caption: txt(o.caption, 1000) };
  }).filter((x) => x.url);
}

export function cleanNoticeCalc(raw: unknown): NoticeCalc {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, 20).map((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>;
    return { key: txt(x.key, 80) || `row${i + 1}`, label: txt(x.label, 60), use: numOrNull(x.use, 0, 1e6), order: numOrNull(x.order, 0, 1e9) };
  });
  return {
    material: txt(o.material, 200),
    unit: txt(o.unit, 20) || "หลา",
    unit_note: txt(o.unit_note, 120),
    received: numOrNull(o.received, 0, 1e9),
    mode: o.mode === "single" ? "single" : "ratio",
    waste_pct: numOrNull(o.waste_pct, 0, 100) ?? 0,
    rows,
  };
}

export function cleanNoticeDisplay(raw: unknown): NoticeDisplay {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (o.show ?? {}) as Record<string, unknown>;
  const f = (o.fmt ?? {}) as Record<string, unknown>;
  const show = Object.fromEntries(NOTICE_SHOW_KEYS.map((k) => [k, typeof s[k] === "boolean" ? s[k] : DEFAULT_NOTICE_SHOW[k]])) as NoticeShow;
  const cid = txt(f.company_id, 60);
  return {
    show,
    fmt: {
      paper: f.paper === "A5" ? "A5" : "A4",
      orientation: f.orientation === "landscape" ? "landscape" : "portrait",
      jpg_size: f.jpg_size === "page" ? "page" : "fit",
      jpg_quality: f.jpg_quality === "high" ? "high" : "normal",
      company_id: /^[0-9a-f-]{36}$/i.test(cid) ? cid : null,
    },
  };
}

/** ตรวจทั้งใบ — API ต้องเรียกก่อนบันทึกเสมอ */
export function cleanNotice(raw: unknown): NoticeDoc {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = noticeKindOf(o.kind);
  const cols = Math.round(Number(o.img_cols));
  return {
    kind,
    title: txt(o.title, 200) || noticeKindMeta(kind).title,
    images: cleanNoticeImages(o.images),
    img_cols: cols >= 1 && cols <= 4 ? cols : 2,
    calc: cleanNoticeCalc(o.calc),
    note: txt(o.note, 5000),
    display: cleanNoticeDisplay(o.display),
  };
}

// ─────────────────────────── คำนวณ ───────────────────────────
export type NoticeResultRow = NoticeRow & {
  usePlus: number | null;   // ใช้ต่อใบ รวมเผื่อเสียแล้ว
  need: number | null;      // ผ้าที่ต้องใช้ = สั่ง × ใช้ต่อใบ
  can: number | null;       // ทำได้ (แบ่งตามที่สั่ง)
  single: number | null;    // ถ้าเอาผ้าทั้งหมดไปทำไซส์นี้ไซส์เดียว
};
export type NoticeResult = {
  rows: NoticeResultRow[];
  need: number;           // ผ้าที่ต้องใช้รวม
  order: number;          // จำนวนสั่งรวม
  can: number;            // ทำได้รวม (ปัดลงทีละไซส์แล้วค่อยรวม)
  ratio: number | null;   // สัดส่วนที่ทำได้ (1 = ครบ) · null = ยังไม่ใส่ผ้าที่ได้รับ
  enough: boolean | null; // ผ้าพอไหม · null = ยังไม่ใส่ผ้าที่ได้รับ
  short: number;          // ขาดอีก (หลา)
  left: number;           // เหลือ (หลา)
};

const EPS = 1e-9;
export function computeNotice(calc: NoticeCalc): NoticeResult {
  const w = 1 + (Number(calc.waste_pct) || 0) / 100;
  const base = calc.rows.map((r) => {
    const usePlus = r.use != null && r.use > 0 ? r.use * w : null;
    const need = usePlus != null && r.order != null ? usePlus * r.order : null;
    return { r, usePlus, need };
  });
  const need = base.reduce((a, x) => a + (x.need ?? 0), 0);
  const order = calc.rows.reduce((a, r) => a + (r.order ?? 0), 0);
  const recv = calc.received;
  const ratio = recv == null ? null : need > 0 ? Math.min(1, recv / need) : 0;
  const rows: NoticeResultRow[] = base.map(({ r, usePlus, need: nd }) => ({
    ...r, usePlus, need: nd,
    can: ratio == null || r.order == null || usePlus == null ? null : Math.floor(r.order * ratio + EPS),
    single: recv == null || usePlus == null ? null : Math.floor(recv / usePlus + EPS),
  }));
  return {
    rows, need, order,
    can: rows.reduce((a, r) => a + (r.can ?? 0), 0),
    ratio,
    enough: recv == null ? null : recv + EPS >= need,
    short: recv == null ? 0 : Math.max(0, need - recv),
    left: recv == null ? 0 : Math.max(0, recv - need),
  };
}

// ─────────────────────────── ดึง "ใช้ต่อใบ" จากแท็บตีราคา ───────────────────────────
export type NoticeCostLine = {
  parent_code: string | null; item_id: string | null; item_sku_id?: string | null; item_name: string | null;
  group_name: string | null; qty: number | null; uom: string | null; piece: boolean;
  amount?: number | null;   // ต้นทุนต่อใบของบรรทัด (ใช้หา "ผ้าหลัก" = ผ้าที่แพงสุด)
};
/** ใช้ต่อใบในหน่วยหนึ่ง (ผ้าแบบผืนมีได้ 2 หน่วย: หลา (แปลงจากหน้ากว้าง) กับ ผืน) */
export type NoticeUnitOption = { unit: string; perTab: Record<string, number>; note: string };
/** วัตถุดิบ 1 ตัวในแท็บตีราคา + ใช้ต่อใบของแต่ละแท็บ (ไซส์) — หลายบรรทัดของวัสดุเดียวกันรวมให้แล้ว
 *  unit/perTab/note = หน่วยตั้งต้น (= units[0]) · units = ทุกหน่วยที่คิดได้ (เลือกสลับได้ในใบแจ้ง)
 *  fabric = กลุ่มวัสดุขึ้นต้นด้วย "ผ้า" · cost = ต้นทุนรวมทุกแท็บ (จัดอันดับผ้าหลัก) */
export type NoticeMaterialOption = {
  key: string; name: string; unit: string; perTab: Record<string, number>; note: string;
  units: NoticeUnitOption[]; fabric: boolean; cost: number;
};
/** 1 หลา = 90 ซม. ตามตัวหารตั้งต้นของแท็บตีราคา (ผ้าม้วน area_face: พื้นที่ ÷ หน้ากว้าง ÷ 90)
 *  ผ้าแบบผืนแปลงเป็นหลาด้วยตัวเดียวกัน → ตัวเลขเทียบกับผ้าม้วน (เช่น ผ้าซับใน) ได้ตรงกัน (เจ้าของขอ 2026-11-06 "แปลงเป็นหลาด้วย") */
export const NOTICE_YARD_CM = 90;
/** แท็บตีราคา — kind: general (ทั่วไป) / code (Parent จริง) / draft (ร่าง) / orphan (มีบรรทัดค้างแต่ไม่อยู่ในรายการ = มักเป็นของเก่า) */
export type NoticeCostTab = { key: string; label: string; kind?: string };

const matKey = (l: NoticeCostLine) => l.item_sku_id || l.item_id || `name:${(l.item_name ?? "").trim().toLowerCase()}`;
export function noticeMaterialsFromCost(lines: NoticeCostLine[], sheetOf: (itemId: string) => SheetSize | null | undefined = () => null): NoticeMaterialOption[] {
  const groups = new Map<string, NoticeCostLine[]>();
  for (const l of lines) {
    if (!(Number(l.qty) > 0) || !(l.item_name ?? "").trim()) continue;
    const k = matKey(l);
    const arr = groups.get(k); if (arr) arr.push(l); else groups.set(k, [l]);
  }
  const out: NoticeMaterialOption[] = [];
  for (const [key, ls] of groups) {
    const byTab = new Map<string, NoticeCostLine[]>();
    for (const l of ls) { const t = l.parent_code ?? ""; const a = byTab.get(t); if (a) a.push(l); else byTab.set(t, [l]); }
    const fabric = ls.some((l) => (l.group_name ?? "").trim().startsWith("ผ้า"));
    // รวมใช้ต่อใบทุกหน่วยที่คิดได้ ต่อแท็บ
    const byUnit = new Map<string, { perTab: Record<string, number>; widths: Set<number>; sizes: Set<string> }>();
    const put = (unit: string, tab: string, q: number, meta: { width?: number; size?: string | null } = {}) => {
      if (!(q > 0) || !unit) return;
      let v = byUnit.get(unit);
      if (!v) { v = { perTab: {}, widths: new Set(), sizes: new Set() }; byUnit.set(unit, v); }
      v.perTab[tab] = (v.perTab[tab] ?? 0) + q;
      if (meta.width) v.widths.add(meta.width);
      if (meta.size) v.sizes.add(meta.size);
    };
    for (const [tab, tl] of byTab) {
      const u = costUsagePerUnit(tl.map((l) => ({ item_id: l.item_id, group_name: l.group_name, qty: l.qty, uom: l.uom, piece: l.piece })), sheetOf);
      if (u.sheets) put(u.sheets.unit, tab, u.sheets.qty, { size: u.sheets.size });
      for (const b of u.byUom) put(b.uom, tab, b.qty);
      // ผ้าแบบผืน (cm²) → หลาด้วย: พื้นที่ ÷ หน้ากว้างผืน ÷ 90 (ต้องรู้หน้ากว้างจากทะเบียนวัสดุตีราคา)
      if (fabric) for (const l of tl) {
        const w = l.piece && l.item_id ? Number(sheetOf(l.item_id)?.width_cm) : 0;
        if (w > 0 && Number(l.qty) > 0) put("หลา", tab, Number(l.qty) / (w * NOTICE_YARD_CM), { width: w });
      }
    }
    if (!byUnit.size) continue;
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    const units = [...byUnit.entries()].map(([unit, v]) => ({
      unit,
      perTab: Object.fromEntries(Object.entries(v.perTab).map(([k, q]) => [k, r4(q)])),
      note: unit === "หลา" && v.widths.size ? (v.widths.size === 1 ? `คิดจากหน้ากว้าง ${[...v.widths][0]} ซม.` : "คิดจากหน้ากว้างผืน")
        : v.sizes.size === 1 ? `${unit}ละ ${[...v.sizes][0]} ซม.` : "",
      tabs: Object.keys(v.perTab).length,
    }))
      // ผ้า → หลาก่อน (เจ้าของคิดเป็นหลา) · แล้วหน่วยที่ครอบคลุมแท็บมากสุด · cm² ไว้ท้าย
      .sort((a, b) => Number(fabric && b.unit === "หลา") - Number(fabric && a.unit === "หลา") || b.tabs - a.tabs || Number(a.unit === "cm²") - Number(b.unit === "cm²"))
      .map(({ unit, perTab, note }) => ({ unit, perTab, note }));
    out.push({
      key, name: (ls[0].item_name ?? "").trim(), unit: units[0].unit, perTab: units[0].perTab, note: units[0].note, units,
      fabric, cost: ls.reduce((a, l) => a + (Number(l.amount) || 0), 0),
    });
  }
  // ผ้าขึ้นก่อน → แพงสุด (= ผ้าหลัก) ก่อน → ใช้เยอะสุด → ชื่อ   (ข้อมูลจริง DS-2026-0064: ผ้าขาวม้า 395 บ. ชนะ กุ้น/ซับใน)
  const total = (m: NoticeMaterialOption) => Object.values(m.perTab).reduce((a, v) => a + v, 0);
  return out.sort((a, b) => Number(b.fabric) - Number(a.fabric) || b.cost - a.cost || total(b) - total(a) || a.name.localeCompare(b.name, "th"));
}

/** แถว 1 ไซส์ จากแท็บตีราคา */
export const noticeTabRow = (m: NoticeMaterialOption, t: NoticeCostTab, orderOf: (tabKey: string) => number | null = () => null): NoticeRow =>
  ({ key: t.key || "general", label: t.label, use: m.perTab[t.key] ?? null, order: orderOf(t.key) });

/** แท็บที่มีวัตถุดิบนี้ + ตั้งต้นเลือกแท็บไหน: Parent จริง/ร่าง ก่อน → ไม่มีก็แท็บอื่นที่ไม่ใช่ทั่วไป → สุดท้ายทั่วไป
 *  (ใบงานจริงมีแท็บเก่าค้าง เช่น DS-2026-0064 มี 8 แท็บ — ใส่ทุกแท็บ = แถวรก) */
export function noticeTabsFor(m: NoticeMaterialOption, tabs: NoticeCostTab[]): { all: NoticeCostTab[]; picked: NoticeCostTab[] } {
  const all = tabs.filter((t) => m.perTab[t.key] != null);
  const main = all.filter((t) => t.kind === "code" || t.kind === "draft");
  const nonGeneral = all.filter((t) => t.key !== "");
  return { all, picked: main.length ? main : nonGeneral.length ? nonGeneral : all };
}

/** แถวไซส์จากวัตถุดิบที่เลือก (เฉพาะแท็บตั้งต้น — noticeTabsFor) · orderOf = จำนวนสั่งตั้งต้น (เช่น จากรอบเสนอราคาล่าสุด) */
export function noticeRowsFromMaterial(
  m: NoticeMaterialOption, tabs: NoticeCostTab[], orderOf: (tabKey: string) => number | null = () => null,
): NoticeRow[] {
  return noticeTabsFor(m, tabs).picked.map((t) => noticeTabRow(m, t, orderOf));
}

// ─────────────────────────── ใบพิมพ์ (PDF / JPEG / พรีวิว) ───────────────────────────
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const f0 = (n: number) => Math.floor(n + EPS).toLocaleString("th-TH");
const f2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const IMG_MAX_MM: Record<number, number> = { 1: 120, 2: 80, 3: 56, 4: 42 };

export type NoticeContext = {
  sheetCode: string; sheetName: string; brandName: string;
  company: { name: string; address: string; phone: string; logoUrl: string | null } | null;
  senderName: string;
  dateText: string;
  /** ทำลิงก์รูปให้เต็ม (พิมพ์ในแท็บใหม่/JPEG ต้องใช้ลิงก์เต็ม) */
  absUrl?: (u: string) => string;
};

function tableHtml(doc: NoticeDoc, res: NoticeResult): string {
  const sh = doc.display.show, c = doc.calc, unit = esc(c.unit || "หลา");
  type Col = { h: string; f: (r: NoticeResultRow) => string; t?: string; b?: boolean };
  const cols: Col[] = [];
  const single = doc.kind === "yield" && c.mode === "single";
  const dash = "—";
  if (single) {
    if (sh.c_use) cols.push({ h: `ใช้ผ้า/ใบ (${unit})`, f: (r) => (r.usePlus != null ? f2(r.usePlus) : dash) });
    if (sh.c_can) cols.push({ h: "ถ้าใช้ผ้าทั้งหมดทำไซส์นี้", f: (r) => (r.single != null ? `${f0(r.single)} ใบ` : dash), b: true });
  } else {
    if (sh.c_use) cols.push({ h: `ใช้ผ้า/ใบ (${unit})`, f: (r) => (r.usePlus != null ? f2(r.usePlus) : dash) });
    if (sh.c_order) cols.push({ h: "จำนวนสั่ง", f: (r) => (r.order != null ? f0(r.order) : dash), t: f0(res.order) });
    if (sh.c_need) cols.push({ h: doc.kind === "usage" ? `ต้องเตรียมผ้า (${unit})` : `ผ้าที่ต้องใช้ (${unit})`, f: (r) => (r.need != null ? f2(r.need) : dash), t: f2(res.need), b: doc.kind === "usage" });
    if (doc.kind === "yield" && sh.c_can && res.ratio != null) cols.push({ h: "ทำได้", f: (r) => (r.can != null ? `${f0(r.can)} ใบ` : dash), t: `${f0(res.can)} ใบ`, b: true });
  }
  if (!res.rows.length) return "";
  const head = `<tr><th class="nt-l">ไซส์</th>${cols.map((x) => `<th>${x.h}</th>`).join("")}</tr>`;
  const body = res.rows.map((r) => `<tr><td class="nt-l">${esc(r.label || "—")}</td>${cols.map((x) => `<td${x.b ? ' class="nt-b"' : ""}>${x.f(r)}</td>`).join("")}</tr>`).join("");
  const tot = !single && sh.total && cols.some((x) => x.t) && res.rows.length > 1
    ? `<tr class="nt-tot"><td class="nt-l">รวม</td>${cols.map((x) => `<td${x.b ? ' class="nt-b"' : ""}>${x.t ?? ""}</td>`).join("")}</tr>` : "";
  return `<table class="nt-table">${head}${body}${tot}</table>`;
}

function summaryHtml(doc: NoticeDoc, res: NoticeResult): string {
  const c = doc.calc, unit = esc(c.unit || "หลา");
  if (doc.kind !== "yield" || !doc.display.show.summary || c.received == null) return "";
  if (c.mode === "single") return `<div class="nt-box nt-info">ผ้าที่ได้รับ ${f2(c.received)} ${unit} (คิดทีละไซส์ ไม่รวมกัน)</div>`;
  if (res.enough) return `<div class="nt-box nt-ok">ผ้าที่ได้รับ ${f2(c.received)} ${unit} <b>พอ</b> สำหรับจำนวนที่สั่ง · เหลือประมาณ ${f2(res.left)} ${unit}</div>`;
  const each = res.rows.filter((r) => r.can != null).map((r) => `${esc(r.label)} ${f0(r.can!)}`).join(" · ");
  return `<div class="nt-box nt-bad">ผ้าที่ได้รับ ${f2(c.received)} ${unit} · ต้องใช้ ${f2(res.need)} ${unit} · <b>ขาดอีก ${f2(res.short)} ${unit}</b>${each ? `<br/>ถ้าใช้ผ้าที่มีทั้งหมด ทำได้ประมาณ ${each} ใบ` : ""}</div>`;
}

export const NOTICE_CSS = `
  .nt-head { display:flex; justify-content:space-between; align-items:flex-start; gap:6mm; border-bottom:2px solid #0f172a; padding-bottom:3mm; }
  .nt-title { font-size:18px; font-weight:700; color:#0f172a; }
  .nt-sub { font-size:12px; color:#475569; margin-top:1mm; }
  .nt-co { text-align:right; font-size:11px; color:#475569; display:flex; flex-direction:column; align-items:flex-end; gap:1mm; max-width:48%; }
  .nt-co img { max-height:14mm; max-width:40mm; object-fit:contain; }
  .nt-co b { color:#0f172a; font-size:12px; }
  .nt-imgs { display:grid; gap:4mm; margin-top:5mm; align-items:start; }
  .nt-img { position:relative; break-inside:avoid; page-break-inside:avoid; }
  .nt-img img { display:block; width:100%; height:auto; object-fit:contain; border:1px solid #e2e8f0; border-radius:4px; background:#fff; }
  .nt-no { position:absolute; top:2mm; left:2mm; min-width:6mm; height:6mm; padding:0 1.5mm; border-radius:3mm; background:#0f172a; color:#fff; font-size:11px; display:flex; align-items:center; justify-content:center; }
  .nt-cap { margin-top:1.5mm; padding:2mm 3mm; border-radius:4px; background:#f1f5f9; border:1px solid #e2e8f0; font-size:12px; line-height:1.5; white-space:pre-wrap; color:#1e293b; }
  .nt-mat { margin-top:5mm; font-size:14px; font-weight:600; color:#0f172a; }
  .nt-unote { font-size:11.5px; font-weight:400; color:#64748b; }
  .nt-table { width:100%; border-collapse:collapse; margin-top:2mm; font-size:12.5px; }
  .nt-table th { background:#f1f5f9; color:#475569; font-weight:600; text-align:right; padding:2mm 2.5mm; border-bottom:1px solid #cbd5e1; }
  .nt-table td { text-align:right; padding:2mm 2.5mm; border-bottom:1px solid #e2e8f0; font-variant-numeric:tabular-nums; }
  .nt-table .nt-l { text-align:left; }
  .nt-table .nt-b { font-weight:700; color:#0f172a; }
  .nt-table .nt-tot td { font-weight:600; border-top:1px solid #94a3b8; }
  .nt-box { margin-top:3mm; padding:3mm 4mm; border-radius:6px; font-size:12.5px; line-height:1.6; }
  .nt-ok { background:#ecfdf5; color:#065f46; } .nt-bad { background:#fef2f2; color:#991b1b; } .nt-info { background:#eff6ff; color:#1e3a8a; }
  .nt-waste { margin-top:1.5mm; font-size:11px; color:#64748b; }
  .nt-note { margin-top:5mm; font-size:13px; line-height:1.7; white-space:pre-wrap; color:#0f172a; }
  .nt-sign { display:flex; justify-content:flex-end; margin-top:12mm; }
  .nt-sign div { width:60mm; text-align:center; font-size:11.5px; color:#475569; }
  .nt-sign i { display:block; border-bottom:1px dotted #94a3b8; height:10mm; margin-bottom:1.5mm; }
  .nt-foot { margin-top:6mm; padding-top:2mm; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b; }
`;

/** ใบแจ้งทั้งใบ (เอกสาร HTML เต็ม) — forImage = ทำ JPEG (พอดีเนื้อหา = ไม่บังคับสูงเท่ากระดาษ) */
export function buildNoticeHtml(doc: NoticeDoc, ctx: NoticeContext, opts: { forImage?: boolean; docTitle?: string } = {}): string {
  const sh = doc.display.show, fmt = doc.display.fmt;
  const abs = ctx.absUrl ?? ((u: string) => u);
  const res = computeNotice(doc.calc);

  // หัวกระดาษ
  const sub = [sh.docno && ctx.sheetCode, sh.job && ctx.sheetName, sh.customer && ctx.brandName].filter((x) => x && String(x).trim()).map(esc).join(" · ");
  const co = ctx.company;
  const right = [
    sh.logo && co?.logoUrl ? `<img src="${esc(abs(co.logoUrl))}" alt="" />` : "",
    sh.company && co?.name ? `<div><b>${esc(co.name)}</b>${co.address ? `<br/>${esc(co.address)}` : ""}</div>` : "",
    sh.date && ctx.dateText ? `<div>${esc(ctx.dateText)}</div>` : "",
  ].filter(Boolean).join("");
  const header = `<div class="nt-head"><div><div class="nt-title">${esc(doc.title || noticeKindMeta(doc.kind).title)}</div>${sub ? `<div class="nt-sub">${sub}</div>` : ""}</div>${right ? `<div class="nt-co">${right}</div>` : ""}</div>`;

  // รูป + คำอธิบายใต้รูป
  const cols = Math.max(1, Math.min(doc.img_cols || 2, doc.images.length || 1, 4));
  const maxMm = IMG_MAX_MM[cols] ?? 80;
  const imgs = sh.images && doc.images.length
    ? `<div class="nt-imgs" style="grid-template-columns:repeat(${cols},minmax(0,1fr));">${doc.images.map((im, i) => `<div class="nt-img"><div style="position:relative;"><img src="${esc(abs(im.url))}" alt="" style="max-height:${maxMm}mm;" />${sh.imgno ? `<span class="nt-no">${i + 1}</span>` : ""}</div>${sh.captions && im.caption.trim() ? `<div class="nt-cap">${esc(im.caption.trim())}</div>` : ""}</div>`).join("")}</div>`
    : "";

  // ตารางผ้า
  let calcHtml = "";
  if (noticeHasCalc(doc.kind)) {
    const tbl = tableHtml(doc, res);
    const waste = sh.waste && doc.calc.waste_pct > 0 && tbl ? `<div class="nt-waste">* ตัวเลขผ้ารวมเผื่อเสีย ${esc(doc.calc.waste_pct)}% แล้ว</div>` : "";
    const mat = sh.matname && doc.calc.material
      ? `<div class="nt-mat">${esc(doc.calc.material)}${doc.calc.unit_note ? ` <span class="nt-unote">· ${esc(doc.calc.unit || "หลา")} ${esc(doc.calc.unit_note)}</span>` : ""}</div>` : "";
    calcHtml = `${mat}${tbl}${summaryHtml(doc, res)}${waste}`;
  }

  const note = sh.note && doc.note.trim() ? `<div class="nt-note">${esc(doc.note.trim())}</div>` : "";
  const sign = sh.sign ? `<div class="nt-sign"><div><i></i>ลูกค้ารับทราบ / วันที่</div></div>` : "";
  const footBits = [sh.sender && ctx.senderName ? `ผู้แจ้ง: ${esc(ctx.senderName)}` : "", sh.phone && co?.phone ? `โทร ${esc(co.phone)}` : ""].filter(Boolean);
  const footer = footBits.length ? `<div class="nt-foot">${footBits.join(" · ")}</div>` : "";

  const tpl: ReportTemplate = {
    paper_size: fmt.paper, orientation: fmt.orientation,
    header_html: "{{{nt_header}}}", body_html: "{{{nt_body}}}", footer_html: "{{{nt_footer}}}",
    custom_css: NOTICE_CSS + (opts.forImage && fmt.jpg_size === "fit" ? " /* nt-fit */ .doc { min-height: 0 !important; }" : ""),
  };
  return buildReportHtml(tpl, { nt_header: header, nt_body: `${imgs}${calcHtml}${note}${sign}`, nt_footer: footer }, opts.docTitle);
}

/** แถวทะเบียนบริษัท (GET /api/admin/companies) → หัวกระดาษใบแจ้ง · id ไม่เจอ = บริษัทตั้งต้น */
export function noticeCompanyFrom(rows: Record<string, unknown>[], companyId: string | null): NoticeContext["company"] {
  const active = rows.filter((r) => String(r.status ?? "active") !== "inactive");
  const row = (companyId && active.find((r) => r.id === companyId)) || active.find((r) => r.is_default) || active[0];
  if (!row) return null;
  const name = String(row.name_th ?? "").trim() || String(row.name ?? "").trim();
  return { name, address: formatThaiAddress(row), phone: String(row.phone ?? "").trim(), logoUrl: r2ImageUrl(String(row.logo_key ?? "") || null, 600) };
}

/** วันที่แบบไทยสั้น เช่น 6 พ.ย. 2569 */
export const noticeDateText = (iso: string | null | undefined) =>
  new Date(iso || Date.now()).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
