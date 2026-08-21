"use client";

/**
 * BomWhereUsed — ของกลาง: "สินค้าตัวนี้ถูกใช้ในสูตรผลิตของอะไรบ้าง" (ย้อน BOM)
 *
 * แท็บ BOM ในหน้า SKU เดิมตอบได้แค่ "สูตรของสินค้าตัวนี้" (มันผลิตจากอะไร)
 * ตัวนี้ตอบอีกทาง: ของชิ้นนี้ (เช่น กระดุม/เชือก) ไปอยู่ในสูตรของสินค้าตัวไหนบ้าง ใช้กี่ชิ้น
 *
 * กดรหัสสินค้า = เปิดจอสินค้าตัวนั้น · กด "เปิดสูตร" = ไปหน้า BOM ที่สูตรนั้น
 * ไม่มีสูตรไหนใช้ = โชว์บรรทัดเดียวบอกว่ายังไม่ถูกใช้ (ไม่รก)
 *
 * ใช้ที่: MasterRecordDrawer (moduleKey=skus-v2) และหน้า /master/skus — แท็บ "BOM (สูตรผลิต)"
 * ของกลางที่ใช้: MiniTable · HoverPreview · apiFetch · r2ImageUrl · MasterRecordDrawer
 */

import { useCallback, useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverPreview } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";

const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Row = {
  line_id: string;
  bom_code: string | null;
  version: string | null;
  status: string | null;
  bom_active: boolean;
  is_default: boolean;
  product_sku: string | null;
  product_name: string | null;
  product_sku_id: string | null;
  product_image: string | null;
  qty: number | null;
  uom: string | null;
  slot_code: string | null;
  waste_percent: number | null;
  is_optional: boolean;
};

const imgSrc = (v: string | null, w: number) => (!v ? null : v.startsWith("http") ? v : r2ImageUrl(v, w));
const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));

export function BomWhereUsed({ skuId, skuCode }: {
  skuId: string;
  /** รู้รหัสอยู่แล้วก็ส่งมาได้ (ประหยัดการค้นรหัสฝั่งเซิร์ฟเวอร์) */
  skuCode?: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSkuId, setOpenSkuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!skuId && !skuCode) return;
    setLoading(true);
    try {
      const p = skuCode ? `sku=${encodeURIComponent(skuCode)}` : `sku_id=${encodeURIComponent(skuId)}`;
      const j = await apiFetch(`/api/bom/where-used?${p}`).then((r) => r.json());
      setRows(Array.isArray(j.data) ? (j.data as Row[]) : []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [skuId, skuCode]);

  useEffect(() => { void load(); }, [load]);

  const columns: MiniColumn<Row>[] = [
    {
      key: "product", header: "สินค้าที่ใช้ของชิ้นนี้", width: "2fr",
      sortValue: (r) => r.product_sku ?? "", sortLabel: "รหัสสินค้า",
      cell: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <HoverPreview url={imgSrc(r.product_image, 640)} previewW={420}>
            <div className="w-8 h-8 shrink-0 rounded border border-slate-100 bg-white flex items-center justify-center overflow-hidden">
              {r.product_image
                ? <img src={imgSrc(r.product_image, 80) ?? ""} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                : <span className="text-slate-200 text-xs">📦</span>}
            </div>
          </HoverPreview>
          <div className="min-w-0">
            {r.product_sku_id ? (
              <button type="button" onClick={() => setOpenSkuId(r.product_sku_id)}
                className="block text-left text-[12.5px] font-medium text-blue-600 hover:underline truncate max-w-[16rem]"
                title="เปิดหน้าสินค้าตัวนี้">{r.product_sku}</button>
            ) : (
              <span className="block text-[12.5px] font-medium text-slate-700 truncate max-w-[16rem]">{r.product_sku ?? "—"}</span>
            )}
            <span className="block text-[11px] text-slate-400 truncate max-w-[16rem]">{r.product_name ?? "—"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "qty", header: "ใช้", align: "right", width: "7rem",
      sortValue: (r) => r.qty ?? 0, sortLabel: "จำนวนที่ใช้",
      cell: (r) => <span className="tabular-nums text-[12.5px] text-slate-700">{fmtQty(r.qty)} <span className="text-[11px] text-slate-400">{r.uom ?? ""}</span></span>,
    },
    {
      key: "slot", header: "ตำแหน่ง/ช่อง", width: "8rem",
      sortValue: (r) => r.slot_code ?? "", sortLabel: "ตำแหน่ง",
      cell: (r) => <span className="text-[12px] text-slate-500">{r.slot_code || "—"}{r.is_optional && <span className="ml-1 text-[10px] text-amber-600">(ไม่บังคับ)</span>}</span>,
    },
    {
      key: "bom", header: "สูตร", width: "9rem",
      sortValue: (r) => r.bom_code ?? "", sortLabel: "รหัสสูตร",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 font-mono truncate max-w-[6rem]" title={r.bom_code ?? ""}>{r.bom_code ?? "—"}</span>
          {r.version && <span className="text-[10px] text-slate-400">{r.version}</span>}
          {!r.bom_active && <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-500">ปิด</span>}
        </div>
      ),
    },
    {
      key: "open", header: "", align: "right", width: "6rem",
      cell: (r) => r.product_sku ? (
        <a href={`/master/bom-headers?open=${encodeURIComponent(r.product_sku)}`} target="_blank" rel="noopener noreferrer"
          className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap"
          title="เปิดสูตรนี้ในหน้า BOM">เปิดสูตร ↗</a>
      ) : null,
    },
  ];

  if (loading) return <div className="text-xs text-slate-400 py-2">กำลังตรวจว่ามีสูตรไหนใช้ของชิ้นนี้…</div>;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-150 bg-slate-50/60 px-3 py-2.5">
        <p className="text-[12.5px] text-slate-500">🔎 <span className="font-medium">ใช้ในสูตรของสินค้าอื่น</span> — ยังไม่มีสูตรไหนใช้สินค้าชิ้นนี้เป็นวัตถุดิบ</p>
      </div>
    );
  }

  const products = new Set(rows.map((r) => r.product_sku ?? "").filter(Boolean)).size;

  return (
    <div className="space-y-2">
      <MiniTable
        rows={rows}
        rowKey={(r) => r.line_id}
        columns={columns}
        title={<span className="text-[13px] font-medium text-slate-700">🔎 ใช้เป็นวัตถุดิบใน {products.toLocaleString("th-TH")} สินค้า</span>}
        countUnit="บรรทัด"
        searchText={(r) => `${r.product_sku ?? ""} ${r.product_name ?? ""} ${r.bom_code ?? ""} ${r.slot_code ?? ""}`}
        searchPlaceholder="ค้นหาสินค้า / รหัสสูตร…"
        dense
        maxHeightClass="max-h-[420px]"
        footnote="รายการนี้ย้อนจากสูตรผลิต (BOM) ทุกใบที่มีสินค้าชิ้นนี้อยู่ในรายการวัตถุดิบ"
      />
      {openSkuId && (
        <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" recordId={openSkuId}
          onClose={() => setOpenSkuId(null)} />
      )}
    </div>
  );
}

export default BomWhereUsed;
