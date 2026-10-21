"use client";

/**
 * ของกลาง — ฟอร์มตั้งค่า Section/Block ที่ "วาดเองจาก Schema" (lib/website-schema.ts)
 *
 * เพิ่มชนิดบล็อกใหม่ไม่ต้องแตะไฟล์นี้: แค่ประกาศ fields ใน schema แล้วช่องจะขึ้นเอง
 * ช่องแต่ละชนิด (text/textarea/number/range/select/toggle/image/link/href/color/list/emoji/video/map/products/category)
 * ใช้ของกลางเดิม: ImageUploadField (คลังรูป/อัปโหลด) · ColorInput · WebsiteProductPicker
 *
 * จัดกลุ่มช่องเป็นหมวด (เนื้อหา / รูป / ปุ่ม / การจัดวาง / สินค้า) · รองรับ showIf (โชว์เมื่อช่องอื่นเป็นค่าที่กำหนด)
 */
import { ImageCropBox, CropZoom } from "@/components/image-crop-box";
import { categoryChoiceLabel } from "@/lib/website-category-tree";
import { useMemo } from "react";
import { ImageUploadField } from "@/components/website-theme-media";
import { ColorInput } from "@/components/color-picker";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { WebsiteSkuPicker } from "@/components/website-sku-picker";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ERPDateTime24 } from "@/components/form";
import { FontSelect } from "@/components/font-select";
import { canvasFontNames, canvasFontOptions, useShopTheme } from "@/components/website-text-pickers";
import { FIELD_GROUP_LABEL, matchShowIf, type FieldDef, type FieldGroup } from "@/lib/website-schema";
import { BilingualField, useContentLang, useTranslateOne } from "@/components/bilingual-field";
import { confirmPatch, readMeta, translationPatch, translationStatus } from "@/lib/content-i18n";
import { englishValue, isTranslatable, thaiValue } from "@/lib/website-i18n";
import { WebsiteCategoriesField } from "@/components/website-categories-field";
import { WebsiteVideoField } from "@/components/website-video-field";
import { ImageSizeNote } from "@/components/image-size-note";
import { RangeInput } from "@/components/range-input";

export interface SchemaFormContext {
  shopSlug: string;
  shopId: string;
  /** ชื่อร้าน (ใช้ในคำสั่งแนะนำ AI) */
  shopName?: string;
  /** หมวดสินค้าบนเว็บของร้าน (จากแท็บจับคู่ฟิลด์) */
  /** parent = หมวดแม่ (หมวดย่อย) — รายการเรียงแบบต้นไม้ · imageKey/icon = รูป/ไอคอนหมวด (ตัวเลือกหมวดโชว์รูปย่อ) */
  categories: { key: string; label: string; parent?: string | null; imageKey?: string | null; icon?: string }[];
  /** Section ในหน้าที่กำลังจัด (ช่อง "กดแล้วไปที่ → เลื่อนไปส่วนอื่นในหน้านี้") */
  sections?: { id: string; label: string }[];
  /** 🃏 ค่าการ์ดสินค้าของร้านตอนนี้ (ธีม → การ์ดสินค้า) — ปิดสวิตช์ "ใช้การ์ดตามค่ากลางของร้าน" แล้วก๊อปมาเป็นค่าเริ่ม (FieldDef.copyShopCard) */
  themeCard?: Record<string, unknown>;
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
export const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

const GROUP_ORDER: FieldGroup[] = ["content", "media", "action", "products", "layout", "caption", "card"];

/**
 * ภาพร่างเล็ก ๆ ของตัวเลือกแบบปุ่มรูปย่อ (FieldOption.sketch) — กล่องเทา ๆ บอกการจัดวางคร่าว ๆ
 * เพิ่มแบบใหม่: ใส่ key + ช่องในกริด (col/row เริ่ม 1 · span) ที่นี่ แล้วอ้าง sketch: "<key>" ใน schema
 */
type Cell = { c: number; r: number; cs?: number; rs?: number; dim?: boolean; dark?: boolean; h?: number };
const SKETCHES: Record<string, { cols: number; rows: number; cells: Cell[] }> = {
  /** "เหมือนคอม" — จอคอม (กว้าง) กับ มือถือ (แคบ) */
  same: { cols: 5, rows: 1, cells: [{ c: 1, r: 1, cs: 3, dim: true }, { c: 5, r: 1, h: 100 }] },
  grid:{ cols: 4, rows: 2, cells: [1, 2, 3, 4].flatMap((c) => [{ c, r: 1 }, { c, r: 2 }]) },
  carousel: { cols: 7, rows: 1, cells: [{ c: 1, r: 1, cs: 2 }, { c: 3, r: 1, cs: 2 }, { c: 5, r: 1, cs: 2 }, { c: 7, r: 1, dim: true }] },
  feature: { cols: 4, rows: 2, cells: [{ c: 1, r: 1, cs: 2, rs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 2 }] },
  mosaic: { cols: 4, rows: 2, cells: [{ c: 1, r: 1, cs: 2, rs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 2, cs: 2 }] },
  lookbook: { cols: 2, rows: 1, cells: [{ c: 1, r: 1, dark: true }, { c: 2, r: 1, dark: true }] },
  spotlight: { cols: 5, rows: 1, cells: [{ c: 1, r: 1, dim: true, h: 60 }, { c: 2, r: 1, cs: 3, dark: true }, { c: 5, r: 1, dim: true, h: 60 }] },
  rank: { cols: 5, rows: 1, cells: [1, 2, 3, 4, 5].map((c) => ({ c, r: 1, dark: c === 1 })) },
  tabs: { cols: 4, rows: 3, cells: [{ c: 1, r: 1, h: 45, dark: true }, { c: 2, r: 1, h: 45, dim: true }, { c: 3, r: 1, h: 45, dim: true }, ...[1, 2, 3, 4].map((c) => ({ c, r: 2, rs: 2 }))] },
  banner: { cols: 4, rows: 1, cells: [{ c: 1, r: 1, cs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }] },
  /* ❓ คำถามที่พบบ่อย: เข้ม = หัวข้อ · แถบบาง = คำถาม */
  /* 🛍 ลุคบุ๊ก: เข้ม = รูปนายแบบ · อ่อน = การ์ดสินค้า */
  "lb-side": { cols: 5, rows: 3, cells: [{ c: 1, r: 1, cs: 3, rs: 3, dark: true }, { c: 4, r: 1, cs: 2, rs: 2 }, { c: 4, r: 3, cs: 2, h: 45 }] },
  "lb-pop": { cols: 5, rows: 3, cells: [{ c: 1, r: 1, cs: 5, rs: 3, dark: true }, { c: 3, r: 2, cs: 2, rs: 1 }] },
  "faq-side": { cols: 5, rows: 4, cells: [{ c: 1, r: 1, cs: 2, h: 70, dark: true }, { c: 1, r: 2, cs: 2, h: 40, dim: true }, ...[1, 2, 3, 4].map((r) => ({ c: 3, r, cs: 3, h: 45 }))] },
  "faq-center": { cols: 5, rows: 4, cells: [{ c: 2, r: 1, cs: 3, h: 70, dark: true }, ...[2, 3, 4].map((r) => ({ c: 2, r, cs: 3, h: 45 }))] },
  "faq-two": { cols: 4, rows: 4, cells: [{ c: 2, r: 1, cs: 2, h: 70, dark: true }, ...[2, 3, 4].flatMap((r) => [{ c: 1, r, cs: 2, h: 45 }, { c: 3, r, cs: 2, h: 45 }])] },
  "faq-tabs": { cols: 5, rows: 4, cells: [{ c: 2, r: 1, h: 55, dark: true }, { c: 3, r: 1, h: 55, dim: true }, { c: 4, r: 1, h: 55, dim: true }, ...[2, 3, 4].map((r) => ({ c: 2, r, cs: 3, h: 45 }))] },
  /* 📍 ตำแหน่งปุ่มบนแบนเนอร์ (Hero btnPos): 3×3 จุด เข้ม = ตรงที่ปุ่มอยู่ */
  ...Object.fromEntries(
    (["top", "middle", "bottom"] as const).flatMap((rv, ri) =>
      (["left", "center", "right"] as const).map((cv, ci) => [
        rv === "middle" && cv === "center" ? "pos-center" : `pos-${rv}-${cv}`,
        { cols: 3, rows: 3, cells: [1, 2, 3].flatMap((r) => [1, 2, 3].map((c) => ({ c, r, h: 55, dark: c === ci + 1 && r === ri + 1, dim: !(c === ci + 1 && r === ri + 1) }))) },
      ]),
    ),
  ),
  /* 🎞️ รูปทรงสไลด์ (สไลด์โชว์ shape): กล่องเข้มกลางช่อง = สัดส่วนกว้าง:สูง โดยประมาณ */
  "ss-height": { cols: 13, rows: 1, cells: [{ c: 1, r: 1, cs: 13, h: 60, dark: true }] },
  "ss-21-9": { cols: 13, rows: 1, cells: [{ c: 2, r: 1, cs: 11, dark: true }] },
  "ss-16-9": { cols: 13, rows: 1, cells: [{ c: 3, r: 1, cs: 9, dark: true }] },
  "ss-3-2": { cols: 13, rows: 1, cells: [{ c: 4, r: 1, cs: 7, dark: true }] },
  "ss-1-1": { cols: 13, rows: 1, cells: [{ c: 5, r: 1, cs: 5, dark: true }] },
  "ss-4-5": { cols: 13, rows: 1, cells: [{ c: 6, r: 1, cs: 3, h: 80, dark: true }] },
  "ss-3-4": { cols: 13, rows: 1, cells: [{ c: 6, r: 1, cs: 3, h: 90, dark: true }] },
  "ss-full": { cols: 13, rows: 1, cells: [{ c: 1, r: 1, cs: 13, dark: true }] },
  /* ใต้ข้อความ (แบบเดิม): บรรทัดข้อความ 2 แถบ + ปุ่มใต้ */
  "pos-flow": { cols: 3, rows: 3, cells: [{ c: 1, r: 1, cs: 2, h: 45, dim: true }, { c: 1, r: 2, cs: 2, h: 45, dim: true }, { c: 1, r: 3, h: 55, dark: true }] },
  /* กำหนดเอง: วางตรงไหนก็ได้ */
  "pos-custom": { cols: 5, rows: 3, cells: [{ c: 1, r: 1, cs: 5, rs: 3, dim: true }, { c: 4, r: 3, h: 55, dark: true }] },
  /* 📝 ข้อความประกอบรูป (แกลเลอรี capPos): เข้ม = รูป · อ่อน = ข้อความ · จาง = พื้นการ์ด (ชิ้นหลังวาดทับชิ้นก่อน) */
  "cap-below": { cols: 2, rows: 3, cells: [{ c: 1, r: 1, rs: 2, dark: true }, { c: 2, r: 1, rs: 2, dark: true }, { c: 1, r: 3, h: 45 }, { c: 2, r: 3, h: 45 }] },
  "cap-card": { cols: 2, rows: 3, cells: [{ c: 1, r: 1, rs: 3, dim: true }, { c: 2, r: 1, rs: 3, dim: true }, { c: 1, r: 1, rs: 2, dark: true, h: 85 }, { c: 2, r: 1, rs: 2, dark: true, h: 85 }, { c: 1, r: 3, h: 40 }, { c: 2, r: 3, h: 40 }] },
  "cap-overlay": { cols: 2, rows: 3, cells: [{ c: 1, r: 1, rs: 3, dark: true }, { c: 2, r: 1, rs: 3, dark: true }, { c: 1, r: 3, h: 40 }, { c: 2, r: 3, h: 40 }] },
  "cap-hover": { cols: 2, rows: 3, cells: [{ c: 1, r: 1, rs: 3, dark: true }, { c: 2, r: 1, rs: 3, dark: true }, { c: 2, r: 3, h: 40, dim: true }] },
};
function LayoutSketch({ kind, on }: { kind: string; on: boolean }) {
  const sk = SKETCHES[kind];
  if (!sk) return null;
  return (
    <div className="grid gap-[3px] h-9 items-stretch" style={{ gridTemplateColumns: `repeat(${sk.cols}, 1fr)`, gridTemplateRows: `repeat(${sk.rows}, 1fr)` }} aria-hidden>
      {sk.cells.map((x, i) => (
        <span
          key={i}
          className={`rounded-[3px] self-center ${x.dark ? (on ? "bg-blue-400" : "bg-slate-400") : on ? "bg-blue-200" : "bg-slate-200"} ${x.dim ? "opacity-50" : ""}`}
          style={{ gridColumn: `${x.c} / span ${x.cs ?? 1}`, gridRow: `${x.r} / span ${x.rs ?? 1}`, height: `${x.h ?? 100}%` }}
        />
      ))}
    </div>
  );
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
const FieldBox = Field;

/** ช่องกรอกล้วน (ไม่มีหัวข้อ/คำแนะนำ) — ใช้ใน widget 2 ภาษาที่วาดหัวให้เอง */
function BareField({ children }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <>{children}</>;
}

/** ปุ่ม/ลิงก์ = ข้อความ + ปลายทาง (เลือกจากรายการ: หน้า/หมวด/สินค้า/ส่วนในหน้า/ลิงก์นอก — ของกลาง LinkTargetPicker) */
/** ฟอนต์ตัวพิมพ์ดีดของเครื่อง (ไม่ต้องโหลดเพิ่ม) — ตรงกับ MONO_STACK ของเว็บร้าน (GalleryStrip) */
const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
/** 🔤 ช่องฟอนต์ของ Section (CANVAS_FONTS) — โชว์ฟอนต์หัวข้อ/เนื้อหาของร้านจริง */
function SchemaFontField({ fd, value, onChange, ctx }: { fd: FieldDef; value: string; onChange: (v: unknown) => void; ctx: SchemaFormContext }) {
  const { fontNames } = useShopTheme(ctx.shopSlug);
  // ตัวเลือกเพิ่มที่ช่องนี้ประกาศเอง (นอก CANVAS_FONTS) วางไว้บนสุด — เช่น "mono" ของแถวรูปลุคบุ๊ก
  const base = canvasFontOptions(fontNames);
  const extra = (fd.options ?? []).filter((o) => !base.some((b) => b.value === o.v)).map((o) => ({ value: o.v, label: o.l, family: o.v === "mono" ? MONO_FONT_STACK : `"${o.v}", sans-serif` }));
  return (
    <Field label={fd.label} hint={fd.hint} wide={fd.wide}>
      <FontSelect value={value} onChange={(v) => onChange(v)} options={[...extra, ...base]} googleFonts={canvasFontNames(fontNames)} />
    </Field>
  );
}

function LinkPair({ value, onChange, ctx }: { value: { text?: string; href?: string } | undefined; onChange: (v: { text: string; href: string }) => void; ctx: SchemaFormContext }) {
  const v = value ?? { text: "", href: "" };
  return (
    <div className="space-y-1.5">
      <input className={inputCls} placeholder="ข้อความปุ่ม (ว่าง = ไม่มีปุ่ม)" value={v.text ?? ""} onChange={(e) => onChange({ text: e.target.value, href: v.href ?? "" })} />
      <LinkTargetPicker value={v.href ?? ""} onChange={(href) => onChange({ text: v.text ?? "", href })} ctx={ctx} />
    </div>
  );
}

function ListEditor({ items, placeholder, max, onChange }: { items: string[]; placeholder?: string; max?: number; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5">
          <input className={inputCls} value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 text-sm" title="ลบรายการนี้">
            ×
          </button>
        </div>
      ))}
      {(!max || items.length < max) && (
        <button type="button" onClick={() => onChange([...items, ""])} className="text-xs text-blue-600 hover:underline">
          + เพิ่มรายการ
        </button>
      )}
    </div>
  );
}

/** ช่อง crop: ลากกรอบเลือกส่วนที่เห็น + ซูม (ของกลาง ImageCropBox) — กรอบตามสัดส่วนที่ตั้งใน Section แม่ */
function CropField({ fd, value, onChange, item, parent }: { fd: FieldDef; value: unknown; onChange: (v: unknown) => void; item?: Record<string, unknown>; parent?: Record<string, unknown> }) {
  const key = fd.cropImage ? item?.[fd.cropImage] : null;
  // สัดส่วนกรอบ: จาก Section แม่ (ช่องในชิ้นย่อย) หรือจากตัวเอง (ช่องใน Section)
  const fromSec = fd.cropRatio ? parent?.[fd.cropRatio] ?? item?.[fd.cropRatio] : null;
  // ค่าใน Section ที่ไม่ใช่สัดส่วน (เช่น สไลด์ "ตามความสูง" / "เต็มจอ") + มีกรอบประมาณ (cropBox) → ใช้กรอบประมาณ · ไม่มี = "ตามรูปจริง"
  const ratio = String(fromSec != null && (/^\d+:\d+$/.test(String(fromSec)) || !fd.cropBox) ? fromSec : fd.cropBox ?? "1:1");
  const o = (value ?? {}) as Record<string, unknown>;
  const v = { x: Number(o.x ?? 50), y: Number(o.y ?? 50), zoom: Number(o.zoom ?? 100) };
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (typeof key !== "string" || !key) return <Field label={fd.label} wide><p className="text-xs text-slate-400">เลือกรูปก่อน แล้วค่อยเลือกส่วนที่เห็น</p></Field>;
  if (!m) return <Field label={fd.label} wide><p className="text-xs text-slate-400">สัดส่วน &quot;ตามรูปจริง&quot; = เห็นทั้งรูป ไม่ต้องเลือกส่วน</p></Field>;
  return (
    <Field label={fd.label} hint="ลากกรอบ (หรือคลิกตรงไหนของรูป) = ส่วนที่โชว์บนเว็บ" wide>
      <div className="space-y-2">
        <ImageCropBox imageKey={key} box={{ w: Number(m[1]), h: Number(m[2]) }} value={v} onChange={(p) => onChange({ ...v, ...p })} />
        <CropZoom value={v.zoom} onChange={(z) => onChange({ ...v, zoom: z })} />
        {(v.x !== 50 || v.y !== 50 || v.zoom !== 100) && (
          <button type="button" className="text-[11px] text-slate-500 hover:text-blue-600" onClick={() => onChange({ x: 50, y: 50, zoom: 100 })}>
            ↺ กลับกลางรูป
          </button>
        )}
      </div>
    </Field>
  );
}

/** 📍 จุดบนรูป (ช่องชนิด point) — คลิกบนรูปของ Section แม่ (pointImage) เพื่อวางจุด · เก็บเป็น % */
function PointField({ fd, value, onChange, item, parent }: { fd: FieldDef; value: unknown; onChange: (v: unknown) => void; item?: Record<string, unknown>; parent?: Record<string, unknown> }) {
  // ลุคที่ (pointLook) → รูป `${pointImage}${n}` ของ Section แม่ (ลุค 1 = pointImage เดิม)
  const look = fd.pointLook ? String(item?.[fd.pointLook] ?? "1") : "1";
  const imgKey = fd.pointImage ? (look !== "1" ? `${fd.pointImage}${look}` : fd.pointImage) : null;
  const key = imgKey ? parent?.[imgKey] ?? item?.[imgKey] : null;
  const o = (value ?? {}) as Record<string, unknown>;
  const v = { x: Number(o.x ?? 50), y: Number(o.y ?? 50) };
  // จุดอื่นในชุดเดียวกัน (ชิ้นย่อยพี่น้องที่มีช่องนี้) → โชว์จาง ๆ ให้วางไม่ทับกัน
  const siblings: { x: number; y: number }[] = [];
  const isPt = (pv: unknown): pv is { x: unknown; y: unknown } => !!pv && typeof pv === "object" && Number.isFinite(Number((pv as { x?: unknown }).x)) && Number.isFinite(Number((pv as { y?: unknown }).y));
  // รูปเป็นของชิ้นนี้เอง (เช่น ลุคของรันเวย์ — แต่ละลุคคนละรูป) → จุดพี่น้อง = จุดอื่นในชิ้นเดียวกัน · ข้ามจุดที่ยังไม่เคยวาง (กลางรูปพอดี)
  const ownImage = !!imgKey && parent?.[imgKey] == null && item?.[imgKey] != null;
  if (ownImage)
    for (const [k, pv] of Object.entries(item ?? {})) {
      if (k === fd.key || !isPt(pv) || (Number(pv.x) === 50 && Number(pv.y) === 50)) continue;
      siblings.push({ x: Number(pv.x), y: Number(pv.y) });
    }
  else for (const arr of Object.values(parent ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const it of arr as Record<string, unknown>[]) {
      if (!it || typeof it !== "object" || it === item || (item?.id && it.id === item.id)) continue;
      if (fd.pointLook && String(it[fd.pointLook] ?? "1") !== look) continue; // คนละลุค = ไม่ต้องโชว์
      const pv = it[fd.key] as { x?: unknown; y?: unknown } | undefined;
      if (pv && typeof pv === "object" && Number.isFinite(Number(pv.x)) && Number.isFinite(Number(pv.y))) siblings.push({ x: Number(pv.x), y: Number(pv.y) });
    }
  }
  if (typeof key !== "string" || !key)
    return (
      <Field label={fd.label} wide>
        <p className="text-xs text-slate-400">{look !== "1" ? `ใส่ "รูปลุค ${look}" ของ Section ก่อน แล้วค่อยคลิกวางจุด` : "เลือกรูปของ Section ก่อน แล้วค่อยคลิกวางจุด"}</p>
      </Field>
    );
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const round = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
    onChange({ x: round(((e.clientX - r.left) / r.width) * 100), y: round(((e.clientY - r.top) / r.height) * 100) });
  };
  return (
    <Field label={fd.label} hint="คลิกบนรูปตรงตำแหน่งสินค้า = วางจุด (คลิกใหม่เพื่อย้าย)" wide>
      <div className="relative inline-block max-w-full cursor-crosshair select-none rounded-lg overflow-hidden border border-slate-200" onClick={pick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/r2-image?key=${encodeURIComponent(key)}&w=800`} alt="" className="block max-h-72 w-auto max-w-full" draggable={false} />
        {siblings.map((p, i) => (
          <span key={i} className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-white/70 border border-slate-500/60 pointer-events-none" style={{ left: `${p.x}%`, top: `${p.y}%` }} title="จุดอื่น" />
        ))}
        <span
          className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-white border-2 border-slate-900 shadow flex items-center justify-center pointer-events-none"
          style={{ left: `${v.x}%`, top: `${v.y}%` }}
        >
          <span className="w-2 h-2 rounded-full bg-slate-900" />
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">
        ตำแหน่ง: ซ้าย {v.x}% · บน {v.y}%
      </p>
    </Field>
  );
}

/**
 * 🌐 ช่องข้อความ 2 ภาษา (text/textarea/link/list) — ใช้ widget กลาง BilingualField
 * โหมดไทย = ช่องเดิมทุกอย่าง + ป้ายสถานะ · โหมด EN = ช่องอังกฤษ (`<key>_en`) + ไทยให้ดูเทียบ + ปุ่มแปล/ตรวจแล้ว
 */
function SchemaBilingual({
  fd,
  item,
  onPatch,
  thNode,
}: {
  fd: FieldDef;
  item: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  thNode: React.ReactNode;
}) {
  const th = thaiValue(fd, item);
  const en = englishValue(fd, item);
  const status = translationStatus(th, en, readMeta(item)[fd.key]);
  const tx = useTranslateOne();
  const thList = Array.isArray(th) ? th : [];
  const enList = Array.isArray(en) ? en : [];
  const enStr = typeof en === "string" ? en : "";
  const enMax = Math.ceil((fd.type === "link" ? 60 : fd.max ?? (fd.type === "textarea" ? 600 : 160)) * 1.5);
  const setEn = (v: string | string[]) => onPatch(translationPatch(item, fd.key, th, v, false));

  const enNode =
    fd.type === "list" ? (
      thList.length ? (
        <div className="space-y-1.5">
          {thList.map((t, i) => (
            <input key={i} className={inputCls} value={enList[i] ?? ""} placeholder={t || "English"} onChange={(e) => setEn(thList.map((_, j) => (j === i ? e.target.value : enList[j] ?? "")))} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">ยังไม่มีรายการ — เพิ่มที่โหมดภาษาไทยก่อน</p>
      )
    ) : fd.type === "textarea" ? (
      <textarea className={inputCls} rows={fd.max && fd.max > 1000 ? 6 : 3} value={enStr} placeholder="English" maxLength={enMax} onChange={(e) => setEn(e.target.value)} />
    ) : (
      <input className={inputCls} value={enStr} placeholder={fd.type === "link" ? "Button text" : "English"} maxLength={enMax} onChange={(e) => setEn(e.target.value)} />
    );

  return (
    <BilingualField
      label={fd.label}
      hint={fd.hint}
      wide={fd.wide || fd.type === "list" || fd.type === "textarea" || fd.type === "link"}
      status={status}
      thRef={Array.isArray(th) ? th.filter((x) => x.trim()).join("\n") : th}
      thNode={thNode}
      enNode={enNode}
      enNote={fd.type === "link" ? "ลิงก์ปลายทางใช้ร่วมกับภาษาไทย" : fd.type === "list" ? "จำนวน/ลำดับรายการตามภาษาไทย" : undefined}
      busy={tx.busy}
      error={tx.error}
      onTranslate={() =>
        tx.run(Array.isArray(th) ? th : [th], (out) =>
          onPatch(translationPatch(item, fd.key, th, Array.isArray(th) ? th.map((t, i) => (t.trim() ? out[i] ?? "" : "")) : out[0] ?? "", true)),
        )
      }
      onConfirm={() => onPatch(confirmPatch(item, fd.key, th))}
    />
  );
}

/** ช่องเดียวตาม schema */
export function SchemaField(props: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: SchemaFormContext;
  /** ค่าทั้งชิ้นที่ช่องนี้อยู่ (ช่อง crop อ่านรูปของชิ้นเดียวกัน) */
  item?: Record<string, unknown>;
  /** Section แม่ (ตอนแก้ Block ย่อย — ช่อง crop อ่านสัดส่วนกรอบ) */
  parent?: Record<string, unknown>;
  /** แก้หลายช่องพร้อมกัน (ช่อง 2 ภาษาเขียน `<key>_en` + `_i18n`) — ไม่ส่ง = ช่องภาษาเดียวแบบเดิม */
  onPatch?: (patch: Record<string, unknown>) => void;
}) {
  const { enabled } = useContentLang();
  const { fd, item, onPatch } = props;
  // 📂 หมวดที่โชว์ + รูปรายหมวด (แก้ 2 ช่องพร้อมกัน: cats + catImg) — ตัวเลือกหมวดของกลาง
  if (fd.type === "categories" && onPatch && item)
    return (
      <FieldBox label={fd.label} hint={fd.hint ?? "ไม่เลือก = ทุกหมวด"} wide>
        <WebsiteCategoriesField shopSlug={props.ctx.shopSlug} categories={props.ctx.categories} value={Array.isArray(props.value) ? (props.value as string[]) : []} item={item} onPatch={onPatch} fieldKey={fd.key} />
      </FieldBox>
    );
  // 📸 สวิตช์ "ใช้การ์ดตามค่ากลางของร้าน": ปิด → ก๊อปค่าการ์ดของร้านตอนนี้มาใส่ช่องในกลุ่ม (เริ่มจากหน้าตาเดิม) · ไม่มีค่าธีม = ใช้ค่าเริ่มของช่อง
  if (fd.copyShopCard && onPatch) {
    const copy = fd.copyShopCard;
    const card = props.ctx.themeCard;
    return (
      <div className="sm:col-span-2">
        <SchemaFieldInner {...props} onChange={(v) => onPatch(v === false && card ? { ...copy(card, props.item ?? {}), [fd.key]: false } : { [fd.key]: v })} />
      </div>
    );
  }
  const inner = <SchemaFieldInner {...props} />;
  // 🌐 อยู่ในแผงที่เปิดโหมด 2 ภาษา + ช่องนี้แปลได้ → ห่อด้วย widget กลาง (ช่องไทยข้างในหน้าตาเดิม)
  if (enabled && onPatch && item && isTranslatable(fd)) {
    return <SchemaBilingual fd={fd} item={item} onPatch={onPatch} thNode={<SchemaFieldInner {...props} bare />} />;
  }
  return inner;
}

function SchemaFieldInner({
  fd,
  value,
  onChange,
  ctx,
  item,
  parent,
  bare,
}: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: SchemaFormContext;
  item?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  /** true = ช่องกรอกล้วน ไม่มีหัวข้อ/คำแนะนำ (widget 2 ภาษาวาดหัวให้เอง) */
  bare?: boolean;
}) {
  // ช่องข้อความใน widget 2 ภาษา: วาดเฉพาะช่องกรอก (หัวข้อ + ป้ายสถานะ + คำแนะนำ อยู่ใน BilingualField)
  const Field = bare ? BareField : FieldBox;
  if (fd.type === "crop") return <CropField fd={fd} value={value} onChange={onChange} item={item} parent={parent} />;
  if (fd.type === "point") return <PointField fd={fd} value={value} onChange={onChange} item={item} parent={parent} />;
  if (fd.type === "datetime")
    return (
      <Field label={fd.label} hint={fd.hint ?? "เวลาไทย · พิมพ์เวลาแบบ 24 ชม. เช่น 20:00"} wide={fd.wide}>
        <ERPDateTime24 value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v)} defaultTime="00:00" />
      </Field>
    );
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  switch (fd.type) {
    case "text":
    case "emoji":
    case "href":
    case "video":
    case "map":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide || fd.type === "video" || fd.type === "map"}>
          <input className={inputCls} value={s} placeholder={fd.placeholder} maxLength={fd.max} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "target":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <LinkTargetPicker value={s} onChange={onChange} ctx={ctx} />
        </Field>
      );
    case "code":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <textarea
            className={`${inputCls} font-mono text-xs leading-relaxed`}
            rows={14}
            spellCheck={false}
            value={s}
            placeholder={fd.placeholder ?? "<style>\n  .promo { padding: 40px; text-align: center; }\n</style>\n<section class=\"promo\">\n  <h2>หัวข้อ</h2>\n</section>"}
            maxLength={fd.max}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {s.length.toLocaleString()} / {(fd.max ?? 40000).toLocaleString()} ตัวอักษร · script/iframe/onclick จะถูกถอดอัตโนมัติตอนบันทึก
          </p>
        </Field>
      );
    case "textarea":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide !== false}>
          <textarea className={inputCls} rows={fd.max && fd.max > 1000 ? 6 : 3} value={s} placeholder={fd.placeholder} maxLength={fd.max} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "number":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide}>
          <input
            type="number"
            className={inputCls}
            value={Number.isFinite(Number(value)) ? Number(value) : ""}
            min={fd.min}
            max={fd.numMax}
            step={fd.step ?? 1}
            onChange={(e) => onChange(e.target.value === "" ? fd.default ?? 0 : Number(e.target.value))}
          />
        </Field>
      );
    case "range":
      return (
        <Field label={`${fd.label}: ${Number(value) || 0}`} hint={fd.hint} wide={fd.wide}>
          {/* แถบเลื่อน + ช่องพิมพ์ตัวเลข (ของกลาง RangeInput · พิมพ์ได้ในช่วง min–numMax ของช่อง) */}
          <RangeInput value={Number(value) || 0} min={fd.min ?? 0} max={fd.numMax ?? 100} step={fd.step ?? 1} onChange={(v) => onChange(v)} />
        </Field>
      );
    case "select":
      // 🔤 ช่องฟอนต์ — เห็นหน้าตาฟอนต์จริงก่อนเลือก (ของกลาง FontSelect)
      if (fd.display === "font") return <SchemaFontField fd={fd} value={s} onChange={onChange} ctx={ctx} />;
      // 🎛️ ปุ่มรูปย่อ (display "tiles") — เห็นหน้าตาแต่ละแบบก่อนเลือก (เช่น รูปแบบการโชว์สินค้า)
      if (fd.display === "tiles")
        return (
          <Field label={fd.label} hint={fd.hint} wide>
            <div className="grid grid-cols-3 gap-1.5">
              {(fd.options ?? []).map((o) => {
                const on = s === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => onChange(o.v)}
                    title={o.hint ?? o.l}
                    className={`rounded-lg border p-1.5 text-left transition ${on ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400" : "border-slate-200 bg-white hover:border-slate-400"}`}
                  >
                    {o.sketch && <LayoutSketch kind={o.sketch} on={on} />}
                    <span className={`block text-[11px] leading-tight mt-1 ${on ? "text-blue-700 font-medium" : "text-slate-700"}`}>{o.l}</span>
                    {o.hint && <span className="block text-[10px] leading-tight text-slate-400 mt-0.5">{o.hint}</span>}
                  </button>
                );
              })}
            </div>
          </Field>
        );
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide}>
          <select className={inputCls} value={s} onChange={(e) => onChange(e.target.value)}>
            {(fd.options ?? []).map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        </Field>
      );
    case "toggle":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700 py-1.5 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>{fd.label}</span>
          {fd.hint && <span className="text-[11px] text-slate-400">— {fd.hint}</span>}
        </label>
      );
    case "image":
      return (
        <div className={fd.wide !== false ? "sm:col-span-2" : ""}>
          <ImageUploadField label={fd.label} hint={fd.hint} value={(value as string | null) ?? null} onChange={(k) => onChange(k)} height={80} />
          {/* 📏 ขนาดจริงของรูป + เตือนเมื่อเล็กไป (ช่องที่ตั้ง minPx เช่น รูปสไลด์/แบนเนอร์เต็มจอ) */}
          {fd.minPx ? <ImageSizeNote imageKey={(value as string | null) ?? null} minPx={fd.minPx} what={fd.minPx >= 2000 ? "แสดงเต็มจอคอม" : "จอมือถือ"} /> : null}
        </div>
      );
    case "videoFile":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <WebsiteVideoField value={(value as string | null) ?? null} onChange={(k) => onChange(k)} slot={fd.label.replace(/\s*\([^)]*\)\s*$/, "")} />
        </Field>
      );
    case "link":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide !== false}>
          <LinkPair value={value as { text?: string; href?: string } | undefined} onChange={onChange} ctx={ctx} />
        </Field>
      );
    case "color":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide}>
          <ColorInput value={s || "#ffffff"} onChange={(hex) => onChange(hex)} />
        </Field>
      );
    case "list":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <ListEditor items={Array.isArray(value) ? (value as string[]) : []} placeholder={fd.placeholder} max={fd.max} onChange={onChange} />
        </Field>
      );
    case "products":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <WebsiteProductPicker shopSlug={ctx.shopSlug} value={Array.isArray(value) ? (value as string[]) : []} max={fd.max} onChange={onChange} />
        </Field>
      );
    case "skus":
      return (
        <Field label={fd.label} hint={fd.hint} wide>
          <WebsiteSkuPicker shopSlug={ctx.shopSlug} value={Array.isArray(value) ? (value as string[]) : []} max={fd.max} onChange={onChange} />
        </Field>
      );
    case "categories": {
      // หลายหมวด เรียงตามลำดับที่กด · ไม่เลือก = ทุกหมวด
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={fd.label} hint={fd.hint ?? "ไม่เลือก = ทุกหมวด"} wide>
          {ctx.categories.length ? (
            <div className="flex flex-wrap gap-1.5">
              {ctx.categories.map((c) => {
                const i = cur.indexOf(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onChange(i >= 0 ? cur.filter((k) => k !== c.key) : [...cur, c.key])}
                    className={`rounded-full border px-2.5 py-1 text-xs ${i >= 0 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}
                  >
                    {i >= 0 && <span className="mr-1 tabular-nums">{i + 1}.</span>}
                    {categoryChoiceLabel(c)}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">ร้านนี้ยังไม่มีหมวด — ตั้งที่แท็บ 📂 หมวดหมู่</p>
          )}
        </Field>
      );
    }
    case "category":
      return (
        <Field label={fd.label} hint={fd.hint ?? "รายการหมวดตั้งที่แท็บ ⚙️ จับคู่ฟิลด์"} wide={fd.wide}>
          <select className={inputCls} value={s} onChange={(e) => onChange(e.target.value)}>
            <option value="">— เลือกหมวด —</option>
            {ctx.categories.map((c) => (
              <option key={c.key} value={c.key}>{categoryChoiceLabel(c)}</option>
            ))}
          </select>
        </Field>
      );
  }
}

/**
 * ฟอร์มทั้งชุดของ Section หรือ Block ย่อย — จัดกลุ่มตาม field.group
 * @param value ค่าปัจจุบัน (ฟิลด์อยู่ระดับบนของ object เหมือนที่เก็บใน DB)
 */
export function SchemaForm({
  fields,
  value,
  onChange,
  ctx,
  compact = false,
  parent,
}: {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  ctx: SchemaFormContext;
  /** Section แม่ (เฉพาะตอนแก้ Block ย่อย) */
  parent?: Record<string, unknown>;
  /** ชิ้นย่อย: ไม่แยกหัวกลุ่ม */
  compact?: boolean;
}) {
  // showIfParent = ช่องของชิ้นย่อยที่โชว์ตามค่าของ Section แม่ (เช่น "อยู่ลุคที่" เฉพาะลุคบุ๊กแบบหลายลุค)
  const visible = useMemo(
    () => fields.filter((fd) => !fd.hidden && matchShowIf(fd, value) && (!fd.showIfParent || matchShowIf({ ...fd, showIf: fd.showIfParent }, parent ?? {}))),
    [fields, value, parent],
  );
  const groups = useMemo(() => {
    const map = new Map<FieldGroup, FieldDef[]>();
    for (const fd of visible) {
      const g = fd.group ?? "content";
      map.set(g, [...(map.get(g) ?? []), fd]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [visible]);

  if (!visible.length) return <p className="text-xs text-slate-400 py-2">บล็อกนี้ไม่มีค่าให้ตั้ง</p>;

  return (
    <div className="space-y-4">
      {groups.map(([g, list]) => (
        <section key={g}>
          {!compact && groups.length > 1 && (
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{FIELD_GROUP_LABEL[g]}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((fd) => (
              <SchemaField key={fd.key} fd={fd} value={value[fd.key]} onChange={(v) => onChange({ [fd.key]: v })} onPatch={onChange} ctx={ctx} item={value} parent={parent} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
