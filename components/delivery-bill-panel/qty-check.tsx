"use client";

/**
 * กล่อง "เช็กจำนวน" ของแผงใบส่งของ — รวมจำนวนจากใบส่งของทุกใบ (สินค้ามาหลายรอบ) เทียบกับจำนวนในใบสำคัญ
 * ★ 2026-11-15 เจ้าของ: "บางสินค้ามา 2 รอบ อยากให้เช็คจำนวนด้วยว่าตรงไหม (ขาดเท่าไหร่)" — ดูอย่างเดียว ไม่แตะ PO/สต๊อก
 * สูตร: lib/delivery-bill-check (deliveryQtyCheck · suggestBoxMatches) · ใช้ใน components/delivery-bill-panel เท่านั้น
 */
import { useMemo } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { deliveryQtyCheck, suggestBoxMatches, type QtyRow, type QtyStatus } from "@/lib/delivery-bill-check";
import type { DeliveryBillLine } from "@/lib/delivery-bill";

type LineLite = { id: string; code: string; item_name: string; qty: number; uom: string | null; is_product?: boolean };
export type BoxSuggestion = { bill_id: string; idx: number; line_id: string };

const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const n3 = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const STATUS: Record<QtyStatus, { cls: string; text: (r: QtyRow) => string; tip: string }> = {
  ok:      { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: () => "ครบ", tip: "จำนวนจากใบส่งของรวมทุกรอบ เท่ากับในใบ" },
  short:   { cls: "bg-rose-50 text-rose-700 border-rose-200", text: (r) => `ขาด ${n3(-r.diff)}`, tip: "มาน้อยกว่าในใบ — อาจมารอบหน้า (ใบส่งของใบใหม่) หรือหายระหว่างทาง" },
  over:    { cls: "bg-amber-50 text-amber-700 border-amber-200", text: (r) => `เกิน ${n3(r.diff)}`, tip: "มามากกว่าในใบ — เช็กว่าบิลร้านอ่านตกแถว / เป็นของบิลอื่นที่มากล่องเดียวกัน / ร้านส่งเกินหรือแถม" },
  none:    { cls: "bg-slate-50 text-slate-600 border-slate-200", text: () => "ยังไม่มา", tip: "ยังไม่มีกล่องไหนในใบส่งของที่จับคู่กับสินค้านี้" },
  unknown: { cls: "bg-amber-50 text-amber-700 border-amber-200", text: () => "อ่านจำนวนไม่ได้", tip: "มีกล่องที่ช่อง Qty ว่าง — พิมพ์จำนวนในตารางใบส่งของ" },
};

export function QtyCheckCard({ lines, bills, readonly, onSuggest }: {
  lines: LineLite[];
  bills: { id: string; tracking_no: string | null; lines: DeliveryBillLine[] }[];
  readonly: boolean;
  onSuggest: (s: BoxSuggestion[]) => void;
}) {
  const checkLines = useMemo(() => lines.map((l) => ({ id: l.id, label: l.code || stripCode(l.item_name), qty: Number(l.qty) || 0, is_product: l.is_product !== false })), [lines]);
  const checkBills = useMemo(() => bills.map((b) => ({ id: b.id, tracking_no: b.tracking_no, lines: b.lines.map((x) => ({ qty: x.qty, voucher_line_ids: x.voucher_line_ids ?? [] })) })), [bills]);
  const chk = useMemo(() => deliveryQtyCheck(checkLines, checkBills), [checkLines, checkBills]);
  const sugg = useMemo(() => (readonly ? [] : suggestBoxMatches(checkLines, checkBills)), [readonly, checkLines, checkBills]);
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  if (bills.length === 0 || checkLines.every((l) => !l.is_product)) return null;

  const count = (s: QtyStatus) => chk.rows.filter((r) => r.status === s).length;
  const trk = (id: string) => bills.find((b) => b.id === id)?.tracking_no || "ไม่มีรหัส";
  const cols: MiniColumn<QtyRow>[] = [
    { key: "item", header: "สินค้า", width: "minmax(11rem,2fr)", cell: (r) => (
      <div className="min-w-0">
        {r.ids.map((id) => { const l = byId.get(id); return (
          <div key={id} className="truncate text-slate-800" title={l?.item_name}>
            <span className="font-mono text-[11px] text-slate-500">{l?.code || "—"}</span> {l ? stripCode(l.item_name) : id}
          </div>
        ); })}
        {r.ids.length > 1 && <div className="text-[10px] text-indigo-600" title="มีกล่องที่ใส่สินค้าเหล่านี้ปนกัน — เช็กได้แค่ยอดรวมของกลุ่ม">กล่องปนกัน · เช็กยอดรวม</div>}
      </div>
    ) },
    { key: "exp", header: "ในใบ", align: "right", width: "4.5rem", cell: (r) => <span className="tabular-nums">{n3(r.expected)}</span> },
    ...bills.map((b): MiniColumn<QtyRow> => ({
      key: `b-${b.id}`, header: <span className="font-mono text-[11px]" title={`จำนวนจากใบส่งของ ${trk(b.id)}`}>{trk(b.id)}</span>, align: "right", width: "6rem",
      cell: (r) => r.byBill[b.id] != null ? <span className="tabular-nums">{n3(r.byBill[b.id])}</span> : <span className="text-slate-300">—</span>,
    })),
    { key: "got", header: "รวม", align: "right", width: "4.5rem", cell: (r) => <span className="tabular-nums font-medium">{r.status === "none" ? "0" : n3(r.got)}</span> },
    { key: "st", header: "ผล", width: "7.5rem", cell: (r) => { const s = STATUS[r.status]; return <span className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${s.cls}`} title={s.tip}>{s.text(r)}</span>; } },
  ];
  const chips: { s: QtyStatus; label: string }[] = [{ s: "ok", label: "ครบ" }, { s: "short", label: "ขาด" }, { s: "over", label: "เกิน" }, { s: "none", label: "ยังไม่มา" }, { s: "unknown", label: "อ่านจำนวนไม่ได้" }];

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border-b border-slate-100">
        <Icon name="inspect" mode="line" size={15} className="text-slate-500" />
        <span className="text-xs font-semibold text-slate-700">เช็กจำนวน: ใบส่งของ เทียบกับในใบ</span>
        <span className="text-[11px] text-slate-400">รวมทุกใบส่งของในใบนี้ (สินค้ามาหลายรอบ)</span>
        {chk.matchedBoxes > 0 && chips.filter((c) => count(c.s) > 0).map((c) => (
          <span key={c.s} className={`text-[11px] px-1.5 py-0.5 rounded border ${STATUS[c.s].cls}`}>{c.label} {count(c.s)}</span>
        ))}
        <span className="flex-1" />
        {sugg.length > 0 && (
          <button type="button" onClick={() => onSuggest(sugg)} title={sugg.map((s) => `${trk(s.bill_id)} กล่อง ${s.idx + 1} → ${byId.get(s.line_id)?.code || stripCode(byId.get(s.line_id)?.item_name ?? "")}`).join("\n")}
            className="h-7 px-2.5 text-[11px] rounded-md border border-blue-200 bg-white text-blue-700 hover:bg-blue-50">จับคู่ตามที่ระบบเดา ({sugg.length} กล่อง)</button>
        )}
      </div>
      {chk.matchedBoxes === 0 ? (
        <div className="px-3 py-3 text-xs text-slate-500">ยังไม่ได้จับคู่กล่องกับสินค้า — กด &quot;＋ เลือกสินค้าในกล่องนี้&quot; ทีละกล่อง{sugg.length > 0 ? " หรือปุ่มจับคู่ด้านบน" : ""} แล้วระบบจะนับให้ว่าครบไหม</div>
      ) : (
        <MiniTable rows={chk.rows} rowKey={(r) => r.ids.join(",")} columns={cols} hideToolbar zebra={false} dense />
      )}
      {chk.unmatched.length > 0 && (
        <div className="px-3 py-1.5 text-[11px] text-violet-700 bg-violet-50/50 border-t border-slate-100">
          ยังไม่รู้ว่าเป็นสินค้าอะไร: {chk.unmatched.map((u) => `${trk(u.bill_id)} ${u.boxes} กล่อง (${n3(u.qty)} ชิ้น)`).join(" · ")}
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">ดูอย่างเดียว ยังไม่แก้ใบสั่งซื้อ/สต๊อก · ขาด = อาจมารอบหน้า · เกิน = เช็กว่าบิลร้านอ่านตกแถว หรือเป็นของบิลอื่น</div>
    </div>
  );
}
