"use client";
// Design Dashboard: ข้อความแจ้งผลแบบเลื่อนในหัว (เจ้าของเลือก 2026-11-22 แทนกล่องเขียวเต็มกว้าง)
//   • ข้อความยาวเกินช่อง = วิ่งจากขวาไปซ้าย · สั้น = นิ่ง · ผิดพลาด = สีแดง
//   • undo = ปุ่ม "ย้อนกลับ" นับถอยหลัง 5 วินาที (ย้ายสถานะ / เลื่อนกำหนดส่ง) · หมดเวลา = ปุ่มหาย ข้อความค้างจนถึง 15 วินาทีแล้วจางหาย
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";

export type TickerMsg = { id: number; type: "success" | "error"; text: string; undo?: () => void };

const UNDO_SEC = 5;
const SHOW_MS = 15000;

export function MoveTicker({ msg, onDone, className = "" }: { msg: TickerMsg | null; onDone: () => void; className?: string }) {
  const t = useT();
  const [left, setLeft] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(0);   // px ที่ต้องวิ่ง (0 = ข้อความพอดีช่อง)

  useEffect(() => {
    if (!msg) return;
    setLeft(msg.undo ? UNDO_SEC : 0);
    const iv = msg.undo ? window.setInterval(() => setLeft((n) => (n <= 1 ? (window.clearInterval(iv), 0) : n - 1)), 1000) : 0;
    const hide = window.setTimeout(onDone, SHOW_MS);
    return () => { window.clearInterval(iv); window.clearTimeout(hide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg?.id]);

  useLayoutEffect(() => {
    const box = boxRef.current, txt = textRef.current;
    setRun(box && txt ? Math.max(0, txt.scrollWidth - box.clientWidth) : 0);
  }, [msg?.id, msg?.text]);

  if (!msg) return <div className={className} />;
  const err = msg.type === "error";
  const dur = Math.max(6, run / 30);   // ~30px/วินาที
  return (
    <div role="status" aria-live="polite" className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${err ? "bg-rose-500" : "bg-emerald-500"}`} />
      <div ref={boxRef} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" title={msg.text}>
        <style>{`@keyframes dd-ticker{0%,15%{transform:translateX(0)}85%,100%{transform:translateX(var(--dd-run))}}`}</style>
        <span ref={textRef} key={msg.id}
          className={`inline-block text-xs font-medium ${err ? "text-rose-600" : "text-emerald-700"}`}
          style={run > 0 ? ({ ["--dd-run" as string]: `-${run}px`, animation: `dd-ticker ${dur}s ease-in-out infinite alternate` }) : undefined}>
          {msg.text}
        </span>
      </div>
      {msg.undo && left > 0 && (
        <button type="button" onClick={() => { const u = msg.undo; onDone(); u?.(); }}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
          <Icon value="i:arrow-back-up" /> {t("ย้อนกลับ", "Undo")} <span className="tabular-nums text-slate-400">{left}</span>
        </button>
      )}
      <button type="button" onClick={onDone} aria-label={t("ปิดข้อความ", "Dismiss")} className="shrink-0 text-xs text-slate-300 hover:text-slate-500">✕</button>
    </div>
  );
}
