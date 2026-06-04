"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { AttachmentPanel } from "@/components/attachment-panel";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CustomerPicker, WarehousePicker, EmployeePicker } from "@/components/pickers";
import type { CustomerPickerValue, WarehousePickerValue, EmployeePickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { SOListItem, SODetail } from "@/app/api/sales-orders/route";
import { SOLineEditor, emptyLine, type EditorLine } from "./line-editor";

// ---- helpers ----

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต",
  ready: "พร้อมส่ง", shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

// ---- Form state ----

type FormState = {
  customer: CustomerPickerValue | null;
  warehouse: WarehousePickerValue | null;
  sale_person_name: string;
  order_date: string;
  expected_ship_date: string;
  vat_rate: number;
  vat_included: boolean;
  wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  lines: EditorLine[];
};

const EMPTY: FormState = {
  customer: null, warehouse: null, sale_person_name: "",
  order_date: new Date().toISOString().slice(0, 10), expected_ship_date: "",
  vat_rate: 7, vat_included: false, wht_rate: 0,
  header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
  note: "", lines: [emptyLine()],
};

// ============================================================
// Page
// ============================================================

export default function SalesOrdersPage() {
  const canView    = usePermission("so.view");
  const canCreate  = usePermission("so.create");
  const canConfirm = usePermission("so.confirm");
  const canShip    = usePermission("so.ship");
  const canComplete= usePermission("so.complete");
  const canCancel  = usePermission("so.cancel");
  const { user, can } = useAuth();

  const [rows,    setRows]    = useState<SOListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<FormState>(EMPTY);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  // detail drawer
  const [detail,        setDetail]        = useState<SODetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // workflow
  const [wfLoading, setWfLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SODetail | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/sales-orders?limit=200");
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
      const res = await apiFetch(`/api/sales-orders/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as SODetail);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  // ---- Open edit (draft only) ----
  const openEdit = (so: SODetail) => {
    setEditingId(so.id);
    setForm({
      customer: so.customer_id ? {
        id: so.customer_id, code: so.customer_code, name: so.customer_name ?? "",
      } as CustomerPickerValue : null,
      warehouse: (so as unknown as { from_warehouse_id?: string; from_warehouse_code?: string; from_warehouse_name?: string }).from_warehouse_id ? {
        id: (so as unknown as { from_warehouse_id: string }).from_warehouse_id,
        code: (so as unknown as { from_warehouse_code: string | null }).from_warehouse_code,
        name: (so as unknown as { from_warehouse_name: string }).from_warehouse_name ?? "",
      } as WarehousePickerValue : null,
      sale_person_name: so.sale_person_name ?? "",
      order_date: so.order_date,
      expected_ship_date: so.expected_ship_date ?? "",
      vat_rate: so.vat_rate, vat_included: so.vat_included, wht_rate: so.wht_rate,
      header_discount_type: so.header_discount_type, header_discount_value: so.header_discount_value,
      shipping_fee: so.shipping_fee,
      note: so.note ?? "",
      lines: so.lines.map(l => ({
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
    setEditingId(null); setForm(EMPTY); setFormErr(null); setModalOpen(true);
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
        from_warehouse_id: form.warehouse?.id ?? null,
        sale_person_name: form.sale_person_name || null,
        order_date: form.order_date,
        expected_ship_date: form.expected_ship_date || null,
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
      const url = editingId ? `/api/sales-orders/${editingId}` : "/api/sales-orders";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้าง SO ใหม่");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- Transition ----
  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/sales-orders/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({
        confirm: "ยืนยันแล้ว · ออกเลข SO", start_production: "เริ่มผลิต",
        mark_ready: "พร้อมจัดส่ง", ship: "จัดส่งแล้ว",
        complete: "ปิด SO", cancel: "ยกเลิกแล้ว",
      }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false); setCancelTarget(null); setCancelReason("");
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  // ---- Columns ----
  const columns: ColumnDef<SOListItem>[] = useMemo(() => [
    {
      id: "so_number", accessorKey: "so_number", header: "เลขที่ SO", size: 130,
      cell: ({ getValue, row }) => {
        const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>;
      },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 220 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{STATUS_LABEL[s] ?? s}</span>;
      },
    },
    {
      id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-right block">{baht(getValue() as number)}</span>,
    },
    { id: "sale_person_name", accessorKey: "sale_person_name", header: "เซลส์", size: 140 },
    {
      id: "order_date", accessorKey: "order_date", header: "วันที่สั่ง", size: 110,
      cell: ({ getValue }) => <span>{formatDate(getValue())}</span>,
    },
    {
      id: "expected_ship_date", accessorKey: "expected_ship_date", header: "วันที่ส่ง", size: 110,
      cell: ({ getValue }) => <span>{formatDate(getValue())}</span>,
    },
    {
      id: "line_count", accessorKey: "line_count", header: "รายการ", size: 80,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span>,
    },
  ], []);

  // ---- Saved Views (มุมมองบันทึกไว้ — ของกลาง §14) ----
  // "ของฉัน" + "เดือนนี้" ต้องอิงค่า dynamic (ชื่อผู้ใช้ / เดือนปัจจุบัน) จึงสร้างใน useMemo
  const views = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const myName = user?.name ?? "";
    return [
      { id: "all",       label: "ทั้งหมด" },
      { id: "mine",      label: "👤 ของฉัน",     filter: (r: Record<string, unknown>) => String(r.sale_person_name ?? "") === myName },
      { id: "draft",     label: "📝 ร่าง",        filter: (r: Record<string, unknown>) => r.status === "draft" },
      { id: "confirmed", label: "✅ ยืนยันแล้ว",  filter: (r: Record<string, unknown>) => r.status === "confirmed" },
      { id: "shipped",   label: "📦 ส่งของแล้ว",  filter: (r: Record<string, unknown>) => r.status === "shipped" },
      { id: "month",     label: "🗓 เดือนนี้",    filter: (r: Record<string, unknown>) => String(r.order_date ?? "").startsWith(monthPrefix) },
      { id: "cancelled", label: "⊘ ยกเลิก",       filter: (r: Record<string, unknown>) => r.status === "cancelled" },
    ];
  }, [user?.name]);

  // F14 fix: early return หลัง hooks ทั้งหมด (กัน React #310)
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const isDraft = detail?.status === "draft";

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🧾 Sales Orders</h1>
            <p className="text-sm text-slate-500 mt-0.5">ใบสั่งขาย — workflow: draft → confirmed → ready → shipped → completed</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ สร้าง SO
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="sales-orders"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["so_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลข SO / ลูกค้า..."
          exportFilename="sales-orders"
          exportEntityType="erp_playground_so"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Detail Drawer */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `SO ${detail.so_number ?? "(ร่าง)"} · ${detail.customer_name}` : "SO Detail"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.so_number && (
              <a href={`/print/sales-order/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">
                🖨 พิมพ์
              </a>
            )}
            {detail.status === "draft" && (
              <>
                <button onClick={() => openEdit(detail)}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
                {canConfirm && (
                  <button onClick={() => transition(detail.id, "confirm")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">✓ ยืนยัน</button>
                )}
              </>
            )}
            {detail.status === "confirmed" && canShip && (
              <>
                <button onClick={() => transition(detail.id, "start_production")} disabled={wfLoading}
                  className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">🏭 เริ่มผลิต</button>
                <button onClick={() => transition(detail.id, "ship")} disabled={wfLoading}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">📦 จัดส่งเลย</button>
              </>
            )}
            {detail.status === "in_production" && (
              <button onClick={() => transition(detail.id, "mark_ready")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">✓ พร้อมส่ง</button>
            )}
            {detail.status === "ready" && canShip && (
              <button onClick={() => transition(detail.id, "ship")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">📦 จัดส่ง</button>
            )}
            {detail.status === "shipped" && canComplete && (
              <button onClick={() => transition(detail.id, "complete")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ ปิด SO</button>
            )}
            {(detail.status === "draft" || detail.status === "confirmed") && canCancel && (
              <button onClick={() => setCancelTarget(detail)} disabled={wfLoading}
                className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="h-64 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="คลังต้นทาง" value={(detail as unknown as { from_warehouse_code?: string; from_warehouse_name?: string }).from_warehouse_name ?? "—"} />
              <Info label="เซลส์" value={detail.sale_person_name} />
              <Info label="วันที่สั่ง" value={formatDate(detail.order_date)} />
            </div>
            {((detail as unknown as { stock_reserved?: boolean }).stock_reserved
              || (detail as unknown as { stock_shipped?: boolean }).stock_shipped) && (
              <div className="flex gap-2 text-xs">
                {(detail as unknown as { stock_reserved?: boolean }).stock_reserved && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">📌 จอง stock แล้ว</span>
                )}
                {(detail as unknown as { stock_shipped?: boolean }).stock_shipped && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">📦 ตัด stock แล้ว</span>
                )}
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
              <Row label="Subtotal"               value={baht(detail.subtotal)} />
              <Row label="ลด line"                value={baht(detail.total_line_discount)} />
              <Row label="ลดท้ายบิล"             value={baht(detail.total_header_discount)} />
              <Row label="ค่าจัดส่ง"             value={baht(detail.total_shipping)} />
              <Row label="ฐานภาษี"               value={baht(detail.taxable)} bold />
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
                <strong>เหตุผลยกเลิก:</strong> {detail.reject_reason}
              </div>
            )}

            {/* Attachments (ของกลาง N) */}
            <div className="border-t border-slate-100 pt-4">
              <AttachmentPanel entityType="erp_playground_so" entityId={detail.id} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* Create / Edit modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ SO" : "สร้าง SO ใหม่"}
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
            <div>
              <span className="text-xs font-medium text-slate-600">คลังต้นทาง <span className="text-amber-600">(สำหรับ inventory)</span></span>
              <div className="mt-0.5">
                <WarehousePicker value={form.warehouse} onChange={(v) => setForm({ ...form, warehouse: v })} />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">เซลส์ <span className="text-slate-400">(พนักงาน — ไม่บังคับ)</span></span>
              <div className="mt-0.5">
                <EmployeePicker
                  value={form.sale_person_name ? { id: "", code: null, name: form.sale_person_name } as EmployeePickerValue : null}
                  onChange={(v: EmployeePickerValue | null) => setForm({ ...form, sale_person_name: v?.name ?? "" })}
                />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่สั่ง</span>
              <div className="mt-0.5">
                <DateInput value={form.order_date} onChange={(iso) => setForm({ ...form, order_date: iso })} />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่ส่งคาด</span>
              <div className="mt-0.5">
                <DateInput value={form.expected_ship_date} onChange={(iso) => setForm({ ...form, expected_ship_date: iso })} />
              </div>
            </div>
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

      {/* Cancel confirm */}
      <ERPModal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} size="md"
        title="ยกเลิก SO"
        footer={
          <>
            <button onClick={() => setCancelTarget(null)} disabled={wfLoading}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับ</button>
            <button onClick={() => cancelTarget && transition(cancelTarget.id, "cancel", cancelReason)}
              disabled={wfLoading || (cancelTarget?.status === "confirmed" && !cancelReason.trim())}
              className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              ยืนยันยกเลิก
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ต้องการยกเลิก SO &quot;{cancelTarget?.so_number ?? "ร่าง"}&quot; ใช่ไหม?</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              เหตุผล {cancelTarget?.status === "confirmed" && <span className="text-red-500">*</span>}
            </span>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
              placeholder="(จำเป็นเมื่อยกเลิก SO ที่ confirm แล้ว)"
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
