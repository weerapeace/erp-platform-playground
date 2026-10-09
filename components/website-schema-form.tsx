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
import { useMemo } from "react";
import { ImageUploadField } from "@/components/website-theme-media";
import { ColorInput } from "@/components/color-picker";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { FIELD_GROUP_LABEL, type FieldDef, type FieldGroup } from "@/lib/website-schema";

export interface SchemaFormContext {
  shopSlug: string;
  shopId: string;
  /** ชื่อร้าน (ใช้ในคำสั่งแนะนำ AI) */
  shopName?: string;
  /** หมวดสินค้าบนเว็บของร้าน (จากแท็บจับคู่ฟิลด์) */
  categories: { key: string; label: string }[];
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
export const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

const GROUP_ORDER: FieldGroup[] = ["content", "media", "action", "products", "layout"];

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

/** ช่องเดียวตาม schema */
export function SchemaField({
  fd,
  value,
  onChange,
  ctx,
}: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: SchemaFormContext;
}) {
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
}: {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  ctx: SchemaFormContext;
  /** ชิ้นย่อย: ไม่แยกหัวกลุ่ม */
  compact?: boolean;
}) {
  const visible = useMemo(() => fields.filter((fd) => !fd.showIf || value[fd.showIf.key] === fd.showIf.eq), [fields, value]);
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
              <SchemaField key={fd.key} fd={fd} value={value[fd.key]} onChange={(v) => onChange({ [fd.key]: v })} ctx={ctx} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
