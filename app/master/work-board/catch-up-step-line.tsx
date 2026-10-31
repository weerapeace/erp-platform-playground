"use client";

/**
 * 📋 รายการขั้นของโหมดอัปเดตงาน แบบอ่านง่าย (แบบ A ตารางย่อ — เจ้าของเลือก 2026-10-31) — ของกลาง
 * ใช้ที่: ป๊อปอัปเดต (ระบบจะบันทึก / ผลบันทึก / ส่งคำขอแล้ว) · ตารางอัปเดตเป็นชุด (ตรวจก่อนบันทึก / ผลรายใบ)
 *
 * 1 ขั้น = 1 แถว: [สถานะ] [ชื่อขั้น ตัวหนา สีตามหมวด] [รายละเอียด + วันที่] [ป้าย] · กว้างสุด max-w-3xl (ตารางชุดกว้างมาก ป้ายจะหลุดขอบ)
 * ตัวหนา = ตัวเลขหลัก · ขีดฆ่า = ค่าเดิม · ขีดเส้นใต้จุด = คน/โต๊ะ/ปลายทาง · เอียง = เหตุผล/ไม่ระบุวัน · ป้ายสี = ต้องตามต่อ
 * ข้อความ/การแบ่งชิ้นมาจาก cuStepParts (catch-up.ts) — แก้รูปแบบที่ไฟล์นี้ แก้ถ้อยคำที่ catch-up.ts
 */
import { Icon } from "@/components/icon";
import { cuStepParts, type CuChip, type CuSeg, type CuStep, type CuTone } from "./catch-up";

export type CuStepState = "plan" | "ok" | "fail" | "run" | "skip";
export type CuStepItem = { step: CuStep; state?: CuStepState; msg?: string };

const TONE: Record<CuTone, string> = {
  qty: "text-amber-700", ready: "text-slate-600", disp: "text-indigo-700", ret: "text-teal-700", qc: "text-pink-700",
  ship: "text-emerald-700", close: "text-emerald-700", cancel: "text-rose-700", info: "text-slate-600",
};
const CHIP: Record<CuChip["tone"], string> = {
  warn: "bg-amber-50 text-amber-800", bad: "bg-rose-50 text-rose-700", acc: "bg-indigo-50 text-indigo-700", ok: "bg-emerald-50 text-emerald-700", muted: "bg-slate-100 text-slate-500",
};
const segCls = (s: CuSeg) => [
  s.b ? "font-semibold text-slate-900" : "", s.old ? "text-slate-400 line-through" : "", s.who ? "underline decoration-slate-400 decoration-dotted underline-offset-2" : "",
  s.it ? "italic" : "", s.dim ? "text-slate-500" : "",
].filter(Boolean).join(" ");

function StateIcon({ st }: { st: CuStepState }) {
  if (st === "ok") return <Icon name="done" className="text-emerald-600" />;
  if (st === "fail") return <Icon name="cancel" className="text-rose-600" />;
  if (st === "run") return <Icon name="waiting" className="text-amber-600" />;
  if (st === "skip") return <span className="text-slate-300">○</span>;
  return <span className="text-slate-300">•</span>;
}

export function CuStepList({ items, who, size = "sm" }: { items: CuStepItem[]; who?: (s: CuStep) => string; size?: "sm" | "md" }) {
  if (!items.length) return <div className="text-[12px] text-slate-400">—</div>;
  return (
    <div className={`grid max-w-3xl grid-cols-[1.1rem_6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-1 ${size === "md" ? "text-[13px]" : "text-[12px]"}`}>
      {items.map((it, i) => {
        const p = cuStepParts(it.step, who), st = it.state ?? "plan", off = st === "skip";
        return (
          <div key={i} className="contents">
            <span className="text-center"><StateIcon st={st} /></span>
            <span className={`font-semibold ${off ? "text-slate-400" : TONE[p.tone]}`}>{p.title}</span>
            <span className={`min-w-0 ${off ? "text-slate-400" : "text-slate-700"}`}>
              {p.main.map((s, j) => <span key={j} className={off ? "" : segCls(s)}>{s.t}</span>)}
              {p.date && <span className={`ml-2 whitespace-nowrap ${p.date.none ? "italic text-slate-400" : "text-slate-500"}`}>{p.date.t}</span>}
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {off ? <span className={`rounded-full px-1.5 text-[11px] ${CHIP.muted}`}>ยังไม่ได้ทำ</span>
                : p.chips.map((c, j) => <span key={j} className={`whitespace-nowrap rounded-full px-1.5 text-[11px] ${CHIP[c.tone]}`}>{c.t}</span>)}
            </span>
            {st === "fail" && it.msg && <span className="col-span-2 col-start-3 -mt-0.5 text-[11px] text-rose-600">{it.msg}</span>}
          </div>
        );
      })}
    </div>
  );
}
