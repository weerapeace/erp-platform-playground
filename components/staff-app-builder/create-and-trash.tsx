"use client";

/**
 * ➕ สร้างแอปพนักงาน (ว่าง / แม่แบบ / คัดลอกแอปเดิม) + 🗑 ถังขยะแอป — ใช้ใน /admin/app-manager
 * ข้อมูล: POST /api/staff-apps (create · restore · purge) · กฎ lib/staff-apps.ts
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { STAFF_APP_TEMPLATES } from "@/lib/staff-apps";
import type { StaffAppRow } from "./index";

async function post(body: Record<string, unknown>) {
  const r = await apiFetch("/api/staff-apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

type Source = { kind: "blank" } | { kind: "template"; key: string } | { kind: "copy"; id: string };

export function StaffAppCreateModal({ open, onClose, staffApps, onCreated }: {
  open: boolean; onClose: () => void; staffApps: StaffAppRow[]; onCreated: (app: StaffAppRow) => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [src, setSrc] = useState<Source>({ kind: "blank" });
  const [busy, setBusy] = useState(false);
  const live = staffApps.filter((a) => !a.deleted_at);
  const pick = (s: Source, suggest?: string) => { setSrc(s); if (suggest && !label.trim()) setLabel(suggest); };
  const on = (s: Source) => JSON.stringify(s) === JSON.stringify(src);
  const tile = (s: Source) => `flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${on(s) ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-slate-400"}`;

  const create = async () => {
    if (!label.trim()) { toast.error("ตั้งชื่อแอปก่อน"); return; }
    setBusy(true);
    try {
      const j = await post({ action: "create", label: label.trim(), ...(src.kind === "template" ? { template: src.key } : src.kind === "copy" ? { copy_from: src.id } : {}) });
      toast.success("สร้างแอปร่างแล้ว — ตั้งค่าต่อได้เลย (พนักงานยังไม่เห็น)");
      onCreated(j.app as StaffAppRow);
      setLabel(""); setSrc({ kind: "blank" });
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="สร้างแอปพนักงาน" size="md" defaultExpanded={false} hasUnsavedChanges={!!label.trim()}
      footer={<div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void create()} disabled={busy || !label.trim()} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">{busy ? "กำลังสร้าง…" : "สร้างเป็นร่าง"}</button>
      </div>}>
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="mb-1 block text-slate-600">ชื่อแอป *</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoFocus placeholder="เช่น แอปหน้างานผลิต" className="h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-violet-400" />
        </label>
        <div>
          <div className="mb-1.5 text-slate-600">เริ่มจาก</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => pick({ kind: "blank" })} className={tile({ kind: "blank" })}><Icon name="plus" /> แอปว่าง (เลือกเมนูเอง)</button>
            {STAFF_APP_TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => pick({ kind: "template", key: t.key }, `${t.label} (พนักงาน)`)} className={tile({ kind: "template", key: t.key })}>
                <span className="text-lg"><Icon value={t.icon} /></span>
                <span><span className="block font-medium text-slate-800">แม่แบบ {t.label}</span><span className="text-xs text-slate-500">เมนูทั้งหมดของแอป{t.label} — ตัด/เพิ่มทีหลังได้</span></span>
              </button>
            ))}
          </div>
        </div>
        {live.length > 0 && (
          <div>
            <div className="mb-1.5 text-slate-600">หรือคัดลอกแอปพนักงานที่มีอยู่</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {live.map((a) => (
                <button key={a.id} type="button" onClick={() => pick({ kind: "copy", id: a.id }, `${a.label} (สำเนา)`)} className={tile({ kind: "copy", id: a.id })}>
                  <span className="text-lg"><Icon value={a.icon ?? "📱"} /></span><span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}

export function StaffAppTrash({ apps, onChanged }: { apps: StaffAppRow[]; onChanged: () => void }) {
  const toast = useToast();
  const [purge, setPurge] = useState<StaffAppRow | null>(null);
  const [busy, setBusy] = useState(false);
  const restore = async (a: StaffAppRow) => {
    try { await post({ action: "restore", id: a.id }); onChanged(); toast.success(`กู้คืน “${a.label}” แล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const doPurge = async () => {
    if (!purge) return;
    setBusy(true);
    try { await post({ action: "purge", id: purge.id }); onChanged(); toast.success(`ลบ “${purge.label}” ถาวรแล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); setPurge(null); }
  };
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-base font-semibold text-slate-800"><Icon name="trash" /> ถังขยะแอปพนักงาน</h2>
      <p className="mb-3 text-xs text-slate-500">แอปที่ลบแล้ว พนักงานเปิดไม่ได้ · กู้คืนได้ทุกเมื่อ · ลบถาวร = เอาแอปออกจากทุกเมนูแล้วลบทิ้ง (เมนูกลางไม่หาย)</p>
      {apps.length === 0 && <p className="py-10 text-center text-sm text-slate-500">ถังขยะว่าง</p>}
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {apps.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <span className="text-lg"><Icon value={a.icon ?? "📱"} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-slate-800">{a.label}</div>
              <div className="text-[11px] text-slate-400">ลบเมื่อ {a.deleted_at ? new Date(a.deleted_at).toLocaleString("th-TH") : "-"} · {cleanCount(a)} เมนู</div>
            </div>
            <button type="button" onClick={() => void restore(a)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50"><Icon name="arrow-back-up" /> กู้คืน</button>
            <button type="button" onClick={() => setPurge(a)} className="h-8 rounded-lg border border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50">ลบถาวร</button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!purge} onClose={() => setPurge(null)} onConfirm={() => void doPurge()} loading={busy} variant="danger" requireTyped="ลบ"
        title={`ลบ “${purge?.label ?? ""}” ถาวร?`} confirmText="ลบถาวร"
        message="ลบแล้วกู้คืนไม่ได้ (ประวัติเวอร์ชันหายด้วย) · เมนูกลางยังอยู่ แอปอื่นไม่กระทบ — พิมพ์คำว่า “ลบ” เพื่อยืนยัน" />
    </div>
  );
}

function cleanCount(a: StaffAppRow): number {
  const d = a.draft as { menus?: unknown[] } | null;
  return Array.isArray(d?.menus) ? d!.menus!.length : 0;
}
