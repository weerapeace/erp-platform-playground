"use client";

/**
 * SettingsNavLayout (ของกลาง) — หน้าตั้งค่าแบบ "เมนูซ้ายจัดหมวด"
 * เจ้าของขอ 2026-10-26: เมนูตั้งค่าเรียงยาวแถวเดียว 14 อันดูยาก → จัดเป็นหมวด + คำอธิบายสั้นใต้ชื่อ + ช่องค้นหา
 *
 * ใช้: <SettingsNavLayout groups={[{ label: "ผู้ใช้และสิทธิ์", items: [{ key: "perm", icon: "🔑", label: "สิทธิ์", desc: "ใครทำอะไรได้" }] }]}
 *        active={tab} onSelect={setTab}>{เนื้อหาของเมนูที่เลือก}</SettingsNavLayout>
 *   - ซ่อนเมนูที่ไม่มีสิทธิ์: ใส่ hidden: true (หมวดที่ว่างหายเอง)
 *   - จอใหญ่ = เมนูซ้ายติดจอ (sticky) · มือถือ = ช่องเลือกเมนู (dropdown จัดหมวด)
 *   - หัวเนื้อหา = หมวด › ชื่อเมนู + คำอธิบาย (ไม่ต้องทำหัวเองในแต่ละหน้า)
 * ห้ามใช้เมื่อ: มีแค่ 2–4 เมนู (ใช้แท็บธรรมดา/ScrollTabs พอ)
 */
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";

export type SettingsNavItem<K extends string = string> = { key: K; label: string; desc?: string; icon?: ReactNode; hidden?: boolean };
export type SettingsNavGroup<K extends string = string> = { label: string; items: SettingsNavItem<K>[] };

export function SettingsNavLayout<K extends string>({ groups, active, onSelect, children, showHeader = true }: {
  groups: SettingsNavGroup<K>[];
  active: K;
  onSelect: (key: K) => void;
  children: ReactNode;
  /** โชว์หัวเนื้อหา (หมวด › ชื่อ + คำอธิบาย) — ปิดได้ถ้าเนื้อหามีหัวของตัวเองแล้ว */
  showHeader?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const visible = useMemo(() => groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) })).filter((g) => g.items.length > 0), [groups]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => !needle ? visible : visible
    .map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.desc ?? ""} ${g.label}`.toLowerCase().includes(needle)) }))
    .filter((g) => g.items.length > 0), [visible, needle]);
  const cur = useMemo(() => {
    for (const g of visible) { const it = g.items.find((i) => i.key === active); if (it) return { group: g.label, item: it }; }
    return null;
  }, [visible, active]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
      {/* มือถือ/จอเล็ก: ช่องเลือกเมนูแบบจัดหมวด */}
      <select value={active} onChange={(e) => onSelect(e.target.value as K)} aria-label={t("เลือกหัวข้อตั้งค่า", "Choose a settings section")}
        className="lg:hidden w-full h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white">
        {visible.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </optgroup>
        ))}
      </select>

      {/* จอใหญ่: เมนูซ้ายจัดหมวด + ค้นหา */}
      <nav className="hidden lg:block w-64 shrink-0 sticky top-4 bg-white border border-slate-200 rounded-xl p-2 max-h-[calc(100vh-2rem)] overflow-y-auto" aria-label={t("เมนูตั้งค่า", "Settings menu")}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาการตั้งค่า เช่น LINE", "Search settings, e.g. LINE")}
          className="w-full h-8 px-2.5 mb-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200" />
        {shown.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">{t("ไม่พบหัวข้อนี้ ลองคำอื่น", "No matching section — try another word")}</p>}
        {shown.map((g) => (
          <div key={g.label} className="mt-2">
            <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400">{g.label}</div>
            {g.items.map((i) => {
              const on = i.key === active;
              return (
                <button key={i.key} type="button" onClick={() => onSelect(i.key)} aria-current={on ? "page" : undefined}
                  className={`w-full text-left flex gap-2 px-2 py-1.5 rounded-lg transition-colors ${on ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`}>
                  {i.icon != null && <span className="w-5 shrink-0 text-center leading-5">{i.icon}</span>}
                  <span className="min-w-0">
                    <span className={`block text-sm leading-5 ${on ? "font-semibold" : "font-medium"}`}>{i.label}</span>
                    {i.desc && <span className={`block text-[11px] leading-4 ${on ? "text-violet-600" : "text-slate-400"}`}>{i.desc}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* เนื้อหาของเมนูที่เลือก */}
      <div className="flex-1 min-w-0 w-full">
        {showHeader && cur && (
          <div className="mb-3">
            <div className="text-xs text-slate-400">{cur.group} › <span className="font-medium text-slate-600">{cur.item.label}</span></div>
            {cur.item.desc && <p className="text-sm text-slate-500">{cur.item.desc}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
