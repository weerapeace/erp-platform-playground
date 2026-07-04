"use client";

/**
 * ใบส่งสินค้า (Delivery Note) — โมดูลเอกสารส่งของ
 * สร้างได้ 2 แบบ: เลือกสินค้าเอง (เหมือนใบขาย) หรือดึงจากใบขายหลายใบ (ลูกค้าเดียวกัน) → รวมรายการ+จำนวน
 * ไม่มีราคา · workflow ร่าง → ส่งแล้ว → ยกเลิก (+ ย้อนสถานะ) · พิมพ์ด้วยแม่แบบใบส่งสินค้า
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { CustomerPicker } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import { formatDate } from "@/lib/date";
import { SOLineEditor, emptyLine, type EditorLine } from "@/components/sales-line-items";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
import type { ColumnDef } from "@tanstack/react-table";
import type { DeliveryNoteListItem, DeliveryNoteDetail, DeliveryNoteLine } from "@/app/api/delivery-notes/route";

const STATUS_LABEL: Record<string, string> = { draft: "ร่าง", delivered: "ส่งแล้ว", cancelled: "ยกเลิก" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", delivered: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-600",
};

// รวมรายการสินค้า: SKU เดียวกัน → บวกจำนวน
function mergeLines(base: EditorLine[], incoming: EditorLine[]): EditorLine[] {
  const out = base.filter(l => l.product_name.trim()).map(l => ({ ...l }));
  const idx = new Map<string, number>();
  out.forEach((l, i) => { const k = l.sku?.trim(); if (k) idx.set(k, i); });
  for (const inc of incoming) {
    const k = inc.sku?.trim();
    if (k && idx.has(k)) { out[idx.get(k)!].qty = Number(out[idx.get(k)!].qty) + Number(inc.qty); }
    else { out.push({ ...inc }); if (k) idx.set(k, out.length - 1); }
  }
  return out.length ? out : [emptyLine()];
}

export default function DeliveryNotesPage() {
  const canView   = usePermission("so.view");
  const canCreate = usePermission("so.create");
  const { user } = useAuth();

  const [rows,    setRows]    = useState<DeliveryNoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [customer,  setCustomer]  = useState<CustomerPickerValue | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [note,      setNote]      = useState("");
  const [lines,     setLines]     = useState<EditorLine[]>([emptyLine()]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [srcSo, setSrcSo] = useState<{ id: string; number: string }[]>([]);

  // detail
  const [detail,     setDetail]     = useState<DeliveryNoteDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wfLoading,  setWfLoading]  = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const fetchList = useCallback(async () => {
    const cached = peekSWR<DeliveryNoteListItem[]>("delivery-notes:list");
    if (cached) { setRows(cached); setLoading(false); } else { setLoading(true); }
    setError(null);
    try {
      const res = await apiFetch("/api/delivery-notes?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data = (json.data ?? []) as DeliveryNoteListItem[];
      setRows(data); mutateSWR("delivery-notes:list", data);
    } catch (err) { if (!cached) setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  const openCreate = () => {
    setEditingId(null); setCustomer(null); setDeliveryDate(new Date().toISOString().slice(0, 10));
    setNote(""); setLines([emptyLine()]); setSrcSo([]); setFormErr(null); setModalOpen(true);
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/delivery-notes/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as DeliveryNoteDetail);
    } catch (err) { flash(err instanceof Error ? err.message : "โหลดไม่ได้"); setDetailOpen(false); }
    finally { setDetailLoading(false); }
  };

  // แก้ไข (ร่างเท่านั้น) → เติมฟอร์มจากรายละเอียด
  const openEdit = (d: DeliveryNoteDetail) => {
    setEditingId(d.id);
    setCustomer(d.customer_id ? ({ id: d.customer_id, code: d.customer_code ?? null, name: d.customer_name ?? "" } as CustomerPickerValue) : null);
    setDeliveryDate(d.delivery_date ? String(d.delivery_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNote(d.note ?? "");
    setLines(d.lines.length ? d.lines.map(l => ({
      tempId: l.id ?? String(Math.random()).slice(2),
      product_id: l.product_id ?? null, sku: l.sku ?? null, product_name: l.product_name, qty: l.qty,
      unit: l.unit ?? "ชิ้น", unit_price: 0, discount_type: "percent" as const, discount_value: 0, note: l.note ?? "",
    })) : [emptyLine()]);
    setSrcSo((d.so_ids ?? []).map((sid, i) => ({ id: sid, number: (d.so_numbers ?? [])[i] ?? "SO" })));
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  // ดึงจากใบขาย: ดึงรายการสินค้า+จำนวนของแต่ละ SO มารวม + ล็อกลูกค้าเดียวกัน
  const handlePicked = async (picked: SourceDocRow[]) => {
    const lockedCust = srcSo.length > 0 ? customer?.id : undefined;
    const custSet = new Set([lockedCust, ...picked.map(r => r.customer_id as string)].filter(Boolean));
    if (custSet.size > 1) { flash("ใบขายที่เลือกเป็นคนละลูกค้า — ส่งได้เฉพาะลูกค้าเดียวกัน"); return; }
    const first = picked[0];
    if (srcSo.length === 0 && first?.customer_id) {
      setCustomer({ id: first.customer_id as string, code: (first.customer_code as string) ?? null, name: (first.customer_name as string) ?? "" } as CustomerPickerValue);
    }
    const seen = new Set(srcSo.map(s => s.id));
    const fresh = picked.filter(r => !seen.has(r.id));
    // ดึงรายละเอียดรายการของแต่ละ SO
    const incoming: EditorLine[] = [];
    for (const r of fresh) {
      try {
        const res = await apiFetch(`/api/sales-orders/${r.id}`);
        const json = await res.json();
        const soLines = (json.data?.lines ?? []) as Array<Record<string, unknown>>;
        for (const l of soLines) {
          incoming.push({
            tempId: String(Math.random()).slice(2),
            product_id: (l.product_id as string) ?? null, sku: (l.sku as string) ?? null,
            product_name: (l.product_name as string) ?? "", qty: Number(l.qty) || 0,
            unit: (l.unit as string) ?? "ชิ้น", unit_price: 0,
            discount_type: "percent", discount_value: 0, note: `จาก ${r.so_number ?? "SO"}`,
          });
        }
      } catch { /* ข้าม SO ที่ดึงไม่ได้ */ }
    }
    setLines(prev => mergeLines(prev, incoming));
    setSrcSo(prev => [...prev, ...fresh.map(r => ({ id: r.id, number: (r.so_number as string) ?? "(ร่าง)" }))]);
  };

  const save = async () => {
    const validLines = lines.filter(l => l.product_name.trim());
    if (validLines.length === 0) { setFormErr("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"); return; }
    if (!customer) { setFormErr("กรุณาเลือกลูกค้า"); return; }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        customer_id: customer.id, customer_name: customer.name, customer_code: customer.code,
        delivery_date: deliveryDate, note: note || null,
        so_ids: srcSo.map(s => s.id), so_numbers: srcSo.map(s => s.number),
      };
      const dnLines: DeliveryNoteLine[] = validLines.map(l => ({
        product_id: l.product_id ?? null, sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit,
      }));
      const url = editingId ? `/api/delivery-notes/${editingId}` : "/api/delivery-notes";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ header, lines: dnLines, actor: user?.name }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใบส่งสินค้าแล้ว");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/delivery-notes/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({ deliver: "ส่งของแล้ว", cancel: "ยกเลิกแล้ว", revert: "ย้อนสถานะแล้ว" }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  const totalQty = useMemo(() => lines.reduce((s, l) => s + (l.product_name.trim() ? Number(l.qty) || 0 : 0), 0), [lines]);

  const columns: ColumnDef<DeliveryNoteListItem>[] = useMemo(() => [
    { id: "dn_number", accessorKey: "dn_number", header: "เลขที่ใบส่ง", size: 150,
      cell: ({ getValue }) => { const n = getValue() as string | null; return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>; } },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 240 },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 110,
      cell: ({ getValue }) => { const s = getValue() as string; return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>; } },
    { id: "total_qty", accessorKey: "total_qty", header: "รวมจำนวน", size: 110,
      cell: ({ getValue }) => <span className="tabular-nums font-mono block text-right">{Number(getValue() ?? 0).toLocaleString("th-TH")}</span> },
    { id: "delivery_date", accessorKey: "delivery_date", header: "วันที่ส่ง", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "line_count", accessorKey: "line_count", header: "รายการ", size: 90, cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span> },
    { id: "so_numbers", accessorKey: "so_numbers", header: "อ้างอิงใบขาย", size: 180,
      cell: ({ getValue }) => { const a = (getValue() as string[] | null) ?? []; return <span className="text-[11px] text-slate-500 truncate">{a.length ? a.join(", ") : "—"}</span>; } },
    { id: "actions", header: "", size: 110, enableSorting: false,
      cell: ({ row }) => row.original.dn_number ? (
        <a href={`/print/delivery-doc/${row.original.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">📦 พิมพ์</a>
      ) : null },
  ], []);

  const views = useMemo(() => [
    { id: "all",       label: "ทั้งหมด",     filter: (r: Record<string, unknown>) => r.status !== "cancelled" },
    { id: "draft",     label: "📝 ร่าง",      filter: (r: Record<string, unknown>) => r.status === "draft" },
    { id: "delivered", label: "🚚 ส่งแล้ว",   filter: (r: Record<string, unknown>) => r.status === "delivered" },
    { id: "cancelled", label: "⊘ ยกเลิก",     filter: (r: Record<string, unknown>) => r.status === "cancelled" },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📦 ใบส่งสินค้า</h1>
            <p className="text-sm text-slate-500">เอกสารส่งของ — เลือกสินค้าเอง หรือดึงจากใบขาย · workflow: ร่าง → ส่งแล้ว</p>
          </div>
          {canCreate && (
            <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600">+ สร้างใบส่ง</button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="delivery-notes"
          data={rows}
          columns={columns}
          loading={loading}
          views={views}
          searchableKeys={["dn_number", "customer_name"]}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า..."
          exportFilename="delivery-notes"
          onRowClick={(r) => openDetail(r.id)}
          pageSize={20}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm z-50">✓ {toast}</div>}
      </div>

      {/* Create / Edit */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ไขใบส่งสินค้า" : "สร้างใบส่งสินค้าใหม่"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-4 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึก" : "สร้างใบส่ง"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-medium text-slate-600">ลูกค้า *</span>
              <div className="mt-1"><CustomerPicker value={customer} onChange={setCustomer} /></div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่ส่ง</span>
              <div className="mt-1"><DateInput value={deliveryDate} onChange={setDeliveryDate} /></div>
            </div>
          </div>

          {/* ดึงจากใบขาย */}
          <div className="flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2">
            <button type="button" onClick={() => setPickerOpen(true)} className="h-8 px-3 text-xs font-medium rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50">＋ ดึงจากใบขาย (เลือกหลายใบ)</button>
            {srcSo.length > 0 && <span className="text-[11px] text-slate-500">อ้างอิง: {srcSo.map(s => s.number).join(", ")}</span>}
          </div>

          {/* รายการสินค้า (เหมือนใบขาย) */}
          <SOLineEditor lines={lines} onChange={setLines} layout="table" />
          <div className="text-right text-sm text-slate-600">รวมจำนวน <span className="font-bold text-slate-900 tabular-nums">{totalQty.toLocaleString("th-TH")}</span></div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </label>
        </div>
      </ERPModal>

      {pickerOpen && <SourceDocPickerModal open={pickerOpen} mode="so" onClose={() => setPickerOpen(false)} onConfirm={handlePicked} />}

      {/* Detail */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบส่งสินค้า ${detail.dn_number ?? "(ร่าง)"}` : "ใบส่งสินค้า"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.dn_number && (
              <a href={`/print/delivery-doc/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">📦 พิมพ์ใบส่งสินค้า</a>
            )}
            {detail.status === "draft" && (
              <button onClick={() => openEdit(detail)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✏️ แก้ไข</button>
            )}
            {detail.status === "draft" && (
              <button onClick={() => transition(detail.id, "deliver")} disabled={wfLoading} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🚚 ส่งของ</button>
            )}
            {(detail.status === "draft" || detail.status === "delivered") && (
              <button onClick={() => transition(detail.id, "cancel")} disabled={wfLoading} className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
            {(detail.status === "delivered" || detail.status === "cancelled") && (
              <button onClick={() => { if (confirm("ย้อนสถานะกลับหนึ่งขั้น?")) transition(detail.id, "revert"); }} disabled={wfLoading}
                className="h-9 px-4 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50">↩ ย้อนสถานะ</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="วันที่ส่ง" value={formatDate(detail.delivery_date)} />
              <Info label="สถานะ" value={STATUS_LABEL[detail.status] ?? detail.status} />
              <Info label="อ้างอิงใบขาย" value={(detail.so_numbers ?? []).join(", ") || "—"} />
              <div className="md:col-span-3"><Info label="ที่อยู่" value={detail.customer_address || "—"} /></div>
              <Info label="เลขประจำตัวผู้เสียภาษี" value={detail.customer_tax_id || "—"} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">รหัส</th>
                    <th className="px-3 py-2 text-left font-semibold">สินค้า</th>
                    <th className="px-3 py-2 text-right font-semibold">จำนวน</th>
                    <th className="px-3 py-2 text-left font-semibold">หน่วย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{l.sku ?? "-"}</td>
                      <td className="px-3 py-2">{l.product_name}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{Number(l.qty).toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-slate-500">{l.unit ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="border-t border-slate-200">
                    <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">รวมจำนวน</td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{Number(detail.total_qty).toLocaleString("th-TH")}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {detail.note && <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900"><strong>หมายเหตุ:</strong> {detail.note}</div>}
            {detail.reject_reason && <div className="px-3 py-2 bg-red-50 border-l-4 border-red-300 text-sm text-red-900"><strong>เหตุผลยกเลิก:</strong> {detail.reject_reason}</div>}
          </div>
        )}
      </ERPModal>
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
