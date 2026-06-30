"use client";

/**
 * ศูนย์ตั้งค่าประเภทสินค้า (Product Families) — /admin/product-families
 *   - กลุ่ม:   จัดการกลุ่ม/กลุ่มย่อย (popup ฟอร์ม: สี/ไอคอน/จัดลำดับ/เลือกได้แค่ 1) + จัดแท็กเข้ากลุ่ม + เพิ่มแท็ก (popup)
 *   - แท็ก:    เพิ่ม/แก้/ลบ แท็ก + จัดเข้ากลุ่ม
 *   - เทมเพลต: ตั้งค่าฟิลด์/ค่าตั้งต้น ต่อแท็ก (Parent SKU / SKU)  ← ฝังหน้า family-template
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PermissionGate, AccessDenied } from "@/components/auth";
import { FamilyTemplateView } from "@/app/admin/family-template/view";

type Group = { id: string; name: string; parent_group_id: string | null; single_select: boolean; sort_order: number; color: string | null; icon: string | null };
type Tag = { id: string; name: string; group_id: string | null };

const GROUPS_API = "/api/master-v2/product_family_groups";
const TAGS_API = "/api/master-v2/product_families";
const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b"];
const ICONS = ["👜", "🎒", "🛍️", "👕", "👖", "👗", "👚", "🧥", "👟", "👠", "👢", "💍", "⌚", "🧣", "🧢", "🧤", "🪡", "🧵", "🔖", "🏷️", "📦", "💄", "🕶️", "👒", "🎀", "💎", "🧶", "🔩", "⚙️", "🧰"];

// เปิดได้เฉพาะผู้ดูแลระบบ (หน้า admin orphan ไม่ผูกแอป)
export default function ProductFamiliesHub() {
  return <PermissionGate perm="admin.users" fallback={<AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />}><ProductFamiliesHubInner /></PermissionGate>;
}

function ProductFamiliesHubInner() {
  const router = useRouter();
  const goBack = () => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/master/lookups"); };
  const [tab, setTab] = useState<"groups" | "tags" | "template">("groups");

  const [groups, setGroups] = useState<Group[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [g, t] = await Promise.all([
      apiFetch(`${GROUPS_API}?limit=500`).then((r) => r.json()),
      apiFetch(`${TAGS_API}?limit=500`).then((r) => r.json()),
    ]);
    setGroups(((g.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), name: String(r.name ?? ""), parent_group_id: r.parent_group_id ? String(r.parent_group_id) : null,
      single_select: r.single_select === true, sort_order: Number(r.sort_order ?? 100),
      color: r.color ? String(r.color) : null, icon: r.icon ? String(r.icon) : null,
    })));
    setTags(((t.data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), group_id: r.group_id ? String(r.group_id) : null })));
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const patchGroup = (id: string, body: Record<string, unknown>) =>
    apiFetch(`${GROUPS_API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  if (loading) return <div className="p-6 text-sm text-slate-500">กำลังโหลด…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={goBack} title="กลับ" className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
            <h1 className="text-xl font-bold text-slate-900">🧱 ตั้งค่าประเภทสินค้า</h1>
          </div>
          <button onClick={goBack} className="h-8 px-3 text-sm rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">✕ ปิด</button>
        </div>
        <div className="flex gap-1 mt-3 -mb-px">
          {([["groups", "🗂️ กลุ่ม"], ["tags", "🏷️ แท็ก"], ["template", "🧩 เทมเพลต"]] as [typeof tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`h-9 px-4 text-sm border-b-2 transition-colors ${tab === k ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        {msg && <div className="mb-2 text-xs">{msg}</div>}
        {tab === "groups" && <GroupsTab groups={groups} tags={tags} reload={load} patchGroup={patchGroup} setMsg={setMsg} />}
        {tab === "tags" && <TagsTab groups={groups} tags={tags} reload={load} setMsg={setMsg} />}
        {tab === "template" && <FamilyTemplateView embedded />}
      </div>
    </div>
  );
}

// ───────────────────────── helpers ─────────────────────────
const byOrder = (a: Group, b: Group) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th");

function groupOptions(groups: Group[]) {
  const tops = groups.filter((g) => !g.parent_group_id).sort(byOrder);
  const out: { id: string; label: string }[] = [];
  for (const top of tops) {
    out.push({ id: top.id, label: `${top.icon ? top.icon + " " : ""}${top.name}` });
    for (const sub of groups.filter((g) => g.parent_group_id === top.id).sort(byOrder))
      out.push({ id: sub.id, label: `   ↳ ${sub.icon ? sub.icon + " " : ""}${sub.name}` });
  }
  return out;
}

// ───────────────────────── popup: ฟอร์มกลุ่ม (สร้าง/แก้ไข) ─────────────────────────
function GroupFormModal({ mode, parentId, group, groups, onClose, onSaved, setMsg }: {
  mode: "create" | "edit"; parentId?: string | null; group?: Group; groups: Group[];
  onClose: () => void; onSaved: () => void | Promise<void>; setMsg: (s: string) => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [parent, setParent] = useState<string>(group?.parent_group_id ?? parentId ?? "");
  const [single, setSingle] = useState(group?.single_select ?? false);
  const [color, setColor] = useState<string>(group?.color ?? "");
  const [icon, setIcon] = useState<string>(group?.icon ?? "");
  const [saving, setSaving] = useState(false);
  const tops = groups.filter((g) => !g.parent_group_id && g.id !== group?.id);

  const save = async () => {
    if (!name.trim()) return;
    if (mode === "edit" && group && parent === group.id) { setMsg("❌ เลือกตัวเองเป็นกลุ่มแม่ไม่ได้"); return; }
    setSaving(true);
    const body: Record<string, unknown> = { name: name.trim(), parent_group_id: parent || null, single_select: single, color: color || null, icon: icon || null };
    let res: Response;
    if (mode === "edit" && group) {
      res = await apiFetch(`${GROUPS_API}/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      const sibs = groups.filter((g) => (g.parent_group_id ?? null) === (parent || null));
      res = await apiFetch(GROUPS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, sort_order: sibs.length * 10 }) });
    }
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || j.error) { setMsg("❌ บันทึกไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    setMsg("✅ บันทึกแล้ว"); await onSaved();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[460px] max-w-[94vw] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{mode === "edit" ? "แก้ไขกลุ่ม" : parentId ? "เพิ่มกลุ่มย่อย" : "เพิ่มกลุ่มหลัก"}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">ชื่อกลุ่ม</label>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">เป็นกลุ่มย่อยของ</label>
            <select value={parent} onChange={(e) => setParent(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
              <option value="">— เป็นกลุ่มหลัก —</option>
              {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">สีกลุ่ม</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              <button type="button" onClick={() => setColor("")} title="ไม่มีสี" className={`w-6 h-6 rounded-full border bg-white text-slate-300 text-xs ${!color ? "ring-2 ring-blue-400" : "border-slate-300"}`}>✕</button>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`w-6 h-6 rounded-full border border-black/10 ${color === c ? "ring-2 ring-offset-1 ring-blue-500" : ""}`} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ไอคอน</label>
            <div className="flex flex-wrap gap-1 mb-2">
              <button type="button" onClick={() => setIcon("")} title="ไม่มีไอคอน" className={`w-8 h-8 rounded-md border text-slate-300 ${!icon ? "ring-2 ring-blue-400 border-blue-300" : "border-slate-200"}`}>✕</button>
              {ICONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setIcon(ic)} className={`w-8 h-8 rounded-md border text-lg leading-none hover:bg-slate-50 ${icon === ic ? "ring-2 ring-blue-500 border-blue-300 bg-blue-50" : "border-slate-200"}`}>{ic}</button>
              ))}
            </div>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="หรือพิมพ์/วางอีโมจิเอง" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} className="rounded border-slate-300" />
            เลือกได้แค่ 1 แท็กในกลุ่มนี้ (กันสูตรทับกัน)
          </label>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="h-9 px-5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── popup: เพิ่มแท็ก (+ เลือกกลุ่ม) ─────────────────────────
function TagFormModal({ groups, onClose, onSaved, setMsg }: {
  groups: Group[]; onClose: () => void; onSaved: () => void | Promise<void>; setMsg: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [gid, setGid] = useState("");
  const [saving, setSaving] = useState(false);
  const opts = groupOptions(groups);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await apiFetch(TAGS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), group_id: gid || null }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || j.error) { setMsg("❌ เพิ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    await onSaved();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">＋ เพิ่มแท็กใหม่</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">ชื่อแท็ก</label>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">หมวดหมู่ (กลุ่ม)</label>
            <select value={gid} onChange={(e) => setGid(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
              <option value="">— ไม่มีกลุ่ม —</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select></div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="h-9 px-5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังเพิ่ม…" : "เพิ่มแท็ก"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── แท็บ: กลุ่ม ─────────────────────────
function GroupsTab({ groups, tags, reload, patchGroup, setMsg }: {
  groups: Group[]; tags: Tag[]; reload: () => Promise<void>;
  patchGroup: (id: string, body: Record<string, unknown>) => Promise<Response>; setMsg: (s: string) => void;
}) {
  const [groupModal, setGroupModal] = useState<{ mode: "create" | "edit"; parentId?: string | null; group?: Group } | null>(null);
  const [tagModal, setTagModal] = useState(false);

  const tops = useMemo(() => groups.filter((g) => !g.parent_group_id).sort(byOrder), [groups]);
  const subsOf = (id: string) => groups.filter((g) => g.parent_group_id === id).sort(byOrder);
  const tagCount = (gid: string) => tags.filter((t) => t.group_id === gid).length;

  const del = async (g: Group) => {
    const n = tagCount(g.id), subs = subsOf(g.id).length;
    if (!confirm(`ลบกลุ่ม "${g.name}"?\n${subs ? `มีกลุ่มย่อย ${subs} กลุ่ม (จะกลายเป็นกลุ่มหลัก)\n` : ""}${n ? `มีแท็ก ${n} อัน (จะกลายเป็น "ไม่มีกลุ่ม")` : ""}`)) return;
    const res = await apiFetch(`${GROUPS_API}/${g.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) { setMsg("❌ ลบไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    await reload();
  };

  const reorder = async (g: Group, dir: -1 | 1) => {
    const sibs = groups.filter((x) => (x.parent_group_id ?? null) === (g.parent_group_id ?? null)).sort(byOrder);
    const i = sibs.findIndex((x) => x.id === g.id); const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const arr = [...sibs]; [arr[i], arr[j]] = [arr[j], arr[i]];
    await Promise.all(arr.map((x, idx) => (x.sort_order !== idx * 10 ? patchGroup(x.id, { sort_order: idx * 10 }) : null)).filter(Boolean) as Promise<Response>[]);
    await reload();
  };

  const setTagGroup = async (tagId: string, groupId: string) => {
    await apiFetch(`${TAGS_API}/${tagId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: groupId || null }) });
    await reload();
  };

  const opts = groupOptions(groups);
  const ungrouped = tags.filter((t) => !t.group_id || !groups.some((g) => g.id === t.group_id));

  const GroupRow = (g: Group, isSub: boolean) => (
    <div key={g.id} className={`group flex items-center ${isSub ? "pl-4" : ""} hover:bg-slate-50`}>
      <button onClick={() => setGroupModal({ mode: "edit", group: g })} className={`flex-1 text-left px-2 py-1.5 text-sm flex items-center gap-1.5 min-w-0 ${isSub ? "text-slate-600" : "text-slate-700"}`}>
        {isSub && <span className="text-slate-300">↳</span>}
        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/5" style={{ backgroundColor: g.color ?? "#cbd5e1" }} />
        {g.icon && <span>{g.icon}</span>}
        <span className="truncate">{g.name}</span>
        {g.single_select && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">เลือก 1</span>}
        <span className="text-[10px] text-slate-400">({tagCount(g.id)})</span>
      </button>
      <button onClick={() => reorder(g, -1)} title="เลื่อนขึ้น" className="px-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100">▲</button>
      <button onClick={() => reorder(g, 1)} title="เลื่อนลง" className="px-1 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100">▼</button>
      {!isSub && <button onClick={() => setGroupModal({ mode: "create", parentId: g.id })} title="เพิ่มกลุ่มย่อย" className="px-1 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100">＋</button>}
      <button onClick={() => del(g)} title="ลบ" className="px-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* ซ้าย: ต้นไม้กลุ่ม */}
      <div className="w-full lg:w-72 shrink-0">
        <button onClick={() => setGroupModal({ mode: "create", parentId: null })} className="w-full h-9 px-3 mb-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">＋ เพิ่มกลุ่มหลัก</button>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {tops.length === 0 ? <div className="p-3 text-xs text-slate-400">ยังไม่มีกลุ่ม</div> : tops.map((top) => (
            <div key={top.id} className="border-b border-slate-100 last:border-0">
              {GroupRow(top, false)}
              {subsOf(top.id).map((sub) => GroupRow(sub, true))}
            </div>
          ))}
        </div>
      </div>

      {/* ขวา: จัดแท็กเข้ากลุ่ม */}
      <div className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">จัดแท็กเข้ากลุ่ม ({tags.length})</h2>
            <button onClick={() => setTagModal(true)} className="h-8 px-3 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100">＋ เพิ่มแท็ก</button>
          </div>
          <div className="space-y-3 max-h-[460px] overflow-y-auto">
            {[...groups].sort(byOrder).filter((g) => tagCount(g.id) > 0).map((g) => (
              <div key={g.id}>
                <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: g.color ?? "#cbd5e1" }} />
                  {g.icon && <span>{g.icon}</span>}{g.parent_group_id && <span className="text-slate-300">↳ </span>}{g.name}
                </div>
                {tags.filter((t) => t.group_id === g.id).sort((a, b) => a.name.localeCompare(b.name, "th")).map((t) => TagAssignRow(t, opts, setTagGroup))}
              </div>
            ))}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-1">— ไม่มีกลุ่ม ({ungrouped.length}) —</div>
              {ungrouped.sort((a, b) => a.name.localeCompare(b.name, "th")).map((t) => TagAssignRow(t, opts, setTagGroup))}
            </div>
          </div>
        </div>
      </div>

      {groupModal && (
        <GroupFormModal mode={groupModal.mode} parentId={groupModal.parentId} group={groupModal.group} groups={groups} setMsg={setMsg}
          onClose={() => setGroupModal(null)} onSaved={async () => { await reload(); setGroupModal(null); }} />
      )}
      {tagModal && (
        <TagFormModal groups={groups} setMsg={setMsg} onClose={() => setTagModal(false)} onSaved={async () => { await reload(); setTagModal(false); }} />
      )}
    </div>
  );
}

function TagAssignRow(t: Tag, opts: { id: string; label: string }[], setTagGroup: (tagId: string, groupId: string) => void) {
  return (
    <div key={t.id} className="flex items-center gap-2 py-1 pl-3 border-b border-slate-50 last:border-0">
      <span className="flex-1 text-sm text-slate-700 truncate">{t.name}</span>
      <select value={t.group_id ?? ""} onChange={(e) => setTagGroup(t.id, e.target.value)} className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white w-56">
        <option value="">— ไม่มีกลุ่ม —</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ───────────────────────── แท็บ: แท็ก ─────────────────────────
function TagsTab({ groups, tags, reload, setMsg }: { groups: Group[]; tags: Tag[]; reload: () => Promise<void>; setMsg: (s: string) => void }) {
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const opts = groupOptions(groups);

  const add = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    const res = await apiFetch(TAGS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || j.error) { setMsg("❌ เพิ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    setNewName(""); await reload();
  };
  const rename = async (id: string, name: string) => {
    if (!name.trim()) return;
    const res = await apiFetch(`${TAGS_API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg("❌ แก้ชื่อไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    await reload();
  };
  const del = async (id: string, label: string) => {
    if (!confirm(`ลบแท็ก "${label}" ?`)) return;
    const res = await apiFetch(`${TAGS_API}/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg("❌ ลบไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    await reload();
  };
  const setTagGroup = async (id: string, gid: string) => {
    await apiFetch(`${TAGS_API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: gid || null }) });
    await reload();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex gap-2 mb-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="ชื่อแท็กใหม่…"
          className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-md" />
        <button onClick={add} disabled={busy || !newName.trim()} className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">+ เพิ่มแท็ก</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-slate-400 border-b border-slate-100"><th className="text-left font-normal px-3 py-2">ชื่อแท็ก</th><th className="text-left font-normal px-3 py-2 w-60">กลุ่ม</th><th className="w-10" /></tr></thead>
          <tbody>
            {tags.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-300">ยังไม่มีแท็ก</td></tr>}
            {[...tags].sort((a, b) => a.name.localeCompare(b.name, "th")).map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-1.5">
                  <input value={draft[t.id] ?? t.name} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.name) rename(t.id, e.target.value); }}
                    className="w-full h-7 px-2 text-sm border border-transparent hover:border-slate-200 focus:border-blue-300 rounded" />
                </td>
                <td className="px-3 py-1.5">
                  <select value={t.group_id ?? ""} onChange={(e) => setTagGroup(t.id, e.target.value)} className="w-full h-7 px-1.5 text-xs border border-slate-200 rounded bg-white">
                    <option value="">— ไม่มีกลุ่ม —</option>
                    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 text-center"><button onClick={() => del(t.id, t.name)} className="text-slate-300 hover:text-red-500">🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
