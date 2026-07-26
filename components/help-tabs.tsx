"use client";

// ของกลาง: ปุ่มช่วยเหลือ ⓘ → เปิดป๊อปอัปคู่มือแบบ "มีแท็บ"
// ใช้เมื่อคำอธิบายยาว/มีหลายหัวข้อ (ถ้าสั้น ๆ หัวข้อเดียวใช้ <InfoHint> พอ — components/info-hint)
//
// วิธีใช้:
//   <HelpTabsButton title="วิธีใช้คลังไฟล์กลาง" tabs={[
//     { key: "howto", label: "📘 วิธีใช้", content: <>…</> },
//     { key: "rules", label: "📐 กฎของรูป", content: <>…</> },
//   ]} />

import { useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";

export type HelpTab = { key: string; label: string; content: ReactNode };

export function HelpTabsButton({ title, tabs, label, className = "" }: {
  title: string;                 // หัวป๊อปอัป
  tabs: HelpTab[];
  label?: string;                // tooltip ของปุ่ม (ดีฟอลต์ = title)
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const cur = tabs.find((x) => x.key === active) ?? tabs[0];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={label ?? title} aria-label={label ?? title}
        className={`shrink-0 h-5 w-5 inline-flex items-center justify-center rounded-full border border-slate-300 text-slate-400 text-[11px] leading-none hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50 ${className}`}>ⓘ</button>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} title={title} size="lg"
          footer={<div className="flex justify-end"><button type="button" onClick={() => setOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
          <div className="flex items-center gap-1 border-b border-slate-200 -mt-1 mb-3 overflow-x-auto">
            {tabs.map((tb) => (
              <button key={tb.key} type="button" onClick={() => setActive(tb.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tb.key === cur?.key ? "border-violet-500 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{tb.label}</button>
            ))}
          </div>
          <div className="text-sm text-slate-600 leading-relaxed">{cur?.content}</div>
        </ERPModal>
      )}
    </>
  );
}
