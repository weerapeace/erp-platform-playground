"use client";

/**
 * 🧭 เมนู 2 ชั้นของหน้าเว็บไซต์ (/website/[shop]) — เจ้าของเลือก 2026-11-10 "แบบ A 2 ชั้น + ไอคอนเส้นมีสี"
 *   ชั้นบน = กลุ่ม (WEBSITE_GROUPS ตัวเดียวกับสิทธิ์) · ชั้นล่าง = แท็บย่อยของกลุ่มที่เลือก (กลุ่มที่มีแท็บเดียว = ไม่มีชั้นล่าง)
 *   ชื่อ/ไอคอน/สี = lib/website-access (WEBSITE_GROUP_STYLE · WEBSITE_TAB_META) · ไอคอนเส้นกลาง <Icon value="i:…">
 *   กดกลุ่ม = ไปแท็บย่อยล่าสุดของกลุ่มนั้น (lastTabOf) หรือแท็บแรก · ใช้เฉพาะหน้าเว็บไซต์
 */
import { Icon } from "@/components/icon";
import { WEBSITE_GROUPS, WEBSITE_GROUP_STYLE, WEBSITE_TAB_META, websiteGroupOfTab, type WebsiteGroup } from "@/lib/website-access";

export function WebsiteManagerMenu<T extends string>({ tab, onGo, canSee, viewOnly, lastTabOf }: {
  tab: T;
  onGo: (k: T) => void;
  /** แท็บนี้ดูได้ไหม (ไม่มีสิทธิ์ = ไม่โชว์) */
  canSee: (k: T) => boolean;
  /** แท็บนี้ดูได้อย่างเดียว (โชว์ไอคอนตา) */
  viewOnly?: (k: T) => boolean;
  lastTabOf?: Partial<Record<WebsiteGroup, T>>;
}) {
  const groups = WEBSITE_GROUPS
    .map((g) => ({ ...g, visible: (g.tabs as T[]).filter(canSee) }))
    .filter((g) => g.visible.length > 0);
  const curKey = websiteGroupOfTab(tab);
  const cur = groups.find((g) => g.key === curKey) ?? groups[0];
  const eye = <Icon value="i:eye" size={13} className="text-slate-400" title="ดูได้อย่างเดียว" />;
  return (
    <nav className="mb-4" aria-label="เมนูเว็บไซต์">
      <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-200">
        {groups.map((g) => {
          const st = WEBSITE_GROUP_STYLE[g.key];
          const on = g.key === cur?.key;
          const last = lastTabOf?.[g.key];
          const target = last && g.visible.includes(last) ? last : g.visible[0];
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onGo(target)}
              title={g.hint}
              aria-current={on ? "true" : undefined}
              className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition ${
                on ? "border-slate-300 bg-white text-slate-900 font-medium shadow-sm" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className="inline-flex" style={{ color: st.color }}><Icon value={`i:${st.icon}`} size={19} /></span>
              {g.label}
              {viewOnly && g.visible.every((k) => viewOnly(k)) && eye}
            </button>
          );
        })}
      </div>
      {cur && cur.visible.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 pt-2">
          {cur.visible.map((k) => {
            const m = WEBSITE_TAB_META[k];
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onGo(k)}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition ${
                  on ? "border-slate-300 bg-slate-50 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span className="inline-flex" style={{ color: WEBSITE_GROUP_STYLE[cur.key].color }}><Icon value={`i:${m?.icon ?? "file"}`} size={16} /></span>
                {m?.label ?? k}
                {viewOnly?.(k) && eye}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
