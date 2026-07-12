"use client";

// ============================================================
// PanelConfigModal — ⚙️ ตั้งค่าการ์ดระบบบนแดชบอร์ด (แอดมิน)
// ต่อระบบ (app_key): ซ่อน / ใครเห็น (ต่อยอดสิทธิ์แอปเดิม) / แจ้งเตือนที่แสดง
// เขียนลง erp_dashboard_panels ผ่าน /api/dashboard/panels
// ============================================================
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { eventsForSystem, eventLabel, type DashboardPanel } from "@/lib/dashboard-systems";
import type { SystemApp } from "./system-cards";

const ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "ผู้ดูแลระบบ" }, { key: "manager", label: "ผู้จัดการ" },
  { key: "staff", label: "พนักงาน" }, { key: "viewer", label: "ผู้ชม" },
];

export function PanelConfigModal({ app, panel, onClose, onSaved }: {
  app: SystemApp;
  panel: DashboardPanel | undefined;
  onClose: () => void;
  onSaved: (p: DashboardPanel) => void;
}) {
  const allEvents = eventsForSystem(app.key);
  const [hidden, setHidden] = useState(panel?.hidden ?? false);
  const [visMode, setVisMode] = useState<"app" | "roles">(panel?.visible_roles ? "roles" : "app");
  const [roles, setRoles] = useState<Set<string>>(new Set(panel?.visible_roles ?? []));
  const [events, setEvents] = useState<Set<string>>(new Set(panel?.enabled_events ?? allEvents));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleRole = (r: string) => setRoles((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const toggleEvent = (e: string) => setEvents((s) => { const n = new Set(s); if (n.has(e)) n.delete(e); else n.add(e); return n; });

  const save = async () => {
    setSaving(true); setErr(null);
    const patch: Partial<DashboardPanel> = {
      hidden,
      visible_roles: visMode === "app" ? null : [...roles],
      enabled_events: events.size >= allEvents.length ? null : [...events],
    };
    try {
      const j = await apiFetch("/api/dashboard/panels", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_key: app.key, patch }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      onSaved(j.data as DashboardPanel);
      onClose();
    } catch (e) { setErr(String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">{app.icon ?? "🧩"}</span>
            <span className="text-sm font-semibold text-slate-800">ตั้งค่าระบบ «{app.label}»</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{err}</div>}

          {/* ซ่อนระบบ */}
          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="w-4 h-4" />
            ซ่อนระบบนี้จากแดชบอร์ด (ทุกคน)
          </label>

          {/* ใครเห็น */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">👥 ใครเห็นระบบนี้บนแดชบอร์ด</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="vis" checked={visMode === "app"} onChange={() => setVisMode("app")} />
                ใช้สิทธิ์แอปเดิม <span className="text-xs text-slate-400">(ใครเข้าแอปนี้ได้ = เห็น)</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="vis" checked={visMode === "roles"} onChange={() => setVisMode("roles")} />
                เฉพาะตำแหน่งที่เลือก
              </label>
              {visMode === "roles" && (
                <div className="flex flex-wrap gap-1.5 pl-6 pt-1">
                  {ROLES.map((r) => {
                    const on = roles.has(r.key);
                    return (
                      <button key={r.key} onClick={() => toggleRole(r.key)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                        {on ? "✓ " : ""}{r.label}
                      </button>
                    );
                  })}
                  <span className="text-[11px] text-slate-400 w-full pt-1">ผู้ดูแลระบบเห็นได้เสมอ</span>
                </div>
              )}
            </div>
          </div>

          {/* แจ้งเตือนที่แสดง */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">🔔 แจ้งเตือนที่จะแสดงในระบบนี้</div>
            {allEvents.length === 0 ? (
              <div className="text-xs text-slate-400">ระบบนี้ยังไม่มีชนิดแจ้งเตือน</div>
            ) : (
              <div className="space-y-1">
                {allEvents.map((e) => (
                  <label key={e} className="flex items-center gap-2.5 text-sm text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={events.has(e)} onChange={() => toggleEvent(e)} className="w-4 h-4" />
                    {eventLabel(e)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
