"use client";

/**
 * ของกลาง — ตาราง "สินค้าที่ขาย" (บนจอ)
 *
 * รวมทุกลูกค้า / แยกตามลูกค้า · เรียงตาม ยอดเงิน/จำนวน/ชื่อ/รหัส · โชว์รูป (ไม่โชว์/เล็ก/ใหญ่) · คอลัมน์ %
 * ยอดรวมจำนวน "แยกตามหน่วย" ทั้งรายลูกค้าและรวมทั้งหมด
 *
 * ตัวเลือกเป็นแบบ "คุมจากข้างนอก" (opts + onChange) เพื่อให้ใบพิมพ์ใช้ค่าเดียวกัน และจำรายคนด้วย useReportOptions
 *   const { opts, set } = useReportOptions("sales_monthly_products", DEFAULT_PRODUCT_OPTIONS);
 *   <SoldProductsTable products={rep.products} opts={opts} onChange={set} />
 *   // ใบพิมพ์: ส่ง opts เดียวกันเข้าตัวสร้าง HTML แล้วเรียง/รวมผ่าน lib/sold-products
 *
 * ใช้ตารางกลาง MiniTable (ค้นหา/เรียง/จัดกลุ่ม) + รูปย่อกลาง HoverImage
 */
import { useMemo } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import {
  defaultSortDir, fmtQty, groupByCustomer, mergeProducts, productThumb, qtyByUnit, sortProducts, sumAmt,
  type ProductSortKey, type ProductTableOptions, type SoldProduct,
} from "@/lib/sold-products";

const baht = (n: number) => Math.round(n || 0).toLocaleString("th-TH");
const qtyText = (list: SoldProduct[]) => qtyByUnit(list).map(u => fmtQty(u.qty, u.unit)).join(" · ");
const IMG_PX = { none: 0, small: 28, large: 56 } as const;

function Seg<V extends string>({ value, options, onChange, full = false }: {
  value: V; options: { v: V; label: string }[]; onChange: (v: V) => void; full?: boolean;
}) {
  return (
    <div className={`${full ? "flex w-full" : "inline-flex"} h-8 border border-slate-200 rounded-lg overflow-hidden bg-white text-sm`}>
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`${full ? "flex-1" : ""} px-2.5 ${value === o.v ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const IMAGE_OPTIONS: { v: ProductTableOptions["image"]; label: string }[] =
  [{ v: "none", label: "ไม่โชว์" }, { v: "small", label: "เล็ก" }, { v: "large", label: "ใหญ่" }];

/**
 * ตัวเลือกตารางสินค้าแบบเรียงลงทีละข้อ — ใช้ในหน้าปรับก่อนพิมพ์ (components/print-setup-dialog)
 * ค่าชุดเดียวกับตารางบนจอ (เปลี่ยนที่นี่ ตารางบนจอก็เปลี่ยนตาม)
 */
export function SoldProductsOptions({ opts, onChange }: {
  opts: ProductTableOptions;
  onChange: (patch: Partial<ProductTableOptions>) => void;
}) {
  const numeric = opts.sortKey === "amt" || opts.sortKey === "qty";
  return (
    <div className="space-y-2.5">
      <Seg full value={opts.grouped ? "cust" : "all"} onChange={v => onChange({ grouped: v === "cust" })}
        options={[{ v: "all", label: "รวมทุกลูกค้า" }, { v: "cust", label: "แยกตามลูกค้า" }]} />
      <div className="space-y-1">
        <div className="text-[11px] text-slate-400">เรียงตาม</div>
        <Seg full value={opts.sortKey} onChange={k => onChange({ sortKey: k, sortDir: defaultSortDir(k) })}
          options={[{ v: "amt", label: "ยอดเงิน" }, { v: "qty", label: "จำนวน" }, { v: "name", label: "ชื่อ" }, { v: "sku", label: "รหัส" }]} />
        <Seg full value={opts.sortDir} onChange={d => onChange({ sortDir: d })}
          options={numeric
            ? [{ v: "desc", label: "มาก → น้อย" }, { v: "asc", label: "น้อย → มาก" }]
            : [{ v: "asc", label: "ก → ฮ" }, { v: "desc", label: "ฮ → ก" }]} />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-slate-400">รูปสินค้า</div>
        <Seg full value={opts.image} onChange={v => onChange({ image: v })} options={IMAGE_OPTIONS} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
        <input type="checkbox" checked={opts.pct} onChange={e => onChange({ pct: e.target.checked })} /> คอลัมน์ % ของยอด
      </label>
      <label className={`flex items-center gap-2 text-slate-700 ${opts.grouped ? "cursor-pointer" : "opacity-40"}`}>
        <input type="checkbox" checked={opts.pageBreak} disabled={!opts.grouped}
          onChange={e => onChange({ pageBreak: e.target.checked })} /> ขึ้นหน้าใหม่ทุกลูกค้า
      </label>
    </div>
  );
}

export function SoldProductsTable({ products, opts, onChange, groupNote, maxHeightClass = "max-h-[640px]", groupWord = "ลูกค้า", printOptions = true }: {
  products: SoldProduct[];
  opts: ProductTableOptions;
  onChange: (patch: Partial<ProductTableOptions>) => void;
  /** ข้อความเสริมหัวกลุ่มลูกค้า เช่น "21 ใบขาย" */
  groupNote?: (customer: string) => string;
  maxHeightClass?: string;
  /** คำเรียกกลุ่ม (ช่อง customer) เช่น "ร้าน" ในรายงานแพลตฟอร์ม · ค่าเริ่มต้น "ลูกค้า" */
  groupWord?: string;
  /** โชว์ตัวเลือกที่มีผลตอนพิมพ์ (ขึ้นหน้าใหม่ทุกกลุ่ม) — หน้าที่ไม่มีปุ่มพิมพ์ให้ปิด */
  printOptions?: boolean;
}) {
  const groups = useMemo(() => groupByCustomer(products), [products]);
  const groupRank = useMemo(() => new Map(groups.map((g, i) => [g.customer, i])), [groups]);
  const groupTotal = useMemo(() => new Map(groups.map(g => [g.customer, g.amt])), [groups]);
  // เรียงด้วยตัวกลางก่อน (ให้ลำดับตอนค่าเท่ากันตรงกับใบพิมพ์) แล้ว MiniTable เรียงซ้ำแบบ stable
  const rows = useMemo(
    () => sortProducts(opts.grouped ? products : mergeProducts(products), opts.sortKey, opts.sortDir),
    [products, opts.grouped, opts.sortKey, opts.sortDir],
  );
  const grandTotal = sumAmt(products);
  const img = IMG_PX[opts.image];

  const columns: MiniColumn<SoldProduct>[] = [
    ...(img ? [{
      key: "img", header: "รูป", width: `${img + 16}px`,
      cell: (p: SoldProduct) => <HoverImage url={productThumb(p.image, 320)} size={img} previewSize={240} />,
    }] : []),
    { key: "sku", header: "รหัส", width: "9.5rem", sortValue: p => p.sku ?? "",
      cell: p => <code className="font-mono text-[11px] text-slate-500">{p.sku ?? "—"}</code> },
    { key: "name", header: "สินค้า", width: "1fr", sortValue: p => p.name,
      cell: p => <span className="text-slate-700">{p.name}</span> },
    { key: "qty", header: "จำนวน", width: "8rem", align: "right", sortValue: p => p.qty,
      cell: p => <span className="font-mono tabular-nums text-slate-600">{fmtQty(p.qty, p.unit)}</span> },
    { key: "amt", header: "ยอด (บาท)", width: "8rem", align: "right", sortValue: p => p.amt,
      cell: p => <span className="font-mono tabular-nums text-slate-800">{baht(p.amt)}</span> },
    ...(opts.pct ? [{
      key: "pct", header: "%", width: "4.5rem", align: "right" as const,
      cell: (p: SoldProduct) => {
        const base = opts.grouped ? groupTotal.get(p.customer) ?? 0 : grandTotal;
        return <span className="font-mono tabular-nums text-xs text-slate-500">{base ? ((p.amt / base) * 100).toFixed(1) : "0"}%</span>;
      },
    }] : []),
  ];

  const onSortChange = (key: string, dir: "asc" | "desc") => {
    // "" (ลำดับเดิม) = ยอดเงินมาก→น้อย · เปลี่ยนคอลัมน์ = ใช้ทิศเริ่มต้นของคอลัมน์นั้น (ตัวเลข มาก→น้อย · ตัวหนังสือ ก→ฮ)
    const k = (key || "amt") as ProductSortKey;
    onChange({ sortKey: k, sortDir: !key ? "desc" : k !== opts.sortKey ? defaultSortDir(k) : dir });
  };

  return (
    <div>
      <MiniTable
        rows={rows}
        columns={columns}
        rowKey={p => `${p.customer}|${p.sku ?? p.name}|${p.unit ?? ""}`}
        searchText={p => `${p.sku ?? ""} ${p.name}`}
        searchPlaceholder="ค้นหารหัส / ชื่อสินค้า"
        sortKey={opts.sortKey}
        sortDir={opts.sortDir}
        onSortChange={onSortChange}
        groupBy={p => p.customer}
        groupLabel={`แยกตาม${groupWord}`}
        grouped={opts.grouped}
        onGroupedChange={v => onChange({ grouped: v })}
        groupOrder={name => groupRank.get(name) ?? 999}
        groupExtra={rs => (
          <span>
            {groupNote?.(rs[0]?.customer ?? "") && <>{groupNote(rs[0].customer)} · </>}
            {qtyText(rs)} · <span className="font-semibold text-slate-700">฿{baht(sumAmt(rs))}</span>
          </span>
        )}
        countUnit="รายการ"
        inlineActions
        actions={
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-xs text-slate-400">รูป</span>
            <Seg value={opts.image} onChange={v => onChange({ image: v })} options={IMAGE_OPTIONS} />
            <label className="inline-flex items-center gap-1.5 h-8 px-2 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={opts.pct} onChange={e => onChange({ pct: e.target.checked })} /> % ของยอด
            </label>
            {opts.grouped && printOptions && (
              <label className="inline-flex items-center gap-1.5 h-8 px-2 text-slate-600 cursor-pointer" title="มีผลตอนพิมพ์ / PDF">
                <input type="checkbox" checked={opts.pageBreak} onChange={e => onChange({ pageBreak: e.target.checked })} /> ขึ้นหน้าใหม่ทุก{groupWord} (ตอนพิมพ์)
              </label>
            )}
          </div>
        }
        maxHeightClass={maxHeightClass}
        emptyText="เดือนนี้ยังไม่มีสินค้าที่ขาย"
      />
      {products.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap px-3 py-2 rounded-lg bg-slate-100 text-sm">
          <span className="font-semibold text-slate-700">
            {opts.grouped ? `รวมทุก${groupWord}` : "รวมทั้งหมด"} · {rows.length.toLocaleString("th-TH")} รายการ
          </span>
          <span className="flex items-center gap-4 flex-wrap">
            <span className="text-slate-600">จำนวน {qtyText(products)}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">฿{baht(grandTotal)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
