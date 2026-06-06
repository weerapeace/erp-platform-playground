"use client";

/**
 * จัดการกลุ่มแท็ก (Product Family Groups) — /admin/family-groups
 *
 * โครงสร้าง 2 ชั้น: กลุ่ม → กลุ่มย่อย → แท็ก
 *  - เพิ่ม/แก้/ลบ กลุ่ม และกลุ่มย่อย
 *  - ตั้ง "เลือกได้แค่ 1" (single_select) ต่อกลุ่ม/กลุ่มย่อย
 *  - จัดแท็ก (product_families) เข้ากลุ่ม/กลุ่มย่อย
 *
 * ใช้ API กลาง master-v2 (product_family_groups + product_families) — ไม่ query Supabase ตรง
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Group = { id: string; name: string; parent_group_id: string | null; single_select: boolean; sort_order: number };
type Tag = { id: string; name: string; group_id: string | null };

const GROUPS_API = "/api/master-v2/product_family_groups";
const TAGS_API = "/api/master-v2/product_families";

export default function FamilyGroupsPage() {
  const router = useRouter();
  const goBack = () => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/master/lookups"); };

  const [groups, setGroups] = useState<Group[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [activeId, setActiveId] = useState<string>("");

  // ฟอร์มแก้ไขกลุ่มที่เลือก
  const [draftName, setDraftName] = useState("");
  const [draftParent, setDraftParent] = useState<string>("");   // "" = กลุ่มหลัก
  const [draftSingle, setDraftSingle] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [g, t] = await Promise.all([
        apiFetch(`${GROUPS_API}?limit=500`).then(r => r.json()),
        apiFetch(`${TAGS_API}?limit=500`).then(r => r.json()),
      ]);
      setGroups(((g.data ?? []) as Record<string, unknown>[]).map(r => ({
        id: String(r.id), name: String(r.name ?? ""), parent_group_id: r.parent_group_id ? String(r.parent_group_id) : null,
        single_select: r.single_select === true, sort_order: Number(r.sort_order ?? 100),
      })));
      setTags(((t.data ?? []) as Record<string, unknown>[]).map(r => ({
        id: String(r.id), name: String(r.name ?? ""), group_id: r.group_id ? String(r.group_id) : null,
      })));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  // กลุ่มหลัก + กลุ่มย่อยของแต่ละกลุ่ม
  const tops = useMemo(() => groups.filter(g => !g.parent_group_id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th")), [groups]);
  const subsOf = (id: string) => groups.filter(g => g.parent_group_id === id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th"));
  const groupById = (id: string | null) => (id ? groups.find(g => g.id === id) : undefined);
  const tagCount = (gid: string) => tags.filter(t => t.group_id === gid).length;

  // เลือกกลุ่ม → เติมฟอร์ม
  const selectGroup = (g: Group) => {
    setActiveId(g.id); setDraftName(g.name); setDraftParent(g.parent_group_id ?? ""); setDraftSingle(g.single_select); setMsg("");
  };

  const addGroup = async (parentId: string | null) => {
    const name = window.prompt(parentId ? "ชื่อกลุ่มย่อยใหม่:" : "ชื่อกลุ่มหลักใหม่:", "");
    if (!name || !name.trim()) return;
    try {
      const res = await apiFetch(GROUPS_API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parent_group_id: parentId, single_select: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setMsg("❌ เพิ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      await load();
      const newId = (j.data as { id?: string } | undefined)?.id;
      if (newId) { const ng = groups.find(x => x.id === newId); if (ng) selectGroup(ng); else setActiveId(newId); }
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "network")); }
  };

  const saveGroup = async () => {
    if (!activeId || !draftName.trim()) return;
    // กันเลือกตัวเองเป็นกลุ่มแม่ + กันลึกเกิน 2 ชั้น (กลุ่มย่อยห้ามมีลูก)
    if (draftParent === activeId) { setMsg("❌ เลือกตัวเองเป็นกลุ่มแม่ไม่ได้"); return; }
    setSaving(true); setMsg("");
    try {
      const res = await apiFetch(`${GROUPS_API}/${activeId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim(), parent_group_id: draftParent || null, single_select: draftSingle }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setMsg("❌ บันทึกไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setMsg("✅ บันทึกแล้ว"); await load();
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "network")); }
    finally { setSaving(false); }
  };

  const delGroup = async (g: Group) => {
    const n = tagCount(g.id), subs = subsOf(g.id).length;
    if (!confirm(`ลบกลุ่ม "${g.name}"?\n${subs ? `มีกลุ่มย่อย ${subs} กลุ่ม (จะกลายเป็นกลุ่มหลัก)\n` : ""}${n ? `มีแท็ก ${n} อันในกลุ่มนี้ (แท็กจะกลายเป็น "ไม่มีกลุ่ม")` : ""}`)) return;
    try {
      const res = await apiFetch(`${GROUPS_API}/${g.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setMsg("❌ ลบไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      if (activeId === g.id) setActiveId("");
      await load();
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "network")); }
  };

  // เปลี่ยนกลุ่มของแท็ก
  const setTagGroup = async (tagId: string, groupId: string) => {
    setTags(p => p.map(t => t.id === tagId ? { ...t, group_id: groupId || null } : t));   // optimistic
    try {
      await apiFetch(`${TAGS_API}/${tagId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId || null }),
      });
    } catch { void load(); }
  };

  // ตัวเลือกกลุ่มสำหรับ dropdown (กลุ่มหลัก + กลุ่มย่อยเยื้อง)
  const groupOptions = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const top of tops) {
      out.push({ id: top.id, label: top.name });
      for (const sub of subsOf(top.id)) out.push({ id: sub.id, label: `  ↳ ${sub.name}` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const active = groupById(activeId);

  if (loading) return <div className="p-6 text-sm text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={goBack} title="กลับ" className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
            <h1 className="text-xl font-bold text-slate-900">🗂️ จัดการกลุ่มแท็ก</h1>
          </div>
          <button onClick={goBack} className="h-8 px-3 text-sm flex items-center gap-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">✕ ปิด</button>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">จัดกลุ่มให้แท็ก (กลุ่ม → กลุ่มย่อย → แท็ก) และตั้งกลุ่มที่ "เลือกได้แค่ 1"</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-6xl mx-auto">
        {/* ซ้าย: ต้นไม้กลุ่ม */}
        <div className="w-full lg:w-72 shrink-0">
          <button onClick={() => addGroup(null)}
            className="w-full h-9 px-3 mb-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">＋ เพิ่มกลุ่มหลัก</button>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {tops.length === 0 ? (
              <div className="p-3 text-xs text-slate-400">ยังไม่มีกลุ่ม — กด “เพิ่มกลุ่มหลัก”</div>
            ) : tops.map(top => (
              <div key={top.id} className="border-b border-slate-100 last:border-0">
                <div className={`group flex items-center ${activeId === top.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <button onClick={() => selectGroup(top)} className={`flex-1 text-left px-3 py-2 text-sm ${activeId === top.id ? "text-blue-700 font-medium" : "text-slate-700"}`}>
                    {top.name}
                    {top.single_select && <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">เลือก 1</span>}
                    <span className="ml-1.5 text-[10px] text-slate-400">({tagCount(top.id)})</span>
                  </button>
                  <button onClick={() => addGroup(top.id)} title="เพิ่มกลุ่มย่อย" className="px-1.5 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100">＋</button>
                  <button onClick={() => delGroup(top)} title="ลบกลุ่ม" className="px-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
                </div>
                {subsOf(top.id).map(sub => (
                  <div key={sub.id} className={`group flex items-center pl-4 ${activeId === sub.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <button onClick={() => selectGroup(sub)} className={`flex-1 text-left px-3 py-1.5 text-sm ${activeId === sub.id ? "text-blue-700 font-medium" : "text-slate-600"}`}>
                      <span className="text-slate-300 mr-1">↳</span>{sub.name}
                      {sub.single_select && <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">เลือก 1</span>}
                      <span className="ml-1.5 text-[10px] text-slate-400">({tagCount(sub.id)})</span>
                    </button>
                    <button onClick={() => delGroup(sub)} title="ลบกลุ่มย่อย" className="px-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ขวา: แก้ไขกลุ่มที่เลือก + จัดแท็ก */}
        <div className="flex-1 min-w-0 space-y-4">
          {!active ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-400">เลือกกลุ่มทางซ้าย หรือกด “เพิ่มกลุ่มหลัก”</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">แก้ไขกลุ่ม</h2>
                <div className="flex items-center gap-2">
                  {msg && <span className="text-xs">{msg}</span>}
                  <button onClick={saveGroup} disabled={saving} className="h-8 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
                </div>
              </div>
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อกลุ่ม</label>
                  <input value={draftName} onChange={e => setDraftName(e.target.value)} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">เป็นกลุ่มย่อยของ</label>
                  <select value={draftParent} onChange={e => setDraftParent(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                    <option value="">— เป็นกลุ่มหลัก —</option>
                    {tops.filter(t => t.id !== activeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={draftSingle} onChange={e => setDraftSingle(e.target.checked)} className="rounded border-slate-300" />
                  เลือกได้แค่ 1 แท็กในกลุ่มนี้ (กันสูตรทับกัน)
                </label>
              </div>
            </div>
          )}

          {/* จัดแท็กเข้ากลุ่ม */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">จัดแท็กเข้ากลุ่ม ({tags.length})</h2>
            {tags.length === 0 ? (
              <div className="text-xs text-slate-400">ยังไม่มีแท็ก</div>
            ) : (
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {tags.slice().sort((a, b) => a.name.localeCompare(b.name, "th")).map(t => (
                  <div key={t.id} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                    <span className="flex-1 text-sm text-slate-700 truncate">{t.name}</span>
                    <select value={t.group_id ?? ""} onChange={e => setTagGroup(t.id, e.target.value)}
                      className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white w-56">
                      <option value="">— ไม่มีกลุ่ม —</option>
                      {groupOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
