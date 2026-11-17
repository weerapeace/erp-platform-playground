"use client";
/**
 * 🧭 ตั้งค่าตัวกรองหน้ารายการสินค้า (theme.listing.filters + ช่วงราคา/ขนาด/วันสินค้าใหม่) — อยู่ในแท็บ "หน้ารายการสินค้า"
 * ลาก ⠿ เรียงลำดับ · ติ๊กเปิด/ปิด · แก้ชื่อที่ลูกค้าเห็น · "กางไว้" = เปิดหน้ามาเห็นตัวเลือกเลย (ไม่ติ๊ก = พับไว้)
 * ฟิลด์สินค้า (ฟิลด์ Parent SKU ที่ส่งออกเว็บ) เพิ่มเป็นตัวกรองได้: ค่าตรงตัว หรือ "จัดกลุ่มด้วยคำ" (เช่น วัสดุ: หนัง = มีคำว่า หนัง/leather)
 * ของกลาง: useDragReorder/DragHandle · ColorToneButton (จัดโทนสี) · ตรรกะ/ค่าตั้งต้น lib/website-listing.ts · เว็บร้านคำนวณใน src/lib/shop-filters.ts
 */
import { LangInput } from "@/components/bilingual-field";
import { useState } from "react";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { ColorToneButton } from "@/components/color-tone-manager";
import {
  SHOP_FILTER_KIND_LABEL, normalizePriceBreaks, normalizeSizeBreaks, normalizeShopFilters,
  type ListingConfig, type ShopFilter, type ShopFilterKeyword,
} from "@/lib/website-listing";

const inputCls = "rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white";
const fmt = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/** คำอธิบายสั้น ๆ ว่ากลุ่มนี้ใช้ข้อมูลอะไรจากสินค้า */
const kindHint = (): Record<ShopFilter["kind"], string> => ({
  category: tr("หมวดของร้าน (แท็บ 📂 หมวดหมู่) · เลือกได้ทีละหมวด", "Shop categories (📂 Categories tab) · one at a time"),
  color: tr("สีของสินค้าจัดเป็นโทน — กดโทน “แดง” เห็นทุกเฉดแดง + รูปการ์ดเปลี่ยนเป็นสีนั้น", "Product colors grouped into tones — picking “red” shows every red shade + card image switches to that color"),
  price: tr("แบ่งช่วงจากราคาขาย", "Ranges from the selling price"),
  size: tr("ดูจากด้านที่ยาวที่สุด (กว้าง/สูง) ในแท็บขนาดของสินค้า", "Uses the longest side (width/height) from the product's size tab"),
  option2: tr("ไซส์จากปุ่มไซส์ของสินค้า (S/M/L …) เรียงเล็ก→ใหญ่ — สินค้าที่ไม่มีไซส์ไม่อยู่ในกลุ่มนี้ · ยังไม่มีสินค้าที่มีไซส์ = ซ่อนเองบนเว็บ", "Sizes from the product's size buttons (S/M/L …) small→large — products without sizes are excluded · no sized products = hidden on web"),
  collection: tr("คอลเลกชันที่ผูกไว้ในสินค้า", "Collections linked to the product"),
  fits: tr("ข้อมูล “ใส่ได้” ในแท็บขนาดของสินค้า — ยังไม่มีสินค้ากรอก กลุ่มนี้จะซ่อนเองบนเว็บ", "“Fits” data from the product's size tab — hidden on web until some product has it"),
  status: tr("พร้อมส่ง (มีของ) · กำลังลดราคา (มีราคาก่อนลด) · สินค้าใหม่", "Ready to ship (in stock) · On sale (has pre-sale price) · New"),
  field: tr("ค่าจากฟิลด์สินค้า", "Values from a product field"),
});

/** ชื่อชนิดตัวกรองภาษาอังกฤษ (ป้ายในหน้าจัดการเท่านั้น · ค่าไทยต้นฉบับอยู่ lib/website-listing) */
const KIND_LABEL_EN: Record<ShopFilter["kind"], string> = { category: "Category", color: "Color (tone)", price: "Price range", size: "Size", option2: "Size (size buttons)", collection: "Collection", fits: "Fits", status: "Status", field: "Product field" };

/** ช่องตัวเลขหลายค่าคั่นด้วยจุลภาค — เก็บข้อความไว้ระหว่างพิมพ์ แล้วค่อยแปลงตอนออกจากช่อง */
function NumsInput({ value, onCommit, className }: { value: number[]; onCommit: (v: number[]) => void; className?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      value={txt ?? value.join(", ")}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        // "1,500" = เลขมีลูกน้ำ (ไม่ใช่ 1 กับ 500) → ตัดลูกน้ำหลักพันก่อน แล้วค่อยแยกด้วยจุลภาค/เว้นวรรค
        if (txt != null) onCommit(txt.replace(/(\d),(?=\d{3}(?!\d))/g, "$1").split(/[,\s]+/).map((s) => Number(s.replace(/[^\d.]/g, ""))).filter((n) => n > 0));
        setTxt(null);
      }}
      className={className}
    />
  );
}
/** คำค้นของกลุ่ม (คั่นด้วยจุลภาค) */
function WordsInput({ value, onCommit }: { value: string[]; onCommit: (v: string[]) => void }) {
  const t = useT();
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <input
      value={txt ?? value.join(", ")}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt != null) onCommit([...new Set(txt.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 12));
        setTxt(null);
      }}
      placeholder={t("คำที่ต้องมี คั่นด้วย , เช่น หนัง, leather", "Words to match, comma-separated, e.g. leather, suede")}
      className={`${inputCls} flex-1 min-w-0`}
    />
  );
}

export function ShopFiltersEditor({
  value,
  onChange,
  fields,
}: {
  value: ListingConfig;
  onChange: (v: ListingConfig) => void;
  /** ฟิลด์ Parent SKU ที่ส่งออกเว็บ (choices.specFields) — ให้เลือกทำตัวกรองเพิ่ม */
  fields: { key: string; label: string }[];
}) {
  const t = useT();
  const KIND_HINT = kindHint();
  // กันธีมเก่าที่ยังไม่ผ่าน normalizeTheme (ปกติ API เกลามาให้แล้ว)
  const list = Array.isArray(value.filters) ? value.filters : normalizeShopFilters(undefined, value.colorFilter === false);
  // สี: ติ๊กเปิด/ปิดแถว = เปิด/ปิด colorFilter ด้วย (ค่าเดิมที่เว็บเก่าใช้)
  const setList = (filters: ShopFilter[]) => {
    const color = filters.find((f) => f.kind === "color");
    onChange({ ...value, filters, colorFilter: color ? color.enabled : value.colorFilter });
  };
  const patch = (id: string, p: Partial<ShopFilter>) => setList(list.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const drag = useDragReorder((from, to) => setList(moveItem(list, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState("");

  const used = new Set(list.filter((f) => f.kind === "field").map((f) => f.field));
  const freeFields = fields.filter((f) => !used.has(f.key));
  const fieldLabel = (k?: string) => fields.find((f) => f.key === k)?.label ?? k ?? "";
  const hasSettings = (f: ShopFilter) => f.kind === "price" || f.kind === "size" || f.kind === "status" || f.kind === "field";

  const addField = () => {
    const fl = fields.find((f) => f.key === addKey);
    if (!fl) return;
    const id = `f-${fl.key}`;
    setList([...list, { id, kind: "field", field: fl.key, label: fl.label.slice(0, 40), enabled: true, open: false, mode: "exact", keywords: [] }]);
    setAddKey("");
    setOpenId(id);
  };
  const setKw = (f: ShopFilter, keywords: ShopFilterKeyword[]) => patch(f.id, { keywords });

  const b = normalizePriceBreaks(value.priceBreaks);
  const priceLabels = [...b.map((v, i) => (i === 0 ? t(`ต่ำกว่า ${fmt(v)}`, `Under ${fmt(v)}`) : `${fmt(b[i - 1])}–${fmt(v)}`)), t(`${fmt(b[b.length - 1])} ขึ้นไป`, `${fmt(b[b.length - 1])} and up`)];

  const settings = (f: ShopFilter) => {
    if (f.kind === "price")
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("แบ่งช่วงที่ราคา (บาท)", "Price breaks (THB)")}
            <NumsInput value={b} onCommit={(v) => onChange({ ...value, priceBreaks: normalizePriceBreaks(v) })} className={`${inputCls} w-48`} />
          </div>
          <p className="text-[11px] text-slate-400">{t("ลูกค้าจะเห็น:", "Customers see:")} {priceLabels.join(" · ")}</p>
        </div>
      );
    if (f.kind === "size") {
      const [s, m] = normalizeSizeBreaks(value.sizeBreaks);
      const setS = (i: 0 | 1, n: number) => onChange({ ...value, sizeBreaks: normalizeSizeBreaks(i === 0 ? [n, m] : [s, n]) });
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {t("เล็ก = ไม่เกิน", "Small = up to")}
          <input type="number" min={1} value={s} onChange={(e) => setS(0, Number(e.target.value))} className={`${inputCls} w-16`} />
          {t("ซม. · กลาง = ไม่เกิน", "cm · Medium = up to")}
          <input type="number" min={1} value={m} onChange={(e) => setS(1, Number(e.target.value))} className={`${inputCls} w-16`} />
          {t("ซม. · ใหญ่ = มากกว่านั้น", "cm · Large = above that")}
        </div>
      );
    }
    if (f.kind === "status")
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {t("“สินค้าใหม่” = ขึ้นร้านไม่เกิน", "“New” = listed within")}
          <input
            type="number"
            min={1}
            max={365}
            value={value.newDays ?? 30}
            onChange={(e) => onChange({ ...value, newDays: Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 30))) })}
            className={`${inputCls} w-16`}
          />
          {t("วัน", "days")}
        </div>
      );
    if (f.kind === "field") {
      const kws = f.keywords ?? [];
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("ฟิลด์", "Field")}
            <select
              value={f.field}
              onChange={(e) => {
                const k = e.target.value;
                if (list.some((x) => x.id === `f-${k}`)) return;
                const id = `f-${k}`;
                setList(list.map((x) => (x.id === f.id ? { ...x, id, field: k } : x)));
                setOpenId(id);
              }}
              className={inputCls}
            >
              {!fields.some((x) => x.key === f.field) && <option value={f.field}>{f.field}</option>}
              {fields.map((x) => (
                <option key={x.key} value={x.key} disabled={x.key !== f.field && used.has(x.key)}>
                  {x.label}
                </option>
              ))}
            </select>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {([
                ["exact", t("ค่าตรงตัว", "Exact value")],
                ["keywords", t("จัดกลุ่มด้วยคำ", "Group by words")],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => patch(f.id, { mode: v })}
                  className={`px-2.5 py-1 text-xs ${(f.mode ?? "exact") === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {f.mode === "keywords" ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-400">{t("ตัวเลือกบนเว็บ = ชื่อกลุ่ม · สินค้าเข้ากลุ่มเมื่อค่าในฟิลด์มีคำใดคำหนึ่ง (ไม่สนตัวพิมพ์เล็ก/ใหญ่) · 1 สินค้าเข้าได้หลายกลุ่ม", "Web options = group names · a product joins a group when the field contains any of its words (case-insensitive) · one product can be in several groups")}</p>
              {kws.map((k, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <LangInput
                    obj={k}
                    k="label"
                    maxLength={40}
                    onPatch={(p) => setKw(f, kws.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                    placeholder={t("ชื่อกลุ่ม เช่น หนัง", "Group name, e.g. Leather")}
                    className={`${inputCls} w-32`}
                  />
                  <WordsInput value={k.words} onCommit={(words) => setKw(f, kws.map((x, j) => (j === i ? { ...x, words } : x)))} />
                  <button type="button" onClick={() => setKw(f, kws.filter((_, j) => j !== i))} className="text-xs px-1.5 text-slate-400 hover:text-red-600" title={t("ลบกลุ่มนี้", "Delete this group")}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setKw(f, [...kws, { label: "", words: [] }])} className="text-xs text-blue-600 hover:underline">
                ＋ {t("เพิ่มกลุ่มคำ", "Add word group")}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">{t("ตัวเลือกบนเว็บ = ค่าที่กรอกในสินค้าแต่ละตัว (พิมพ์ไม่เหมือนกัน = แยกเป็นคนละตัวเลือก) · ถ้าค่าเป็นข้อความยาว ๆ ใช้ “จัดกลุ่มด้วยคำ” จะเรียบร้อยกว่า", "Web options = the value entered on each product (different spelling = separate options) · for long text values, “Group by words” is tidier")}</p>
          )}
          <button type="button" onClick={() => setList(list.filter((x) => x.id !== f.id))} className="text-xs text-red-600 hover:underline">
            🗑 {t("เอาตัวกรองนี้ออก", "Remove this filter")}
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        {t("ลาก ⠿ เรียงลำดับ · ติ๊กช่องซ้าย = เปิดใช้ · แก้ชื่อที่ลูกค้าเห็นได้ ·", "Drag ⠿ to reorder · left checkbox = enabled · you can edit the name customers see ·")} <b>{t("กางไว้", "Expanded")}</b> {t("= เปิดหน้ามาเห็นตัวเลือกเลย (ไม่ติ๊ก = พับ ลูกค้ากดหัวข้อเพื่อกาง) · กลุ่มที่สินค้ายังไม่มีข้อมูล จะซ่อนเองบนเว็บ", "= options visible on page load (unticked = collapsed, customers tap the heading to open) · groups with no product data are hidden on web")}
      </p>
      <ul className="space-y-1">
        {list.map((f, i) => {
          const open = openId === f.id;
          return (
            <li key={f.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${open ? "border-blue-300" : "border-slate-200"} ${drag.rowCls(i)} ${f.enabled ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <input type="checkbox" checked={f.enabled} onChange={(e) => patch(f.id, { enabled: e.target.checked })} className="w-4 h-4 accent-blue-600" title={t("เปิดใช้", "Enabled")} />
                <LangInput obj={f} k="label" maxLength={40} onPatch={(p) => patch(f.id, p)} className={`${inputCls} w-32`} ariaLabel={t("ชื่อที่ลูกค้าเห็น", "Name customers see")} />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">
                  {f.kind === "field" ? `${t("ฟิลด์", "Field")}: ${fieldLabel(f.field)}${f.mode === "keywords" ? t(" · กลุ่มคำ", " · word groups") : ""}` : t(SHOP_FILTER_KIND_LABEL[f.kind], KIND_LABEL_EN[f.kind])}
                </span>
                <span className="text-[11px] text-slate-400 flex-1 min-w-[8rem] truncate" title={KIND_HINT[f.kind]}>
                  {f.kind === "field" ? "" : KIND_HINT[f.kind]}
                </span>
                <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={f.open} onChange={(e) => patch(f.id, { open: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
                  {t("กางไว้", "Expanded")}
                </label>
                {f.kind === "color" && <ColorToneButton label={t("🎨 จัดโทนสี", "🎨 Color tones")} />}
                {hasSettings(f) && (
                  <button type="button" onClick={() => setOpenId(open ? null : f.id)} className={`text-xs px-2 py-0.5 rounded border ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    ⚙ {t("ตั้งค่า", "Settings")}
                  </button>
                )}
              </div>
              {open && hasSettings(f) && <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/50">{settings(f)}</div>}
            </li>
          );
        })}
      </ul>
      {freeFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={addKey} onChange={(e) => setAddKey(e.target.value)} className={inputCls}>
            <option value="">{t("＋ เพิ่มตัวกรองจากฟิลด์สินค้า…", "＋ Add filter from a product field…")}</option>
            {freeFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          {addKey && (
            <button type="button" onClick={addField} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              {t("เพิ่ม", "Add")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
