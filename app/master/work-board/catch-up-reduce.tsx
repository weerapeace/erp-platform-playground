"use client";

/**
 * 📉 ช่อง "ทำได้ไม่ครบ / ลดจำนวน" — ของกลางของโหมดอัปเดตงาน (ป๊อปอัปเดต · ตารางอัปเดตเป็นชุด · ป๊อปแก้ไข)
 *
 * ทำได้จริง N จาก Q ชิ้น · เหตุผล (รายการ + พิมพ์เพิ่ม) · ที่เหลือ: แยกเป็นใบใหม่รอของ (แนะนำ) / ไม่ทำแล้ว / ค้างไว้ในใบนี้
 * โชว์ "ระบบจะทำอะไร" ก่อนบันทึก (ลดใบจ่ายที่ยังค้างช่างให้ด้วยถ้าจ่ายเกิน) · กติกา lib/mo-qty-reduce · ตัวบันทึกอยู่ที่ catch-up.ts / catch-up-edit-plan.ts
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import type { CatchUpWo } from "@/app/api/mo/catch-up/route";
import { REDUCE_REASONS, reduceSummary, shrinkWos } from "@/lib/mo-qty-reduce";
import { cuReduceReason, type CuIssue, type CuReduce } from "./catch-up";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const numOr0 = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function ReducePanel({ qty, received, sized = false, wos, value, onChange, issues = [], allowKeep = true, compact = false, hint }: {
  /** จำนวนสั่งผลิตตอนนี้ · ยอดที่ช่างส่งคืนแล้ว (ลดต่ำกว่านี้ไม่ได้) */
  qty: number; received: number; sized?: boolean;
  /** ใบจ่ายของใบนี้ (ไว้บอกว่าต้องลดใบจ่ายไหนบ้าง) */
  wos: CatchUpWo[];
  value: CuReduce | null; onChange: (v: CuReduce | null) => void;
  issues?: CuIssue[];
  /** ป๊อปแก้ไข = ไม่มี "ค้างไว้ในใบนี้" (ไม่ได้เปลี่ยนอะไร) */
  allowKeep?: boolean;
  /** ตารางชุด = ย่อ (เหตุผล/ทางเลือกเป็น select) */
  compact?: boolean;
  /** ข้อความชวนเปิด (เช่น ติ๊ก "ยังขาดของ" อยู่) */
  hint?: ReactNode;
}) {
  const ring = (field: string) => { const i = issues.find((x) => x.field === field); return !i ? "" : i.level === "error" ? " !border-rose-400 !bg-rose-50/40" : " !border-amber-400"; };
  const msgs = issues.filter((x) => x.field.startsWith("reduce:"));
  if (!value) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" disabled={sized} onClick={() => onChange({ qty: 0, pick: REDUCE_REASONS[0], detail: "", mode: "split" })}
          title={sized ? "ใบนี้แบ่งจำนวนตามไซส์ — ลดรายไซส์ที่หน้าใบสั่งผลิต" : "ทำได้ไม่ครบตามจำนวนสั่ง (ของไม่พอ / ช่างส่งคืนไม่ครบ)"}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 text-slate-600 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-40">
          <Icon name="cut" /> ทำได้ไม่ครบ / ลดจำนวน
        </button>
        {sized ? <span className="text-[11px] text-slate-400">ใบแบ่งตามไซส์ — ลดรายไซส์ที่หน้าใบสั่งผลิต</span> : hint ? <span className="text-[11px] text-amber-700">{hint}</span> : null}
      </div>
    );
  }
  const set = (p: Partial<CuReduce>) => onChange({ ...value, ...p });
  const rest = Math.max(0, Math.round((qty - value.qty) * 100) / 100);
  const valid = value.qty > 0 && value.qty < qty && value.qty >= received;
  const lines = !valid ? [] : value.mode === "keep"
    ? [`ใบนี้ยังเป็น ${fmt(qty)} ชิ้น · จ่ายไปก่อน ${fmt(value.qty)} ชิ้น`, "จดต่อท้ายหมายเหตุใบสั่งผลิต · ปิดใบได้เมื่อทำครบ (หรือกด \"ปิดยอดขาด\" ตอนท้าย)"]
    : reduceSummary({ from: qty, to: value.qty, mode: value.mode, reason: cuReduceReason(value), shrink: shrinkWos(wos, value.qty) });
  const modes: { k: CuReduce["mode"]; label: string; sub: string }[] = [
    { k: "split", label: "แยกเป็นใบใหม่ รอของ", sub: valid ? `ได้ใบใหม่ ${fmt(rest)} ชิ้น อยู่แท็บรอจ่าย · ใบนี้ปิดได้เมื่อทำครบ ${fmt(value.qty)}` : "ที่เหลือไปอยู่ใบใหม่ (รอของ) ไม่หาย" },
    { k: "drop", label: "ไม่ทำแล้ว", sub: valid ? `ตัดทิ้ง ${fmt(rest)} ชิ้น เก็บเหตุผลไว้ในประวัติ` : "ที่เหลือตัดทิ้ง เก็บเหตุผลไว้ในประวัติ" },
    ...(allowKeep ? [{ k: "keep" as const, label: "ค้างไว้ในใบนี้", sub: valid ? `ใบยังเป็น ${fmt(qty)} · จ่ายไปก่อน ${fmt(value.qty)}` : "ไม่ลดจำนวน จ่ายไปก่อนเท่าที่ทำได้" }] : []),
  ];
  return (
    <div id="cu-reduce" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-amber-900"><Icon name="cut" /> ทำได้จริง</span>
        <input type="number" min={0} inputMode="decimal" value={value.qty || ""} onChange={(e) => set({ qty: numOr0(e.target.value) })}
          placeholder="จำนวน" className={`h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm${ring("reduce:qty")}`} />
        <span className="text-slate-600">จาก {fmt(qty)} ชิ้น{received > 0 ? ` (ช่างคืนแล้ว ${fmt(received)})` : ""} · เพราะ</span>
        <select value={value.pick} onChange={(e) => set({ pick: e.target.value })} className={`h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm${ring("reduce:reason")}`}>
          {REDUCE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={value.detail} onChange={(e) => set({ detail: e.target.value })} placeholder={value.pick === "อื่น ๆ" ? "พิมพ์เหตุผล" : "ระบุเพิ่ม เช่น ผ้าลายดอกไม่พอ"}
          className={`h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm${value.pick === "อื่น ๆ" ? ring("reduce:reason") : ""}`} style={{ minWidth: 140 }} />
        <button type="button" onClick={() => onChange(null)} title="ทำครบตามสั่ง (ไม่ลด)" className="h-8 shrink-0 rounded-lg px-2 text-slate-400 hover:bg-white hover:text-rose-600"><Icon name="cancel" /></button>
      </div>
      {compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">ที่เหลือ {fmt(rest)} ชิ้น:</span>
          <select value={value.mode} onChange={(e) => set({ mode: e.target.value as CuReduce["mode"] })} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {modes.map((m) => <option key={m.k} value={m.k}>{m.label}{m.k === "split" ? " (แนะนำ)" : ""}</option>)}
          </select>
        </div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-3">
          {modes.map((m) => (
            <button key={m.k} type="button" onClick={() => set({ mode: m.k })} aria-pressed={value.mode === m.k}
              className={`rounded-lg border bg-white px-2.5 py-1.5 text-left ${value.mode === m.k ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-[13px] font-medium text-slate-800">{m.label}{m.k === "split" && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] font-normal text-indigo-700">แนะนำ</span>}</div>
              <div className="text-[11px] text-slate-500">{m.sub}</div>
            </button>
          ))}
        </div>
      )}
      {msgs.map((x, i) => <div key={i} className={`text-[11px] ${x.level === "error" ? "text-rose-600" : "text-amber-700"}`}>{x.msg}</div>)}
      {lines.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md bg-white/70 py-1.5 pl-6 pr-2 text-[12px] text-slate-600">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
