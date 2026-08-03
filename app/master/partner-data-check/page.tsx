"use client";

/**
 * คู่ค้าข้อมูลไม่ครบ — /master/partner-data-check
 *
 * ปัญหาที่แก้: ใบกำกับภาษี / ใบสั่งซื้อ ต้องมี ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี
 * แต่ข้อมูลจริงกรอกไม่ครบ → พิมพ์ออกมาช่องว่าง โดยไม่มีใครรู้จนกว่าจะพิมพ์ส่งลูกค้า/ซัพ
 *
 * เรียง "รายที่ออกเอกสารบ่อยสุด" ขึ้นก่อน → กรอกไล่จากบนลงล่างได้เลย คุ้มที่สุด
 * กดแถว → เปิดทะเบียนคู่ค้ารายนั้นไปกรอกต่อได้ทันที
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, type RowAction } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { PartnerCheckRow } from "@/app/api/master/partner-data-check/route";

const Yes = () => <span className="text-emerald-600">✓</span>;
const No = () => <span className="text-rose-500 font-medium">ขาด</span>;

export default function PartnerDataCheckPage() {
  const [rows, setRows] = useState<PartnerCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/master/partner-data-check");
      const json = (await res.json()) as { data?: PartnerCheckRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "โหลดไม่สำเร็จ");
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const openPartner = useCallback((r: PartnerCheckRow) => {
    window.open(`/master/partners?open=${encodeURIComponent(r.id)}`, "_blank", "noopener");
  }, []);

  const columns = useMemo<ColumnDef<PartnerCheckRow>[]>(() => [
    {
      accessorKey: "name", header: "คู่ค้า", size: 300,
      cell: ({ getValue, row }) => (
        <div className="min-w-0">
          <div className="text-sm text-slate-800 truncate">{getValue() as string}</div>
          {row.original.tax_swapped && (
            <div className="text-[11px] text-amber-700">⚠️ เลขภาษีไปอยู่ในช่อง "สาขา" — กรอกสลับช่อง</div>
          )}
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
    { accessorKey: "has_company_name", header: "ชื่อบริษัท", size: 95,
      cell: ({ getValue }) => (getValue() ? <Yes /> : <No />) },
    { accessorKey: "has_address", header: "ที่อยู่", size: 85,
      cell: ({ getValue }) => (getValue() ? <Yes /> : <No />) },
    { accessorKey: "has_tax_id", header: "เลขผู้เสียภาษี", size: 110,
      cell: ({ getValue }) => (getValue() ? <Yes /> : <No />) },
    { accessorKey: "has_phone", header: "เบอร์โทร", size: 95,
      cell: ({ getValue }) => (getValue() ? <Yes /> : <No />) },
    { accessorKey: "missing", header: "ที่ยังขาด", size: 240,
      cell: ({ getValue }) => <span className="text-xs text-rose-600">{getValue() as string}</span> },
  ], []);

  const rowActions = useMemo<RowAction<PartnerCheckRow>[]>(() => [
    { label: "เปิดไปกรอกข้อมูล", icon: "✎", onClick: openPartner },
  ], [openPartner]);

  const sum = useMemo(() => {
    const used = rows.filter((r) => r.doc_count > 0);
    return {
      total: rows.length,
      used: used.length,
      noTax: rows.filter((r) => !r.has_tax_id).length,
      noTaxUsed: used.filter((r) => !r.has_tax_id).length,
      swapped: rows.filter((r) => r.tax_swapped).length,
    };
  }, [rows]);

  return (
    <PlaygroundShell>
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">⚠️ คู่ค้าข้อมูลไม่ครบ</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ช่องพวกนี้ต้องมี ไม่งั้นใบกำกับภาษี / ใบสั่งซื้อ จะพิมพ์ออกมาว่าง ·
            เรียงรายที่ออกเอกสารบ่อยสุดไว้บนสุด — กรอกไล่จากบนลงล่างได้เลย
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "ข้อมูลไม่ครบทั้งหมด", value: sum.total, tone: "text-slate-800" },
            { label: "⭐ เคยออกเอกสารแล้ว (ควรกรอกก่อน)", value: sum.used, tone: "text-amber-600" },
            { label: "ไม่มีเลขผู้เสียภาษี", value: sum.noTax, tone: "text-rose-600" },
            { label: "กรอกสลับช่อง", value: sum.swapped, tone: sum.swapped > 0 ? "text-rose-600" : "text-slate-300" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-slate-400">{c.label}</div>
              <div className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value.toLocaleString("th-TH")}</div>
            </div>
          ))}
        </div>

        {sum.noTaxUsed > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            มี <b>{sum.noTaxUsed}</b> รายที่ออกเอกสารไปแล้วแต่ยังไม่มีเลขผู้เสียภาษี —
            ใบกำกับภาษีของรายเหล่านี้ช่องเลขภาษีจะว่าง
          </div>
        )}

        <DataTable<PartnerCheckRow>
          data={rows} columns={columns} loading={loading} error={error ?? undefined} onRetry={fetchRows}
          emptyMessage="ข้อมูลคู่ค้าครบทุกรายแล้ว 🎉"
          searchPlaceholder="ค้นหาชื่อคู่ค้า..."
          searchableKeys={["name", "missing"]}
          tableId="partner-data-check"
          exportFilename="คู่ค้าข้อมูลไม่ครบ"
          onRowClick={openPartner}
          rowActions={rowActions}
          views={[
            { id: "used", label: "⭐ เคยออกเอกสารแล้ว", filter: (r) => (r as PartnerCheckRow).doc_count > 0 },
            { id: "all", label: "ทั้งหมด" },
            { id: "no_tax", label: "ไม่มีเลขภาษี", filter: (r) => !(r as PartnerCheckRow).has_tax_id },
            { id: "customer", label: "เฉพาะลูกค้า", filter: (r) => (r as PartnerCheckRow).is_customer },
            { id: "supplier", label: "เฉพาะผู้จำหน่าย", filter: (r) => (r as PartnerCheckRow).is_supplier },
            { id: "swapped", label: "กรอกสลับช่อง", filter: (r) => (r as PartnerCheckRow).tax_swapped },
          ]}
        />
      </div>
    </PlaygroundShell>
  );
}
