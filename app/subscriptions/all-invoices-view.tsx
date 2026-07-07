"use client";

/**
 * มุมมอง "ใบเสร็จ" — รวมใบเสร็จ PDF ของทุก subscription + กรองตามเดือน
 * ใช้ DataTable กลาง (ค้นหา/เรียง/ส่งออก) · เปิด/ลบไฟล์ได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { SubInvoice } from "@/lib/subscriptions";

type InvoiceRow = SubInvoice & { sub_name: string | null };

function fmtMonth(ym: string): string {
  const [y, m] = (ym ?? "").split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}

export function AllInvoicesView({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/subscriptions/invoices");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as InvoiceRow[]);
      setMonths((j.months ?? []) as string[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดใบเสร็จไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (month === "all" ? rows : rows.filter((r) => r.month === month)),
    [rows, month],
  );

  const handleDelete = useCallback(async (inv: InvoiceRow) => {
    if (!confirm(`ลบใบเสร็จ "${inv.file_name}"?`)) return;
    try {
      const res = await apiFetch(`/api/subscriptions/${inv.subscription_id}/invoices/${inv.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ลบใบเสร็จแล้ว");
      setRows((prev) => prev.filter((r) => r.id !== inv.id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast]);

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
    { id: "month", accessorKey: "month", header: "เดือน", size: 120,
      cell: ({ getValue }) => <span className="text-sm text-slate-700">{fmtMonth(getValue() as string)}</span> },
    { id: "sub_name", accessorKey: "sub_name", header: "รายการ", size: 240,
      cell: ({ getValue }) => <span className="text-sm font-medium text-slate-800">{(getValue() as string) || "—"}</span> },
    { id: "file_name", accessorKey: "file_name", header: "ไฟล์", size: 300,
      cell: ({ getValue }) => <span className="text-sm text-slate-600 inline-flex items-center gap-1.5"><span>📄</span><span className="truncate">{getValue() as string}</span></span> },
    {
      id: "actions", header: "", size: 120, enableSorting: false,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {inv.url
              ? <a href={inv.url} target="_blank" rel="noopener noreferrer"
                  className="h-7 px-2.5 inline-flex items-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">🔗 เปิด</a>
              : <span className="text-xs text-slate-300">—</span>}
            {canEdit && (
              <button onClick={() => handleDelete(inv)} title="ลบ"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
            )}
          </div>
        );
      },
    },
  ], [canEdit, handleDelete]);

  return (
    <div className="space-y-3">
      {/* ตัวกรองเดือน */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-xs font-medium text-slate-500">เดือน:</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-400">
            <option value="all">ทุกเดือน ({rows.length})</option>
            {months.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)} ({rows.filter((r) => r.month === m).length})</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">แสดง {filtered.length} ใบเสร็จ</span>
      </div>

      <DataTable
        tableId="subscription-invoices"
        data={filtered}
        columns={columns}
        loading={loading}
        searchableKeys={["sub_name", "file_name", "month"]}
        searchPlaceholder="ค้นหา รายการ / ชื่อไฟล์…"
        exportFilename="subscription-invoices"
        exportEntityType="subscription_invoices"
        pageSize={25}
        emptyMessage="ยังไม่มีใบเสร็จ — อัปโหลดได้ที่ปุ่ม 🧾 ของแต่ละรายการ"
      />
    </div>
  );
}
