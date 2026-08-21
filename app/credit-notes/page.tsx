"use client";

/**
 * ใบลดหนี้ (Credit Note) — /credit-notes
 *
 * ออกเมื่อออกใบกำกับภาษีไปแล้ว แต่ยอดต้องลดลง (ของไม่ครบ / ชำรุด / คืนของ / ลดราคาให้)
 * รองรับ 2 ทาง: กรอกเลขใบกำกับเดิมเอง (ใบที่ออกนอกระบบ) หรือดึงจากใบกำกับในระบบ
 *
 * ของกลางที่ใช้: PlaygroundShell · DataTable · ERPModal/ConfirmDialog · CustomerPicker/SkuPicker
 *                MoneyInput · DateInput · permission · lib/credit-note (คิดเลขที่เดียวกับฝั่ง API)
 * ⚖️ ใบที่ออกเอกสารแล้วแก้/ลบไม่ได้ — ต้องยกเลิกแล้วออกใบใหม่
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CustomerPicker, SkuPicker } from "@/components/pickers";
import type { CustomerPickerValue, SkuPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { MoneyInput } from "@/components/money-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { computeCreditNote, validateBeforeIssue, type CreditNoteLine } from "@/lib/credit-note";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreditNoteListItem, CreditNoteDetail } from "@/app/api/credit-notes/route";
import type { InvoiceOption, InvoiceSource } from "@/app/api/credit-notes/from-invoice/route";

const STATUS_LABEL: Record<string, string> = { draft: "ร่าง", issued: "ออกเอกสารแล้ว", cancelled: "ยกเลิก" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", issued: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-600",
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const randId = () => String(Math.random()).slice(2);

type EditLine = CreditNoteLine & { tempId: string };
const emptyLine = (): EditLine => ({
  tempId: randId(), product_id: null, sku: null, product_name: "", note: "",
  unit: "ชิ้น", unit_price: 0, qty_original: 0, qty_correct: 0,
});

type CompanyOpt = { id: string; company_code: string; name: string; name_th: string | null; is_default: boolean };

type FormState = {
  company_id: string;
  company_code: string;
  cn_date: string;
  ref_so_id: string | null;
  ref_invoice_no: string;
  ref_invoice_date: string;
  customer: CustomerPickerValue | null;
  original_amount: number;
  vat_rate: number;
  reason: string;
  note: string;
  lines: EditLine[];
};

const EMPTY: FormState = {
  company_id: "", company_code: "", cn_date: new Date().toISOString().slice(0, 10),
  ref_so_id: null, ref_invoice_no: "", ref_invoice_date: "",
  customer: null, original_amount: 0, vat_rate: 7, reason: "", note: "", lines: [emptyLine()],
};

/** เหตุผลที่ใช้บ่อย — กดปุ่มเติมได้ ไม่ต้องพิมพ์ */
const REASON_PRESETS = [
  "ส่งสินค้าไม่ครบตามจำนวน",
  "สินค้าชำรุด/ไม่ได้มาตรฐาน",
  "ลูกค้าส่งคืนสินค้า",
  "ลดราคาให้ลูกค้าภายหลัง",
  "คำนวณราคาผิดพลาด (สูงเกินไป)",
];

export default function CreditNotesPage() {
  const canView   = usePermission("cn.view");
  const canCreate = usePermission("cn.create");
  const canCancel = usePermission("cn.cancel");
  const { user } = useAuth();

  const [rows, setRows] = useState<CreditNoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  // form
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);

  // ดึงจากใบกำกับในระบบ
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // detail
  const [detail, setDetail] = useState<CreditNoteDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wfLoading, setWfLoading] = useState(false);
  const [issueTarget, setIssueTarget] = useState<CreditNoteDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CreditNoteDetail | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CreditNoteDetail | null>(null);

  // ---- โหลดรายการ ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/credit-notes?limit=300");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows((json.data ?? []) as CreditNoteListItem[]);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/api/admin/companies").then(r => r.json())
      .then(j => setCompanies(((j.data ?? []) as CompanyOpt[]).filter(Boolean)))
      .catch(() => setCompanies([]));
  }, [canView]);

  // ---- ยอดรวม (คิดด้วยสูตรเดียวกับฝั่งเซิร์ฟเวอร์) ----
  const totals = useMemo(
    () => computeCreditNote(form.lines, form.original_amount, form.vat_rate).totals,
    [form.lines, form.original_amount, form.vat_rate],
  );

  const patchLine = (tempId: string, patch: Partial<EditLine>) =>
    setForm(f => ({ ...f, lines: f.lines.map(l => (l.tempId === tempId ? { ...l, ...patch } : l)) }));

  const openCreate = () => {
    const def = companies.find(c => c.is_default) ?? companies[0];
    setEditingId(null);
    setForm({ ...EMPTY, cn_date: new Date().toISOString().slice(0, 10), lines: [emptyLine()],
      company_id: def?.id ?? "", company_code: def?.company_code ?? "" });
    setFormErr(null); setModalOpen(true);
  };

  const openEdit = (d: CreditNoteDetail) => {
    setEditingId(d.id);
    setForm({
      company_id: d.company_id ?? "", company_code: d.company_code ?? "",
      cn_date: d.cn_date, ref_so_id: d.ref_so_id, ref_invoice_no: d.ref_invoice_no ?? "",
      ref_invoice_date: d.ref_invoice_date ?? "",
      customer: d.customer_id ? ({ id: d.customer_id, code: d.customer_code, name: d.customer_name ?? "" } as CustomerPickerValue) : null,
      original_amount: d.original_amount, vat_rate: d.vat_rate, reason: d.reason ?? "", note: d.note ?? "",
      lines: (d.lines.length ? d.lines : [emptyLine()]).map(l => ({ ...l, tempId: randId() })),
    });
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  // ---- ดึงจากใบกำกับในระบบ ----
  const loadInvoices = useCallback(async (q: string) => {
    setInvoiceLoading(true);
    try {
      const res = await apiFetch(`/api/credit-notes/from-invoice?search=${encodeURIComponent(q)}`);
      const json = await res.json();
      setInvoices((json.data ?? []) as InvoiceOption[]);
    } catch { setInvoices([]); }
    finally { setInvoiceLoading(false); }
  }, []);

  useEffect(() => {
    if (!invoiceOpen) return;
    const t = setTimeout(() => loadInvoices(invoiceQuery), 250);
    return () => clearTimeout(t);
  }, [invoiceOpen, invoiceQuery, loadInvoices]);

  const pickInvoice = async (opt: InvoiceOption) => {
    try {
      const res = await apiFetch(`/api/credit-notes/from-invoice?so_id=${opt.so_id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const src = json.data as InvoiceSource;
      setForm(f => ({
        ...f,
        company_id: src.company_id ?? f.company_id,
        company_code: src.company_code ?? f.company_code,
        ref_so_id: src.so_id,
        ref_invoice_no: src.invoice_no,
        ref_invoice_date: src.invoice_date ?? "",
        customer: src.customer_id
          ? ({ id: src.customer_id, code: src.customer_code, name: src.customer_name ?? "" } as CustomerPickerValue)
          : f.customer,
        original_amount: src.taxable,
        vat_rate: src.vat_rate || 7,
        lines: src.lines.length ? src.lines.map(l => ({ ...l, tempId: randId() })) : [emptyLine()],
      }));
      setInvoiceOpen(false);
      flash(`ดึงข้อมูลจาก ${src.invoice_no} แล้ว — แก้ช่อง "จำนวนที่ถูกต้อง" ของบรรทัดที่ต้องลด`);
    } catch (err) { flash(err instanceof Error ? err.message : "ดึงข้อมูลไม่ได้"); }
  };

  // ---- บันทึก ----
  const save = async () => {
    if (!form.ref_invoice_no.trim()) { setFormErr("ต้องระบุเลขที่ใบกำกับภาษีเดิมที่อ้างอิง"); return; }
    if (!form.customer) { setFormErr("กรุณาเลือกลูกค้า"); return; }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        company_id: form.company_id || null,
        company_code: form.company_code || companies.find(c => c.id === form.company_id)?.company_code || null,
        cn_date: form.cn_date,
        ref_so_id: form.ref_so_id,
        ref_invoice_no: form.ref_invoice_no.trim(),
        ref_invoice_date: form.ref_invoice_date || null,
        customer_id: form.customer.id, customer_name: form.customer.name, customer_code: form.customer.code,
        original_amount: form.original_amount, vat_rate: form.vat_rate,
        reason: form.reason || null, note: form.note || null,
      };
      const lines = form.lines.map(({ tempId: _t, ...l }) => l);
      const url = editingId ? `/api/credit-notes/${editingId}` : "/api/credit-notes";
      const res = await apiFetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใบลดหนี้ (ร่าง) แล้ว");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- เปิดรายละเอียด ----
  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/credit-notes/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as CreditNoteDetail);
    } catch (err) { flash(err instanceof Error ? err.message : "โหลดไม่ได้"); setDetailOpen(false); }
    finally { setDetailLoading(false); }
  };

  const runTransition = async (id: string, action: "issue" | "cancel", reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/credit-notes/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(action === "issue" ? `ออกเอกสารแล้ว เลขที่ ${json.cn_number}` : "ยกเลิกแล้ว");
      setIssueTarget(null); setCancelTarget(null); setCancelReason(""); setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ"); }
    finally { setWfLoading(false); }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/credit-notes/${deleteTarget.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบใบร่างแล้ว");
      setDeleteTarget(null); setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setWfLoading(false); }
  };

  // ---- ตาราง ----
  const columns: ColumnDef<CreditNoteListItem>[] = useMemo(() => [
    { id: "cn_number", accessorKey: "cn_number", header: "เลขที่ใบลดหนี้", size: 165,
      cell: ({ getValue }) => { const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>; } },
    { id: "ref_invoice_no", accessorKey: "ref_invoice_no", header: "อ้างอิงใบกำกับ", size: 155,
      cell: ({ getValue }) => <code className="font-mono text-xs text-slate-600">{(getValue() as string) ?? "—"}</code> },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 260 },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => { const s = getValue() as string;
        return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>; } },
    { id: "diff_amount", accessorKey: "diff_amount", header: "ยอดลด (ก่อน VAT)", size: 140,
      cell: ({ getValue }) => <span className="tabular-nums font-mono block text-right">{baht(getValue() as number)}</span> },
    { id: "grand_total", accessorKey: "grand_total", header: "รวมลดหนี้", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono block text-right font-semibold">{baht(getValue() as number)}</span> },
    { id: "cn_date", accessorKey: "cn_date", header: "วันที่", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "reason", accessorKey: "reason", header: "เหตุผล", size: 220,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{(getValue() as string) ?? "—"}</span> },
    { id: "actions", header: "", size: 90, enableSorting: false,
      cell: ({ row }) => row.original.status === "issued" ? (
        <a href={`/print/credit-note/${row.original.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">🖨 พิมพ์</a>
      ) : null },
  ], []);

  const views = useMemo(() => [
    { id: "all",       label: "ทั้งหมด",        filter: () => true },
    { id: "draft",     label: "📝 ร่าง",         filter: (r: Record<string, unknown>) => r.status === "draft" },
    { id: "issued",    label: "✅ ออกเอกสารแล้ว", filter: (r: Record<string, unknown>) => r.status === "issued" },
    { id: "cancelled", label: "⊘ ยกเลิก",        filter: (r: Record<string, unknown>) => r.status === "cancelled" },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const filledLines = form.lines.filter(l => (l.product_name ?? "").trim() || (l.sku ?? "").trim());

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🧾➖ ใบลดหนี้</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ออกเมื่อออกใบกำกับภาษีไปแล้วแต่ยอดต้องลดลง — ของไม่ครบ / ชำรุด / คืนของ / ลดราคาให้
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sales-orders" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">🧾 ใบขาย</Link>
            {canCreate && (
              <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                ＋ สร้างใบลดหนี้
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="credit-notes"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["cn_number", "ref_invoice_no", "customer_name", "reason"]}
          searchPlaceholder="ค้นหา เลขใบลดหนี้ / เลขใบกำกับ / ลูกค้า..."
          exportFilename="credit-notes"
          exportEntityType="erp_playground_credit_note"
          onRowClick={(row: CreditNoteListItem) => openDetail(row.id)}
        />
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 bg-slate-800 text-white text-sm rounded-lg shadow-lg">{toast}</div>
      )}

      {/* ============ ฟอร์มสร้าง/แก้ ============ */}
      <ERPModal open={modalOpen} onClose={() => setModalOpen(false)} size="xl"
        title={editingId ? "แก้ใบลดหนี้ (ร่าง)" : "สร้างใบลดหนี้"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึกเป็นร่าง"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {formErr}</div>}

          {/* --- หัวเอกสาร --- */}
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">ข้อมูลเอกสาร</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">ออกในนามบริษัท</span>
                <select value={form.company_id}
                  onChange={e => {
                    const c = companies.find(x => x.id === e.target.value);
                    setForm(f => ({ ...f, company_id: e.target.value, company_code: c?.company_code ?? "" }));
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                  {companies.length === 0 && <option value="">— ยังไม่มีบริษัทในทะเบียน —</option>}
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name_th || c.name} ({c.company_code})</option>)}
                </select>
                <span className="mt-1 block text-[11px] text-slate-400">เลขที่ใบลดหนี้จะออกตามชุดเลขของบริษัทนี้</span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">วันที่ใบลดหนี้</span>
                <DateInput value={form.cn_date} onChange={v => setForm(f => ({ ...f, cn_date: v }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">ลูกค้า *</span>
                <div className="mt-1">
                  <CustomerPicker value={form.customer} onChange={v => setForm(f => ({ ...f, customer: v }))} />
                </div>
              </label>
            </div>
          </section>

          {/* --- ใบกำกับต้นทาง --- */}
          <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-800">
                ใบกำกับภาษีเดิมที่อ้างอิง <span className="font-normal text-slate-500">(กฎหมายบังคับให้ระบุ)</span>
              </h3>
              <button type="button" onClick={() => { setInvoiceOpen(true); setInvoiceQuery(""); }}
                className="h-8 px-3 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                📄 ดึงจากใบกำกับในระบบ
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">เลขที่ใบกำกับเดิม *</span>
                <input value={form.ref_invoice_no} onChange={e => setForm(f => ({ ...f, ref_invoice_no: e.target.value, ref_so_id: null }))}
                  placeholder="เช่น LM2569-08-001"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">วันที่ใบกำกับเดิม</span>
                <DateInput value={form.ref_invoice_date} onChange={v => setForm(f => ({ ...f, ref_invoice_date: v }))} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">มูลค่าตามเอกสารเดิม (ก่อน VAT)</span>
                <MoneyInput value={form.original_amount}
                  onChange={raw => setForm(f => ({ ...f, original_amount: Number(raw) || 0 }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-right tabular-nums" />
                <span className="mt-1 block text-[11px] text-slate-400">ยอดรวมทั้งใบก่อนภาษี — ดึงจากระบบจะเติมให้อัตโนมัติ</span>
              </label>
            </div>
          </section>

          {/* --- รายการที่ลด --- */}
          <section className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">รายการที่ลด <span className="text-xs font-normal text-slate-400">({filledLines.length})</span></h3>
                <p className="text-[11px] text-slate-400">แก้ช่อง &ldquo;จำนวนที่ถูกต้อง&rdquo; ให้เป็นจำนวนที่ลูกค้าได้รับจริง — ระบบคิดผลต่างให้เอง</p>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }))}
                className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">+ เพิ่มรายการ</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="w-8 px-2 py-2 text-center font-semibold">#</th>
                    <th className="min-w-[260px] px-2 py-2 text-left font-semibold">สินค้า</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">ราคา/หน่วย</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">จำนวนเดิม</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">จำนวนที่ถูกต้อง</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">ยอดที่ลด</th>
                    <th className="w-9 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.lines.map((l, i) => {
                    const diff = (Number(l.qty_original) - Number(l.qty_correct)) * Number(l.unit_price);
                    return (
                      <tr key={l.tempId} className="align-top">
                        <td className="px-2 py-2 text-center font-mono text-xs text-slate-400">{i + 1}</td>
                        <td className="px-2 py-2">
                          <SkuPicker
                            value={l.product_name ? ({ id: l.product_id ?? "", code: l.sku ?? "", name: l.product_name, uom_name: l.unit, list_price: l.unit_price } as SkuPickerValue) : null}
                            onChange={(p: SkuPickerValue | null) => patchLine(l.tempId, p ? {
                              product_id: p.id, sku: p.code, product_name: p.name,
                              unit: p.uom_name ?? l.unit, unit_price: p.list_price ?? l.unit_price,
                              note: (l.note ?? "").trim() ? l.note : (p.color ?? ""),
                            } : { product_id: null, sku: null, product_name: "", note: "" })}
                            placeholder="เลือก SKU / ชื่อสินค้า..." />
                          <input value={l.note ?? ""} onChange={e => patchLine(l.tempId, { note: e.target.value })}
                            placeholder="สี/ตัวเลือก (เช่น เขียว L)"
                            className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-400" />
                        </td>
                        <td className="px-2 py-2">
                          <MoneyInput value={l.unit_price} onChange={raw => patchLine(l.tempId, { unit_price: Number(raw) || 0 })}
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" value={l.qty_original}
                            onChange={e => patchLine(l.tempId, { qty_original: parseFloat(e.target.value) || 0 })}
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" value={l.qty_correct}
                            onChange={e => patchLine(l.tempId, { qty_correct: parseFloat(e.target.value) || 0 })}
                            className="h-9 w-full rounded-lg border border-blue-300 bg-blue-50/40 px-2 text-right text-sm tabular-nums" />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">{baht(diff)}</td>
                        <td className="px-1 py-2 text-center">
                          <button type="button" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter(x => x.tempId !== l.tempId) }))}
                            className="h-8 w-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label="ลบรายการ">x</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* --- เหตุผล + สรุป --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-xl border border-slate-200 p-3">
              <span className="text-xs font-medium text-slate-600">เหตุผลที่ลดหนี้ * <span className="font-normal text-slate-400">(จะพิมพ์บนเอกสาร)</span></span>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="เช่น ส่งสินค้าไม่ครบตามจำนวน"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REASON_PRESETS.map(r => (
                  <button key={r} type="button" onClick={() => setForm(f => ({ ...f, reason: r }))}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-700">{r}</button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-600">หมายเหตุเพิ่มเติม</span>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">สรุปยอด (ก่อน VAT)</h3>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  VAT
                  <input type="number" value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: parseFloat(e.target.value) || 0 }))}
                    className="h-7 w-14 rounded-md border border-slate-200 px-1.5 text-right text-xs tabular-nums" />%
                </label>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">มูลค่าตามเอกสารเดิม</dt>
                  <dd className="font-mono tabular-nums">{baht(totals.original_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">มูลค่าที่ถูกต้อง</dt>
                  <dd className="font-mono tabular-nums">{baht(totals.correct_amount)}</dd></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <dt className="font-medium text-slate-700">ผลต่าง (ยอดที่ลด)</dt>
                  <dd className="font-mono tabular-nums font-semibold text-amber-700">{baht(totals.diff_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">ภาษีมูลค่าเพิ่ม {form.vat_rate}%</dt>
                  <dd className="font-mono tabular-nums">{baht(totals.vat_amount)}</dd></div>
                <div className="flex justify-between border-t border-slate-300 pt-1.5">
                  <dt className="font-semibold text-slate-800">จำนวนเงินทั้งสิ้น</dt>
                  <dd className="font-mono tabular-nums text-base font-bold text-slate-900">{baht(totals.grand_total)}</dd></div>
              </dl>
              {totals.original_amount > 0 && totals.diff_amount > totals.original_amount && (
                <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">⚠ ยอดที่ลดมากกว่ามูลค่าตามเอกสารเดิม</p>
              )}
            </section>
          </div>
        </div>
      </ERPModal>

      {/* ============ เลือกใบกำกับในระบบ ============ */}
      <ERPModal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} size="lg" title="เลือกใบกำกับภาษีในระบบ">
        <div className="space-y-3">
          <input autoFocus value={invoiceQuery} onChange={e => setInvoiceQuery(e.target.value)}
            placeholder="ค้นหา เลขใบกำกับ / ชื่อลูกค้า..."
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            {invoiceLoading ? (
              <div className="py-10 text-center text-sm text-slate-400">กำลังค้นหา...</div>
            ) : invoices.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                ไม่พบใบกำกับในระบบ — ถ้าใบเดิมออกนอกระบบ ให้ปิดหน้านี้แล้วพิมพ์เลขที่/วันที่/ยอดเดิมเอง
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold">เลขที่</th>
                    <th className="px-3 py-2 text-left font-semibold">วันที่</th>
                    <th className="px-3 py-2 text-left font-semibold">ลูกค้า</th>
                    <th className="px-3 py-2 text-right font-semibold">ยอดก่อน VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <tr key={inv.so_id} onClick={() => pickInvoice(inv)} className="cursor-pointer hover:bg-blue-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{inv.invoice_no}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{formatDate(inv.invoice_date)}</td>
                      <td className="px-3 py-2 max-w-[280px] truncate">{inv.customer_name}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(inv.taxable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </ERPModal>

      {/* ============ รายละเอียด ============ */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบลดหนี้ ${detail.cn_number ?? "(ร่าง)"}` : "ใบลดหนี้"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.status === "issued" && (
              <a href={`/print/credit-note/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">🖨 พิมพ์</a>
            )}
            {detail.status === "draft" && canCreate && (
              <>
                <button onClick={() => openEdit(detail)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✏️ แก้ไข</button>
                <button onClick={() => setDeleteTarget(detail)} disabled={wfLoading}
                  className="h-9 px-4 text-sm border border-red-300 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50">🗑 ลบ</button>
                <button onClick={() => setIssueTarget(detail)} disabled={wfLoading}
                  className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✅ ออกเอกสาร</button>
              </>
            )}
            {detail.status === "issued" && canCancel && (
              <button onClick={() => { setCancelTarget(detail); setCancelReason(""); }} disabled={wfLoading}
                className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="อ้างอิงใบกำกับ" value={detail.ref_invoice_no} />
              <Info label="วันที่ใบกำกับเดิม" value={formatDate(detail.ref_invoice_date)} />
              <Info label="สถานะ" value={STATUS_LABEL[detail.status] ?? detail.status} />
              <Info label="ออกในนาม" value={detail.company_name_th || detail.company_code} />
              <Info label="วันที่ใบลดหนี้" value={formatDate(detail.cn_date)} />
              <div className="md:col-span-2"><Info label="เหตุผลที่ลดหนี้" value={detail.reason} /></div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">รหัส</th>
                    <th className="px-3 py-2 text-left font-semibold">สินค้า</th>
                    <th className="px-3 py-2 text-right font-semibold">ราคา/หน่วย</th>
                    <th className="px-3 py-2 text-right font-semibold">เดิม</th>
                    <th className="px-3 py-2 text-right font-semibold">ที่ถูกต้อง</th>
                    <th className="px-3 py-2 text-right font-semibold">ยอดที่ลด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{l.sku ?? "-"}</td>
                      <td className="px-3 py-2">{l.product_name}{l.note ? <span className="block text-xs text-slate-400">{l.note}</span> : null}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(l.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{Number(l.qty_original).toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{Number(l.qty_correct).toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{baht(l.amount_diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">มูลค่าตามเอกสารเดิม</span><span className="font-mono tabular-nums">{baht(detail.original_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">มูลค่าที่ถูกต้อง</span><span className="font-mono tabular-nums">{baht(detail.correct_amount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 mt-1.5 pt-1.5"><span className="font-medium">ผลต่าง</span><span className="font-mono tabular-nums font-semibold text-amber-700">{baht(detail.diff_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">VAT {detail.vat_rate}%</span><span className="font-mono tabular-nums">{baht(detail.vat_amount)}</span></div>
              <div className="flex justify-between border-t border-slate-300 mt-1.5 pt-1.5"><span className="font-semibold">จำนวนเงินทั้งสิ้น</span><span className="font-mono tabular-nums font-bold">{baht(detail.grand_total)}</span></div>
            </div>

            {detail.note && <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900"><strong>หมายเหตุ:</strong> {detail.note}</div>}
            {detail.cancel_reason && <div className="px-3 py-2 bg-red-50 border-l-4 border-red-300 text-sm text-red-900"><strong>เหตุผลที่ยกเลิก:</strong> {detail.cancel_reason}</div>}
          </div>
        )}
      </ERPModal>

      {/* ยืนยันออกเอกสาร */}
      <ConfirmDialog
        open={!!issueTarget} onClose={() => setIssueTarget(null)}
        onConfirm={() => issueTarget && runTransition(issueTarget.id, "issue")}
        loading={wfLoading} title="ออกเอกสารใบลดหนี้?" confirmText="ออกเอกสาร"
        message={issueTarget ? (
          <div className="space-y-2 text-sm">
            <div>ระบบจะออกเลขที่จริงให้ตามชุดเลขของบริษัท และ<strong>แก้ไขไม่ได้อีก</strong></div>
            <div className="text-slate-500">
              ลด {baht(issueTarget.diff_amount)} + VAT {baht(issueTarget.vat_amount)} = <strong>{baht(issueTarget.grand_total)} บาท</strong>
              <br />อ้างอิงใบกำกับ {issueTarget.ref_invoice_no}
            </div>
            {validateBeforeIssue({ ref_invoice_no: issueTarget.ref_invoice_no, reason: issueTarget.reason, diff_amount: issueTarget.diff_amount, original_amount: issueTarget.original_amount }) && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                ⚠ {validateBeforeIssue({ ref_invoice_no: issueTarget.ref_invoice_no, reason: issueTarget.reason, diff_amount: issueTarget.diff_amount, original_amount: issueTarget.original_amount })}
              </div>
            )}
          </div>
        ) : ""}
      />

      {/* ยืนยันยกเลิก */}
      <ERPModal open={!!cancelTarget} onClose={() => setCancelTarget(null)} size="sm" title="ยกเลิกใบลดหนี้"
        footer={
          <>
            <button onClick={() => setCancelTarget(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            <button onClick={() => cancelTarget && runTransition(cancelTarget.id, "cancel", cancelReason)}
              disabled={wfLoading || !cancelReason.trim()}
              className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">ยืนยันยกเลิก</button>
          </>
        }>
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">เอกสารภาษีลบไม่ได้ — ระบบจะเก็บใบนี้ไว้พร้อมสถานะ &ldquo;ยกเลิก&rdquo; และเหตุผล</p>
          <input autoFocus value={cancelReason} onChange={e => setCancelReason(e.target.value)}
            placeholder="เหตุผลที่ยกเลิก เช่น ออกผิดใบ"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
        </div>
      </ERPModal>

      {/* ยืนยันลบร่าง */}
      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={doDelete}
        loading={wfLoading} variant="danger" title="ลบใบร่าง?" confirmText="ลบถาวร"
        message={deleteTarget ? `ลบใบลดหนี้ร่างที่อ้างอิง ${deleteTarget.ref_invoice_no ?? "-"} ทิ้งถาวร (ระบบเก็บประวัติไว้ให้)` : ""}
      />
    </PlaygroundShell>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}
