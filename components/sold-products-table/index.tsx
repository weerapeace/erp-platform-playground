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

function Seg<V extends string>({ value, options, onChange }: {
  value: V; options: { v: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div className="inline-flex h-8 border border-slate-200 rounded-lg overflow-hidden bg-white text-sm">
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`px-2.5 ${value === o.v ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SoldProductsTable({ products, opts, onChange, groupNote, maxHeightClass = "max-h-[640px]" }: {
  products: SoldProduct[];
  opts: ProductTableOptions;
  onChange: (patch: Partial<ProductTableOptions>) => void;
  /** ข้อความเสริมหัวกลุ่มลูกค้า เช่น "21 ใบขาย" */
  groupNote?: (customer: string) => string;
  maxHeightClass?: string;
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
        groupLabel="แยกตามลูกค้า"
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
            <Seg value={opts.image} onChange={v => onChange({ image: v })}
              options={[{ v: "none", label: "ไม่โชว์" }, { v: "small", label: "เล็ก" }, { v: "large", label: "ใหญ่" }]} />
            <label className="inline-flex items-center gap-1.5 h-8 px-2 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={opts.pct} onChange={e => onChange({ pct: e.target.checked })} /> % ของยอด
            </label>
            {opts.grouped && (
              <label className="inline-flex items-center gap-1.5 h-8 px-2 text-slate-600 cursor-pointer" title="มีผลตอนพิมพ์ / PDF">
                <input type="checkbox" checked={opts.pageBreak} onChange={e => onChange({ pageBreak: e.target.checked })} /> ขึ้นหน้าใหม่ทุกลูกค้า (ตอนพิมพ์)
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
            {opts.grouped ? "รวมทุกลูกค้า" : "รวมทั้งหมด"} · {rows.length.toLocaleString("th-TH")} รายการ
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
