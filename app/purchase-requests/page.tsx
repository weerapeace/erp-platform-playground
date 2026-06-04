"use client";

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, StatusBadge } from "@/components/data-table";
import { ERPModal, ConfirmDialog, ApprovalDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { ActivityFeed } from "@/components/activity-feed";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentPanel } from "@/components/attachment-panel";
import type { ActivityEntry } from "@/components/activity-feed";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { PRListItem, PRDetail, PRLine } from "@/app/api/purchase-requests/route";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";
import { PRLineEditor, type EditorLine } from "./line-editor";

// ============================================================
// Toast
// ============================================================

type Toast = { id: number; type: "success" | "error"; message: string };

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${t.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <span>{t.type === "success" ? "✓" : "⚠️"}</span>{t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Columns
// ============================================================

const COLUMNS: ColumnDef<PRListItem>[] = [
  {
    accessorKey: "pr_number", header: "เลขที่", size: 140,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">{v}</span>
               : <span className="text-xs text-slate-400 italic">ยังไม่ส่ง</span>;
    },
  },
  {
    accessorKey: "title", header: "หัวข้อ",
    cell: ({ getValue }) => <span className="text-sm font-medium text-slate-800 line-clamp-1">{getValue() as string}</span>,
  },
  { accessorKey: "requester_name", header: "ผู้ขอ", size: 140, meta: { filterable: true } },
  { accessorKey: "department", header: "แผนก", size: 120, meta: { filterable: true } },
  {
    accessorKey: "line_count", header: "รายการ", size: 80,
    cell: ({ getValue }) => <span className="text-sm tabular-nums text-slate-600">{Number(getValue())} รายการ</span>,
  },
  {
    accessorKey: "total_amount", header: "มูลค่ารวม", size: 120,
    cell: ({ getValue }) => <span className="text-sm tabular-nums font-medium text-slate-800">฿{Number(getValue()).toLocaleString("th-TH")}</span>,
  },
  {
    accessorKey: "status", header: "สถานะ", size: 110,
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
  {
    accessorKey: "created_at", header: "วันที่สร้าง", size: 110,
    cell: ({ getValue }) => <span className="text-xs text-slate-500">{formatDate(getValue())}</span>,
  },
];

const VIEWS = [
  { id: "all",       label: "ทั้งหมด" },
  { id: "draft",     label: "📝 ร่าง",       filter: (r: Record<string, unknown>) => r.status === "draft" },
  { id: "submitted", label: "⏳ รออนุมัติ",  filter: (r: Record<string, unknown>) => r.status === "submitted" },
  { id: "approved",  label: "✅ อนุมัติแล้ว", filter: (r: Record<string, unknown>) => r.status === "approved" },
  { id: "rejected",  label: "❌ ปฏิเสธ",     filter: (r: Record<string, unknown>) => r.status === "rejected" },
];

const DEPT_OPTIONS = [
  { value: "จัดซื้อ",   label: "จัดซื้อ" },
  { value: "ผลิต",     label: "ผลิต" },
  { value: "คลังสินค้า", label: "คลังสินค้า" },
  { value: "การตลาด",  label: "การตลาด" },
  { value: "บัญชี",    label: "บัญชี" },
  { value: "IT",      label: "IT" },
];

// ============================================================
// Main Page
// ============================================================

type FormState = {
  title: string; requester_name: string; department: string; note: string; lines: EditorLine[];
};
const EMPTY_FORM: FormState = { title: "", requester_name: "", department: "จัดซื้อ", note: "", lines: [] };

export default function PurchaseRequestsPage() {
  const { user, can } = useAuth();
  const [rows,    setRows]    = useState<PRListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [total,   setTotal]   = useState(0);

  // form modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);

  // detail drawer
  const [detail,        setDetail]        = useState<PRDetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [history,       setHistory]       = useState<ActivityEntry[]>([]);

  // workflow dialogs
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PRDetail | null>(null);
  const [wfLoading,    setWfLoading]    = useState(false);

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  // ---- Fetch list ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/purchase-requests?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data); setTotal(json.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ---- Open create ----
  const openCreate = () => {
    setEditingId(null); setForm(EMPTY_FORM); setFormErr(null); setDirty(false); setModalOpen(true);
  };

  // ---- Open detail drawer ----
  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null); setHistory([]);
    try {
      const [dRes, hRes] = await Promise.all([
        apiFetch(`/api/purchase-requests/${id}`).then(r => r.json()),
        apiFetch(`/api/audit-logs?entity_id=${id}&limit=50`).then(r => r.json()),
      ]);
      if (dRes.error) throw new Error(dRes.error);
      setDetail(dRes.data as PRDetail);
      setHistory((hRes as AuditLogsResponse).data ?? []);
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "โหลดรายละเอียดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  // ---- Open edit (draft only) ----
  const openEdit = async (pr: PRDetail) => {
    setEditingId(pr.id);
    setForm({
      title: pr.title, requester_name: pr.requester_name ?? "",
      department: pr.department ?? "จัดซื้อ", note: pr.note ?? "",
      lines: pr.lines.map(l => ({
        id: l.id ?? String(Math.random()), product_id: l.product_id ?? null,
        sku: l.sku ?? "", product_name: l.product_name, qty: l.qty,
        unit: l.unit, unit_price: l.unit_price, note: l.note ?? "",
      })),
    });
    setFormErr(null); setDirty(false); setDetailOpen(false); setModalOpen(true);
  };

  const updateForm = (patch: Partial<FormState>) => { setForm(p => ({ ...p, ...patch })); setDirty(true); };

  // ---- Save ----
  const grandTotal = form.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  const save = async () => {
    if (!form.title.trim()) { setFormErr("กรุณากรอกหัวข้อใบขอซื้อ"); return; }
    if (form.lines.length === 0) { setFormErr("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ"); return; }
    if (form.lines.some(l => !l.product_name.trim())) { setFormErr("มีรายการที่ยังไม่ได้เลือกสินค้า"); return; }
    setSaving(true); setFormErr(null);
    try {
      const payload = {
        title: form.title, requester_name: form.requester_name || undefined,
        department: form.department || undefined, note: form.note || undefined,
        actor: user?.name,
        lines: form.lines.map(l => ({
          product_id: l.product_id, sku: l.sku, product_name: l.product_name,
          qty: l.qty, unit: l.unit, unit_price: l.unit_price, note: l.note,
        } satisfies PRLine)),
      };
      const res = editingId
        ? await apiFetch(`/api/purchase-requests/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      pushToast("success", editingId ? "บันทึกการแก้ไขแล้ว" : "สร้างใบขอซื้อ (ร่าง) แล้ว");
      setModalOpen(false); setDirty(false);
      await fetchList();
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  // ---- Workflow transitions ----
  const transition = async (id: string, action: string, opts?: { actor?: string; reason?: string }) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/purchase-requests/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...opts }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const labels: Record<string, string> = { submit: "ส่งอนุมัติแล้ว", approve: "อนุมัติแล้ว", reject: "ปฏิเสธแล้ว", cancel: "ยกเลิกแล้ว" };
      pushToast("success", labels[action] ?? "ดำเนินการแล้ว");
      setApprovalOpen(false); setCancelTarget(null); setDetailOpen(false);
      await fetchList();
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally { setWfLoading(false); }
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          🛒 Milestone 3 — Purchase Request (module จริง)
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ใบขอซื้อ (Purchase Request)</h1>
            <p className="text-slate-500 mt-1">โมดูลจริง — มี Numbering, Workflow, Approval, Line Items, Activity Feed</p>
          </div>
          {can("pr.create") && (
            <button onClick={openCreate} className="h-10 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0">
              ＋ สร้างใบขอซื้อ
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Workflow info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">เส้นทางสถานะ (Workflow)</p>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <StatusBadge status="draft" />
            <span className="text-slate-400">→ ส่งอนุมัติ →</span>
            <StatusBadge status="submitted" />
            <span className="text-slate-400">→ อนุมัติ →</span>
            <StatusBadge status="approved" />
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-slate-400">ปฏิเสธ →</span>
            <StatusBadge status="rejected" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable<PRListItem>
            data={rows} columns={COLUMNS}
            title={`รายการใบขอซื้อ (${total})`}
            description="ทุกใบบันทึก audit log + workflow ครบ"
            loading={loading} error={error ?? undefined}
            emptyMessage="ยังไม่มีใบขอซื้อ — กดปุ่ม สร้างใบขอซื้อ"
            searchPlaceholder="ค้นหา เลขที่ / หัวข้อ / ผู้ขอ..."
            searchableKeys={["pr_number", "title", "requester_name", "department"]}
            views={VIEWS} tableId="purchase-requests"
            exportFilename="ใบขอซื้อ"
            enableCards
            cardConfig={{
              primary:  "title",
              subtitle: "pr_number",
              badges:   ["status", "department"],
              metrics:  ["total_amount", "line_count"],
              lines:    ["requester_name", "created_at"],
            }}
            onRetry={fetchList}
            onRowClick={(row) => openDetail(row.id)}
          />
        </div>
      </div>

      {/* ============ Create/Edit Modal ============ */}
      <ERPModal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editingId ? "แก้ไขใบขอซื้อ (ร่าง)" : "สร้างใบขอซื้อใหม่"}
        description={editingId ? form.title : "กรอกข้อมูล + เพิ่มรายการสินค้า"}
        size="xl" hasUnsavedChanges={dirty}
        footer={
          <>
            <div className="mr-auto text-sm text-slate-600">
              มูลค่ารวม: <span className="font-bold text-slate-900">฿{grandTotal.toLocaleString("th-TH")}</span>
            </div>
            <button onClick={() => setModalOpen(false)} disabled={saving} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึก" : "สร้าง (ร่าง)"}
            </button>
          </>
        }
      >
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        <ERPFormSection title="ข้อมูลใบขอซื้อ" columns={2}>
          <ERPFormField label="หัวข้อ" required span={2}>
            <ERPInput value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="เช่น ขอซื้อวัสดุสำนักงานประจำเดือน" />
          </ERPFormField>
          <ERPFormField label="ผู้ขอ">
            <ERPInput value={form.requester_name} onChange={e => updateForm({ requester_name: e.target.value })} placeholder="ชื่อผู้ขอ" />
          </ERPFormField>
          <ERPFormField label="แผนก">
            <ERPSelect value={form.department} options={DEPT_OPTIONS} onChange={e => updateForm({ department: e.target.value })} />
          </ERPFormField>
          <ERPFormField label="หมายเหตุ" span={2}>
            <ERPTextarea value={form.note} rows={2} onChange={e => updateForm({ note: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" />
          </ERPFormField>
        </ERPFormSection>

        <ERPFormSection title="รายการสินค้า">
          <PRLineEditor lines={form.lines} onChange={lines => updateForm({ lines })} />
        </ERPFormSection>
      </ERPModal>

      {/* ============ Detail Drawer ============ */}
      {detailOpen && (
        <PRDetailDrawer
          detail={detail} loading={detailLoading} history={history}
          onClose={() => setDetailOpen(false)}
          onEdit={() => detail && openEdit(detail)}
          onSubmit={() => detail && transition(detail.id, "submit", { actor: user?.name })}
          onApprove={() => setApprovalOpen(true)}
          onCancel={() => detail && setCancelTarget(detail)}
          wfLoading={wfLoading}
        />
      )}

      {/* Approve/Reject dialog */}
      <ApprovalDialog
        open={approvalOpen} onClose={() => setApprovalOpen(false)}
        documentLabel={detail ? `${detail.pr_number ?? ""} — ${detail.title}` : ""}
        loading={wfLoading}
        onApprove={(comment) => detail && transition(detail.id, "approve", { actor: user?.name, reason: comment })}
        onReject={(reason) => detail && transition(detail.id, "reject", { actor: user?.name, reason })}
      />

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget} onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && transition(cancelTarget.id, "cancel", { actor: user?.name })}
        title="ยกเลิกใบขอซื้อ"
        message={<span>ต้องการยกเลิก <span className="font-semibold">{cancelTarget?.title}</span> ใช่ไหม?</span>}
        confirmText="ยกเลิกใบขอซื้อ" variant="danger" loading={wfLoading}
      />

      <ToastStack toasts={toasts} onDismiss={id => setToasts(p => p.filter(t => t.id !== id))} />
    </PlaygroundShell>
  );
}

// ============================================================
// Detail Drawer
// ============================================================

function PRDetailDrawer({
  detail, loading, history, onClose, onEdit, onSubmit, onApprove, onCancel, wfLoading,
}: {
  detail: PRDetail | null; loading: boolean; history: ActivityEntry[];
  onClose: () => void; onEdit: () => void; onSubmit: () => void;
  onApprove: () => void; onCancel: () => void; wfLoading: boolean;
}) {
  const { can } = useAuth();
  const status = detail?.status;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[560px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{detail?.title ?? "กำลังโหลด..."}</h3>
            {detail?.pr_number && <span className="font-mono text-xs text-slate-500">{detail.pr_number}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {detail && (
              <a href={`/print/purchase-request/${detail.id}`} target="_blank" rel="noopener noreferrer"
                title="พิมพ์ / บันทึก PDF"
                className="h-8 px-2.5 flex items-center gap-1 rounded-md text-sm text-slate-600 border border-slate-200 hover:bg-slate-50">
                🖨️ พิมพ์
              </a>
            )}
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        {loading || !detail ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Status + info */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={detail.status} />
                {detail.department && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{detail.department}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="ผู้ขอ" value={detail.requester_name} />
                <Field label="วันที่สร้าง" value={formatDate(detail.created_at)} />
                {detail.submitted_at && <Field label="ส่งเมื่อ" value={formatDate(detail.submitted_at)} />}
                {detail.approver_name && <Field label="ผู้อนุมัติ/ดำเนินการ" value={detail.approver_name} />}
              </div>
              {detail.note && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">หมายเหตุ</p>{detail.note}</div>}
              {detail.status === "rejected" && detail.reject_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"><p className="text-xs text-red-500 mb-1">เหตุผลที่ปฏิเสธ</p>{detail.reject_reason}</div>
              )}

              {/* Line items */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">รายการสินค้า ({detail.lines.length})</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr><th className="px-3 py-2 text-left">สินค้า</th><th className="px-3 py-2 text-right">จำนวน</th><th className="px-3 py-2 text-right">ราคา/หน่วย</th><th className="px-3 py-2 text-right">รวม</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.lines.map(l => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{l.product_name}</div>
                            {l.sku && <div className="font-mono text-xs text-slate-400">{l.sku}</div>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.qty} {l.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">฿{Number(l.unit_price).toLocaleString("th-TH")}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">฿{Number(l.line_total).toLocaleString("th-TH")}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold">
                      <tr><td colSpan={3} className="px-3 py-2 text-right text-slate-600">มูลค่ารวมทั้งสิ้น</td><td className="px-3 py-2 text-right tabular-nums text-blue-700">฿{Number(detail.total_amount).toLocaleString("th-TH")}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Attachments (ของกลาง N) */}
              {detail && (
                <div className="border-t border-slate-100 pt-4">
                  <AttachmentPanel entityType="erp_playground_pr" entityId={detail.id} />
                </div>
              )}

              {/* Comments */}
              {detail && (
                <div className="border-t border-slate-100 pt-4">
                  <CommentThread entityType="erp_playground_pr" entityId={detail.id} maxHeight={280} />
                </div>
              )}

              {/* Activity */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ประวัติ (Activity)</p>
                <ActivityFeed entries={history} compact emptyMessage="ยังไม่มีประวัติ" />
              </div>
            </div>

            {/* Workflow action footer */}
            <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
              {status === "draft" && (
                <>
                  {can("pr.submit") && <button onClick={onSubmit} disabled={wfLoading} className="flex-1 h-9 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">📤 ส่งอนุมัติ</button>}
                  {can("pr.edit")   && <button onClick={onEdit} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">✏️ แก้ไข</button>}
                  {can("pr.cancel") && <button onClick={onCancel} className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">ยกเลิก</button>}
                </>
              )}
              {status === "submitted" && (
                <>
                  {can("pr.approve")
                    ? <button onClick={onApprove} disabled={wfLoading} className="flex-1 h-9 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ อนุมัติ / ปฏิเสธ</button>
                    : <p className="flex-1 text-sm text-amber-600 text-center self-center">⏳ รอผู้มีสิทธิ์อนุมัติ (คุณไม่มีสิทธิ์อนุมัติ)</p>}
                  {can("pr.cancel") && <button onClick={onCancel} className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">ยกเลิก</button>}
                </>
              )}
              {(status === "approved" || status === "rejected" || status === "cancelled") && (
                <p className="text-sm text-slate-400 text-center w-full">เอกสารปิดแล้ว ({status === "approved" ? "อนุมัติ" : status === "rejected" ? "ปฏิเสธ" : "ยกเลิก"}) — ดูได้อย่างเดียว</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-xs text-slate-400 mb-0.5">{label}</p><p className="text-sm font-medium text-slate-800">{value || "—"}</p></div>;
}
