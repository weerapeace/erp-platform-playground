/**
 * product-listing-checks — ตัวเช็กข้อมูลสินค้าก่อนลงขาย (pure · ไม่ยิง DB · ทดสอบได้)
 *
 * เตือนอย่างเดียว ไม่บล็อกการบันทึก/อนุมัติ — คนตรวจเป็นคนตัดสิน (เจ้าของเลือก: เตือนเป็นภาษาคน ไม่เดาค่าให้)
 * เช็ก: บรรทัด Description ซ้ำ · อังกฤษสั้นกว่าไทยมาก/ไม่มี · ตัวเลข ซม. ไทยกับอังกฤษไม่ตรง · ไม่ใส่ขนาด
 *       ชื่อสีว่าง/ผิดภาษา · ไม่มีราคาขาย · ไม่มีราคาขีดฆ่า/ขีดฆ่าไม่สูงกว่าราคาขาย · ไม่มีรูป
 * ห้ามรับต้นทุน (standard_price) เข้ามา — ตัวเช็กนี้ใช้ในจอที่คนทั่วไปเห็น
 *
 * ใช้ที่: components/product-quick-check (แผงตรวจสินค้าเร็ว) · เทสต์ lib/__tests__/product-listing-checks.test.ts
 */
import { tr } from "@/lib/lang";

export type ListingCheckSection = "desc" | "sku" | "img";
export type ListingCheck = { key: string; section: ListingCheckSection; text: string };

export type ListingSku = {
  code: string;
  color_th: string | null;
  color_en: string | null;
  list_price: number | null;   // ราคาขาย
  fake_price: number | null;   // ราคาขีดฆ่า
  images: number;
};
export type ListingParent = {
  code: string;
  introduction: string | null;
  description: string | null;          // Description ไทย
  english_description: string | null;  // Description อังกฤษ
  size: { length: number | null; height: number | null; thickness: number | null } | null;
  parent_images: number;
  description_images: number;
  skus: ListingSku[];
};

/** สินค้า 1 รุ่นที่แผงตรวจเร็วแสดง (= ข้อมูลที่ตัวเช็กใช้ + ชื่อ/รหัส) — มาจาก GET /api/creative-tasks/[id]/quick-check */
export type QuickCheckParent = ListingParent & { id: string; name: string; thumbs?: string[] };   // thumbs = r2 key รูป Parent สูงสุด 6 รูป (ไว้โชว์แถวรูปย่อ)

const THAI = /[฀-๿]/;
export const hasThai = (s: string | null | undefined) => THAI.test(s ?? "");

/** แตกบรรทัด Description (ตัดขีดนำหน้า/ช่องว่าง · ทิ้งบรรทัดว่าง) */
export function descLines(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((s) => s.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.。]+$/, "").trim();

/** บรรทัดที่ซ้ำกัน (คืนข้อความบรรทัดแรกที่เจอ ตัวละครั้งเดียว) */
export function duplicateLines(text: string | null | undefined): string[] {
  const seen = new Map<string, string>(); const dup: string[] = [];
  for (const l of descLines(text)) {
    const k = norm(l);
    if (seen.has(k)) { if (!dup.includes(seen.get(k)!)) dup.push(seen.get(k)!); }
    else seen.set(k, l);
  }
  return dup;
}
/** บรรทัดนี้ซ้ำกับบรรทัดอื่นไหม (ใช้ระบายสีในจอ) */
export const isDuplicateLine = (line: string, dups: string[]) => dups.some((d) => norm(d) === norm(line));

/** ตัวเลขที่ตามด้วย ซม./cm (เช่น "28 ซม.", "Handle drop: 40 cm") */
export function cmNumbers(text: string | null | undefined): number[] {
  return [...(text ?? "").matchAll(/(\d+(?:\.\d+)?)\s*(?:ซม|cm)/gi)].map((m) => Number(m[1]));
}

/** ชื่อสีที่ไว้แสดง (ตัด "(01)" ท้ายชื่อแบบ platform ออก) */
export const plainColor = (s: string | null | undefined) => (s ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();

/** จุดที่ควรเช็กของ SKU 1 ตัว (ใช้ระบายช่องในตาราง) */
export function skuFlags(s: ListingSku) {
  const th = plainColor(s.color_th), en = plainColor(s.color_en);
  return {
    colorTh: !th || !hasThai(th),            // ว่าง หรือเขียนเป็นอังกฤษ
    colorEn: !en || hasThai(en),             // ว่าง หรือเขียนเป็นไทย
    listPrice: !(Number(s.list_price) > 0),
    fakePrice: !(Number(s.fake_price) > 0) || Number(s.fake_price) <= Number(s.list_price),
    images: s.images <= 0,
  };
}

/** รวมจุดที่ควรเช็กของสินค้า 1 รุ่น */
export function listingChecks(p: ListingParent): ListingCheck[] {
  const out: ListingCheck[] = [];
  const add = (key: string, section: ListingCheckSection, text: string) => out.push({ key, section, text });

  const th = descLines(p.description), en = descLines(p.english_description);
  if (!th.length) add("desc_th_empty", "desc", tr("ยังไม่มี Description ไทย", "Thai description is empty"));
  if (!en.length) add("desc_en_empty", "desc", tr("ยังไม่มี Description อังกฤษ", "English description is empty"));
  const dt = duplicateLines(p.description), de = duplicateLines(p.english_description);
  if (dt.length) add("desc_th_dup", "desc", tr(`Description ไทยมีบรรทัดซ้ำ: ${dt.join(", ")}`, `Thai description repeats: ${dt.join(", ")}`));
  if (de.length) add("desc_en_dup", "desc", tr(`Description อังกฤษมีบรรทัดซ้ำ: ${de.join(", ")}`, `English description repeats: ${de.join(", ")}`));
  if (th.length && en.length && en.length * 2 < th.length) add("desc_en_short", "desc", tr(`Description อังกฤษสั้นกว่าไทยมาก (${en.length} บรรทัด จาก ${th.length})`, `English description is much shorter (${en.length} of ${th.length} lines)`));
  const enCm = cmNumbers(p.english_description), miss = [...new Set(cmNumbers(p.description).filter((v) => !enCm.includes(v)))];
  if (miss.length && enCm.length) add("desc_cm_mismatch", "desc", tr(`ตัวเลขไทยกับอังกฤษไม่ตรง: ${miss.join(", ")} ซม. ไม่มีในฉบับอังกฤษ`, `Numbers differ: ${miss.join(", ")} cm missing in English`));
  const sz = p.size;
  if (!sz || !(Number(sz.length) > 0 || Number(sz.height) > 0 || Number(sz.thickness) > 0)) add("size_missing", "desc", tr("ยังไม่ได้ใส่ขนาด (กว้าง × สูง × หนา)", "Size (W × H × D) is missing"));

  const n = (pick: (f: ReturnType<typeof skuFlags>, s: ListingSku) => boolean) => p.skus.filter((s) => pick(skuFlags(s), s)).length;
  const enEmpty = n((_, s) => !plainColor(s.color_en)), enThai = n((_, s) => !!plainColor(s.color_en) && hasThai(plainColor(s.color_en)));
  const thEmpty = n((_, s) => !plainColor(s.color_th)), thEng = n((_, s) => !!plainColor(s.color_th) && !hasThai(plainColor(s.color_th)));
  if (thEmpty) add("color_th_empty", "sku", tr(`ชื่อสีไทยว่าง ${thEmpty} ตัว`, `${thEmpty} SKU(s) missing Thai color name`));
  if (thEng) add("color_th_english", "sku", tr(`ชื่อสีไทยเขียนเป็นภาษาอังกฤษ ${thEng} ตัว`, `${thEng} Thai color name(s) written in English`));
  if (enEmpty) add("color_en_empty", "sku", tr(`ชื่อสีอังกฤษว่าง ${enEmpty} ตัว`, `${enEmpty} SKU(s) missing English color name`));
  if (enThai) add("color_en_thai", "sku", tr(`ชื่อสีอังกฤษเขียนเป็นภาษาไทย ${enThai} ตัว`, `${enThai} English color name(s) written in Thai`));
  const noList = n((f) => f.listPrice);
  if (noList) add("price_missing", "sku", tr(`ยังไม่ใส่ราคาขาย ${noList} ตัว`, `${noList} SKU(s) without a sale price`));
  const noFake = n((_, s) => !(Number(s.fake_price) > 0)), lowFake = n((_, s) => Number(s.fake_price) > 0 && Number(s.fake_price) <= Number(s.list_price));
  if (noFake) add("fake_missing", "sku", tr(`ยังไม่ใส่ราคาขีดฆ่า ${noFake} ตัว`, `${noFake} SKU(s) without a strikethrough price`));
  if (lowFake) add("fake_low", "sku", tr(`ราคาขีดฆ่าไม่สูงกว่าราคาขาย ${lowFake} ตัว`, `${lowFake} strikethrough price(s) not above the sale price`));

  if (p.parent_images <= 0) add("parent_no_images", "img", tr("Parent ยังไม่มีรูป", "Parent has no images"));
  const noImg = n((f) => f.images);
  if (noImg && p.skus.length) add("sku_no_images", "sku", tr(`SKU ยังไม่มีรูป ${noImg} จาก ${p.skus.length} ตัว`, `${noImg} of ${p.skus.length} SKUs have no images`));
  return out;
}

/** สรุปราคา: ทุกสีราคาเท่ากันไหม (ไว้โชว์บรรทัดเดียวแทนการไล่ดูทั้งตาราง) */
export function priceSummary(skus: ListingSku[]): { same: boolean; list: number | null; fake: number | null; discountPct: number | null } {
  const lists = [...new Set(skus.map((s) => Number(s.list_price) || 0))], fakes = [...new Set(skus.map((s) => Number(s.fake_price) || 0))];
  if (!skus.length || lists.length !== 1 || fakes.length !== 1) return { same: false, list: null, fake: null, discountPct: null };
  const list = lists[0] || null, fake = fakes[0] || null;
  const discountPct = list && fake && fake > list ? Math.round((1 - list / fake) * 100) : null;
  return { same: true, list, fake, discountPct };
}

/** จัดกลุ่ม SKU ตามรหัสหลัก (WK46-01D/G/N → WK46-01) สำหรับรุ่นที่มีแบบย่อยเยอะ */
export function groupSkusByBase(skus: ListingSku[]): { base: string; items: ListingSku[] }[] {
  const map = new Map<string, ListingSku[]>();
  for (const s of skus) { const b = s.code.replace(/(-\d+)[A-Za-z]+$/, "$1"); map.set(b, [...(map.get(b) ?? []), s]); }
  return [...map.entries()].map(([base, items]) => ({ base, items }));
}
