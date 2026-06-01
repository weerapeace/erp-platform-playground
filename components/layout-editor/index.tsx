"use client";

/**
 * LayoutEditorModal (กลุ่ม B) — จัดการ Layout ฟอร์ม: Tab → Section → จำนวน column
 *
 * - เพิ่ม/ลบ/เปลี่ยนชื่อ/เรียง Tab
 * - ในแต่ละ Tab: เพิ่ม/ลบ section (เลือกจาก group ที่มี) + ตั้งจำนวน column (1-4) + ชื่อ
 * - บันทึกลง erp_modules.config.layout
 *
 * หมายเหตุ: การกำหนดว่า field ไหนอยู่ section ไหน ทำที่ "ออกแบบหน้า" (Studio) ผ่าน group ของ field
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import type { FormLayout, FormLayoutTab } from "@/app/api/admin/field-registry-v2/route";
import { useBackdropDismiss } from "@/components/modal";

type SectionOpt = { key: string; label: string; count: number };

function uid(prefix: string) { return prefix + "_" + Math.random().toString(36).slice(2, 7); }

export function LayoutEditorModal({
  moduleKey, moduleTitle, layout, sections, onClose, onSaved,
}: {
  moduleKey: string;
  moduleTitle: string;
  layout: FormLayout;
  sections: SectionOpt[];   // group ที่มีอยู่จริง (จาก field)
  onClose: () => void;
  onSaved: () => void;
}) {
  // init จาก layout เดิม หรือสร้าง default (1 tab รวมทุก section)
  const [tabs, setTabs] = useState<FormLayoutTab[]>(() => {
    if (layout?.tabs?.length) return JSON.parse(JSON.stringify(layout.tabs));
    return [{
      key: "main", label: "ข้อมูล", icon: "📋",
      sections: sections.map((s) => ({ key: s.key, label: s.label, columns: 2 })),
    }];
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (fn: (t: FormLayoutTab[]) => FormLayoutTab[]) => setTabs((prev) => fn(JSON.parse(JSON.stringify(prev))));

  const sectionLabel = (key: string) => sections.find((s) => s.key === key)?.label ?? key;
  const usedKeys = new Set(tabs.flatMap((t) => t.sections.map((s) => s.key)));
  const freeSections = sections.filter((s) => !usedKeys.has(s.key));

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      const res = await apiFetch("/api/admin/module-layout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, layout: { tabs } }),
      });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      onSaved(); onClose();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" {...useBackdropDismiss(onClose)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">🗂️ จัด Layout ฟอร์ม</h3>
            <p className="text-xs text-slate-500 mt-0.5">{moduleTitle} — Tab → Section → จำนวน column</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {tabs.map((tab, ti) => (
            <div key={tab.key} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              {/* tab header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-400">Tab {ti + 1}</span>
                <input value={tab.label}
                  onChange={(e) => update((t) => { t[ti].label = e.target.value; return t; })}
                  className="flex-1 h-8 px-2 text-sm font-medium border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400" />
                <button onClick={() => update((t) => { if (ti > 0) [t[ti - 1], t[ti]] = [t[ti], t[ti - 1]]; return t; })}
                  disabled={ti === 0} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                <button onClick={() => update((t) => { if (ti < t.length - 1) [t[ti + 1], t[ti]] = [t[ti], t[ti + 1]]; return t; })}
                  disabled={ti === tabs.length - 1} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                <button onClick={() => update((t) => t.filter((_, i) => i !== ti))}
                  className="px-1.5 text-red-400 hover:text-red-600" title="ลบ Tab">🗑</button>
              </div>

              {/* sections in tab */}
              <div className="space-y-1.5 pl-2">
                {tab.sections.map((sec, si) => (
                  <div key={sec.key} className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1.5">
                    <span className="text-sm text-slate-700 flex-1 truncate">
                      {sectionLabel(sec.key)} <span className="text-[10px] text-slate-400">({sections.find((s) => s.key === sec.key)?.count ?? 0} field)</span>
                    </span>
                    <label className="text-xs text-slate-500">คอลัมน์</label>
                    <select value={sec.columns} onChange={(e) => update((t) => { t[ti].sections[si].columns = Number(e.target.value); return t; })}
                      className="h-7 px-1 text-xs border border-slate-200 rounded bg-white">
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button onClick={() => update((t) => { if (si > 0) [t[ti].sections[si - 1], t[ti].sections[si]] = [t[ti].sections[si], t[ti].sections[si - 1]]; return t; })}
                      disabled={si === 0} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                    <button onClick={() => update((t) => { const ss = t[ti].sections; if (si < ss.length - 1) [ss[si + 1], ss[si]] = [ss[si], ss[si + 1]]; return t; })}
                      disabled={si === tab.sections.length - 1} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                    <button onClick={() => update((t) => { t[ti].sections = t[ti].sections.filter((_, i) => i !== si); return t; })}
                      className="px-1 text-red-400 hover:text-red-600" title="เอาออก">✕</button>
                  </div>
                ))}
                {/* add section to this tab */}
                {freeSections.length > 0 && (
                  <select value="" onChange={(e) => { const k = e.target.value; if (!k) return; update((t) => { t[ti].sections.push({ key: k, label: sectionLabel(k), columns: 2 }); return t; }); }}
                    className="mt-1 h-7 px-2 text-xs border border-dashed border-slate-300 rounded bg-white text-slate-500">
                    <option value="">+ เพิ่ม section…</option>
                    {freeSections.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.count})</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}

          <button onClick={() => update((t) => [...t, { key: uid("tab"), label: "Tab ใหม่", sections: [] }])}
            className="w-full h-9 text-sm border border-dashed border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50">
            ＋ เพิ่ม Tab
          </button>

          {freeSections.length > 0 && (
            <p className="text-[11px] text-slate-400">
              section ที่ยังไม่ถูกใส่ Tab: {freeSections.map((s) => s.label).join(", ")} — จะไปอยู่ใต้ &quot;อื่นๆ&quot; ของ Tab แรกอัตโนมัติ
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            💡 อยากย้าย field ไป section ไหน ทำที่ปุ่ม &quot;ออกแบบหน้า&quot; (ตั้ง group ของ field)
          </p>

          {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-between sticky bottom-0 bg-white">
          <button onClick={() => update(() => [{ key: "main", label: "ข้อมูล", icon: "📋", sections: sections.map((s) => ({ key: s.key, label: s.label, columns: 2 })) }])}
            className="h-9 px-3 text-xs text-slate-500 hover:text-slate-700">↺ รีเซ็ตเป็นค่าเริ่มต้น</button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึก Layout"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
