"use client";

/**
 * หน้าสั่งซื้อ (Purchase Order) — /purchasing/orders
 * เฟส 1: view ตาราง — แสดง "ขอซื้อ (PR)" ที่รอออกใบสั่งซื้อ (po_id ว่าง)
 *   เลือกหลายแถว → สร้างใบสั่งซื้อ (PO) ผ่าน /api/purchasing/create-po
 *   (ระบบแยกใบตามร้าน + สกุลเงินอัตโนมัติ — 1 ใบ/ร้าน)
 * ใช้ Universal DataTable กลาง
 */
import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { BulkAction } from "@/components/data-table";

type Row = {
  id: string; seller_name: string; item_sku_id: string | null; item_name: string; code: string;
  qty: number; uom: string; price_est: number; line_total: number; currency: string;
  order_date: string | null; requester: string; note: string; status: string; approved: boolean; image_url: string | null;
};

const money = (v: number, cur: string) => `${v.toLocaleString()} ${cur}`;

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: "image_url", header: "รูป", size: 56, enableSorting: false, meta: { type: "image" } },
  {
    accessorKey: "seller_name", header: "ร้าน", size: 160, meta: { filterable: true },
    cell: ({ getValue }) => <span className="text-sm text-slate-700">🏪 {(getValue() as string) || "—"}</span>,
  },
  {
    accessorKey: "code", header: "รหัส", size: 120,
    cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{(getValue() as string) || "—"}</span>,
  },
  { accessorKey: "item_name", header: "สินค้า", cell: ({ getValue }) => <span className="text-sm text-slate-800 line-clamp-1">{getValue() as string}</span> },
  { accessorKey: "qty", header: "จำนวน", size: 80, meta: { filterType: "number" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums">{(getValue() as number).toLocaleString()} <span className="text-xs text-slate-400">{row.original.uom}</span></span> },
  { accessorKey: "price_est", header: "ราคา/หน่วย", size: 110, meta: { filterType: "number" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums text-slate-600">{money(getValue() as number, row.original.currency)}</span> },
  { accessorKey: "line_total", header: "ราคารวม", size: 120, meta: { filterType: "number", summary: "sum" }, cell: ({ getValue, row }) => <span className="text-sm tabular-nums font-semibold text-blue-600">{money(getValue() as number, row.original.currency)}</span> },
  { accessorKey: "order_date", header: "วันที่สั่ง", size: 110, cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() ? formatDate(getValue() as string) : "—"}</span> },
  { accessorKey: "requester", header: "ผู้ขอ", size: 120, meta: { filterable: true } },
  {
    accessorKey: "approved", header: "สถานะ", size: 110,
    meta: { filterable: true, filterOptions: [{ value: "true", label: "อนุมัติแล้ว" }, { value: "false", label: "ยังไม่อนุมัติ" }] },
    cell: ({ getValue }) => getValue()
      ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">อนุมัติแล้ว</span>
      : <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">ยังไม่อนุมัติ</span>,
  },
];

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch("/api/purchasing/orderable").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const createPO = useCallback(async (sel: Row[]) => {
    if (sel.length === 0) return;
    const shops = [...new Set(sel.map((r) => r.seller_name))];
    const unapproved = sel.filter((r) => !r.approved).length;
    if (!confirm(`สร้างใบสั่งซื้อจาก ${sel.length} รายการ → ${shops.length} ร้าน (1 ใบ/ร้าน)?${unapproved ? `\n\n(มี ${unapproved} รายการยังไม่อนุมัติ → ระบบจะบันทึกอนุมัติให้อัตโนมัติ)` : ""}`)) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/create-po", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_ids: sel.map((r) => r.id), actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(`สร้างใบสั่งซื้อ ${(j.created ?? []).length} ใบแล้ว`);
      await fetchRows();
    } catch (e) { toast.error("สร้างใบสั่งซื้อไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  }, [user?.name, toast, fetchRows]);

  const bulkActions: BulkAction<Row>[] = [
    { label: busy ? "กำลังสร้าง…" : "🧾 สร้างใบสั่งซื้อ (ตามร้าน)", onClick: (r) => void createPO(r) },
  ];

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">🧾 สั่งซื้อ — ออกใบสั่งซื้อจากรายการขอซื้อ</h1>
            <p className="text-sm text-slate-500 mt-0.5">เลือกรายการ → กด “สร้างใบสั่งซื้อ” (ระบบแยกใบตามร้านให้อัตโนมัติ • 1 ใบ/ร้าน)</p>
          </div>
          <a href="/m/purchase-orders-v2" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📋 ดูใบสั่งซื้อทั้งหมด</a>
        </div>

        <DataTable<Row>
          data={rows}
          columns={COLUMNS}
          loading={loading}
          error={error ?? undefined}
          onRetry={fetchRows}
          emptyMessage="ไม่มีรายการรอสั่งซื้อ — รายการขอซื้อที่ยังไม่ถูกสั่ง จะมาอยู่ที่นี่"
          searchPlaceholder="ค้นหา ร้าน / สินค้า / รหัส..."
          searchableKeys={["seller_name", "item_name", "code", "requester"]}
          tableId="purchase-orders-create"
          exportFilename="รอสั่งซื้อ"
          selectable
          bulkActions={bulkActions}
          views={[
            { id: "all", label: "ทั้งหมด" },
            { id: "approved", label: "อนุมัติแล้ว", filter: (r) => (r as Row).approved },
            { id: "pending", label: "ยังไม่อนุมัติ", filter: (r) => !(r as Row).approved },
          ]}
        />
      </div>
    </PlaygroundShell>
  );
}
