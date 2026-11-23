"use client";

/**
 * การ์ดของกระดานเงินสด (/cashflow/board) — ใช้ร่วมกันทุกมุมมอง (รายวัน · รายสัปดาห์ · กราฟ · ปฏิทิน)
 * แก้หน้าตาการ์ดที่นี่ที่เดียว ทุกมุมมองเปลี่ยนตาม
 */
import { CompanyTag } from "@/components/company-filter";
import { CASHFLOW_SOURCE, THB, formatDayMonthTH, type CashflowEvent, type CashflowSource } from "@/lib/cashflow";
import type { CompanyRef } from "@/lib/company-filter";

/** การ์ด 1 ใบ หรือกองที่รวมของร้านเดียวกันไว้ */
export type BoardCard =
  | { kind: "single"; key: string; ev: CashflowEvent }
  | { kind: "group"; key: string; party: string; events: CashflowEvent[]; total: number; direction: "in" | "out"; movable: boolean; companyId: string | null };

export const shortTHB = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(2)}ล`;
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}k`;
  return `${s}${Math.round(a)}`;
};

/** ระดับเงินคงเหลือ — ติดลบ / ต่ำกว่าเงินกันขั้นต่ำ / ปกติ (ใช้ระบายสีทุกมุมมองให้ตรงกัน) */
export type BalanceTone = "neg" | "low" | "ok";
export const balanceTone = (bal: number, buffer: number): BalanceTone => (bal < 0 ? "neg" : bal < buffer ? "low" : "ok");
export const TONE_BG: Record<BalanceTone, string> = { neg: "bg-red-50", low: "bg-amber-50", ok: "" };
export const TONE_TEXT: Record<BalanceTone, string> = { neg: "text-red-600 font-semibold", low: "text-amber-700 font-semibold", ok: "text-blue-700" };

export function Card({ ev, companies, dragging, checked, movedFrom, showDate, onDragStart, onDragEnd, onToggleSelect, onOpenDetail }: {
  ev: CashflowEvent; dragging: boolean; checked: boolean; movedFrom: string | null;
  /** null = ไม่โชว์ป้ายบริษัท */
  companies: CompanyRef[] | null;
  /** โชว์วันที่บนการ์ด (มุมมองที่ 1 คอลัมน์มีหลายวัน) */
  showDate?: boolean;
  onDragStart: (ids: string[]) => void; onDragEnd: () => void;
  onToggleSelect: (id: string) => void; onOpenDetail: (id: string) => void;
}) {
  const meta = CASHFLOW_SOURCE[ev.source as CashflowSource];
  const locked = !ev.movable;
  const edge = locked ? "border-l-violet-500" : ev.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500";
  return (
    <div
      draggable={!locked}
      // กดการ์ด = ดูรายละเอียด (เลื่อนวันจากในนั้นได้ — ใช้แทนการลากบนมือถือ) · Ctrl/⌘/Shift หรือติ๊กช่องมุม = เลือกไว้ลากหลายใบ
      onClick={(e) => {
        if (!locked && (e.ctrlKey || e.metaKey || e.shiftKey)) { onToggleSelect(ev.id); return; }
        onOpenDetail(ev.id);
      }}
      onDragStart={(e) => {
        if (locked) { e.preventDefault(); return; }
        e.stopPropagation();
        onDragStart([ev.id]);
        try { e.dataTransfer.setData("text/plain", ev.id); e.dataTransfer.effectAllowed = "move"; } catch { /* บางเบราว์เซอร์ไม่ยอมให้ตั้ง */ }
      }}
      onDragEnd={onDragEnd}
      title={locked
        ? `${meta.label} — กดดูรายละเอียด · เลื่อนวันไม่ได้`
        : `กดดูรายละเอียด/เลื่อนวัน · ลากไปวันอื่นได้${movedFrom ? ` · เดิมคือ ${formatDayMonthTH(movedFrom)}` : ""}`}
      className={`group/card relative rounded-lg border border-l-[3px] border-slate-200 bg-white p-1.5 shadow-sm select-none ${edge}
        ${locked ? "cursor-pointer bg-slate-50" : "cursor-grab active:cursor-grabbing hover:shadow-md"}
        ${dragging ? "opacity-40" : ""} ${movedFrom ? "border-dashed" : ""}
        ${checked ? "ring-2 ring-blue-500" : movedFrom ? "ring-2 ring-blue-200" : ""}`}
    >
      {!locked && (
        <input
          type="checkbox" checked={checked} onChange={() => onToggleSelect(ev.id)}
          onClick={(e) => e.stopPropagation()}
          title="เลือกไว้ลากหลายใบพร้อมกัน"
          className={`absolute -top-1.5 -left-1.5 z-10 w-3.5 h-3.5 cursor-pointer accent-blue-600 transition-opacity
            ${checked ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"}`}
        />
      )}
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[9.5px] px-1.5 py-px rounded-full whitespace-nowrap ${
          locked ? "bg-violet-100 text-violet-700"
            : ev.direction === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {locked ? "🔒 " : ""}{meta.label}
        </span>
        <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
          ev.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
          {ev.direction === "in" ? "+" : "−"}{THB(ev.amount)}
        </span>
      </div>
      <p className="text-[11.5px] text-slate-700 mt-0.5 line-clamp-2 leading-snug">{ev.party}</p>
      <p className="text-[10px] text-slate-400 mt-px flex items-center gap-1 flex-wrap">
        {companies && companies.length > 0 && <CompanyTag companies={companies} companyId={ev.companyId} />}
        <span>
          {showDate && <span className="text-slate-500">{formatDayMonthTH(ev.date)} · </span>}
          {ev.ref}{movedFrom && <span className="text-blue-600"> · เลื่อนจาก {formatDayMonthTH(movedFrom)}</span>}
        </span>
      </p>
    </div>
  );
}

/** กองการ์ดของร้านเดียวกันในวันเดียวกัน — ลากทั้งกองได้ กดเพื่อกางดูรายใบ */
export function GroupCard({ card, companies, open, dragging, selected, pending, originalDate, onToggle, onDragStart, onDragEnd, onToggleSelect, onOpenDetail }: {
  card: Extract<BoardCard, { kind: "group" }>;
  companies: CompanyRef[] | null;
  open: boolean; dragging: boolean;
  selected: Set<string>; pending: Record<string, string>;
  originalDate: (id: string) => string;
  onToggle: () => void;
  onDragStart: (ids: string[]) => void; onDragEnd: () => void;
  onToggleSelect: (id: string) => void; onOpenDetail: (id: string) => void;
}) {
  const ids = card.events.map((e) => e.id);
  const edge = !card.movable ? "border-l-violet-500" : card.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500";
  return (
    <div className="space-y-1.5">
      <div
        draggable={card.movable}
        onClick={onToggle}
        onDragStart={(e) => {
          if (!card.movable) { e.preventDefault(); return; }
          e.stopPropagation();
          onDragStart(ids);
          try { e.dataTransfer.effectAllowed = "move"; } catch { /* ไม่เป็นไร */ }
        }}
        onDragEnd={onDragEnd}
        title={card.movable ? "ลากทั้งกองไปวันอื่น · กดเพื่อกางดูรายใบ" : "ในกองมีใบที่เลื่อนไม่ได้ปนอยู่"}
        className={`rounded-lg border border-l-[3px] border-slate-300 bg-slate-50 p-1.5 shadow-sm select-none ${edge}
          ${card.movable ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "cursor-pointer"}
          ${dragging ? "opacity-40" : ""}`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[9.5px] px-1.5 py-px rounded-full bg-slate-200 text-slate-600 whitespace-nowrap">
            🗂 {card.events.length} ใบ
          </span>
          <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
            card.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
            {card.direction === "in" ? "+" : "−"}{THB(card.total)}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-700 mt-0.5 line-clamp-2 leading-snug">{card.party}</p>
        <p className="text-[10px] text-slate-400 mt-px flex items-center gap-1">
          {companies && companies.length > 0 && <CompanyTag companies={companies} companyId={card.companyId} />}
          <span>{open ? "▲ ซ่อนรายใบ" : "▼ กดดูรายใบ"}</span>
        </p>
      </div>

      {open && (
        <div className="pl-2 space-y-1.5 border-l-2 border-slate-200">
          {card.events.map((ev) => (
            <Card key={ev.id} ev={ev} companies={companies} dragging={false} checked={selected.has(ev.id)}
                  movedFrom={pending[ev.id] ? originalDate(ev.id) : null}
                  onDragStart={onDragStart} onDragEnd={onDragEnd}
                  onToggleSelect={onToggleSelect} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  );
}
