"use client";

// ============================================================
// อนุมัติ/ไม่อนุมัติ/ลบ/กู้คืน ใบขอซื้อ (หน้าสั่งซื้อ) — แยกไฟล์เพื่อแตะ page.tsx ให้น้อย
// API กลางเดิม: pr-approve (อนุมัติ/ไม่อนุมัติ) · pr-restore (กู้คืน) · pr-delete (ลบซ่อน) · rejected (ลิสต์)
// เหตุผลไม่อนุมัติ = "ไม่บังคับ" (เว้นว่างได้ → บันทึกเป็น "ไม่ระบุเหตุผล")
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";

const curLabel = (c: string) => (c === "YUAN" ? "RMB" : c);
const money = (v: number, c: string) => `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${curLabel(c)}`;

async function callApi(url: string, body: unknown): Promise<void> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error ?? "ไม่สำเร็จ");
}

// ---- กล่องใส่เหตุผลไม่อนุมัติ (ไม่บังคับ) ----
function RejectReasonModal({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <ERPModal open={open} onClose={onClose} size="sm" title="ไม่อนุมัติรายการ"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => onConfirm(reason.trim())} className="h-9 px-4 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">✕ ไม่อนุมัติ{count > 1 ? ` (${count})` : ""}</button>
      </>}>
      <div className="space-y-2">
        <p className="text-sm text-slate-600">ไม่อนุมัติ {count > 1 ? `${count} รายการ` : "รายการนี้"} — รายการจะถูกย้ายไปแท็บ &quot;รายการไม่อนุมัติ&quot;</p>
        <label className="block">
          <span className="text-xs text-slate-500">เหตุผล (ไม่บังคับ)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="เช่น ราคาสูงไป / ซ้ำ / รอข้อมูลเพิ่ม..."
            className="mt-0.5 w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400" />
        </label>
      </div>
    </ERPModal>
  );
}

// ---- ปุ่ม อนุมัติ / ไม่อนุมัติ (compact = บนการ์ด, เต็ม = ในป๊อป) ----
export function ApproveActions({ prId, approved, onChanged, compact, stop }: {
  prId: string; approved: boolean; onChanged: () => void; compact?: boolean; stop?: boolean;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const approve = async () => {
    setBusy(true);
    try { await callApi("/api/purchasing/pr-approve", { pr_ids: [prId], action: "approve", actor: user?.name }); toast.success("อนุมัติแล้ว"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const doReject = async (reason: string) => {
    setRejectOpen(false); setBusy(true);
    try { await callApi("/api/purchasing/pr-approve", { pr_ids: [prId], action: "reject", reason: reason || "ไม่ระบุเหตุผล", actor: user?.name }); toast.success("ไม่อนุมัติแล้ว — ย้ายไปแท็บไม่อนุมัติ"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const sp = (fn: () => void) => (e: React.MouseEvent) => { if (stop) e.stopPropagation(); fn(); };

  return (
    <>
      {compact ? (
        <>
          {!approved && <button onClick={sp(approve)} disabled={busy} title="อนุมัติ" className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-emerald-200 shadow-sm hover:bg-emerald-50 text-emerald-600 text-xs disabled:opacity-50">✓</button>}
          <button onClick={sp(() => setRejectOpen(true))} disabled={busy} title="ไม่อนุมัติ" className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-rose-200 shadow-sm hover:bg-rose-50 text-rose-500 text-xs disabled:opacity-50">✕</button>
        </>
      ) : (
        <div className="flex gap-2">
          {!approved && <button onClick={sp(approve)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">✓ อนุมัติ</button>}
          <button onClick={sp(() => setRejectOpen(true))} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">✕ ไม่อนุมัติ</button>
        </div>
      )}
      <RejectReasonModal open={rejectOpen} count={1} onClose={() => setRejectOpen(false)} onConfirm={(r) => void doReject(r)} />
    </>
  );
}

// ---- ปุ่มลบ (soft delete) — ในป๊อปแก้ไข ----
export function DeleteButton({ prId, onDeleted }: { prId: string; onDeleted: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try { await callApi("/api/purchasing/pr-delete", { pr_ids: [prId], actor: user?.name }); toast.success("ลบแล้ว (กู้คืนได้ภายหลัง)"); setConfirm(false); onDeleted(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setConfirm(true)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">🗑 ลบ</button>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void del()}
        title="ลบรายการสั่งซื้อ" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message="ลบรายการนี้ออกจากหน้าสั่งซื้อ? (เป็นการลบแบบซ่อน — กู้คืนได้ภายหลัง)" />
    </>
  );
}

// ---- แถบ bulk ในโหมดเลือกหลายชิ้น: อนุมัติ / ไม่อนุมัติ / ลบ ----
export function BulkApproveBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const n = ids.length;

  const wrap = async (fn: () => Promise<void>, okMsg: string) => {
    if (n === 0) return; setBusy(true);
    try { await fn(); toast.success(okMsg); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const approve = () => void wrap(() => callApi("/api/purchasing/pr-approve", { pr_ids: ids, action: "approve", actor: user?.name }), `อนุมัติ ${n} รายการแล้ว`);
  const reject = (reason: string) => { setRejectOpen(false); void wrap(() => callApi("/api/purchasing/pr-approve", { pr_ids: ids, action: "reject", reason: reason || "ไม่ระบุเหตุผล", actor: user?.name }), `ไม่อนุมัติ ${n} รายการแล้ว`); };
  const del = () => { setDelConfirm(false); void wrap(() => callApi("/api/purchasing/pr-delete", { pr_ids: ids, actor: user?.name }), `ลบ ${n} รายการแล้ว`); };

  return (
    <>
      <button onClick={approve} disabled={busy || n === 0} className="h-9 px-3 text-sm font-medium rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">✓ อนุมัติ ({n})</button>
      <button onClick={() => setRejectOpen(true)} disabled={busy || n === 0} className="h-9 px-3 text-sm font-medium rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">✕ ไม่อนุมัติ</button>
      <button onClick={() => setDelConfirm(true)} disabled={busy || n === 0} className="h-9 px-3 text-sm font-medium rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">🗑 ลบ</button>
      <RejectReasonModal open={rejectOpen} count={n} onClose={() => setRejectOpen(false)} onConfirm={reject} />
      <ConfirmDialog open={delConfirm} onClose={() => setDelConfirm(false)} onConfirm={del}
        title="ลบรายการสั่งซื้อ" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message={`ลบ ${n} รายการที่เลือกออกจากหน้าสั่งซื้อ? (ลบแบบซ่อน — กู้คืนได้ภายหลัง)`} />
    </>
  );
}

type Rej = {
  id: string; item_sku_id: string | null; seller_name: string; item_name: string; code: string; qty: number; uom: string;
  price_est: number; line_total: number; currency: string; requester: string;
  reject_reason: string; rejected_by: string; rejected_at: string | null; image_url: string | null;
};

// ---- ป๊อป "รายการไม่อนุมัติ" + กู้คืน ----
export function RejectedPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<Rej[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Rej | null>(null);
  const [delRow, setDelRow] = useState<Rej | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch("/api/purchasing/rejected").then((r) => r.json())
      .then((j) => setRows((j.data ?? []) as Rej[])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => { if (open) load(); }, [open]);

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      await callApi("/api/purchasing/pr-restore", { pr_ids: [id], actor: user?.name });
      toast.success("กู้คืนแล้ว — กลับไปรออนุมัติ");
      setRows((rs) => rs.filter((x) => x.id !== id)); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); } finally { setBusyId(null); }
  };

  const doDelete = async (id: string) => {
    setBusyId(id);
    try {
      await callApi("/api/purchasing/pr-delete", { pr_ids: [id], actor: user?.name });
      toast.success("ลบแล้ว (กู้คืนได้ภายหลัง)");
      setRows((rs) => rs.filter((x) => x.id !== id)); setDelRow(null); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusyId(null); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="xl" title={`🚫 รายการไม่อนุมัติ (${rows.length})`}
      description="รายการที่ถูกไม่อนุมัติ — แก้ไขแล้วส่งใหม่ / กู้คืน / ลบ">
      {loading ? <div className="py-12 text-center text-slate-400">กำลังโหลด...</div>
        : rows.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">— ไม่มีรายการที่ไม่อนุมัติ —</div>
        : <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2 border border-slate-200 rounded-lg">
                {r.image_url
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-12 h-12 rounded object-cover bg-slate-100 shrink-0" />
                  : <div className="w-12 h-12 rounded bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">📦</div>}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{r.item_name}</div>
                  <div className="text-[11px] text-slate-400">{r.code || "—"} · 🏪 {r.seller_name} · {r.qty.toLocaleString()} {r.uom} · {money(r.line_total, r.currency)}</div>
                  <div className="text-[11px] text-rose-600 mt-0.5">เหตุผล: {r.reject_reason || "—"}{r.rejected_by ? ` · โดย ${r.rejected_by}` : ""}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setEditRow(r)} disabled={busyId === r.id}
                    className="h-8 px-2.5 text-xs rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 whitespace-nowrap">✎ แก้ไข</button>
                  <button onClick={() => void restore(r.id)} disabled={busyId === r.id}
                    className="h-8 px-2.5 text-xs rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap">
                    {busyId === r.id ? "..." : "↩ กู้คืน"}</button>
                  <button onClick={() => setDelRow(r)} disabled={busyId === r.id}
                    className="h-8 px-2.5 text-xs rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap">🗑 ลบ</button>
                </div>
              </div>
            ))}
          </div>}

      {/* แก้ไข → เปลี่ยนสินค้า/จำนวน แล้วส่งขอซื้อใหม่ */}
      {editRow && <RejectedEditModal row={editRow} onClose={() => setEditRow(null)}
        onSaved={() => { setEditRow(null); setRows((rs) => rs.filter((x) => x.id !== editRow.id)); onChanged(); }} />}

      {/* ยืนยันลบ */}
      <ConfirmDialog open={!!delRow} onClose={() => setDelRow(null)} onConfirm={() => delRow && void doDelete(delRow.id)}
        title="ลบรายการขอซื้อ" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message="ลบรายการนี้ออก? (ลบแบบซ่อน — กู้คืนได้ภายหลัง)" />
    </ERPModal>
  );
}

// ---- ป๊อปแก้ไขรายการไม่อนุมัติ: เปลี่ยน SKU + จำนวน → บันทึก + กู้คืน (ส่งขอซื้อใหม่) ----
function RejectedEditModal({ row, onClose, onSaved }: { row: Rej; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [sku, setSku] = useState<SkuPickerValue | null>(row.item_sku_id ? { id: row.item_sku_id, code: row.code, name: row.item_name, uom_name: row.uom } : null);
  const [qty, setQty] = useState(String(row.qty));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = Number(qty);
    if (!(q > 0)) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    setSaving(true);
    try {
      // แก้ค่า PR (สินค้า/ชื่อ/หน่วย/จำนวน) — เปลี่ยน SKU = อัปเดต item_sku_id + ชื่อ + หน่วย
      const patch: Record<string, unknown> = { qty: q, actor: user?.name };
      if (sku && sku.id !== row.item_sku_id) { patch.item_sku_id = sku.id; patch.item_name = sku.name; if (sku.uom_name) patch.uom = sku.uom_name; }
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      // ส่งใหม่ = กู้คืนกลับไปรออนุมัติ
      await callApi("/api/purchasing/pr-restore", { pr_ids: [row.id], actor: user?.name });
      toast.success("แก้ไขแล้ว — ส่งขอซื้อใหม่ (กลับไปรออนุมัติ)");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="sm" title="✎ แก้ไข + ส่งขอซื้อใหม่"
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก + ส่งใหม่"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">สินค้า</label>
          <SkuPicker value={sku} onChange={setSku} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน{sku?.uom_name ? ` (${sku.uom_name})` : ""}</label>
          <input type="number" step="any" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        </div>
        <p className="text-[11px] text-slate-400">บันทึกแล้วระบบส่งรายการกลับไป &quot;รออนุมัติ&quot; ใหม่อัตโนมัติ</p>
      </div>
    </ERPModal>
  );
}
