"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { NotificationRule, NotificationRulesResponse, RecipientType, Recipient } from "@/app/api/admin/notification-rules/route";

// ---- Recipient config ----

const RECIPIENT_OPTIONS: { v: RecipientType; label: string; needsValue?: "role" | "user"; icon: string }[] = [
  { v: "role",      label: "ทุก user role...",       icon: "👥", needsValue: "role" },
  { v: "user",      label: "user เดียว...",          icon: "👤", needsValue: "user" },
  { v: "approvers", label: "Approvers (จาก rule)",  icon: "✋" },
  { v: "requester", label: "ผู้ขอ (PR requester)",  icon: "📝" },
  { v: "mentioned", label: "ผู้ถูก @mention",        icon: "💬" },
];

const PRIORITY_COLOR: Record<string, string> = {
  low:    "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high:   "bg-red-50 text-red-700",
};

const EVENT_PRESETS = [
  { event: "pr.submitted",    icon: "📤", label: "PR submit" },
  { event: "pr.approved",     icon: "✓",  label: "PR approve" },
  { event: "pr.rejected",     icon: "✗",  label: "PR reject" },
  { event: "pr.cancelled",    icon: "⊘",  label: "PR cancel" },
  { event: "comment.mention", icon: "💬", label: "Comment mention" },
];

// ============================================================
// Page
// ============================================================

export default function AdminNotificationRulesPage() {
  const canView = usePermission("notification_rules.view");
  const canEdit = usePermission("admin.notification_rules");
  const { user } = useAuth();

  const [rules,   setRules]   = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [editing, setEditing] = useState<Partial<NotificationRule> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRule | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/notification-rules");
      const json: NotificationRulesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRules(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const grouped = useMemo(() => {
    const g: Record<string, NotificationRule[]> = {};
    for (const r of rules) (g[r.event_type] ??= []).push(r);
    return g;
  }, [rules]);

  const openCreate = (eventType: string) => {
    setEditing({
      event_type: eventType,
      name: "",
      recipients: [],
      title_template: "",
      body_template: "",
      link_pattern: "",
      priority: "normal",
      exclude_actor: true,
      active: true,
      sort_order: 100,
    });
  };
  const openEdit = (r: NotificationRule) => setEditing({ ...r });

  const save = async () => {
    if (!editing?.event_type || !editing.name || !editing.title_template) {
      setError("event_type, name, title template จำเป็น"); return;
    }
    try {
      const res = await apiFetch("/api/admin/notification-rules", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึกแล้ว");
      setEditing(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };

  const remove = async (r: NotificationRule) => {
    try {
      const res = await apiFetch(`/api/admin/notification-rules?id=${r.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ rule แล้ว");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  const addRecipient = (type: RecipientType) => {
    setEditing(e => e ? { ...e, recipients: [...(e.recipients ?? []), { type } as Recipient] } : e);
  };
  const updateRecipient = (idx: number, patch: Partial<Recipient>) => {
    setEditing(e => e ? { ...e, recipients: e.recipients?.map((r, i) => i === idx ? { ...r, ...patch } : r) } : e);
  };
  const removeRecipient = (idx: number) => {
    setEditing(e => e ? { ...e, recipients: e.recipients?.filter((_, i) => i !== idx) } : e);
  };

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">📨 Notification Rules</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            กฎการแจ้งเตือนต่อ event — ระบุ recipient + template; ใช้ tokens เช่น <code className="bg-slate-100 px-1 rounded text-xs">{`{{pr_number}}`}</code>
          </p>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* Per-event sections */}
        {EVENT_PRESETS.map(preset => {
          const evRules = grouped[preset.event] ?? [];
          return (
            <div key={preset.event} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span className="text-base">{preset.icon}</span>{preset.label}
                  <code className="text-[10px] text-slate-400 font-mono">{preset.event}</code>
                  <span className="text-xs font-normal text-slate-400">({evRules.length} rule)</span>
                </h2>
                {canEdit && (
                  <button onClick={() => openCreate(preset.event)}
                    className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
                    + เพิ่ม rule
                  </button>
                )}
              </div>
              {loading ? (
                <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
              ) : evRules.length === 0 ? (
                <div className="px-4 py-6 bg-white border border-dashed border-slate-300 rounded-lg text-center text-sm text-slate-400">
                  ยังไม่มี rule — event นี้จะไม่ส่ง notification
                </div>
              ) : (
                <div className="space-y-2">
                  {evRules.map(r => (
                    <div key={r.id} className={`bg-white border border-slate-200 rounded-xl p-3 ${!r.active ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLOR[r.priority]}`}>{r.priority}</span>
                            <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                            {!r.active && <span className="text-[10px] text-red-600 bg-red-50 px-1.5 rounded">ปิด</span>}
                          </div>
                          {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                          <div className="text-xs text-slate-600 mt-1">
                            <strong>To:</strong>{" "}
                            {r.recipients.map((rcp, i) => {
                              const opt = RECIPIENT_OPTIONS.find(o => o.v === rcp.type);
                              return (
                                <span key={i} className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded mr-1">
                                  {opt?.icon} {opt?.label.replace("...","") ?? rcp.type}
                                  {rcp.value && <code className="text-[10px] text-slate-500">{rcp.value}</code>}
                                </span>
                              );
                            })}
                            {r.recipients.length === 0 && <span className="text-slate-300">—</span>}
                          </div>
                          <div className="text-xs mt-1">
                            <strong className="text-slate-500">Title:</strong> <span className="text-slate-700">{r.title_template}</span>
                          </div>
                          {r.body_template && (
                            <div className="text-xs"><strong className="text-slate-500">Body:</strong> <span className="text-slate-700">{r.body_template}</span></div>
                          )}
                          {r.notes && (
                            <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded mt-1">💡 {r.notes}</div>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={() => openEdit(r)} className="text-xs text-blue-600 hover:underline">แก้</button>
                            <button onClick={() => setDeleteTarget(r)} className="text-xs text-red-600 hover:underline">ลบ</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Tokens hint */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          💡 <strong>Tokens ที่ใช้ใน template ได้:</strong>
          <div className="grid grid-cols-3 gap-1.5 mt-2 font-mono">
            <code>{"{{pr_number}}"}</code>
            <code>{"{{title}}"}</code>
            <code>{"{{total_amount}}"}</code>
            <code>{"{{department}}"}</code>
            <code>{"{{actor}}"}</code>
            <code>{"{{reason}}"}</code>
            <code>{"{{preview}}"}</code>
            <code>{"{{link}}"}</code>
            <code>{"{{entity_id}}"}</code>
          </div>
        </div>

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Editor modal */}
      {editing && (
        <ERPModal open onClose={() => setEditing(null)} size="lg"
          title={editing.id ? `แก้ rule` : `Rule ใหม่ (${editing.event_type})`}
          footer={
            <>
              <button onClick={() => setEditing(null)}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={save}
                className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
            </>
          }>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="text-xs font-medium text-slate-600">ชื่อ rule</span>
                <input value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="PR submit → แจ้งผู้อนุมัติ"
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
              </label>
              <label className="block col-span-2">
                <span className="text-xs font-medium text-slate-600">คำอธิบาย</span>
                <input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Priority</span>
                <select value={editing.priority ?? "normal"} onChange={e => setEditing({ ...editing, priority: e.target.value as NotificationRule["priority"] })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">ลำดับ</span>
                <input type="number" value={editing.sort_order ?? 100}
                  onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 100 })}
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
              </label>
            </div>

            {/* Recipients */}
            <div>
              <span className="text-xs font-medium text-slate-600">Recipients</span>
              <div className="mt-1 p-2 bg-slate-50 rounded-lg space-y-1">
                {(editing.recipients ?? []).map((rcp, i) => {
                  const opt = RECIPIENT_OPTIONS.find(o => o.v === rcp.type);
                  return (
                    <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1">
                      <span className="text-xs">{opt?.icon} {opt?.label.replace("...","")}</span>
                      {opt?.needsValue === "role" && (
                        <select value={rcp.value ?? ""} onChange={e => updateRecipient(i, { value: e.target.value })}
                          className="h-6 px-1 text-xs border border-slate-200 rounded bg-white">
                          <option value="">— role —</option>
                          <option value="admin">admin</option><option value="manager">manager</option>
                          <option value="staff">staff</option><option value="viewer">viewer</option>
                        </select>
                      )}
                      {opt?.needsValue === "user" && (
                        <input value={rcp.value ?? ""} onChange={e => updateRecipient(i, { value: e.target.value })}
                          placeholder="user uuid"
                          className="h-6 px-2 text-[10px] font-mono border border-slate-200 rounded flex-1" />
                      )}
                      <button onClick={() => removeRecipient(i)} className="text-red-400 hover:text-red-600">×</button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-1">
                  {RECIPIENT_OPTIONS.map(o => (
                    <button key={o.v} onClick={() => addRecipient(o.v)}
                      className="text-[10px] px-2 py-1 border border-slate-200 rounded hover:bg-white text-slate-700">
                      + {o.icon} {o.label.replace("...","")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">Title template *</span>
              <input value={editing.title_template ?? ""} onChange={e => setEditing({ ...editing, title_template: e.target.value })}
                placeholder="ขออนุมัติ PR {{pr_number}}"
                className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Body template</span>
              <input value={editing.body_template ?? ""} onChange={e => setEditing({ ...editing, body_template: e.target.value })}
                placeholder="{{title}} · ฿{{total_amount}} · โดย {{actor}}"
                className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Link pattern</span>
              <input value={editing.link_pattern ?? ""} onChange={e => setEditing({ ...editing, link_pattern: e.target.value })}
                placeholder="/purchase-requests?id={{entity_id}}"
                className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={e => setEditing({ ...editing, active: e.target.checked })}
                  className="rounded border-slate-300" />
                <span>เปิดใช้งาน</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.exclude_actor ?? true} onChange={e => setEditing({ ...editing, exclude_actor: e.target.checked })}
                  className="rounded border-slate-300" />
                <span>ไม่ส่งให้ตัวเอง (actor)</span>
              </label>
            </div>
          </div>
        </ERPModal>
      )}

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Rule" message={`ลบ rule "${deleteTarget?.name}" ใช่ไหม?`}
        confirmText="ลบ" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} />
    </PlaygroundShell>
  );
}
