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

export type TagFilterValue = { tagIds: string[]; none: boolean };
type Tag = { id: string; label: string; group_id: string | null };
type Grp = { id: string; name: string; parent_group_id: string | null; sort_order: number; color: string | null; icon: string | null };

export function TagGroupFilter({ value, onChange, label = "กรองแท็ก" }: {
  value: TagFilterValue; onChange: (v: TagFilterValue) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    apiFetch(`/api/master-v2/product_families?limit=500`).then((r) => r.json())
      .then((j) => setTags(((j.data ?? []) as Record<string, unknown>[]).map((t) => ({ id: String(t.id), label: String(t.name ?? t.id), group_id: t.group_id ? String(t.group_id) : null }))))
      .catch(() => {});
    apiFetch(`/api/master-v2/product_family_groups?limit=500`).then((r) => r.json())
      .then((j) => setGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
        id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
        sort_order: Number(g.sort_order ?? 100), color: g.color ? String(g.color) : null, icon: g.icon ? String(g.icon) : null,
      })))).catch(() => {});
  }, []);

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

  const TagRow = (t: Tag) => {
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
              <h3 className="font-semibold text-slate-800">กรองตามแท็ก</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
            </div>
            <div className="px-3 pt-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="ค้นหาแท็ก…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <button type="button" onClick={() => onChange({ ...value, none: !value.none })}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded border ${value.none ? "bg-amber-50 border-amber-200 text-amber-700" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] ${value.none ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                ยังไม่มีแท็ก
              </button>
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
              <button type="button" onClick={clearAll} className="h-9 px-3 text-sm text-slate-500 hover:text-red-500">ล้างตัวกรอง</button>
              <button type="button" onClick={() => setOpen(false)} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">เสร็จ{count > 0 ? ` (${count})` : ""}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
