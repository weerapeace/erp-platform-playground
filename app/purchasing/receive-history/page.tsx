"use client";

/**
 * หน้าประวัติการรับสินค้า — /purchasing/receive-history
 * ตารางกลาง (DataTable) แสดงทุกครั้งที่เคยรับของ (รายบรรทัด)
 * ค้นหาชื่อ/รหัสสินค้าเพื่อดูประวัติของสินค้าตัวใดตัวหนึ่ง · เรียง/กรอง/Export ได้จากตารางกลาง
 */
import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";

type Row = {
  id: string; receive_date: string | null; gr_no: string; po_no: string; seller_name: string; receiver: string;
  item_sku_id: string | null; code: string; item_name: string; uom: string;
  qty_received: number; qty_defective: number; case_type: string;
};

const CASE: Record<string, { label: string; cls: string }> = {
  full: { label: "รับครบ", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  full_defective: { label: "รับครบ", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  partial_wait: { label: "รับบางส่วน (รอของ)", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  partial_close: { label: "ปิดยอด (ขาด)", cls: "bg-orange-50 text-orange-700 border-orange-100" },
};

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: "receive_date", header: "วันที่รับ", size: 110, cell: ({ getValue }) => <span className="text-sm text-slate-600">{getValue() ? formatDate(getValue() as string) : "—"}</span> },
  { accessorKey: "gr_no", header: "เลขที่รับ", size: 120, cell: ({ getValue }) => <span className="font-mono text-xs text-slate-500">{(getValue() as string) || "—"}</span> },
  { accessorKey: "seller_name", header: "ร้าน", size: 150, meta: { filterable: true }, cell: ({ getValue }) => <span className="text-sm text-slate-700">🏪 {(getValue() as string) || "—"}</span> },
  { accessorKey: "po_no", header: "PO", size: 110, cell: ({ getValue }) => <span className="font-mono text-xs text-slate-500">{(getValue() as string) || "—"}</span> },
  { accessorKey: "code", header: "รหัส", size: 120, cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{(getValue() as string) || "—"}</span> },
  { accessorKey: "item_name", header: "สินค้า", cell: ({ getValue }) => <span className="text-sm text-slate-800 line-clamp-1">{getValue() as string}</span> },
  { accessorKey: "qty_received", header: "รับ", size: 90, meta: { filterType: "number", summary: "sum" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums font-semibold text-slate-800">{(getValue() as number).toLocaleString()} <span className="text-xs font-normal text-slate-400">{row.original.uom}</span></span> },
  { accessorKey: "qty_defective", header: "เสีย/ผิด", size: 90, meta: { filterType: "number", summary: "sum" }, cell: ({ getValue }) => { const v = getValue() as number; return <span className={`text-sm tabular-nums ${v > 0 ? "text-red-600" : "text-slate-300"}`}>{v > 0 ? v.toLocaleString() : "-"}</span>; } },
  { accessorKey: "receiver", header: "ผู้รับ", size: 120, meta: { filterable: true } },
  {
    accessorKey: "case_type", header: "สถานะ", size: 150, meta: { filterable: true },
    cell: ({ getValue }) => { const c = CASE[getValue() as string]; return c ? <span className={`text-[11px] px-1.5 py-0.5 rounded border ${c.cls}`}>{c.label}</span> : <span className="text-xs text-slate-400">{(getValue() as string) || "—"}</span>; },
  },
];

export default function ReceiveHistoryPage() {
  const canView = usePermission("products.view");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch("/api/purchasing/receive-ledger").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchRows(); }, [fetchRows]);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">📜 ประวัติการรับสินค้า</h1>
            <p className="text-sm text-slate-500 mt-0.5">ทุกครั้งที่เคยรับของ · ค้นหาชื่อ/รหัสสินค้าเพื่อดูประวัติของสินค้าตัวนั้น</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/purchasing/receive" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📥 ไปหน้ารับของ</a>
            <a href="/m/goods-receipts-v2" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📦 ใบรับสินค้า (GR)</a>
          </div>
        </div>

        <DataTable<Row>
          data={rows} columns={COLUMNS} loading={loading} error={error ?? undefined} onRetry={fetchRows}
          emptyMessage="ยังไม่มีประวัติการรับ — รับสินค้าครั้งแรกแล้วประวัติจะมาแสดงที่นี่"
          searchPlaceholder="ค้นหา สินค้า / รหัส / PO / ร้าน / ผู้รับ..."
          searchableKeys={["item_name", "code", "po_no", "seller_name", "gr_no", "receiver"]}
          tableId="receive-history" exportFilename="ประวัติการรับสินค้า"
          views={[
            { id: "all", label: "ทั้งหมด" },
            { id: "short", label: "รับไม่ครบ", filter: (r) => (r as Row).case_type === "partial_wait" || (r as Row).case_type === "partial_close" },
            { id: "defective", label: "มีของเสีย", filter: (r) => (r as Row).qty_defective > 0 },
          ]}
        />
      </div>
    </PlaygroundShell>
  );
}
