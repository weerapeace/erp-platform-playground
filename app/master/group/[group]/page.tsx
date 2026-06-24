"use client";

/**
 * หน้ารวมโมดูลเป็นแท็บเดียว (Module Group) — /master/group/<ชื่อกลุ่ม>
 *
 * รวมทุกโมดูลที่ตั้ง "กลุ่ม (group_label)" ตรงกัน มาแสดงเป็นแท็บในหน้าเดียว
 * - แก้ชื่อ + ไอคอนกลุ่มได้ (✏️)
 * - เพิ่มโมดูลใหม่เข้ากลุ่มนี้ได้เลย (➕)
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShellPresentContext } from "@/components/playground-shell";
import { MasterPage } from "@/components/master-page";
import { CreateModuleWizard } from "@/components/create-module-wizard";
import { IconPicker } from "@/components/icon-picker";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type Mod = { key: string; label: string; group_label: string | null; icon: string | null };

export default function ModuleGroupPage() {
  const router = useRouter();
  const groupParam = decodeURIComponent(String(useParams().group ?? ""));
  const canManage = usePermission("products.create");
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [groupIcon, setGroupIcon] = useState<string>("🗂️");

  // แก้ไขกลุ่ม
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("🗂️");
  const [savingEdit, setSavingEdit] = useState(false);
  // เพิ่มโมดูลในกลุ่ม
  const [showWizard, setShowWizard] = useState(false);

  const loadMods = () => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      setMods(((j.data ?? []) as Mod[]).filter((m) => (m.group_label ?? "") === groupParam));
    }).catch(() => setMods([]));
  };
  useEffect(() => { loadMods(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [groupParam]);

  // ดึงไอคอนของเมนูกลุ่ม
  useEffect(() => {
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      const href = `/master/group/${encodeURIComponent(groupParam)}`;
      const row = ((j.data ?? []) as { href: string; icon: string | null }[]).find((x) => x.href === href);
      if (row?.icon) setGroupIcon(row.icon);
    }).catch(() => {});
  }, [groupParam]);

  useEffect(() => {
    if (!mods || mods.length === 0) return;
    let initial = mods[0].key;
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && mods.some((m) => m.key === t)) initial = t;
    }
    setActive(initial);
  }, [mods]);

  const selectTab = (k: string) => {
    setActive(k);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", k);
      window.history.replaceState(null, "", u.toString());
    }
  };

  const openEdit = () => { setEditName(groupParam); setEditIcon(groupIcon); setEditing(true); };
  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch("/api/admin/module-group", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old: groupParam, new: name, icon: editIcon }),
      });
      const j = await res.json();
      if (j.error) { alert(j.error); return; }
      setEditing(false);
      if (name !== groupParam) router.push(`/master/group/${encodeURIComponent(name)}`);
      else setGroupIcon(editIcon);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSavingEdit(false); }
  };

  // เพิ่มโมดูลใหม่เข้ากลุ่มนี้: สร้างเสร็จ → ตั้ง group_label = กลุ่มนี้
  const onModuleCreated = async (moduleKey: string) => {
    try {
      await apiFetch(`/api/admin/module-settings/${encodeURIComponent(moduleKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: { group_label: groupParam } }),
      });
    } catch { /* ผู้ใช้ตั้งกลุ่มเองภายหลังได้ */ }
    loadMods();
  };

  const cur = useMemo(() => mods?.find((m) => m.key === active) ?? mods?.[0], [mods, active]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showWizard && <CreateModuleWizard onClose={() => setShowWizard(false)} onCreated={onModuleCreated} />}
      <div className="bg-white border-b border-slate-200 px-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{groupIcon} {groupParam || "กลุ่มโมดูล"}</h1>
            <p className="text-sm text-slate-500 mt-0.5">รวมหลายตารางไว้ในหน้าเดียว — เลือกแท็บด้านล่าง</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {groupParam.includes("เข็มขัด") && (
              <a href="/master/belt-template" target="_blank" rel="noopener noreferrer" title="ดาวน์โหลดเทมเพลตกรอบมาตรฐานสำหรับวาดรูป ปลายหาง/รู/โลโก้"
                className="h-9 px-3 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 inline-flex items-center">🧷 เทมเพลตรูป</a>
            )}
            {canManage && (
              <>
                <button onClick={openEdit} title="แก้ชื่อ/ไอคอนกลุ่ม"
                  className="h-9 px-3 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">✏️ แก้ไขกลุ่ม</button>
                <button onClick={() => setShowWizard(true)}
                  className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">➕ เพิ่มโมดูลในกลุ่มนี้</button>
              </>
            )}
          </div>
        </div>

        {/* แก้ไขกลุ่ม (inline) */}
        {editing && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">ไอคอน</label>
              <IconPicker value={editIcon} onChange={setEditIcon} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] text-slate-500 mb-1">ชื่อกลุ่ม</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <button onClick={saveEdit} disabled={savingEdit || !editName.trim()}
              className="h-10 px-5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {savingEdit ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button onClick={() => setEditing(false)} className="h-10 px-4 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <p className="w-full text-[11px] text-slate-400">เปลี่ยนชื่อกลุ่ม = ย้ายทุกโมดูลในกลุ่มไปชื่อใหม่ + ย้ายเมนูกลุ่มอัตโนมัติ</p>
          </div>
        )}

        <div className="flex gap-1 mt-3 -mb-px overflow-x-auto">
          {(mods ?? []).map((m) => (
            <button key={m.key} onClick={() => selectTab(m.key)}
              className={`h-10 px-4 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active === m.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {m.icon ? `${m.icon} ` : ""}{m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        {mods === null ? (
          <div className="text-sm text-slate-400 py-16 text-center">กำลังโหลด…</div>
        ) : mods.length === 0 ? (
          <div className="text-sm text-slate-400 py-16 text-center">
            ยังไม่มีโมดูลในกลุ่ม “{groupParam}”<br />
            <span className="text-xs">กด “➕ เพิ่มโมดูลในกลุ่มนี้” ด้านบน หรือไปตั้งกลุ่มนี้ที่หน้าตั้งค่าโมดูล</span>
          </div>
        ) : cur ? (
          <ShellPresentContext.Provider value={true}>
            <MasterPage key={cur.key} apiPath={cur.key} moduleKey={cur.key} title={cur.label} icon={cur.icon ?? undefined} />
          </ShellPresentContext.Provider>
        ) : null}
      </div>
    </div>
  );
}
