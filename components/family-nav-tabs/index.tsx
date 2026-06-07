"use client";

/**
 * FamilyNavTabs — แถบแท็บด้านบนของ Tags Manager / เทมเพลตประเภทสินค้า (ของกลาง)
 * - 2 แท็บหลัก: ใส่แท็กให้สินค้า / เทมเพลตประเภทสินค้า
 * - แท็บเพิ่มเติม (ตั้งเองได้จากเว็บ) — เก็บใน app_settings.family_nav_tabs
 * - ปุ่ม ⚙️ จัดการแท็บ (เฉพาะ admin) เลือกตารางมาเป็นแท็บได้
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePermission } from "@/components/auth";
import { SearchableSelect } from "@/components/searchable-select";
import { IconPicker } from "@/components/icon-picker";

// ทางลัดหน้าที่ใช้บ่อย (ไม่ใช่โมดูล) ให้เลือกเพิ่มเป็นแท็บได้ง่าย
const PAGE_SHORTCUTS: ExtraTab[] = [
  { label: "Tags Manager (ใส่แท็ก)", icon: "🏷️", href: "/master/tags-manager" },
  { label: "ข้อมูลตั้งต้น", icon: "🧱", href: "/master/lookups" },
];

type ExtraTab = { label: string; icon: string; href: string };

const BASE = [
  { key: "tags", label: "🏷️ ใส่แท็กให้สินค้า", href: "/master/tags-manager" },
  { key: "template", label: "🧩 เทมเพลตประเภทสินค้า", href: "/admin/family-template" },
];

export function FamilyNavTabs({ active }: { active: "tags" | "template" }) {
  const pathname = usePathname();
  const canManage = usePermission("products.create");
  const [extra, setExtra] = useState<ExtraTab[]>([]);
  const [mgr, setMgr] = useState(false);

  const load = () => {
    apiFetch("/api/admin/family-tabs").then((r) => r.json()).then((j) => setExtra((j.data ?? []) as ExtraTab[])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="bg-white border-b border-slate-200 px-4 pt-2 flex items-center gap-1.5">
      {BASE.map((t) => (
        <Link key={t.key} href={t.href}
          className={`h-10 px-5 inline-flex items-center text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            active === t.key ? "border-blue-600 text-blue-700 bg-blue-50/60" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}>
          {t.label}
        </Link>
      ))}
      {extra.map((t) => (
        <Link key={t.href} href={t.href}
          className={`h-10 px-4 inline-flex items-center gap-1 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            pathname === t.href ? "border-blue-600 text-blue-700 bg-blue-50/60" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}>
          <span>{t.icon}</span><span>{t.label}</span>
        </Link>
      ))}
      {canManage && (
        <button onClick={() => setMgr(true)} title="จัดการแท็บ — เพิ่มตารางมาเป็นแท็บ"
          className="ml-1 h-8 w-8 grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">⚙️</button>
      )}
      {mgr && <TabManager initial={extra} onClose={() => setMgr(false)} onSaved={(t) => { setExtra(t); setMgr(false); }} />}
    </div>
  );
}

// ---- Manager modal ----
function TabManager({ initial, onClose, onSaved }: { initial: ExtraTab[]; onClose: () => void; onSaved: (t: ExtraTab[]) => void }) {
  const [tabs, setTabs] = useState<ExtraTab[]>(initial);
  const [modules, setModules] = useState<{ key: string; label: string; icon: string | null }[]>([]);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  // เพิ่มลิงก์เอง
  const [cLabel, setCLabel] = useState(""); const [cHref, setCHref] = useState(""); const [cIcon, setCIcon] = useState("📋");

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      if (Array.isArray(j.data)) setModules(j.data as { key: string; label: string; icon: string | null }[]);
    }).catch(() => {});
  }, []);

  const addTab = () => {
    const m = modules.find((x) => x.key === pick);
    if (!m) return;
    const href = `/m/${m.key}`;
    if (tabs.some((t) => t.href === href)) { setPick(""); return; }
    setTabs((p) => [...p, { label: m.label, icon: m.icon ?? "📋", href }]);
    setPick("");
  };

  const addOne = (t: ExtraTab) => setTabs((p) => (p.some((x) => x.href === t.href) ? p : [...p, t]));
  const addCustom = () => {
    const label = cLabel.trim(); const href = cHref.trim();
    if (!label || !href) return;
    addOne({ label, icon: cIcon || "📋", href });
    setCLabel(""); setCHref(""); setCIcon("📋");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/family-tabs", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs }),
      });
      const j = await res.json();
      if (j.error) { alert(j.error); return; }
      onSaved(tabs);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">⚙️ จัดการแท็บ (เพิ่มตารางมาเป็นแท็บ)</h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <div className="text-[11px] text-slate-500 mb-1">เลือกตาราง/โมดูล</div>
              <SearchableSelect value={pick} onChange={setPick} placeholder="— เลือกตาราง —"
                options={modules.map((m) => ({ value: m.key, label: m.label, sub: m.key }))} />
            </div>
            <button onClick={addTab} disabled={!pick}
              className="h-9 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">+ เพิ่ม</button>
          </div>

          {/* ทางลัดหน้าใช้บ่อย */}
          <div>
            <div className="text-[11px] text-slate-500 mb-1">ทางลัด</div>
            <div className="flex flex-wrap gap-1.5">
              {PAGE_SHORTCUTS.map((s) => (
                <button key={s.href} onClick={() => addOne(s)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">{s.icon} {s.label}</button>
              ))}
            </div>
          </div>

          {/* เพิ่มลิงก์เอง */}
          <div className="rounded-lg border border-dashed border-slate-200 p-2.5">
            <div className="text-[11px] text-slate-500 mb-1">หรือใส่ลิงก์เอง (หน้าอะไรก็ได้)</div>
            <div className="flex items-end gap-2">
              <div><div className="text-[10px] text-slate-400 mb-0.5">ไอคอน</div><IconPicker value={cIcon} onChange={setCIcon} /></div>
              <div className="flex-1"><div className="text-[10px] text-slate-400 mb-0.5">ชื่อแท็บ</div>
                <input value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="เช่น เข็มขัด" className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md" /></div>
              <div className="flex-1"><div className="text-[10px] text-slate-400 mb-0.5">ลิงก์ (href)</div>
                <input value={cHref} onChange={(e) => setCHref(e.target.value)} placeholder="/master/group/..." className="w-full h-9 px-2 text-sm font-mono border border-slate-200 rounded-md" /></div>
              <button onClick={addCustom} disabled={!cLabel.trim() || !cHref.trim()}
                className="h-9 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">+ เพิ่ม</button>
            </div>
          </div>
          <div className="space-y-1">
            {tabs.length === 0 && <div className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">— ยังไม่มีแท็บเพิ่มเติม —</div>}
            {tabs.map((t, i) => (
              <div key={t.href} className="flex items-center gap-2 text-sm bg-slate-50 rounded-md px-2 py-1.5">
                <span>{t.icon}</span>
                <span className="flex-1 min-w-0 truncate">{t.label} <code className="text-[10px] text-slate-400">{t.href}</code></span>
                <button onClick={() => setTabs((p) => p.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}
