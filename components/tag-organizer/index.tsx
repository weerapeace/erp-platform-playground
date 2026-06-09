"use client";

/**
 * TagOrganizerModal — จัดการแท็กแบบ "ลากวาง" (ของกลาง)
 *
 * เปิดจากปุ่ม "จัดการแท็ก" ในตัวเลือกแท็ก (m2m ที่มีระบบกลุ่ม = product_families)
 * ความสามารถ:
 *   • ลากแท็ก ข้ามกลุ่ม / เข้าหมวดย่อย  → เปลี่ยนกลุ่ม (group_id)
 *   • ลากแท็ก สลับตำแหน่งในกลุ่มเดียวกัน → เรียงลำดับ (sort_order)
 *   • ลากกลุ่ม/หมวดย่อย สลับตำแหน่ง + ย้ายไปอยู่ใต้กลุ่มอื่น (parent_group_id)
 *   • เพิ่ม / แก้ชื่อ / ลบ แท็ก และ กลุ่ม
 * บันทึกทันทีต่อการลากแต่ละครั้ง (optimistic + PATCH master-v2)
 *
 * ใช้ HTML5 drag-and-drop (native) เพื่อให้การวางในโซนซ้อนกัน (กลุ่ม→หมวดย่อย→แท็ก)
 * แม่นยำ ไม่กำกวม — event ยิงที่ element จริงใต้เมาส์
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

type Tag = { id: string; label: string; group_id: string | null; sort_order: number };
type Grp = {
  id: string; name: string; parent_group_id: string | null;
  single_select: boolean; sort_order: number; icon: string | null;
};

const TOP = "__top__";    // คีย์ "ระดับบนสุด" (ไม่มีกลุ่มแม่)
const NONE = "__none__";  // คีย์ "แท็กที่ยังไม่มีกลุ่ม"

const GROUP_MODULE = "product_family_groups";

type TagHint = { type: "tag"; container: string; index: number };
type GroupHint = { type: "group"; parent: string; index: number };
type Hint = TagHint | GroupHint | null;
type DragInfo = { kind: "tag" | "group"; id: string } | null;

export function TagOrganizerModal({
  moduleKey, labelField, onClose, onChanged,
}: {
  moduleKey: string;       // = "product_families"
  labelField: string;      // = "name"
  onClose: () => void;
  onChanged: () => void;    // ให้ parent reload (ตัวเลือกแท็ก/กลุ่ม)
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  const dragRef = useRef<DragInfo>(null);
  const [dragKind, setDragKind] = useState<null | "tag" | "group">(null);  // re-render โซนวางตอนลาก
  const [hint, setHint] = useState<Hint>(null);

  // ---- โหลดข้อมูล ----
  const loadTags = useCallback(async () => {
    const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=500`).then((r) => r.json());
    setTags(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), label: String(r[labelField] ?? r.name ?? r.id),
      group_id: r.group_id ? String(r.group_id) : null, sort_order: Number(r.sort_order ?? 100),
    })));
  }, [moduleKey, labelField]);
  const loadGroups = useCallback(async () => {
    const j = await apiFetch(`/api/master-v2/${GROUP_MODULE}?limit=500`).then((r) => r.json());
    setGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
      id: String(g.id), name: String(g.name ?? ""),
      parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
      single_select: g.single_select === true, sort_order: Number(g.sort_order ?? 100),
      icon: g.icon ? String(g.icon) : null,
    })));
  }, []);
  useEffect(() => {
    (async () => { try { await Promise.all([loadTags(), loadGroups()]); } finally { setLoading(false); } })();
  }, [loadTags, loadGroups]);

  // ---- โครงสร้างกลุ่ม ----
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byOrder = useCallback(
    (a: { sort_order: number; label?: string; name?: string }, b: { sort_order: number; label?: string; name?: string }) =>
      a.sort_order - b.sort_order || String(a.label ?? a.name ?? "").localeCompare(String(b.label ?? b.name ?? ""), "th"),
    [],
  );
  const topGroups = useMemo(() => groups.filter((g) => !g.parent_group_id || !groupById.has(g.parent_group_id)).slice().sort(byOrder), [groups, groupById, byOrder]);
  const subsOf = useCallback((gid: string) => groups.filter((g) => g.parent_group_id === gid).slice().sort(byOrder), [groups, byOrder]);

  const containerKeyOf = useCallback((t: Tag) => (t.group_id && groupById.has(t.group_id) ? t.group_id : NONE), [groupById]);
  const tagsOf = useCallback((key: string) => tags.filter((t) => containerKeyOf(t) === key).slice().sort(byOrder), [tags, containerKeyOf, byOrder]);

  // ---- persist helpers ----
  const patchTag = (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/master-v2/${moduleKey}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const patchGroup = (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/master-v2/${GROUP_MODULE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const cleanupDrag = () => { dragRef.current = null; setDragKind(null); setHint(null); };

  // ---- วางแท็ก (ย้ายกลุ่ม + เรียงลำดับ) ----
  const applyTagDrop = async () => {
    const d = dragRef.current;
    const h = hint;
    cleanupDrag();
    if (!d || d.kind !== "tag" || !h || h.type !== "tag") return;
    const moving = tags.find((t) => t.id === d.id);
    if (!moving) return;
    const targetKey = h.container;
    const targetGroupId = targetKey === NONE ? null : targetKey;

    // รายการแท็กในกลุ่มปลายทาง (ไม่รวมตัวที่กำลังลาก) → แทรกตามตำแหน่ง → ตั้ง sort_order
    const list = tags.filter((t) => containerKeyOf(t) === targetKey && t.id !== d.id).slice().sort(byOrder);
    let idx = Math.max(0, Math.min(h.index, list.length));
    list.splice(idx, 0, moving);
    const orderMap = new Map(list.map((t, i) => [t.id, i * 10]));

    // optimistic
    setTags((prev) => prev.map((t) =>
      orderMap.has(t.id) ? { ...t, group_id: t.id === d.id ? targetGroupId : t.group_id, sort_order: orderMap.get(t.id)! } : t));

    // persist: ตัวที่ย้าย (group_id + sort_order) + ตัวอื่นในกลุ่มปลายทาง (sort_order)
    setBusy(true); setErr(null);
    try {
      await Promise.all(list.map((t) =>
        t.id === d.id
          ? patchTag(t.id, { group_id: targetGroupId, sort_order: orderMap.get(t.id)! })
          : patchTag(t.id, { sort_order: orderMap.get(t.id)! })));
      onChanged();
    } catch (e) { setErr("บันทึกการย้ายแท็กไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); await loadTags(); }
    finally { setBusy(false); }
  };

  // ---- วางกลุ่ม/หมวดย่อย (เรียงลำดับ + ย้ายกลุ่มแม่) ----
  const isUnder = (node: string | null, ancestor: string): boolean => {
    let c = node; const seen = new Set<string>();
    while (c && !seen.has(c)) { seen.add(c); if (c === ancestor) return true; c = groupById.get(c)?.parent_group_id ?? null; }
    return false;
  };
  const applyGroupDrop = async () => {
    const d = dragRef.current;
    const h = hint;
    cleanupDrag();
    if (!d || d.kind !== "group" || !h || h.type !== "group") return;
    const moving = groupById.get(d.id);
    if (!moving) return;
    const newParent = h.parent === TOP ? null : h.parent;
    // กันวางกลุ่มไว้ใต้ตัวเอง/ลูกหลานตัวเอง
    if (newParent && (newParent === d.id || isUnder(newParent, d.id))) return;

    const list = groups.filter((g) => (g.parent_group_id ?? TOP) === h.parent && g.id !== d.id).slice().sort(byOrder);
    let idx = Math.max(0, Math.min(h.index, list.length));
    list.splice(idx, 0, moving);
    const orderMap = new Map(list.map((g, i) => [g.id, i * 10]));

    setGroups((prev) => prev.map((g) =>
      orderMap.has(g.id) ? { ...g, parent_group_id: g.id === d.id ? newParent : g.parent_group_id, sort_order: orderMap.get(g.id)! } : g));

    setBusy(true); setErr(null);
    try {
      await Promise.all(list.map((g) =>
        g.id === d.id
          ? patchGroup(g.id, { parent_group_id: newParent, sort_order: orderMap.get(g.id)! })
          : patchGroup(g.id, { sort_order: orderMap.get(g.id)! })));
      onChanged();
    } catch (e) { setErr("บันทึกการย้ายกลุ่มไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); await loadGroups(); }
    finally { setBusy(false); }
  };

  // ---- CRUD แท็ก ----
  const addTag = async () => {
    const n = newTag.trim(); if (!n) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [labelField]: n }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("เพิ่มแท็กไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setNewTag(""); await loadTags(); onChanged();
    } finally { setBusy(false); }
  };
  const renameTag = async (t: Tag) => {
    const n = window.prompt("แก้ชื่อแท็ก:", t.label); if (n == null) return;
    const name = n.trim(); if (!name || name === t.label) return;
    setBusy(true); setErr(null);
    try {
      const res = await patchTag(t.id, { [labelField]: name });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("แก้ชื่อไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setTags((p) => p.map((x) => x.id === t.id ? { ...x, label: name } : x)); onChanged();
    } finally { setBusy(false); }
  };
  const deleteTag = async (t: Tag) => {
    if (!window.confirm(`ลบแท็ก “${t.label}” ?\n(สินค้าที่เคยติดแท็กนี้จะไม่เห็นแท็กนี้แล้ว)`)) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/${t.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("ลบไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setTags((p) => p.filter((x) => x.id !== t.id)); onChanged();
    } finally { setBusy(false); }
  };

  // ---- CRUD กลุ่ม ----
  const addGroup = async (parentId: string | null) => {
    const n = window.prompt(parentId ? "ชื่อหมวดย่อยใหม่:" : "ชื่อกลุ่มใหม่:", ""); if (n == null) return;
    const name = n.trim(); if (!name) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/${GROUP_MODULE}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_group_id: parentId, single_select: false, sort_order: 100 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("เพิ่มกลุ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      await loadGroups(); onChanged();
    } finally { setBusy(false); }
  };
  const renameGroup = async (g: Grp) => {
    const n = window.prompt("แก้ชื่อกลุ่ม:", g.name); if (n == null) return;
    const name = n.trim(); if (!name || name === g.name) return;
    setBusy(true); setErr(null);
    try {
      const res = await patchGroup(g.id, { name });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("แก้ชื่อกลุ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setGroups((p) => p.map((x) => x.id === g.id ? { ...x, name } : x)); onChanged();
    } finally { setBusy(false); }
  };
  const toggleSingle = async (g: Grp) => {
    setBusy(true); setErr(null);
    const next = !g.single_select;
    setGroups((p) => p.map((x) => x.id === g.id ? { ...x, single_select: next } : x));
    try {
      const res = await patchGroup(g.id, { single_select: next });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("เปลี่ยนโหมดไม่สำเร็จ: " + (j.error ?? res.status)); await loadGroups(); return; }
      onChanged();
    } finally { setBusy(false); }
  };
  const deleteGroup = async (g: Grp) => {
    const kids = subsOf(g.id).length; const inside = tagsOf(g.id).length;
    if (!window.confirm(`ลบกลุ่ม “${g.name}” ?\n(แท็ก ${inside} อัน และหมวดย่อย ${kids} อัน จะไม่ถูกลบ แต่จะหลุดออกจากกลุ่มนี้)`)) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/${GROUP_MODULE}/${g.id}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr("ลบกลุ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      await Promise.all([loadGroups(), loadTags()]); onChanged();
    } finally { setBusy(false); }
  };

  // ---- ชิ้นส่วน UI ----
  const TagBar = ({ container, index }: { container: string; index: number }) =>
    dragKind === "tag" && hint?.type === "tag" && hint.container === container && hint.index === index
      ? <span className="inline-block w-0.5 self-stretch min-h-[20px] bg-blue-500 rounded mx-0.5" />
      : null;

  const TagChip = ({ t, container, index }: { t: Tag; container: string; index: number }) => (
    <span
      draggable={!busy}
      onDragStart={() => { dragRef.current = { kind: "tag", id: t.id }; setDragKind("tag"); }}
      onDragEnd={cleanupDrag}
      onDragOver={(e) => {
        if (dragRef.current?.kind !== "tag") return;
        e.preventDefault(); e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        setHint({ type: "tag", container, index: index + (after ? 1 : 0) });
      }}
      className="group inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white border border-slate-200 text-slate-700 cursor-grab active:cursor-grabbing hover:border-blue-300 hover:bg-blue-50/50"
    >
      <span className="text-slate-300 select-none">⠿</span>
      <span className="truncate max-w-[160px]">{t.label}</span>
      <button type="button" onClick={() => renameTag(t)} title="แก้ชื่อ" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100">✎</button>
      <button type="button" onClick={() => deleteTag(t)} title="ลบ" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
    </span>
  );

  // โซนวางแท็ก (ในกลุ่ม/หมวดย่อย/ไม่มีกลุ่ม)
  const TagDropZone = ({ container }: { container: string }) => {
    const list = tagsOf(container);
    return (
      <div
        onDragOver={(e) => { if (dragRef.current?.kind !== "tag") return; e.preventDefault(); setHint({ type: "tag", container, index: list.length }); }}
        onDrop={(e) => { if (dragRef.current?.kind !== "tag") return; e.preventDefault(); void applyTagDrop(); }}
        className={`flex flex-wrap items-center gap-1.5 min-h-[34px] rounded-md p-1.5 transition-colors ${dragKind === "tag" ? "bg-blue-50/40 border border-dashed border-blue-200" : "border border-transparent"}`}
      >
        {list.length === 0 && <span className="text-[11px] text-slate-300">{dragKind === "tag" ? "วางแท็กที่นี่" : "— ไม่มีแท็ก —"}</span>}
        {list.map((t, i) => (
          <span key={t.id} className="inline-flex items-center">
            <TagBar container={container} index={i} />
            <TagChip t={t} container={container} index={i} />
          </span>
        ))}
        <TagBar container={container} index={list.length} />
      </div>
    );
  };

  // เส้นวางกลุ่ม (แสดงเฉพาะตอนลากกลุ่ม)
  const GroupSlot = ({ parent, index }: { parent: string; index: number }) =>
    dragKind === "group" ? (
      <div
        onDragOver={(e) => { if (dragRef.current?.kind !== "group") return; e.preventDefault(); e.stopPropagation(); setHint({ type: "group", parent, index }); }}
        onDrop={(e) => { if (dragRef.current?.kind !== "group") return; e.preventDefault(); e.stopPropagation(); void applyGroupDrop(); }}
        className={`h-2 rounded transition-colors ${hint?.type === "group" && hint.parent === parent && hint.index === index ? "bg-blue-500" : "bg-slate-100/0 hover:bg-blue-200"}`}
      />
    ) : null;

  const GroupHeader = ({ g, isSub }: { g: Grp; isSub?: boolean }) => (
    <div
      draggable={!busy}
      onDragStart={() => { dragRef.current = { kind: "group", id: g.id }; setDragKind("group"); }}
      onDragEnd={cleanupDrag}
      className={`group/h flex items-center gap-2 px-2 py-1.5 cursor-grab active:cursor-grabbing ${isSub ? "" : "bg-slate-50 rounded-t-lg border-b border-slate-100"}`}
    >
      <span className="text-slate-300 select-none">⠿</span>
      <span className={`${isSub ? "text-xs text-slate-500" : "text-sm font-medium text-slate-700"}`}>
        {isSub ? "↳ " : (g.icon ? g.icon + " " : "")}{g.name}
      </span>
      <button type="button" onClick={() => toggleSingle(g)} title="สลับโหมดเลือก (หลายรายการ / เลือกได้ 1)"
        className={`text-[10px] rounded px-1 border ${g.single_select ? "text-amber-600 bg-amber-50 border-amber-100" : "text-slate-400 bg-white border-slate-200"}`}>
        {g.single_select ? "เลือกได้ 1" : "หลายรายการ"}
      </button>
      <div className="flex-1" />
      <button type="button" onClick={() => renameGroup(g)} title="แก้ชื่อกลุ่ม" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover/h:opacity-100">✎</button>
      {!isSub && <button type="button" onClick={() => addGroup(g.id)} title="เพิ่มหมวดย่อย" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover/h:opacity-100">＋↳</button>}
      <button type="button" onClick={() => deleteGroup(g)} title="ลบกลุ่ม" className="text-slate-300 hover:text-red-500 opacity-0 group-hover/h:opacity-100">🗑️</button>
    </div>
  );

  const body = (
    <div className="space-y-2">
      {/* แต่ละกลุ่มหลัก */}
      {topGroups.map((g, gi) => {
        const subs = subsOf(g.id);
        return (
          <div key={g.id}>
            <GroupSlot parent={TOP} index={gi} />
            <div className="border border-slate-200 rounded-lg">
              <GroupHeader g={g} />
              <div className="p-1.5 space-y-1">
                <TagDropZone container={g.id} />
                {/* หมวดย่อย */}
                {(subs.length > 0 || dragKind === "group") && (
                  <div className="pl-3 border-l-2 border-slate-100 ml-1 space-y-1">
                    {subs.map((s, si) => (
                      <div key={s.id}>
                        <GroupSlot parent={g.id} index={si} />
                        <div className="rounded-md bg-slate-50/50">
                          <GroupHeader g={s} isSub />
                          <div className="px-1 pb-1"><TagDropZone container={s.id} /></div>
                        </div>
                      </div>
                    ))}
                    <GroupSlot parent={g.id} index={subs.length} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <GroupSlot parent={TOP} index={topGroups.length} />

      {/* ไม่มีกลุ่ม */}
      <div className="border border-dashed border-slate-200 rounded-lg">
        <div className="px-2 py-1.5 text-sm font-medium text-slate-500">ไม่มีกลุ่ม</div>
        <div className="p-1.5"><TagDropZone container={NONE} /></div>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[760px] max-w-[95vw] max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">🗂️ จัดการแท็ก (ลากเพื่อย้าย/เรียง)</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">ลากแท็กไปกลุ่มอื่น/หมวดย่อย หรือสลับตำแหน่ง • ลากหัวกลุ่มเพื่อจัดเรียง/ย้ายกลุ่ม • บันทึกอัตโนมัติ</p>
          </div>
          <div className="flex items-center gap-2">
            {busy && <span className="text-[11px] text-slate-400">กำลังบันทึก…</span>}
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
          </div>
        </div>

        {err && <div className="mx-4 mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">{err}</div>}

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div> : body}
        </div>

        <div className="flex items-center gap-2 px-3 py-3 border-t border-slate-100">
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="ชื่อแท็กใหม่…"
            onKeyDown={(e) => { if (e.key === "Enter") void addTag(); }}
            className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-md" />
          <button type="button" onClick={() => void addTag()} disabled={busy || !newTag.trim()}
            className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">+ เพิ่มแท็ก</button>
          <button type="button" onClick={() => void addGroup(null)} disabled={busy}
            className="h-9 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">+ เพิ่มกลุ่ม</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
