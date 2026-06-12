"use client";

/**
 * TagGroupFilter — ของกลาง: ปุ่มกรองแท็ก (Product Family) แบบ popup แบ่งตามกลุ่ม + checkbox หลายอัน
 * - โหลดแท็ก (product_families) + กลุ่ม (product_family_groups) เอง
 * - value = { tagIds: string[], none: boolean }  (none = "ยังไม่มีแท็ก")
 * - ตรรกะ OR (มีอย่างน้อย 1 แท็กที่ติ๊ก) — ผู้บริโภคเป็นคน apply
 * ใช้ซ้ำได้ทุกหน้าที่ต้องกรองตามแท็ก
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth, usePermission, type Permission } from "@/components/auth";

export type TagFilterValue = { tagIds: string[]; none: boolean };
type Tag = { id: string; label: string; group_id: string | null; flag?: boolean };
type Grp = { id: string; name: string; parent_group_id: string | null; sort_order: number; color: string | null; icon: string | null };

/** โหมดตั้งค่า default (admin) — toggle boolean flag ต่อแท็ก เป็นค่ากลางของทุกคน */
export type TagManageFlag = { field: string; onLabel: string; offLabel: string; permission: Permission };

export function TagGroupFilter({ value, onChange, label = "กรองแท็ก", showNone = true, manageFlag, onManaged }: {
  value: TagFilterValue; onChange: (v: TagFilterValue) => void; label?: string;
  /** แสดงปุ่ม "ยังไม่มีแท็ก" หรือไม่ (โหมดซ่อน/โชว์เฉพาะ/เลือกแท็ก ไม่ต้องใช้) */
  showNone?: boolean;
  /** เปิดโหมด ⚙ ให้ admin ตั้ง flag ต่อแท็ก (เช่น hide_in_purchasing) เป็น default ทุกคน */
  manageFlag?: TagManageFlag;
  /** เรียกหลัง admin เปลี่ยน flag → ให้ผู้บริโภครีโหลด */
  onManaged?: () => void;
}) {
  const { user } = useAuth();
  const canManage = usePermission(manageFlag?.permission ?? ("__none__" as Permission));
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);   // โหมดตั้งค่า default
  const [savingId, setSavingId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const flagField = manageFlag?.field;

  useEffect(() => {
    apiFetch(`/api/master-v2/product_families?limit=500`).then((r) => r.json())
      .then((j) => setTags(((j.data ?? []) as Record<string, unknown>[]).map((t) => ({ id: String(t.id), label: String(t.name ?? t.id), group_id: t.group_id ? String(t.group_id) : null, flag: flagField ? t[flagField] === true : false }))))
      .catch(() => {});
    apiFetch(`/api/master-v2/product_family_groups?limit=500`).then((r) => r.json())
      .then((j) => setGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
        id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
        sort_order: Number(g.sort_order ?? 100), color: g.color ? String(g.color) : null, icon: g.icon ? String(g.icon) : null,
      })))).catch(() => {});
  }, [flagField]);

  const count = value.tagIds.length + (value.none ? 1 : 0);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byOrder = (a: Grp, b: Grp) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th");
  const ql = q.trim().toLowerCase();
  const matchTag = (t: Tag) => !ql || t.label.toLowerCase().includes(ql);
  const tops = useMemo(() => groups.filter((g) => !g.parent_group_id).sort(byOrder), [groups]);
  const subsOf = (id: string) => groups.filter((g) => g.parent_group_id === id).sort(byOrder);
  const tagsOf = (gid: string) => tags.filter((t) => t.group_id === gid && matchTag(t));
  const ungrouped = tags.filter((t) => (!t.group_id || !groupById.has(t.group_id)) && matchTag(t));

  const toggleTag = (id: string) => onChange({ ...value, tagIds: value.tagIds.includes(id) ? value.tagIds.filter((x) => x !== id) : [...value.tagIds, id] });
  const clearAll = () => onChange({ tagIds: [], none: false });

  // โหมดตั้งค่า: toggle flag ต่อแท็ก (เก็บลง product_families → default ของทุกคน) ผ่าน API กลาง (audit)
  const toggleFlag = async (t: Tag) => {
    if (!flagField) return;
    const next = !t.flag;
    setSavingId(t.id);
    try {
      const res = await apiFetch(`/api/master-v2/product_families/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [flagField]: next, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setTags((arr) => arr.map((x) => x.id === t.id ? { ...x, flag: next } : x));
      onManaged?.();
    } catch { /* เงียบ — ป้ายไม่เปลี่ยนถ้าพลาด */ }
    finally { setSavingId(null); }
  };

  const TagRow = (t: Tag) => {
    // โหมดตั้งค่า default (admin): กดเพื่อ toggle flag ทุกคน
    if (manage && manageFlag) {
      const hidden = !!t.flag;
      return (
        <button key={t.id} type="button" disabled={savingId === t.id} onClick={() => void toggleFlag(t)}
          className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-slate-50 disabled:opacity-50 ${hidden ? "bg-rose-50/60" : ""}`}>
          <span className="flex-1 truncate">{t.label}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${hidden ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {savingId === t.id ? "…" : hidden ? manageFlag.onLabel : manageFlag.offLabel}
          </span>
        </button>
      );
    }
    const on = value.tagIds.includes(t.id);
    return (
      <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-slate-50 ${on ? "bg-blue-50/60" : ""}`}>
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
        <span className="flex-1 truncate">{t.label}</span>
      </button>
    );
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(true)}
        className={`h-7 px-2.5 text-xs rounded border inline-flex items-center gap-1 ${count > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        🔎 {label}{count > 0 ? ` (${count})` : ""}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-[94vw] max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{manage ? "⚙ ตั้งค่าเริ่มต้น (ทุกคน)" : "กรองตามแท็ก"}</h3>
              <div className="flex items-center gap-2">
                {manageFlag && canManage && (
                  <button type="button" onClick={() => setManage((m) => !m)}
                    title="ตั้งค่าเริ่มต้นของทุกคน"
                    className={`h-7 px-2 text-xs rounded border ${manage ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>⚙</button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
              </div>
            </div>
            <div className="px-3 pt-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="ค้นหาแท็ก…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {manage && manageFlag && (
                <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  กดแท็กเพื่อสลับ — มีผลกับ<b>ทุกคน</b> ({manageFlag.onLabel} = ซ่อนสินค้าในแท็กนี้จากหน้าขอซื้อ)
                </div>
              )}
              {showNone && !manage && (
                <button type="button" onClick={() => onChange({ ...value, none: !value.none })}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded border ${value.none ? "bg-amber-50 border-amber-200 text-amber-700" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] ${value.none ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                  ยังไม่มีแท็ก
                </button>
              )}
              {tops.map((g) => {
                const direct = tagsOf(g.id);
                const subs = subsOf(g.id).map((s) => ({ s, t: tagsOf(s.id) }));
                if (direct.length === 0 && subs.every((x) => x.t.length === 0)) return null;
                return (
                  <div key={g.id} className="border border-slate-100 rounded-lg">
                    <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      {g.color && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />}{g.icon && <span>{g.icon}</span>}{g.name}
                    </div>
                    <div className="p-1">
                      {direct.map(TagRow)}
                      {subs.filter((x) => x.t.length > 0).map(({ s, t }) => (
                        <div key={s.id} className="mt-1">
                          <div className="px-2 py-0.5 text-xs font-medium text-slate-500">↳ {s.icon ? s.icon + " " : ""}{s.name}</div>
                          {t.map(TagRow)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {ungrouped.length > 0 && (
                <div className="border border-slate-100 rounded-lg">
                  <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 text-sm font-medium text-slate-500">ไม่มีกลุ่ม</div>
                  <div className="p-1">{ungrouped.map(TagRow)}</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100">
              {manage
                ? <span className="text-xs text-slate-400">บันทึกอัตโนมัติเมื่อกด</span>
                : <button type="button" onClick={clearAll} className="h-9 px-3 text-sm text-slate-500 hover:text-red-500">ล้างตัวกรอง</button>}
              <button type="button" onClick={() => setOpen(false)} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">เสร็จ{!manage && count > 0 ? ` (${count})` : ""}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
