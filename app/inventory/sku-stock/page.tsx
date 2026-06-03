"use client";

/**
 * ยอดคงเหลือ SKU จริง (ขั้น 4 แบบเล็ก) — คลังรวม นับจำนวน
 * ยอดเพิ่มอัตโนมัติเมื่อ "รับสินค้าเข้า" (หน้า /purchasing/receive)
 */
import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { SkuStockRow } from "@/app/api/inventory/sku-stock/route";

const COLUMNS: ColumnDef<SkuStockRow>[] = [
  {
    accessorKey: "code", header: "รหัส SKU", size: 160,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{v}</span>
               : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    accessorKey: "name_th", header: "ชื่อสินค้า",
    cell: ({ getValue }) => <span className="text-sm text-slate-800 line-clamp-1">{(getValue() as string) || "—"}</span>,
  },
  {
    accessorKey: "qty_on_hand", header: "คงเหลือ", size: 120,
    cell: ({ getValue }) => {
      const n = Number(getValue());
      return <span className={`text-sm tabular-nums font-semibold ${n > 0 ? "text-emerald-700" : "text-slate-400"}`}>{n.toLocaleString("th-TH")}</span>;
    },
  },
  {
    accessorKey: "last_movement_at", header: "เคลื่อนไหวล่าสุด", size: 150,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return <span className="text-xs text-slate-500">{v ? String(v).slice(0, 10) : "—"}</span>;
    },
  },
];

export default function SkuStockPage() {
  const canView = usePermission("products.view");
  const [rows, setRows] = useState<SkuStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/inventory/sku-stock?limit=1000");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) fetchData(); }, [canView, fetchData]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-900">📊 ยอดคงเหลือ (สต็อก SKU)</h1>
        <p className="text-slate-500 mt-1">คลังรวม — ยอดเพิ่มอัตโนมัติเมื่อ &quot;รับสินค้าเข้า&quot; ตามใบสั่งซื้อ (เฉพาะของดี)</p>
      </div>

      <div className="px-8 py-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable<SkuStockRow>
            data={rows} columns={COLUMNS}
            title={`รายการคงเหลือ (${rows.length})`}
            description="นับจำนวนคงเหลือต่อ SKU (ยังไม่แยกหลายคลัง/ไม่คิดต้นทุน)"
            loading={loading} error={error ?? undefined}
            emptyMessage="ยังไม่มียอดคงเหลือ — ลองรับสินค้าเข้าที่หน้า 'รับสินค้าเข้า'"
            searchPlaceholder="ค้นหา รหัส / ชื่อสินค้า..."
            searchableKeys={["code", "name_th"]}
            tableId="sku-stock"
            exportFilename="ยอดคงเหลือ-sku"
            onRetry={fetchData}
          />
        </div>
      </div>
    </PlaygroundShell>
  );
}
