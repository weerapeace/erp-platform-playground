"use client";

/**
 * กลุ่มใบสั่งงาน — โมดอล 2 ตัว
 *  • AssignToGroupModal: เลือก MO แล้วเพิ่มเข้ากลุ่ม (เดิม/สร้างใหม่)
 *  • ManageGroupsModal: ดู/เปลี่ยนชื่อ/ลบ/เอาใบออกจากกลุ่ม
 * ใช้ของกลาง: ERPModal + /api/mo/groups
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { MoGroup } from "@/app/api/mo/groups/route";

function useGroups() {
  const [groups, setGroups] = useState<MoGroup[] | null>(null);
  const load = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/groups"); const j = await r.json(); setGroups((j.data ?? []) as MoGroup[]); }
    catch { setGroups([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { groups, reload: load };
}

// ── เพิ่ม MO ที่เลือกเข้ากลุ่ม ────────────────────────────────
export function AssignToGroupModal({ moNos, onClose, onDone }: { moNos: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { groups } = useGroups();
  const [target, setTarget] = useState<string>("__new__");   // group id หรือ "__new__"
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (moNos.length === 0) { toast.error("ยังไม่ได้เลือกใบสั่งผลิต"); return; }
    setSaving(true);
    try {
      if (target === "__new__") {
        const name = newName.trim(); if (!name) { toast.error("ใส่ชื่อกลุ่มก่อน"); setSaving(false); return; }
        const r = await apiFetch("/api/mo/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mo_nos: moNos }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        toast.success(`สร้างกลุ่ม "${name}" + เพิ่ม ${moNos.length} ใบ`);
      } else {
        const r = await apiFetch("/api/mo/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target, add_mos: moNos }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        toast.success(`เพิ่ม ${moNos.length} ใบเข้ากลุ่มแล้ว`);
      }
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" title={`จัดกลุ่มใบสั่งงาน (${moNos.length} ใบ)`}
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "เพิ่มเข้ากลุ่ม"}</button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {moNos.map((m) => <code key={m} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{m}</code>)}
        </div>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
          <input type="radio" checked={target === "__new__"} onChange={() => setTarget("__new__")} className="accent-blue-600" />
          <span className="text-sm text-slate-700">สร้างกลุ่มใหม่</span>
          {target === "__new__" && <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อกลุ่ม เช่น ชุดเตรียมรอบ 1"
            className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300" />}
        </label>
        {groups === null ? <div className="text-center py-3 text-sm text-slate-400">กำลังโหลดกลุ่ม…</div>
          : groups.length > 0 && <div className="border border-slate-200 rounded-lg divide-y divide-slate-50 max-h-56 overflow-y-auto">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50">
                <input type="radio" checked={target === g.id} onChange={() => setTarget(g.id)} className="accent-blue-600" />
                <span className="text-sm text-slate-700 flex-1 truncate">{g.name}</span>
                <span className="text-[11px] text-slate-400">{g.mo_nos.length} ใบ</span>
              </label>
            ))}
          </div>}
      </div>
    </ERPModal>
  );
}

// ── จัดการกลุ่ม (เปลี่ยนชื่อ/ลบ/เอาใบออก) ─────────────────────
export function ManageGroupsModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const { groups, reload } = useGroups();
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const saveName = async (id: string, name: string, orig: string) => {
    const nm = name.trim();
    if (!nm || nm === orig) return;
    setBusy(id);
    try { const r = await apiFetch("/api/mo/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: nm }) }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success("เปลี่ยนชื่อแล้ว"); await reload(); onChanged?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(null); }
  };
  const removeMo = async (id: string, mo: string) => {
    setBusy(id);
    try { const r = await apiFetch("/api/mo/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, remove_mos: [mo] }) }); const j = await r.json(); if (j.error) throw new Error(j.error); await reload(); onChanged?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusy(null); }
  };
  const delGroup = async (id: string, name: string) => {
    if (!confirm(`ลบกลุ่ม "${name}"? (ใบสั่งผลิตไม่ถูกลบ)`)) return;
    setBusy(id);
    try { const r = await apiFetch(`/api/mo/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success("ลบกลุ่มแล้ว"); await reload(); onChanged?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusy(null); }
  };

  return (
    <ERPModal open onClose={onClose} size="lg" title="🗂 จัดการกลุ่มใบสั่งงาน"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
      {groups === null ? <div className="text-center py-10 text-slate-400">กำลังโหลด…</div>
        : groups.length === 0 ? <div className="text-center py-10 text-slate-300">ยังไม่มีกลุ่ม — เลือกใบสั่งผลิตแล้วกด &ldquo;จัดกลุ่มใบสั่งงาน&rdquo;</div>
        : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input defaultValue={names[g.id] ?? g.name} onChange={(e) => setNames((s) => ({ ...s, [g.id]: e.target.value }))} onBlur={(e) => void saveName(g.id, e.target.value, g.name)} disabled={busy === g.id}
                    className="flex-1 h-8 px-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300" />
                  <span className="text-[11px] text-slate-400 shrink-0">{g.mo_nos.length} ใบ</span>
                  <button onClick={() => void delGroup(g.id, g.name)} disabled={busy === g.id} className="h-8 px-2.5 text-xs text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">ลบกลุ่ม</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.mo_nos.length === 0 ? <span className="text-[11px] text-slate-300">ยังไม่มีใบในกลุ่ม</span>
                    : g.mo_nos.map((m) => (
                      <span key={m} className="text-[11px] pl-1.5 pr-1 py-0.5 rounded bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                        {m}<button onClick={() => void removeMo(g.id, m)} disabled={busy === g.id} title="เอาออกจากกลุ่ม" className="text-slate-400 hover:text-rose-600">✕</button>
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </ERPModal>
  );
}
