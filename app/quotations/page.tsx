"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { AttachmentPanel } from "@/components/attachment-panel";
import { ERPModal } from "@/components/modal";
import { CustomerPicker } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { QuoteListItem, QuoteDetail } from "@/app/api/quotations/route";
import { SOLineEditor, emptyLine, type EditorLine } from "@/app/sales-orders/line-editor";

// ---- helpers ----

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", sent: "ส่งแล้ว", accepted: "ตอบรับแล้ว", converted: "แปลงเป็น SO แล้ว",
  rejected: "ปฏิเสธ", expired: "หมดอายุ", cancelled: "ยกเลิก",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", sent: "bg-amber-100 text-amber-700",
  accepted: "bg-blue-100 text-blue-700", converted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700", expired: "bg-slate-200 text-slate-500",
  cancelled: "bg-red-50 text-red-500",
};

const addDays = (iso: string, days: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ---- Form state ----

type FormState = {
  customer: CustomerPickerValue | null;
  sale_person_name: string;
  quote_date: string;
  valid_until: string;
  vat_rate: number;
  vat_included: boolean;
  wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  lines: EditorLine[];
};

const makeEmpty = (): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customer: null, sale_person_name: "",
    quote_date: today, valid_until: addDays(today, 30),
    vat_rate: 7, vat_included: false, wht_rate: 0,
    header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
    note: "", lines: [emptyLine()],
  };
};

// ============================================================
// Page
// ============================================================

export default function QuotationsPage() {
  const canView   = usePermission("qt.view");
  const canCreate = usePermission("qt.create");
  const canSend   = usePermission("qt.send");
  const canAccept = usePermission("qt.accept");
  const canReject = usePermission("qt.reject");
  const canCancel = usePermission("qt.cancel");
  const { user, can } = useAuth();

  const [rows,    setRows]    = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<FormState>(makeEmpty);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  // detail drawer
  const [detail,        setDetail]        = useState<QuoteDetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // workflow
  const [wfLoading, setWfLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<QuoteDetail | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/quotations?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // ---- Open detail ----
  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/quotations/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as QuoteDetail);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  // ---- Open edit (draft only) ----
  const openEdit = (q: QuoteDetail) => {
    setEditingId(q.id);
    setForm({
      customer: q.customer_id ? {
        id: q.customer_id, code: q.customer_code, name: q.customer_name ?? "",
      } as CustomerPickerValue : null,
      sale_person_name: q.sale_person_name ?? "",
      quote_date: q.quote_date,
      valid_until: q.valid_until ?? addDays(q.quote_date, 30),
      vat_rate: q.vat_rate, vat_included: q.vat_included, wht_rate: q.wht_rate,
      header_discount_type: q.header_discount_type, header_discount_value: q.header_discount_value,
      shipping_fee: q.shipping_fee,
      note: q.note ?? "",
      lines: q.lines.map(l => ({
        tempId: l.id ?? String(Math.random()),
        product_id: l.product_id ?? null, sku: l.sku ?? null, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type ?? "percent",
        discount_value: l.discount_value ?? 0,
        tax_code: l.tax_code ?? null, note: l.note ?? "",
      })),
    });
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null); setForm(makeEmpty()); setFormErr(null); setModalOpen(true);
  };

  // ---- Save ----
  const save = async () => {
    if (!form.customer) { setFormErr("กรุณาเลือกลูกค้า"); return; }
    if (form.lines.length === 0 || form.lines.some(l => !l.product_name.trim())) {
      setFormErr("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"); return;
    }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        customer_id: form.customer.id, customer_name: form.customer.name, customer_code: form.customer.code,
        sale_person_name: form.sale_person_name || null,
        quote_date: form.quote_date,
        valid_until: form.valid_until || null,
        vat_rate: form.vat_rate, vat_included: form.vat_included, wht_rate: form.wht_rate,
        header_discount_type: form.header_discount_type,
        header_discount_value: form.header_discount_value,
        shipping_fee: form.shipping_fee,
        note: form.note || null,
      };
      const lines = form.lines.map(l => ({
        product_id: l.product_id, sku: l.sku, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type, discount_value: l.discount_value,
        tax_code: l.tax_code, note: l.note,
      }));
      const url = editingId ? `/api/quotations/${editingId}` : "/api/quotations";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใบเสนอราคาใหม่");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- Transition ----
  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/quotations/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({
        send: "ส่งใบเสนอราคาแล้ว", accept: "บันทึกว่าลูกค้าตอบรับ",
        reject: "ปฏิเสธแล้ว", expire: "ทำเครื่องหมายหมดอายุ", cancel: "ยกเลิกแล้ว",
      }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false); setRejectTarget(null); setRejectReason("");
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  // ---- Convert to SO ----
  const convertToSO = async (id: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/quotations/${id}/convert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("แปลงเป็นใบสั่งขายแล้ว — เปิดหน้า 'ใบขาย (SO)' เพื่อดูต่อ");
      setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "แปลงไม่สำเร็จ"); }
    finally { setWfLoading(false); }
  };

  // ---- Columns ----
  const columns: ColumnDef<QuoteListItem>[] = useMemo(() => [
    {
      id: "quote_number", accessorKey: "quote_number", header: "เลขที่ใบเสนอราคา", size: 150,
      cell: ({ getValue }) => {
        const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>;
      },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 220 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>;
      },
    },
    {
      id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-right block">{baht(getValue() as number)}</span>,
    },
    { id: "sale_person_name", accessorKey: "sale_person_name", header: "เซลส์", size: 130 },
    { id: "quote_date", accessorKey: "quote_date", header: "วันที่เสนอ", size: 110 },
    {
      id: "valid_until", accessorKey: "valid_until", header: "ยืนราคาถึง", size: 110,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-slate-300">—</span>;
        const expired = v < new Date().toISOString().slice(0, 10);
        return <span className={expired ? "text-red-500" : "text-slate-600"}>{v}{expired ? " ⚠" : ""}</span>;
      },
    },
    {
      id: "line_count", accessorKey: "line_count", header: "รายการ", size: 70,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span>,
    },
  ], []);

  // ---- Saved Views (ของกลาง §14) ----
  const views = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const myName = user?.name ?? "";
    return [
      { id: "all",       label: "ทั้งหมด" },
      { id: "mine",      label: "👤 ของฉัน",     filter: (r: Record<string, unknown>) => String(r.sale_person_name ?? "") === myName },
      { id: "draft",     label: "📝 ร่าง",        filter: (r: Record<string, unknown>) => r.status === "draft" },
      { id: "sent",      label: "📤 ส่งแล้ว",     filter: (r: Record<string, unknown>) => r.status === "sent" },
      { id: "accepted",  label: "👍 ตอบรับแล้ว",  filter: (r: Record<string, unknown>) => r.status === "accepted" },
      { id: "converted", label: "✅ แปลงเป็น SO",  filter: (r: Record<string, unknown>) => r.status === "converted" },
      { id: "rejected",  label: "❌ ปฏิเสธ",      filter: (r: Record<string, unknown>) => r.status === "rejected" },
      { id: "expired",   label: "⏰ หมดอายุ",     filter: (r: Record<string, unknown>) => r.status === "expired" },
      { id: "month",     label: "🗓 เดือนนี้",    filter: (r: Record<string, unknown>) => String(r.quote_date ?? "").startsWith(monthPrefix) },
    ];
  }, [user?.name]);

  // early return หลัง hooks ทั้งหมด
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📄 ใบเสนอราคา (Quotation)</h1>
            <p className="text-sm text-slate-500 mt-0.5">ร่าง → ส่ง → ตอบรับ → แปลงเป็นใบสั่งขาย / ปฏิเสธ / หมดอายุ</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ สร้างใบเสนอราคา
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="quotations"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["quote_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า..."
          exportFilename="quotations"
          exportEntityType="erp_playground_quote"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm z-50">✓ {toast}</div>}
      </div>

      {/* Detail Drawer */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบเสนอราคา ${detail.quote_number ?? "(ร่าง)"} · ${detail.customer_name}` : "Quotation Detail"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>

            {detail.status === "draft" && (
              <>
                <button onClick={() => openEdit(detail)}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
                {canSend && (
                  <button onClick={() => transition(detail.id, "send")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">📤 ส่งใบเสนอราคา</button>
                )}
                {canCancel && (
                  <button onClick={() => transition(detail.id, "cancel")} disabled={wfLoading}
                    className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
                )}
              </>
            )}

            {detail.status === "sent" && (
              <>
                {canAccept && (
                  <button onClick={() => transition(detail.id, "accept")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">👍 ลูกค้าตอบรับ</button>
                )}
                {canAccept && (
                  <button onClick={() => convertToSO(detail.id)} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🧾 แปลงเป็นใบสั่งขาย</button>
                )}
                {canReject && (
                  <button onClick={() => { setRejectTarget(detail); setRejectReason(""); }} disabled={wfLoading}
                    className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">✗ ปฏิเสธ</button>
                )}
              </>
            )}

            {detail.status === "accepted" && canAccept && (
              <button onClick={() => convertToSO(detail.id)} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🧾 แปลงเป็นใบสั่งขาย</button>
            )}

            {detail.status === "converted" && (
              <a href="/sales-orders"
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center">→ ไปหน้าใบสั่งขาย</a>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="h-64 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="เซลส์" value={detail.sale_person_name} />
              <Info label="วันที่เสนอ" value={detail.quote_date} />
              <Info label="ยืนราคาถึง" value={detail.valid_until} />
            </div>

            {detail.status === "converted" && detail.converted_so_id && (
              <div className="px-3 py-2 bg-emerald-50 border-l-4 border-emerald-300 text-sm text-emerald-900">
                ✅ ใบเสนอราคานี้แปลงเป็นใบสั่งขายแล้ว — ดูต่อที่หน้า <strong>ใบขาย (SO)</strong>
              </div>
            )}

            <SOLineEditor lines={detail.lines.map(l => ({
              tempId: l.id ?? "",
              product_id: l.product_id ?? null, sku: l.sku ?? null,
              product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
              discount_type: l.discount_type ?? "percent",
              discount_value: l.discount_value ?? 0,
              tax_code: l.tax_code ?? null,
            }))} onChange={() => {}} readonly />

            {/* Totals */}
            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-x-6">
              <Row label="Subtotal"   value={baht(detail.subtotal)} />
              <Row label="ลด line"    value={baht(detail.total_line_discount)} />
              <Row label="ลดท้ายบิล"  value={baht(detail.total_header_discount)} />
              <Row label="ค่าจัดส่ง"  value={baht(detail.total_shipping)} />
              <Row label="ฐานภาษี"    value={baht(detail.taxable)} bold />
              <Row label={`VAT (${detail.vat_rate}%${detail.vat_included ? " inc" : ""})`} value={baht(detail.total_vat)} />
              <Row label="WHT" value={baht(detail.total_wht)} />
              <Row label="รวมทั้งสิ้น" value={baht(detail.grand_total)} bold primary />
              <Row label="ลูกค้าจ่ายจริง" value={baht(detail.amount_due)} bold emerald />
            </div>

            {detail.note && (
              <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900">
                <strong>หมายเหตุ:</strong> {detail.note}
              </div>
            )}
            {detail.reject_reason && (
              <div className="px-3 py-2 bg-red-50 border-l-4 border-red-300 text-sm text-red-900">
                <strong>เหตุผลปฏิเสธ:</strong> {detail.reject_reason}
              </div>
            )}

            {/* Attachments (ของกลาง) */}
            <div className="border-t border-slate-100 pt-4">
              <AttachmentPanel entityType="erp_playground_quote" entityId={detail.id} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* Create / Edit modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ใบเสนอราคา" : "สร้างใบเสนอราคาใหม่"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "..." : "บันทึก"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-medium text-slate-600">ลูกค้า *</span>
              <div className="mt-0.5">
                <CustomerPicker value={form.customer} onChange={(v) => setForm({ ...form, customer: v })} />
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">เซลส์</span>
              <input value={form.sale_person_name} onChange={e => setForm({ ...form, sale_person_name: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">วันที่เสนอราคา</span>
              <input type="date" value={form.quote_date}
                onChange={e => setForm({ ...form, quote_date: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ยืนราคาถึงวันที่ <span className="text-slate-400">(default 30 วัน)</span></span>
              <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
          </div>

          <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />

          <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">VAT %</span>
              <input type="number" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">รวม VAT</span>
              <div className="h-8 mt-0.5 flex items-center">
                <input type="checkbox" checked={form.vat_included} onChange={e => setForm({ ...form, vat_included: e.target.checked })}
                  className="rounded border-slate-300" />
                <span className="ml-2 text-xs">{form.vat_included ? "Included" : "Excluded"}</span>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">WHT %</span>
              <input type="number" value={form.wht_rate} onChange={e => setForm({ ...form, wht_rate: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ค่าจัดส่ง</span>
              <input type="number" value={form.shipping_fee} onChange={e => setForm({ ...form, shipping_fee: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <div className="block col-span-2">
              <span className="text-xs font-medium text-slate-600">ส่วนลดท้ายบิล</span>
              <div className="flex gap-1 mt-0.5">
                <input type="number" value={form.header_discount_value}
                  onChange={e => setForm({ ...form, header_discount_value: parseFloat(e.target.value) || 0 })}
                  className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded" />
                <select value={form.header_discount_type}
                  onChange={e => setForm({ ...form, header_discount_type: e.target.value as "percent" | "amount" })}
                  className="w-16 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                  <option value="percent">%</option><option value="amount">฿</option>
                </select>
              </div>
            </div>
            <label className="block col-span-2">
              <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
          </div>
        </div>
      </ERPModal>

      {/* Reject confirm */}
      <ERPModal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} size="md"
        title="ปฏิเสธใบเสนอราคา"
        footer={
          <>
            <button onClick={() => setRejectTarget(null)} disabled={wfLoading}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับ</button>
            <button onClick={() => rejectTarget && transition(rejectTarget.id, "reject", rejectReason)}
              disabled={wfLoading || !rejectReason.trim()}
              className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              ยืนยันปฏิเสธ
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ปฏิเสธใบเสนอราคา &quot;{rejectTarget?.quote_number ?? "ร่าง"}&quot; ใช่ไหม?</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">เหตุผล <span className="text-red-500">*</span></span>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
              placeholder="ระบุเหตุผลที่ปฏิเสธ"
              className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>
      </ERPModal>
    </PlaygroundShell>
  );
}

// ---- helpers ----
function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}
function Row({ label, value, bold, primary, emerald }: { label: string; value: string; bold?: boolean; primary?: boolean; emerald?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className={`text-xs ${primary ? "text-blue-700" : emerald ? "text-emerald-700" : "text-slate-600"}`}>{label}</span>
      <span className={`tabular-nums font-mono text-xs ${primary ? "text-lg text-blue-700" : emerald ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
