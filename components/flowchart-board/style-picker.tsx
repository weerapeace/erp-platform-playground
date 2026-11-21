"use client";

// แผงเลือกสไตล์กล่อง (ใช้ภายใน components/flowchart-board เท่านั้น) — ทะเบียนสไตล์ lib/flowchart-styles
//   ใช้ 2 ที่: แถบเหนือกล่อง (สไตล์ของกล่องที่เลือก · มีตัวเลือก "ตามกระดาน") + แถบเครื่องมือ (สไตล์ทั้งกระดาน)

import { FLOW_PALETTE } from "@/lib/flowchart";
import { FLOW_STYLE_KEYS, FLOW_STYLE_META, flowStyleBoxCss, flowStyleLook, type FlowStyleKey } from "@/lib/flowchart-styles";
import { googleFontsPreviewHref, useFontLink } from "@/components/font-select";
import { Icon } from "@/components/icon";

const STYLE_FONTS = FLOW_STYLE_KEYS.map((k) => FLOW_STYLE_META[k].font).filter((f): f is string => !!f);

/** แปลง CSS แบบ kebab → React style */
export const cssToStyle = (css: Record<string, string>): React.CSSProperties =>
  Object.fromEntries(Object.entries(css).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v])) as React.CSSProperties;

export function StylePicker({ t, value, onPick, inherit, title }: {
  t: (th: string, en: string) => string;
  /** สไตล์ตอนนี้ (null = ตามกระดาน) */
  value: FlowStyleKey | null;
  onPick: (k: FlowStyleKey | null) => void;
  /** โชว์ปุ่ม "ตามกระดาน" (สไตล์รายกล่อง) */
  inherit?: boolean;
  title: string;
}) {
  useFontLink(googleFontsPreviewHref(STYLE_FONTS));
  return (
    <div className="w-[300px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="px-1 pb-1 text-[11px] text-slate-500">{title}</div>
      <div className="grid grid-cols-3 gap-1">
        {FLOW_STYLE_KEYS.map((k) => {
          const m = FLOW_STYLE_META[k];
          const look = flowStyleLook(k, FLOW_PALETTE.slate);
          return (
            <button key={k} type="button" onClick={() => onPick(k)} title={t(m.hintTh, m.hintEn)}
              className={`flex flex-col items-center gap-1.5 rounded-lg px-1 pb-1 pt-2 text-[10.5px] text-slate-600 hover:bg-slate-50 ${value === k ? "bg-violet-50 ring-1 ring-violet-300" : ""}`}>
              <span className="flex h-7 w-[70px] items-center justify-center text-[11px]"
                style={{ ...cssToStyle(flowStyleBoxCss(look, "8px")), ...(m.font ? { fontFamily: `"${m.font}", sans-serif` } : {}), fontWeight: look.weight ?? 600 }}>
                {t("กล่อง", "Box")}
              </span>
              <span className="truncate">{t(m.th, m.en)}</span>
            </button>
          );
        })}
      </div>
      {inherit && (
        <button type="button" onClick={() => onPick(null)}
          className={`mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11px] ${value === null ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <Icon value="i:arrow-back-up" />{t("ตามสไตล์ของกระดาน", "Follow the board style")}
        </button>
      )}
    </div>
  );
}
