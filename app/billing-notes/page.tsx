"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import { formatDate } from "@/lib/date";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
import type { ColumnDef } from "@tanstack/react-table";
import type { BillingNoteListItem, BillingNoteDetail } from "@/app/api/billing-notes/route";

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", issued: "วางบิลแล้ว", paid: "รับชำระแล้ว", cancelled: "ยกเลิก",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", issued: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-600",
};

type PickedSO = { id: string; so_number: string; grand_total: number };

export default function BillingNotesPage() {
  const canView   = usePermission("so.view");
  const canCreate = usePermission("so.create");
  const { user } = useAuth();

  const [rows,    setRows]    = useState<BillingNoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create
  const [modalOpen, setModalOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [customer,  setCustomer]  = useState<CustomerPickerValue | null>(null);
  const [billDate,  setBillDate]  = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [note,      setNote]      = useState("");
  const [picked,    setPicked]    = useState<PickedSO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // detail
  const [detail,        setDetail]        = useState<BillingNoteDetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wfLoading,     setWfLoading]     = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const fetchList = useCallback(async () => {
    // SWR-lite: กลับเข้าหน้าเดิม → โชว์ของแคชทันที แล้ว revalidate เงียบ
    const cached = peekSWR<BillingNoteListItem[]>("billing-notes:list");
    if (cached) { setRows(cached); setLoading(false); } else { setLoading(true); }
    setError(null);
    try {
      const res = await apiFetch("/api/billing-notes?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data = (json.data ?? []) as BillingNoteListItem[];
      setRows(data); mutateSWR("billing-notes:list", data);
    } catch (err) { if (!cached) setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  const openCreate = () => {
    setCustomer(null); setBillDate(new Date().toISOString().slice(0, 10)); setDueDate("");
    setNote(""); setPicked([]); setFormErr(null); setModalOpen(true);
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/billing-notes/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as BillingNoteDetail);
    } catch (err) { flash(err instanceof Error ? err.message : "โหลดไม่ได้"); setDetailOpen(false); }
    finally { setDetailLoading(false); }
  };

  // เลือกใบกำกับภาษี (SO) เข้าใบวางบิล
  const handlePicked = (rowsPicked: SourceDocRow[]) => {
    // ล็อก "ลูกค้าเดียวกัน" เฉพาะตอนมีรายการดึงไว้แล้ว — ถ้ายังไม่มี ให้ลูกค้าของใบที่เลือกใหม่เป็นตัวกำหนด
    // (กันเคสลูกค้าค้างจากการเลือกก่อนหน้า แล้วเลือกลูกค้าคนใหม่ไม่ได้)
    const lockedCust = picked.length > 0 ? customer?.id : undefined;
    const custSet = new Set([lockedCust, ...rowsPicked.map(r => r.customer_id as string)].filter(Boolean));
    if (custSet.size > 1) { flash("ใบที่เลือกเป็นคนละลูกค้า — วางบิลได้เฉพาะลูกค้าเดียวกัน"); return; }
    const first = rowsPicked[0];
    if (picked.length === 0 && first?.customer_id) {
      setCustomer({ id: first.customer_id as string, code: (first.customer_code as string) ?? null, name: (first.customer_name as string) ?? "" } as CustomerPickerValue);
    }
    setPicked(prev => {
      const seen = new Set(prev.map(p => p.id));
      const add = rowsPicked.filter(r => !seen.has(r.id)).map(r => ({
        id: r.id, so_number: (r.so_number as string) ?? "(ร่าง)", grand_total: Number(r.grand_total) || 0,
      }));
      return [...prev, ...add];
    });
  };
  const removePicked = (id: string) => {
    const next = picked.filter(p => p.id !== id);
    setPicked(next);
    if (next.length === 0) setCustomer(null);   // ไม่เหลือรายการ → ปลดล็อกลูกค้า เลือกลูกค้าคนใหม่ได้
  };

  const pickedTotal = useMemo(() => picked.reduce((s, p) => s + p.grand_total, 0), [picked]);

  const save = async () => {
    if (picked.length === 0) { setFormErr("เลือกใบกำกับภาษีอย่างน้อย 1 ใบ"); return; }
    if (!customer) { setFormErr("ไม่พบลูกค้า — เลือกใบกำกับภาษีก่อน"); return; }
    setSaving(true); setFormErr(null);
    try {
      const res = await apiFetch("/api/billing-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: {
            customer_id: customer.id, customer_name: customer.name, customer_code: customer.code,
            bill_date: billDate, due_date: dueDate || null, note: note || null,
          },
          so_ids: picked.map(p => p.id),
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("สร้างใบวางบิลแล้ว");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/billing-notes/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({ issue: "วางบิลแล้ว", pay: "รับชำระแล้ว", cancel: "ยกเลิกแล้ว" }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  const columns: ColumnDef<BillingNoteListItem>[] = useMemo(() => [
    {
      id: "bill_number", accessorKey: "bill_number", header: "เลขที่ใบวางบิล", size: 150,
      cell: ({ getValue }) => { const n = getValue() as string | null; return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>; },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 240 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 120,
      cell: ({ getValue }) => { const s = getValue() as string; return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>; },
    },
    { id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130, cell: ({ getValue }) => <span className="tabular-nums font-mono block text-right">{baht(getValue() as number)}</span> },
    { id: "bill_date", accessorKey: "bill_date", header: "วันที่", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "due_date", accessorKey: "due_date", header: "กำหนดชำระ", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "line_count", accessorKey: "line_count", header: "จำนวนบิล", size: 90, cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span> },
    {
      id: "actions", header: "", size: 90, enableSorting: false,
      cell: ({ row }) => (
        <a href={`/print/billing-note/${row.original.id}`} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()} title="พิมพ์ใบวางบิล"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
          🧾 พิมพ์
        </a>
      ),
    },
  ], []);

  const views = useMemo(() => [
    { id: "all",       label: "ทั้งหมด",        filter: () => true },
    { id: "draft",     label: "📝 ร่าง",         filter: (r: Record<string, unknown>) => r.status === "draft" },
    { id: "issued",    label: "📤 วางบิลแล้ว",   filter: (r: Record<string, unknown>) => r.status === "issued" },
    { id: "paid",      label: "✅ รับชำระแล้ว",  filter: (r: Record<string, unknown>) => r.status === "paid" },
    { id: "cancelled", label: "❌ ยกเลิก",       filter: (r: Record<string, unknown>) => r.status === "cancelled" },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">📄 ใบวางบิล</h1>
            <p className="text-sm text-slate-500">รวมใบกำกับภาษีของลูกค้ามาวางบิล — workflow: ร่าง → วางบิล → รับชำระ</p>
          </div>
          {canCreate && (
            <button onClick={openCreate} className="h-10 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ สร้างใบวางบิล</button>
          )}
        </div>

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="master-billing-notes"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["bill_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า..."
          exportFilename="billing-notes"
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Create */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title="สร้างใบวางบิล"
        description="เลือกใบกำกับภาษีของลูกค้ารายเดียวกัน ระบบจะรวมยอดให้อัตโนมัติ"
        footer={
          <>
            <div className="mr-auto flex items-baseline gap-2">
              <span className="text-xs text-slate-500">รวม {picked.length} ใบ</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-700">{baht(pickedTotal)}</span>
            </div>
            <button onClick={() => setModalOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้างใบวางบิล"}</button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            <div className="md:col-span-1">
              <span className="text-xs font-medium text-slate-600">ลูกค้า <span className="text-slate-400">(มาจากใบที่เลือก)</span></span>
              <div className="mt-1">
                <CustomerPicker value={customer} onChange={setCustomer} />
              </div>
              {customer && <RecordPeekLink moduleKey="partners-v2" recordId={customer.id} label={customer.code ? `${customer.code} - ${customer.name}` : customer.name} />}
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่</span>
              <div className="mt-1"><DateInput value={billDate} onChange={setBillDate} /></div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">กำหนดชำระ</span>
              <div className="mt-1"><DateInput value={dueDate} onChange={setDueDate} /></div>
            </div>
          </div>

          {/* รายการบิล */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">ใบกำกับภาษีที่วางบิล <span className="text-xs font-normal text-slate-400">({picked.length})</span></h3>
                <p className="mt-0.5 text-[11px] text-slate-400">เลือกได้เฉพาะ SO ที่ยืนยันแล้วของลูกค้าเดียวกัน</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(true)} className="h-9 shrink-0 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">+ เลือกใบกำกับภาษี</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold">เลขที่บิล</th>
                    <th className="px-3 py-2 text-right font-semibold">ยอดรวม</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {picked.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{p.so_number}</code></td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{baht(p.grand_total)}</td>
                      <td className="px-1 py-2 text-center"><button type="button" onClick={() => removePicked(p.id)} className="h-7 w-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500">x</button></td>
                    </tr>
                  ))}
                  {picked.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">กด &quot;+ เลือกใบกำกับภาษี&quot; เพื่อเริ่ม</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </label>
        </div>
      </ERPModal>

      {/* SO picker */}
      {pickerOpen && (
        <SourceDocPickerModal open={pickerOpen} mode="so" onClose={() => setPickerOpen(false)} onConfirm={handlePicked} />
      )}

      {/* Detail */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบวางบิล ${detail.bill_number ?? "(ร่าง)"}` : "ใบวางบิล"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.bill_number && (
              <a href={`/print/billing-note/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">🧾 พิมพ์ใบวางบิล</a>
            )}
            {detail.status === "draft" && (
              <button onClick={() => transition(detail.id, "issue")} disabled={wfLoading} className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">📤 วางบิล</button>
            )}
            {detail.status === "issued" && (
              <button onClick={() => transition(detail.id, "pay")} disabled={wfLoading} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ รับชำระ</button>
            )}
            {(detail.status === "draft" || detail.status === "issued") && (
              <button onClick={() => transition(detail.id, "cancel")} disabled={wfLoading} className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="วันที่" value={formatDate(detail.bill_date)} />
              <Info label="กำหนดชำระ" value={formatDate(detail.due_date)} />
              <Info label="สถานะ" value={STATUS_LABEL[detail.status] ?? detail.status} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">เลขที่บิล</th>
                    <th className="px-3 py-2 text-left font-semibold">วันที่บิล</th>
                    <th className="px-3 py-2 text-right font-semibold">จำนวนเงิน</th>
                    <th className="px-3 py-2 text-right font-semibold">ภาษี</th>
                    <th className="px-3 py-2 text-right font-semibold">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="px-3 py-2 text-center font-mono text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{l.so_number ?? "—"}</code></td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(l.bill_date)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(l.amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(l.vat_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{baht(l.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-w-md ml-auto">
              <Row label="จำนวนเงิน" value={baht(detail.subtotal)} />
              <Row label="ภาษีมูลค่าเพิ่ม" value={baht(detail.total_vat)} />
              <Row label="หัก ณ ที่จ่าย" value={baht(detail.total_wht)} />
              <Row label="จำนวนเงินที่ชำระ" value={baht(detail.amount_due)} bold />
            </div>
            {detail.note && <p className="text-sm text-slate-500">หมายเหตุ: {detail.note}</p>}
          </div>
        )}
      </ERPModal>
    </PlaygroundShell>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="text-sm text-slate-800">{value || "—"}</p></div>;
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`col-span-2 flex justify-between ${bold ? "font-semibold border-t border-slate-200 pt-1 mt-1" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums font-mono ${bold ? "text-blue-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
