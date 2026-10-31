"use client";

/**
 * 📉📈 ช่อง "เปลี่ยนจำนวน (ทำได้น้อย/มากกว่าสั่ง)" — ของกลางของโหมดอัปเดตงาน (ป๊อปอัปเดต · ตารางอัปเดตเป็นชุด · ป๊อปแก้ไข)
 *
 * ทำจริง N จาก Q ชิ้น — ช่องเดียวใช้สองทาง (ระบบดูเองว่าน้อยหรือมากกว่าสั่ง):
 *   น้อยกว่า: แยกเป็นใบใหม่รอของ (แนะนำ) / ไม่ทำแล้ว / ค้างไว้ในใบนี้ · มากกว่า: เพิ่มในใบนี้ (แนะนำ) / แยกส่วนเกินเป็นใบใหม่
 * ว่าง / เท่าจำนวนสั่ง = ไม่เปลี่ยน (ขึ้นสีเหลืองบอกให้ใส่หรือปิด — ไม่ใช่จุดต้องแก้)
 * โชว์ "ระบบจะทำอะไร" ก่อนบันทึก · กติกา lib/mo-qty-reduce · ตัวบันทึกอยู่ที่ catch-up.ts / catch-up-edit-plan.ts
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import type { CatchUpWo } from "@/app/api/mo/catch-up/route";
import { REDUCE_REASONS, INCREASE_REASONS, INCREASE_MODE_LABEL, reduceSummary, increaseSummary, shrinkWos, isIncreaseMode } from "@/lib/mo-qty-reduce";
import { cuQtyDir, cuReduceReason, type CuIssue, type CuReduce } from "./catch-up";

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
  /** ตารางชุด = ย่อ (ทางเลือกเป็น select) */
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
          title={sized ? "ใบนี้แบ่งจำนวนตามไซส์ — แก้รายไซส์ที่หน้าใบสั่งผลิต" : "ทำจริงไม่ตรงจำนวนสั่ง (ของไม่พอ / ทำเพิ่มได้ / ช่างคืนไม่ครบ)"}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 text-slate-600 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-40">
          <Icon name="exchange" /> เปลี่ยนจำนวน (ทำได้น้อย/มากกว่าสั่ง)
        </button>
        {sized ? <span className="text-[11px] text-slate-400">ใบแบ่งตามไซส์ — แก้รายไซส์ที่หน้าใบสั่งผลิต</span> : hint ? <span className="text-[11px] text-amber-700">{hint}</span> : null}
      </div>
    );
  }
  const dir = cuQtyDir(qty, value);
  const reasons: readonly string[] = dir === "up" ? INCREASE_REASONS : REDUCE_REASONS;
  /** เปลี่ยนจำนวนข้ามทิศ (น้อย ↔ มาก) = เปลี่ยนทางเลือก/เหตุผลตั้งต้นให้ตรงทิศ */
  const setQty = (n: number) => {
    const d = cuQtyDir(qty, { ...value, qty: n });
    const p: Partial<CuReduce> = { qty: n };
    if (d === "up" && !isIncreaseMode(value.mode)) { p.mode = "add"; if (!(INCREASE_REASONS as readonly string[]).includes(value.pick)) p.pick = INCREASE_REASONS[0]; }
    if (d === "down" && isIncreaseMode(value.mode)) { p.mode = "split"; if (!(REDUCE_REASONS as readonly string[]).includes(value.pick)) p.pick = REDUCE_REASONS[0]; }
    onChange({ ...value, ...p });
  };
  const set = (p: Partial<CuReduce>) => onChange({ ...value, ...p });
  const diff = Math.round(Math.abs(qty - value.qty) * 100) / 100;
  const lines = !dir || msgs.some((x) => x.level === "error" && x.field === "reduce:qty") ? []
    : dir === "up" ? (isIncreaseMode(value.mode) ? increaseSummary({ from: qty, to: value.qty, mode: value.mode, reason: cuReduceReason(value) }) : [])
    : value.mode === "keep" ? [`ใบนี้ยังเป็น ${fmt(qty)} ชิ้น · จ่ายไปก่อน ${fmt(value.qty)} ชิ้น`, "จดต่อท้ายหมายเหตุใบสั่งผลิต · ปิดใบได้เมื่อทำครบ (หรือกด \"ปิดยอดขาด\" ตอนท้าย)"]
    : value.mode === "split" || value.mode === "drop" ? reduceSummary({ from: qty, to: value.qty, mode: value.mode, reason: cuReduceReason(value), shrink: shrinkWos(wos, value.qty) }) : [];
  const modes: { k: CuReduce["mode"]; label: string; sub: string; rec?: boolean }[] = dir === "up" ? [
    { k: "add", label: INCREASE_MODE_LABEL.add, sub: `${fmt(qty)} → ${fmt(value.qty)} ชิ้น ใบเดียวจบ`, rec: true },
    { k: "extra", label: INCREASE_MODE_LABEL.extra, sub: `ใบนี้คง ${fmt(qty)} · ใบใหม่ ${fmt(diff)} ชิ้น (เก็บสต๊อก / คนละลูกค้า)` },
  ] : [
    { k: "split", label: "แยกเป็นใบใหม่ รอของ", sub: dir ? `ได้ใบใหม่ ${fmt(diff)} ชิ้น · ใบนี้ปิดได้เมื่อทำครบ ${fmt(value.qty)}` : "ที่เหลือไปอยู่ใบใหม่ (รอของ) ไม่หาย", rec: true },
    { k: "drop", label: "ไม่ทำแล้ว", sub: dir ? `ตัดทิ้ง ${fmt(diff)} ชิ้น เก็บเหตุผลไว้ในประวัติ` : "ที่เหลือตัดทิ้ง เก็บเหตุผลไว้ในประวัติ" },
    ...(allowKeep ? [{ k: "keep" as const, label: "ค้างไว้ในใบนี้", sub: dir ? `ใบยังเป็น ${fmt(qty)} · จ่ายไปก่อน ${fmt(value.qty)}` : "ไม่ลดจำนวน จ่ายไปก่อนเท่าที่ทำได้" }] : []),
  ];
  const tone = dir === "up" ? "border-indigo-200 bg-indigo-50/40" : "border-amber-200 bg-amber-50/40";
  return (
    <div id="cu-reduce" className={`space-y-2 rounded-lg border p-2.5 text-[13px] ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-medium ${dir === "up" ? "text-indigo-900" : "text-amber-900"}`}><Icon name="exchange" /> ทำจริง</span>
        <input type="number" min={0} inputMode="decimal" value={value.qty || ""} onChange={(e) => setQty(numOr0(e.target.value))}
          placeholder="จำนวน" className={`h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm${ring("reduce:qty")}`} />
        <span className="text-slate-600">จาก {fmt(qty)} ชิ้น{received > 0 ? ` (ช่างคืนแล้ว ${fmt(received)})` : ""}</span>
        {dir && <span className={`rounded-full px-2 text-[11px] ${dir === "up" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-900"}`}>{dir === "up" ? `มากกว่าสั่ง +${fmt(diff)}` : `น้อยกว่าสั่ง −${fmt(diff)}`}</span>}
        <span className="text-slate-600">· เพราะ</span>
        <select value={reasons.includes(value.pick) ? value.pick : reasons[0]} onChange={(e) => set({ pick: e.target.value })} className={`h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm${ring("reduce:reason")}`}>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={value.detail} onChange={(e) => set({ detail: e.target.value })} placeholder={value.pick === "อื่น ๆ" ? "พิมพ์เหตุผล" : dir === "up" ? "ระบุเพิ่ม เช่น ผ้าเหลือจากล็อตก่อน" : "ระบุเพิ่ม เช่น ผ้าลายดอกไม่พอ"}
          className={`h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm${value.pick === "อื่น ๆ" ? ring("reduce:reason") : ""}`} style={{ minWidth: 140 }} />
        <button type="button" onClick={() => onChange(null)} title="ไม่เปลี่ยนจำนวน (ปิดช่องนี้)" className="h-8 shrink-0 rounded-lg px-2 text-slate-400 hover:bg-white hover:text-rose-600"><Icon name="cancel" /></button>
      </div>
      {!dir ? (
        <div className="text-[12px] text-amber-800">{value.qty > 0 ? `เท่าจำนวนสั่ง (${fmt(qty)}) — ไม่ต้องเปลี่ยน กด ✕ ปิดช่องนี้ได้` : "ใส่จำนวนที่ทำจริง (น้อยหรือมากกว่าสั่งก็ได้) หรือกด ✕ ปิด — ยังไม่ใส่ = ไม่เปลี่ยนจำนวน"}</div>
      ) : compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">{dir === "up" ? `ส่วนเกิน ${fmt(diff)} ชิ้น:` : `ที่เหลือ ${fmt(diff)} ชิ้น:`}</span>
          <select value={value.mode} onChange={(e) => set({ mode: e.target.value as CuReduce["mode"] })} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {modes.map((m) => <option key={m.k} value={m.k}>{m.label}{m.rec ? " (แนะนำ)" : ""}</option>)}
          </select>
        </div>
      ) : (
        <div className={`grid gap-1.5 ${modes.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {modes.map((m) => (
            <button key={m.k} type="button" onClick={() => set({ mode: m.k })} aria-pressed={value.mode === m.k}
              className={`rounded-lg border bg-white px-2.5 py-1.5 text-left ${value.mode === m.k ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-[13px] font-medium text-slate-800">{m.label}{m.rec && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] font-normal text-indigo-700">แนะนำ</span>}</div>
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
