"use client";

/**
 * มุมมอง "ใบเสร็จ" — รวมใบเสร็จ PDF ของทุก subscription + กรองตามเดือน
 * ใช้ DataTable กลาง (ค้นหา/เรียง/ส่งออก) · เปิด/ลบไฟล์ได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { toTHB, fmtBaht, fmtCost, type SubSettings, type SubInvoice, type Currency } from "@/lib/subscriptions";
import { MissingInvoicesPanel } from "./missing-invoices-panel";

type InvoiceRow = SubInvoice & { sub_name: string | null; sub_email: string | null; sub_profile: string | null };

function fmtMonth(ym: string): string {
  const [y, m] = (ym ?? "").split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}
// signed url + บังคับดาวน์โหลด (Supabase รองรับ ?download=ชื่อไฟล์)
const dlUrl = (u: string, n: string) => `${u}${u.includes("?") ? "&" : "?"}download=${encodeURIComponent(n)}`;

export function AllInvoicesView({ canEdit, settings }: { canEdit: boolean; settings: SubSettings }) {
  const toast = useToast();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  // แก้ค่าใบเสร็จเอง (ตอนระบบอ่านผิด)
  const [editInv, setEditInv] = useState<InvoiceRow | null>(null);
  const [ef, setEf] = useState<{ amount: string; currency: string; invoice_date: string }>({ amount: "", currency: "THB", invoice_date: "" });
  const [savingEdit, setSavingEdit] = useState(false);

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
  const totalTHB = useMemo(
    () => filtered.reduce((s, r) => s + (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0), 0),
    [filtered, settings],
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

  const openEditInv = useCallback((inv: InvoiceRow) => {
    setEditInv(inv);
    setEf({ amount: inv.amount != null ? String(inv.amount) : "", currency: inv.currency || "THB", invoice_date: inv.invoice_date ?? "" });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editInv) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/subscriptions/${editInv.subscription_id}/invoices/${editInv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: ef.amount.trim() === "" ? null : Number(ef.amount), currency: ef.currency, invoice_date: ef.invoice_date || null }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const u = j.data as InvoiceRow;
      setRows((prev) => prev.map((r) => (r.id === editInv.id ? { ...r, amount: u.amount, currency: u.currency, invoice_date: u.invoice_date, parsed_at: u.parsed_at } : r)));
      toast.success("แก้ไขแล้ว");
      setEditInv(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ"); }
    finally { setSavingEdit(false); }
  }, [editInv, ef, toast]);

  const unparsed = useMemo(() => rows.filter((r) => !r.parsed_at).length, [rows]);

  // อ่าน PDF ที่แนบไว้แล้ว (ย้อนหลัง) — วนจนหมด
  const runBackfill = useCallback(async () => {
    setBackfilling(true);
    try {
      let total = 0, withData = 0, guard = 0;
      while (guard++ < 20) {
        const res = await apiFetch("/api/subscriptions/invoices/parse-existing", { method: "POST" });
        const j = await res.json();
        if (j.error) throw new Error(j.error);
        total += j.processed ?? 0; withData += j.withData ?? 0;
        if ((j.remaining ?? 0) <= 0 || (j.processed ?? 0) === 0) break;
      }
      toast.success(`อ่านบิลแล้ว ${total} ใบ · พบข้อมูล ${withData} ใบ`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "อ่านไม่สำเร็จ"); }
    finally { setBackfilling(false); }
  }, [toast, load]);

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
    { id: "month", accessorKey: "month", header: "เดือน", size: 120,
      cell: ({ getValue }) => <span className="text-sm text-slate-700">{fmtMonth(getValue() as string)}</span> },
    { id: "sub_name", accessorKey: "sub_name", header: "รายการ", size: 220,
      cell: ({ getValue }) => <span className="text-sm font-medium text-slate-800">{(getValue() as string) || "—"}</span> },
    { id: "profile", accessorKey: "sub_profile", header: "โปรไฟล์/บัญชี", size: 200,
      meta: { filterable: true, filterType: "select", filterLabel: "โปรไฟล์/บัญชี" },
      cell: ({ row }) => {
        const inv = row.original;
        return <span className="text-xs text-slate-500 truncate block" title={inv.sub_email ?? ""}>{inv.sub_profile || inv.sub_email || "—"}</span>;
      } },
    { id: "invoice_date", accessorKey: "invoice_date", header: "วันที่ตัด (ในบิล)", size: 120,
      cell: ({ getValue }) => { const d = getValue() as string | null; return <span className="text-xs text-slate-600">{d || <span className="text-slate-300">—</span>}</span>; } },
    { id: "amount", accessorKey: "amount", header: "จำนวนเงิน", size: 120,
      cell: ({ row }) => { const inv = row.original; return inv.amount != null
        ? <span className="text-sm font-mono tabular-nums text-slate-700">{fmtCost(Number(inv.amount), (inv.currency || "THB") as Currency)}</span>
        : <span className="text-xs text-slate-300">—</span>; } },
    { id: "amount_thb", header: "≈ ฿ (บาท)", size: 130,
      accessorFn: (r) => (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0),
      meta: {
        // รวมยอดท้ายตาราง (บาท) — รวมทุกแถวที่กรอง (function form เพราะเป็นคอลัมน์คำนวณ)
        summary: (rs) => {
          const t = (rs as InvoiceRow[]).reduce((a, r) => a + (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0), 0);
          return <span className="text-indigo-700">{fmtBaht(t)}</span>;
        },
      },
      cell: ({ row }) => { const inv = row.original; if (inv.amount == null) return <span className="text-xs text-slate-300">—</span>;
        return <span className="text-sm font-mono tabular-nums text-indigo-600">{fmtBaht(toTHB(Number(inv.amount), (inv.currency || "THB") as Currency, settings), 2)}</span>; } },
    { id: "file_name", accessorKey: "file_name", header: "ไฟล์", size: 260,
      cell: ({ getValue }) => <span className="text-sm text-slate-600 inline-flex items-center gap-1.5"><span>📄</span><span className="truncate">{getValue() as string}</span></span> },
    {
      id: "actions", header: "", size: 190, enableSorting: false,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {inv.url ? (
              <>
                <a href={inv.url} target="_blank" rel="noopener noreferrer" title="เปิดดู"
                  className="h-7 px-2.5 inline-flex items-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">🔗 เปิด</a>
                <a href={dlUrl(inv.url, inv.file_name)} title="ดาวน์โหลดไฟล์"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">⬇</a>
              </>
            ) : <span className="text-xs text-slate-300">—</span>}
            {canEdit && (
              <>
                <button onClick={() => openEditInv(inv)} title="แก้ไขจำนวนเงิน/วันที่"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                <button onClick={() => handleDelete(inv)} title="ลบ"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
              </>
            )}
          </div>
        );
      },
    },
  ], [canEdit, handleDelete, openEditInv, settings]);

  return (
    <div className="space-y-3">
      {/* บิลที่ยังขาด */}
      <MissingInvoicesPanel canEdit={canEdit} refreshKey={rows.length} monthFilter={month} />

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
        <span className="text-xs text-slate-400">แสดง {filtered.length} ใบเสร็จ · รวม ≈ <b className="text-indigo-600">{fmtBaht(totalTHB)}</b></span>
        {canEdit && unparsed > 0 && (
          <button onClick={runBackfill} disabled={backfilling}
            className="ml-auto h-9 px-3 text-xs font-medium border border-indigo-200 text-indigo-600 bg-white rounded-lg hover:bg-indigo-50 disabled:opacity-50"
            title="อ่านไฟล์ PDF ที่แนบไว้แล้ว เพื่อดึงวันที่/ยอดเงิน">
            {backfilling ? "กำลังอ่าน…" : `🔄 อ่านบิลที่แนบ (${unparsed})`}
          </button>
        )}
      </div>

      <DataTable
        tableId="subscription-invoices"
        data={filtered}
        columns={columns}
        loading={loading}
        searchableKeys={["sub_name", "sub_profile", "sub_email", "file_name", "month"]}
        searchPlaceholder="ค้นหา รายการ / ชื่อไฟล์…"
        exportFilename="subscription-invoices"
        exportEntityType="subscription_invoices"
        pageSize={25}
        emptyMessage="ยังไม่มีใบเสร็จ — อัปโหลดได้ที่ปุ่ม 🧾 ของแต่ละรายการ"
      />

      {/* แก้ค่าจากบิลเอง (ตอนระบบอ่านผิด) */}
      <ERPModal open={!!editInv} onClose={() => !savingEdit && setEditInv(null)} size="sm"
        title="แก้ไขค่าจากบิล" description={editInv ? `${editInv.sub_name ?? ""} · ${editInv.file_name}` : undefined}
        footer={
          <>
            <button onClick={() => setEditInv(null)} disabled={savingEdit} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={saveEdit} disabled={savingEdit} className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{savingEdit ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>
        }>
        {editInv && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="text-xs font-medium text-slate-600">จำนวนเงิน</span>
                <input type="number" step="0.01" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })}
                  placeholder="เว้นว่าง = ไม่ระบุ"
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-slate-200 text-sm tabular-nums outline-none focus:border-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">สกุลเงิน</span>
                <select value={ef.currency} onChange={(e) => setEf({ ...ef, currency: e.target.value })}
                  className="mt-1 h-10 w-full px-2 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-indigo-400">
                  {["THB", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">วันที่ตัด (ในบิล)</span>
              <input type="date" value={ef.invoice_date} onChange={(e) => setEf({ ...ef, invoice_date: e.target.value })}
                className="mt-1 h-10 w-full px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
            </label>
            <p className="text-[11px] text-slate-400">แก้เองแล้วปุ่ม &ldquo;🔄 อ่านบิลที่แนบ&rdquo; จะไม่ทับค่านี้</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
