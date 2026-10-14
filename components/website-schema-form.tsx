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
import { useMemo } from "react";
import { ImageUploadField } from "@/components/website-theme-media";
import { ColorInput } from "@/components/color-picker";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { FIELD_GROUP_LABEL, matchShowIf, type FieldDef, type FieldGroup } from "@/lib/website-schema";

export interface SchemaFormContext {
  shopSlug: string;
  shopId: string;
  /** ชื่อร้าน (ใช้ในคำสั่งแนะนำ AI) */
  shopName?: string;
  /** หมวดสินค้าบนเว็บของร้าน (จากแท็บจับคู่ฟิลด์) */
  categories: { key: string; label: string }[];
  /** Section ในหน้าที่กำลังจัด (ช่อง "กดแล้วไปที่ → เลื่อนไปส่วนอื่นในหน้านี้") */
  sections?: { id: string; label: string }[];
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
export const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

const GROUP_ORDER: FieldGroup[] = ["content", "media", "action", "products", "layout"];

/**
 * ภาพร่างเล็ก ๆ ของตัวเลือกแบบปุ่มรูปย่อ (FieldOption.sketch) — กล่องเทา ๆ บอกการจัดวางคร่าว ๆ
 * เพิ่มแบบใหม่: ใส่ key + ช่องในกริด (col/row เริ่ม 1 · span) ที่นี่ แล้วอ้าง sketch: "<key>" ใน schema
 */
type Cell = { c: number; r: number; cs?: number; rs?: number; dim?: boolean; dark?: boolean; h?: number };
const SKETCHES: Record<string, { cols: number; rows: number; cells: Cell[] }> = {
  grid: { cols: 4, rows: 2, cells: [1, 2, 3, 4].flatMap((c) => [{ c, r: 1 }, { c, r: 2 }]) },
  carousel: { cols: 7, rows: 1, cells: [{ c: 1, r: 1, cs: 2 }, { c: 3, r: 1, cs: 2 }, { c: 5, r: 1, cs: 2 }, { c: 7, r: 1, dim: true }] },
  feature: { cols: 4, rows: 2, cells: [{ c: 1, r: 1, cs: 2, rs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 2 }] },
  mosaic: { cols: 4, rows: 2, cells: [{ c: 1, r: 1, cs: 2, rs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 3, r: 2, cs: 2 }] },
  lookbook: { cols: 2, rows: 1, cells: [{ c: 1, r: 1, dark: true }, { c: 2, r: 1, dark: true }] },
  spotlight: { cols: 5, rows: 1, cells: [{ c: 1, r: 1, dim: true, h: 60 }, { c: 2, r: 1, cs: 3, dark: true }, { c: 5, r: 1, dim: true, h: 60 }] },
  rank: { cols: 5, rows: 1, cells: [1, 2, 3, 4, 5].map((c) => ({ c, r: 1, dark: c === 1 })) },
  tabs: { cols: 4, rows: 3, cells: [{ c: 1, r: 1, h: 45, dark: true }, { c: 2, r: 1, h: 45, dim: true }, { c: 3, r: 1, h: 45, dim: true }, ...[1, 2, 3, 4].map((c) => ({ c, r: 2, rs: 2 }))] },
  banner: { cols: 4, rows: 1, cells: [{ c: 1, r: 1, cs: 2, dark: true }, { c: 3, r: 1 }, { c: 4, r: 1 }] },
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

function LinkPair({ value, onChange }: { value: { text?: string; href?: string } | undefined; onChange: (v: { text: string; href: string }) => void }) {
  const v = value ?? { text: "", href: "" };
  return (
    <div className="flex gap-2">
      <input className={inputCls} placeholder="ข้อความปุ่ม" value={v.text ?? ""} onChange={(e) => onChange({ text: e.target.value, href: v.href ?? "" })} />
      <input className={inputCls} placeholder="/shop หรือ https://…" value={v.href ?? ""} onChange={(e) => onChange({ text: v.text ?? "", href: e.target.value })} />
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
  const ratio = String((fd.cropRatio ? parent?.[fd.cropRatio] ?? item?.[fd.cropRatio] : null) ?? "1:1");
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

/** ช่องเดียวตาม schema */
export function SchemaField({
  fd,
  value,
  onChange,
  ctx,
  item,
  parent,
}: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: SchemaFormContext;
  /** ค่าทั้งชิ้นที่ช่องนี้อยู่ (ช่อง crop อ่านรูปของชิ้นเดียวกัน) */
  item?: Record<string, unknown>;
  /** Section แม่ (ตอนแก้ Block ย่อย — ช่อง crop อ่านสัดส่วนกรอบ) */
  parent?: Record<string, unknown>;
}) {
  if (fd.type === "crop") return <CropField fd={fd} value={value} onChange={onChange} item={item} parent={parent} />;
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
          <input type="range" className="w-full accent-blue-600" value={Number(value) || 0} min={fd.min ?? 0} max={fd.numMax ?? 100} step={fd.step ?? 1} onChange={(e) => onChange(Number(e.target.value))} />
        </Field>
      );
    case "select":
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
        </div>
      );
    case "link":
      return (
        <Field label={fd.label} hint={fd.hint} wide={fd.wide !== false}>
          <LinkPair value={value as { text?: string; href?: string } | undefined} onChange={onChange} />
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
                    {c.label}
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
              <option key={c.key} value={c.key}>{c.label}</option>
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
  const visible = useMemo(() => fields.filter((fd) => matchShowIf(fd, value)), [fields, value]);
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
              <SchemaField key={fd.key} fd={fd} value={value[fd.key]} onChange={(v) => onChange({ [fd.key]: v })} ctx={ctx} item={value} parent={parent} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
