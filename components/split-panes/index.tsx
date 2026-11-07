"use client";

/**
 * ↔ SplitPanes — กล่องแบ่งซ้าย-ขวา "กดฝั่งไหน ฝั่งนั้นขยาย ดันอีกฝั่งให้แคบลง" (ของกลาง)
 *   เจ้าของขอ 2026-11-07 (ใบงานออกแบบ แท็บข้อมูลงาน: ข้อมูลซ้าย · กล่องรายละเอียดงานขวา) — ดู widget แล้วเลือก "แบบดัน"
 *
 * การทำงาน
 *   • เริ่มครึ่ง-ครึ่ง · กดตรงไหนก็ได้ในกล่อง → กล่องนั้นขยาย (ตั้งต้น 2 ส่วน : 1 ส่วน) · ปุ่ม "คืนครึ่ง-ครึ่ง" / กดเส้นกลาง = กลับครึ่ง-ครึ่ง
 *   • 2 แบบ (สลับได้มุมขวาบน · จำต่อคน): "ดัน" = อีกฝั่งแคบลงแต่ยังเห็นเนื้อหา · "พับ" = อีกฝั่งเหลือแถบแคบ (กดแถบเพื่อสลับ)
 *   • ที่แคบ (กล่องแม่ < minSplitWidth เช่น มือถือ/ป๊อปไม่ขยาย) = เรียงบน-ล่างเหมือนเดิม ไม่มีดัน
 *   • จำ "ฝั่งที่ขยาย + แบบ" ต่อคนใน user_ui_prefs (prefKey) — หน่วงบันทึก 0.6 วิ กดสลับรัว ๆ ไม่ยิงทุกครั้ง
 *   • ขยายตอน click (ไม่ใช่ตอนกดลง) → ปุ่ม/ช่องที่กดในกล่องแคบยังทำงานก่อน แล้วค่อยขยาย (กันกดพลาดเพราะของเลื่อน)
 *   • เนื้อหาไม่ถูกถอดตอนพับ (ซ่อนไว้) → ช่องพิมพ์/ตัวแก้ข้อความไม่หายกลางคัน
 *
 * ใช้:
 *   <SplitPanes prefKey="ds_info_split"
 *     left={{ title: "ข้อมูลงาน", icon: "doc", content: (size) => <Fields cols={size === "wide" ? 3 : size === "half" ? 2 : 1} /> }}
 *     right={{ title: "รายละเอียดงาน", icon: "note", content: <Detail /> }} />
 *   content เป็น ReactNode หรือฟังก์ชันรับ size ("half" | "wide" | "narrow" | "rail" | "stack") เพื่อจัดคอลัมน์ตามความกว้าง
 * คู่มือ: docs/split-panes.md · ตัวอย่าง: app/_demos/split-panes-preview
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useUserPref } from "@/lib/use-user-pref";
import { parseSplitState, splitFlexOf, splitSizeOf, type SplitMode, type SplitSide, type SplitSize, type SplitState } from "@/lib/split-panes";

export type { SplitMode, SplitSide, SplitSize, SplitState };
export type SplitPaneDef = { title: string; icon?: string; content: ReactNode | ((size: SplitSize) => ReactNode) };

export function SplitPanes({ left, right, prefKey, defaultMode = "push", minSplitWidth = 720, ratio = 2, className = "" }: {
  left: SplitPaneDef;
  right: SplitPaneDef;
  /** key จำต่อคน (user_ui_prefs) เช่น "ds_info_split" — แต่ละหน้าใช้ key ของตัวเอง */
  prefKey: string;
  defaultMode?: SplitMode;
  /** กล่องแม่กว้างน้อยกว่านี้ (px) = เรียงบน-ล่าง */
  minSplitWidth?: number;
  /** ฝั่งที่ขยายกว้างกี่เท่าของอีกฝั่ง (แบบดัน) */
  ratio?: number;
  className?: string;
}) {
  const t = useT();
  const [saved, save] = useUserPref<SplitState>(prefKey, { focus: null, mode: defaultMode }, parseSplitState);
  const [st, setSt] = useState<SplitState>(saved);
  useEffect(() => { setSt(saved); }, [saved.focus, saved.mode]);   // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const update = (next: SplitState) => {
    setSt(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 600);
  };

  // ความกว้างกล่องแม่ → แบ่งซ้ายขวาได้ไหม
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const split = w >= minSplitWidth;

  const pane = (side: SplitSide, def: SplitPaneDef) => {
    const size = splitSizeOf(side, st, split);
    const body = typeof def.content === "function" ? def.content(size) : def.content;
    if (size === "stack") return <div className="min-w-0">{body}</div>;
    const style = { flex: splitFlexOf(size, ratio), minWidth: 0, transition: "flex-grow .3s ease, flex-basis .3s ease" };
    const grow = () => { if (st.focus !== side) update({ ...st, focus: side }); };
    if (size === "rail") {
      return (
        <div style={style} className="relative">
          <button type="button" onClick={grow} title={t(`ขยาย "${def.title}"`, `Expand "${def.title}"`)}
            className="absolute inset-0 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 flex flex-col items-center gap-2 pt-3 text-slate-500">
            {def.icon && <Icon name={def.icon} />}
            <span className="text-xs font-medium" style={{ writingMode: "vertical-rl" }}>{def.title}</span>
          </button>
          <div className="hidden">{body}</div>
        </div>
      );
    }
    return (
      <section style={style} onClick={size === "wide" ? undefined : grow} data-split-size={size}
        className={`rounded-xl border p-3 transition-colors ${size === "wide" ? "border-blue-200" : "split-grow border-slate-200 cursor-pointer hover:border-blue-200"}`}>
        <header className="flex items-center gap-1.5 mb-2 min-h-[26px]">
          {def.icon && <Icon name={def.icon} className="text-slate-400" />}
          <span className="text-sm font-medium text-slate-700 truncate">{def.title}</span>
          <span className="flex-1" />
          {size === "wide" ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); update({ ...st, focus: null }); }}
              className="h-6 px-2 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 shrink-0">{t("คืนครึ่ง-ครึ่ง", "Back to half")}</button>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); grow(); }}
              className="h-6 px-2 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-600 shrink-0">{t("ขยาย", "Expand")}</button>
          )}
        </header>
        {body}
      </section>
    );
  };

  return (
    <div ref={boxRef} className={className}>
      {split && (
        <div className="flex items-center justify-end gap-2 mb-1.5 text-[11px] text-slate-400">
          <span className="hidden sm:inline">{t("กดกล่องไหน กล่องนั้นขยาย", "Click a box to expand it")}</span>
          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={t("แบบขยาย", "Expand style")}>
            {([["push", t("ดัน", "Push")], ["fold", t("พับ", "Fold")]] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => update({ ...st, mode: m })} aria-pressed={st.mode === m}
                title={m === "push" ? t("อีกฝั่งแคบลงแต่ยังเห็นเนื้อหา", "The other side shrinks but stays visible") : t("อีกฝั่งพับเหลือแถบแคบ", "The other side folds into a slim bar")}
                className={`h-5 px-2 rounded ${st.mode === m ? "bg-white text-slate-700 font-medium shadow-sm" : "hover:text-slate-600"}`}>{label}</button>
            ))}
          </span>
        </div>
      )}
      <div className={split ? "flex items-stretch" : "space-y-3"}>
        {pane("left", left)}
        {split && (
          <button type="button" onClick={() => update({ ...st, focus: null })} title={t("กลับครึ่ง-ครึ่ง", "Back to half")} aria-label={t("กลับครึ่ง-ครึ่ง", "Back to half")}
            className="w-3 mx-1 shrink-0 rounded-md text-slate-300 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center text-[10px] leading-none">⋮</button>
        )}
        {pane("right", right)}
      </div>
    </div>
  );
}
