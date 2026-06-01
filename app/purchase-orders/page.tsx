"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { SupplierPicker, WarehousePicker } from "@/components/pickers";
import type { SupplierPickerValue, WarehousePickerValue } from "@/components/pickers";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { POListItem, PODetail } from "@/app/api/purchase-orders/route";
import { SOLineEditor, emptyLine, type EditorLine } from "@/app/sales-orders/line-editor";

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", received: "รับของแล้ว",
  completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

type FormState = {
  supplier: SupplierPickerValue | null;
  warehouse: WarehousePickerValue | null;
  buyer_name: string;
  order_date: string;
  expected_arrival_date: string;
  vat_rate: number; vat_included: boolean; wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  lines: EditorLine[];
};

const EMPTY: FormState = {
  supplier: null, warehouse: null, buyer_name: "",
  order_date: new Date().toISOString().slice(0, 10), expected_arrival_date: "",
  vat_rate: 7, vat_included: false, wht_rate: 0,
  header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
  note: "", lines: [emptyLine()],
};

export default function PurchaseOrdersPage() {
  const canView    = usePermission("po.view");
  const canCreate  = usePermission("po.create");
  const canConfirm = usePermission("po.confirm");
  const canReceive = usePermission("po.receive");
  const canComplete= usePermission("po.complete");
  const canCancel  = usePermission("po.cancel");
  const { user, can } = useAuth();

  const [rows, setRows] = useState<POListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<PODetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wfLoading, setWfLoading] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<PODetail | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/purchase-orders?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/purchase-orders/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as PODetail);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setFormErr(null); setModalOpen(true); };

  const openEdit = (po: PODetail) => {
    setEditingId(po.id);
    setForm({
      supplier: po.supplier_id ? { id: po.supplier_id, code: po.supplier_code, name: po.supplier_name ?? "" } as SupplierPickerValue : null,
      warehouse: po.to_warehouse_id ? { id: po.to_warehouse_id, code: po.to_warehouse_code, name: po.to_warehouse_name ?? "" } as WarehousePickerValue : null,
      buyer_name: po.buyer_name ?? "",
      order_date: po.order_date,
      expected_arrival_date: po.expected_arrival_date ?? "",
      vat_rate: po.vat_rate, vat_included: po.vat_included, wht_rate: po.wht_rate,
      header_discount_type: po.header_discount_type, header_discount_value: po.header_discount_value,
      shipping_fee: po.shipping_fee,
      note: po.note ?? "",
      lines: po.lines.map(l => ({
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

  const save = async () => {
    if (!form.supplier) { setFormErr("กรุณาเลือกผู้จำหน่าย"); return; }
    if (form.lines.length === 0 || form.lines.some(l => !l.product_name.trim())) {
      setFormErr("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"); return;
    }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        supplier_id: form.supplier.id, supplier_name: form.supplier.name, supplier_code: form.supplier.code,
        to_warehouse_id: form.warehouse?.id ?? null,
        buyer_name: form.buyer_name || null,
        order_date: form.order_date,
        expected_arrival_date: form.expected_arrival_date || null,
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
      const url = editingId ? `/api/purchase-orders/${editingId}` : "/api/purchase-orders";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้าง PO ใหม่");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/purchase-orders/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({
        confirm: "ยืนยันแล้ว · ออกเลข PO",
        receive: `รับของเข้าคลังแล้ว`,
        complete: "ปิด PO",
        cancel: "ยกเลิกแล้ว",
      }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false); setCancelTarget(null); setCancelReason("");
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  const columns: ColumnDef<POListItem>[] = useMemo(() => [
    { id: "po_number", accessorKey: "po_number", header: "เลข PO", size: 130,
      cell: ({ getValue }) => {
        const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>;
      } },
    { id: "supplier_name", accessorKey: "supplier_name", header: "ผู้จำหน่าย", size: 220 },
    { id: "to_warehouse_name", accessorKey: "to_warehouse_name", header: "ส่งเข้าคลัง", size: 140 },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{STATUS_LABEL[s] ?? s}</span>;
      } },
    { id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-right block">{baht(getValue() as number)}</span> },
    { id: "buyer_name", accessorKey: "buyer_name", header: "ผู้ซื้อ", size: 130 },
    { id: "order_date", accessorKey: "order_date", header: "วันที่สั่ง", size: 110 },
    { id: "expected_arrival_date", accessorKey: "expected_arrival_date", header: "กำหนดรับ", size: 110 },
    { id: "line_count", accessorKey: "line_count", header: "รายการ", size: 80,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span> },
  ], []);

  // F14 fix: early return ต้องอยู่ "หลัง" hooks ทั้งหมด (กัน React #310 = hooks order)
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📦 Purchase Orders</h1>
            <p className="text-sm text-slate-500 mt-0.5">ใบสั่งซื้อ — draft → confirmed → received → completed (auto IN stock)</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ สร้าง PO
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="purchase-orders"
          data={rows}
          columns={columns}
          loading={loading}
          searchableKeys={["po_number", "supplier_name", "supplier_code"]}
          searchPlaceholder="ค้นหา เลข PO / ผู้จำหน่าย..."
          exportFilename="purchase-orders"
          exportEntityType="erp_playground_po"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Detail Drawer */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `PO ${detail.po_number ?? "(ร่าง)"} · ${detail.supplier_name}` : "PO Detail"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.po_number && (
              <a href={`/print/purchase-order/${detail.id}`} target="_blank" rel="noopener noreferrer"
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
            {detail.status === "confirmed" && canReceive && (
              <button onClick={() => transition(detail.id, "receive")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">📥 รับของเข้าคลัง</button>
            )}
            {detail.status === "received" && canComplete && (
              <button onClick={() => transition(detail.id, "complete")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ ปิด PO</button>
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
              <Info label="ผู้จำหน่าย" value={detail.supplier_name} />
              <Info label="ส่งเข้าคลัง" value={detail.to_warehouse_name} />
              <Info label="ผู้ซื้อ" value={detail.buyer_name} />
              <Info label="กำหนดรับ" value={detail.expected_arrival_date} />
            </div>
            {detail.stock_received && (
              <div className="text-xs"><span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">📦 รับ stock เข้าคลังแล้ว</span></div>
            )}

            <SOLineEditor lines={detail.lines.map(l => ({
              tempId: l.id ?? "",
              product_id: l.product_id ?? null, sku: l.sku ?? null,
              product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
              discount_type: l.discount_type ?? "percent",
              discount_value: l.discount_value ?? 0,
              tax_code: l.tax_code ?? null,
            }))} onChange={() => {}} readonly />

            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-x-6">
              <Row label="Subtotal"  value={baht(detail.subtotal)} />
              <Row label="ลด line"   value={baht(detail.total_line_discount)} />
              <Row label="ลดท้ายบิล" value={baht(detail.total_header_discount)} />
              <Row label="ค่าจัดส่ง" value={baht(detail.total_shipping)} />
              <Row label="ฐานภาษี"   value={baht(detail.taxable)} bold />
              <Row label={`VAT (${detail.vat_rate}%${detail.vat_included ? " inc" : ""})`} value={baht(detail.total_vat)} />
              <Row label="WHT" value={baht(detail.total_wht)} />
              <Row label="รวมทั้งสิ้น" value={baht(detail.grand_total)} bold primary />
              <Row label="ผู้จำหน่ายได้รับจริง" value={baht(detail.amount_due)} bold emerald />
            </div>

            {detail.note && (
              <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900">
                <strong>หมายเหตุ:</strong> {detail.note}
              </div>
            )}
          </div>
        )}
      </ERPModal>

      {/* Create/Edit modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ PO" : "สร้าง PO ใหม่"}
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
              <span className="text-xs font-medium text-slate-600">ผู้จำหน่าย *</span>
              <div className="mt-0.5"><SupplierPicker value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} /></div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">ส่งเข้าคลัง <span className="text-amber-600">(สำหรับ inventory)</span></span>
              <div className="mt-0.5"><WarehousePicker value={form.warehouse} onChange={(v) => setForm({ ...form, warehouse: v })} /></div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ผู้ซื้อ</span>
              <input value={form.buyer_name} onChange={e => setForm({ ...form, buyer_name: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">วันที่สั่ง</span>
              <input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">กำหนดรับ</span>
              <input type="date" value={form.expected_arrival_date} onChange={e => setForm({ ...form, expected_arrival_date: e.target.value })}
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

      {/* Cancel confirm */}
      <ERPModal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} size="md"
        title="ยกเลิก PO"
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
          <p className="text-sm text-slate-700">ต้องการยกเลิก PO &quot;{cancelTarget?.po_number ?? "ร่าง"}&quot; ใช่ไหม?</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              เหตุผล {cancelTarget?.status === "confirmed" && <span className="text-red-500">*</span>}
            </span>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
              placeholder="(จำเป็นเมื่อยกเลิก PO ที่ confirm แล้ว)"
              className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>
      </ERPModal>
    </PlaygroundShell>
  );
}

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
