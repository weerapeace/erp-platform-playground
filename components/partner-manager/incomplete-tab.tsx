"use client";
/**
 * แท็บ "⚠️ ข้อมูลไม่ครบ" ในหน้า Partners (ย้ายมาจากหน้า /master/partner-data-check เดิม — เจ้าของขอ 2026-11-11)
 *   ตารางกลาง DataTable · กติกา lib/partner-data-check · กดแถว = เปิดป๊อปคู่ค้าบนหน้าเดียวกัน (มีกล่องเติมช่องที่ขาด)
 */
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type RowAction } from "@/components/data-table";
import type { PartnerCheckRow } from "@/lib/partner-data-check";

export function PartnerIncompleteTab({ rows, loading, error, onRetry, onOpen }: {
  rows: PartnerCheckRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (row: PartnerCheckRow) => void;
}) {
  const columns = useMemo<ColumnDef<PartnerCheckRow>[]>(() => [
    {
      accessorKey: "name", header: "คู่ค้า", size: 300,
      cell: ({ getValue, row }) => (
        <div className="min-w-0">
          <div className="text-sm text-slate-800 truncate">{getValue() as string}</div>
          {row.original.tax_swapped && <div className="text-[11px] text-amber-700">⚠️ เลขภาษีไปอยู่ในช่อง &quot;สาขา&quot; — กรอกสลับช่อง</div>}
        </div>
      ),
    },
    { accessorKey: "roles", header: "ประเภท", size: 130, meta: { filterType: "select" },
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as string}</span> },
    {
      accessorKey: "doc_count", header: "เอกสารที่เคยออก", size: 130, meta: { filterType: "number" },
      cell: ({ getValue, row }) => {
        const n = getValue() as number;
        return (
          <div className="text-right">
            <div className={`text-sm font-semibold tabular-nums ${n > 0 ? "text-slate-800" : "text-slate-300"}`}>{n}</div>
            {n > 0 && (
              <div className="text-[10px] text-slate-400">
                {row.original.so_count > 0 && `ขาย ${row.original.so_count}`}
                {row.original.so_count > 0 && row.original.po_count > 0 && " · "}
                {row.original.po_count > 0 && `ซื้อ ${row.original.po_count}`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "missing", header: "ที่ยังขาด", size: 280,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.gaps.map((g) => (
            <span key={g.key} title={g.required ? "ต้องมี — เอกสารจะพิมพ์ช่องนี้ว่าง" : "ควรมี"}
              className={`text-[11px] px-2 py-0.5 rounded-full ${g.required ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
              ขาด{g.label}{g.required ? "" : " (ควรมี)"}
            </span>
          ))}
        </div>
      ),
    },
  ], []);

  const rowActions = useMemo<RowAction<PartnerCheckRow>[]>(() => [
    { label: "เติมข้อมูลที่ขาด", icon: "✎", onClick: onOpen },
  ], [onOpen]);

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-slate-500">
        ช่องพวกนี้พิมพ์ลงใบกำกับภาษี / ใบสั่งซื้อ — ว่างแล้วเอกสารจะออกมาช่องว่าง · ร้านจีนไม่ตรวจ ·
        เรียงรายที่ออกเอกสารบ่อยสุดไว้บนสุด กดแถวเพื่อเติมได้เลย
      </p>
      <DataTable<PartnerCheckRow>
        data={rows} columns={columns} loading={loading} error={error ?? undefined} onRetry={onRetry}
        emptyMessage="ข้อมูลคู่ค้าครบทุกรายแล้ว"
        searchPlaceholder="ค้นหาชื่อคู่ค้า..."
        searchableKeys={["name", "missing"]}
        tableId="partners-incomplete"
        exportFilename="คู่ค้าข้อมูลไม่ครบ"
        onRowClick={onOpen}
        rowActions={rowActions}
        views={[
          { id: "used", label: "⭐ เคยออกเอกสารแล้ว", filter: (r) => (r as PartnerCheckRow).doc_count > 0 },
          { id: "required", label: "ขาดช่องที่ต้องมี", filter: (r) => (r as PartnerCheckRow).missing_required },
          { id: "all", label: "ทั้งหมด" },
          { id: "no_tax", label: "ไม่มีเลขภาษี", filter: (r) => (r as PartnerCheckRow).gaps.some((g) => g.key === "tax") },
          { id: "customer", label: "เฉพาะลูกค้า", filter: (r) => (r as PartnerCheckRow).is_customer },
          { id: "supplier", label: "เฉพาะผู้จำหน่าย", filter: (r) => (r as PartnerCheckRow).is_supplier },
          { id: "swapped", label: "กรอกสลับช่อง", filter: (r) => (r as PartnerCheckRow).tax_swapped },
        ]}
      />
    </div>
  );
}
