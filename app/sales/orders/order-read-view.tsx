"use client";

/**
 * ใบสั่งขาย — หน้า "ดูใบ" (เจ้าของเลือกแบบ D+C 2026-11-05)
 *   D = เปิดมาเป็นหน้าอ่าน: ตัวเลขสรุป 4 ช่อง + เตือนสิ่งที่ค้าง (รายการยังไม่ผูกใบสั่งผลิต) · กด "แก้ไขรายการ" ถึงเป็นช่องกรอก
 *   C = รายการจัดกลุ่มตามรุ่น (ส่วนหน้า SKU) พับ/กางได้ · หัวรุ่นบอกจำนวน/ยอด/ผูก MO ครบไหม
 *   ชุดบอกครั้งเดียวด้านบน (ชุดหลัก) — บรรทัดที่อยู่คนละชุดค่อยมีป้าย
 * ตรรกะจัดกลุ่ม: lib/so-order-view · ยอดเงิน: SalesTotalsPreview (ของกลางตัวเดียวกับใบขาย)
 * ยอดต่อรายการ สั่ง/เปิดผลิต/ส่ง (2026-11-05): progress จาก GET /api/so-orders/[id] · กติกา lib/mo-so-rule.ts
 *   1 รายการมีใบผลิตได้หลายใบ (แตกใบ/เปิดเพิ่ม) · เตือนเปิดผลิตขาด/เกินจากที่ลูกค้าสั่ง
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { SalesTotalsPreview, type EditorLine } from "@/components/sales-line-items";
import type { DocumentResult } from "@/lib/tax";
import { format as formatMoney } from "@/lib/money";
import { groupByModel, majorityGroup } from "@/lib/so-order-view";
import { soLineQtyState, soLineQtyText, type SoLineMo, type SoLineProgress } from "@/lib/mo-so-rule";

/** group.id ว่าง = ชุดใหม่ที่ยังไม่บันทึก */
type ReadMeta = { mo_id: string | null; mo_no: string | null; quote_no?: string | null; group: { id: string | null; name: string } | null; progress?: SoLineProgress | null };

const num = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const baht = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayText = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");
const lineAmount = (l: EditorLine) => {
  const sub = (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
  const disc = l.discount_type === "percent" ? sub * ((Number(l.discount_value) || 0) / 100) : Number(l.discount_value) || 0;
  return Math.max(0, sub - disc);
};

export function SoOrderReadView({ header, lines, meta, totals, canOpenMo, onOpenMo, orphanMos = [] }: {
  header: {
    companyName: string; customerName: string; orderDate: string; dueDate: string;
    poNo: string; salePerson: string; note: string; status: string;
  };
  lines: EditorLine[];
  meta: Record<string, ReadMeta>;
  totals: DocumentResult;
  canOpenMo: boolean;
  onOpenMo: () => void;
  /** ใบผลิตที่ผูกใบนี้แต่รหัสไม่ตรงรายการไหน */
  orphanMos?: SoLineMo[];
}) {
  const items = useMemo(() => lines.filter((l) => l.product_name.trim() || l.sku), [lines]);
  const groups = useMemo(() => groupByModel(items, lineAmount), [items]);
  const main = useMemo(() => majorityGroup(items.map((l) => meta[l.tempId]?.group ?? null)), [items, meta]);
  const hasMo = (l: EditorLine) => !!meta[l.tempId]?.mo_no || (meta[l.tempId]?.progress?.mos.length ?? 0) > 0;
  const noMo = items.filter((l) => !hasMo(l));
  // เปิดผลิตขาด/เกินจากที่สั่ง (เฉพาะรายการที่มีใบผลิตแล้ว)
  const qtyOff = items.filter((l) => { const p = meta[l.tempId]?.progress; const st = p ? soLineQtyState(p) : "none"; return st === "under" || st === "over"; });
  const qtyTotal = items.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const units = [...new Set(items.map((l) => l.unit || "ชิ้น"))];
  const indexOf = new Map(lines.map((l, i) => [l.tempId, i + 1]));
  // จัดกลุ่มเมื่อช่วยจริง (หลายรายการ และรุ่นน้อยกว่ารายการ) — ไม่งั้นโชว์ตารางเรียบ ๆ
  const grouped = items.length > 6 && groups.length < items.length;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // เปิดค้างไว้ตั้งแต่แรก: รุ่นน้อย (≤3) หรือรุ่นที่มีรายการยังไม่ผูกใบสั่งผลิต (ให้เห็นของที่ค้างทันที)
  const isOpen = (key: string, its: EditorLine[]) =>
    open[key] ?? (groups.length <= 3 || its.some((l) => !hasMo(l)));
  const cancelled = header.status === "cancelled";

  const row = (l: EditorLine, indent = false) => {
    const m = meta[l.tempId];
    const otherGroup = m?.group && main && m.group.id !== main.group.id;
    return (
      <tr key={l.tempId} className={!hasMo(l) && !cancelled ? "bg-rose-50/50" : ""}>
        <td className={`py-1.5 pr-2 text-center font-mono text-[11px] text-slate-400 ${indent ? "pl-8" : "pl-3"}`}>{indexOf.get(l.tempId)}</td>
        <td className="min-w-0 px-2 py-1.5">
          <div className="truncate text-sm text-slate-800">{l.product_name}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            {l.sku && <code className="font-mono text-orange-700">{l.sku}</code>}
            {l.note && <span className="truncate">· {l.note}</span>}
            {otherGroup && <span className="rounded-full bg-teal-50 px-1.5 text-teal-800">ชุด {m?.group?.name}</span>}
            {!m?.group && main && <span className="rounded-full bg-slate-100 px-1.5 text-slate-500">ไม่อยู่ในชุด</span>}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm tabular-nums text-slate-700">{num(l.qty)} <span className="text-[11px] text-slate-400">{l.unit}</span></td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm tabular-nums text-slate-600">
          {baht(l.unit_price)}
          {!!l.discount_value && <div className="text-[10px] text-rose-600">ลด {l.discount_type === "percent" ? `${l.discount_value}%` : baht(l.discount_value)}</div>}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm font-medium tabular-nums text-slate-800">{baht(lineAmount(l))}</td>
        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          {hasMo(l) ? <MoCell no={m?.mo_no ?? null} p={m?.progress ?? null} /> : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">ยังไม่ผูก</span>}
        </td>
      </tr>
    );
  };

  const kpi = (label: string, value: string, tone = "text-slate-800") => (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* หัวใบ — ตัวหนังสือ ไม่ใช่ช่องกรอก */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm md:grid-cols-4">
        <div className="col-span-2"><div className="text-[11px] text-slate-400">ลูกค้า</div><div className="font-medium text-slate-800">{header.customerName || "—"}</div></div>
        <div><div className="text-[11px] text-slate-400">บริษัท</div><div className="text-slate-700">{header.companyName || "—"}</div></div>
        <div><div className="text-[11px] text-slate-400">เลข PO ลูกค้า</div><div className="text-slate-700">{header.poNo || "—"}</div></div>
        <div><div className="text-[11px] text-slate-400">วันที่สั่ง</div><div className="text-slate-700">{dayText(header.orderDate) || "—"}</div></div>
        <div><div className="text-[11px] text-slate-400">กำหนดส่ง</div>
          {header.dueDate ? <div className="font-medium text-indigo-700">{dayText(header.dueDate)}</div> : <div className="text-amber-600">ยังไม่ระบุ</div>}</div>
        <div className="col-span-2"><div className="text-[11px] text-slate-400">ผู้ขาย</div><div className="text-slate-700">{header.salePerson || "—"}</div></div>
      </div>

      {/* ตัวเลขสรุป */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpi("รายการ", `${items.length}${grouped ? ` · ${groups.length} รุ่น` : ""}`)}
        {kpi("จำนวนรวม", `${num(qtyTotal)} ${units.length === 1 ? units[0] : "หน่วย"}`)}
        {kpi("ยอดรวมทั้งสิ้น", formatMoney(totals.grand_total))}
        {kpi("ผูกใบสั่งผลิต", `${items.length - noMo.length}/${items.length}`, noMo.length && !cancelled ? "text-rose-600" : "text-emerald-700")}
      </div>

      {/* สิ่งที่ค้าง */}
      {noMo.length > 0 && !cancelled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <Icon name="warning" />
          <span>{noMo.length} รายการยังไม่ผูกใบสั่งผลิต: <span className="font-mono text-xs">{noMo.slice(0, 6).map((l) => l.sku || l.product_name).join(", ")}{noMo.length > 6 ? ` +${noMo.length - 6}` : ""}</span></span>
          {canOpenMo && (
            <button type="button" onClick={onOpenMo} className="ml-auto h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700">เปิด/ผูกใบสั่งผลิตให้</button>
          )}
        </div>
      )}

      {qtyOff.length > 0 && !cancelled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Icon name="warning" />
          <span>{qtyOff.length} รายการเปิดผลิตไม่ตรงกับที่ลูกค้าสั่ง: <span className="text-xs">{qtyOff.slice(0, 4).map((l) => `${l.sku || l.product_name} (${soLineQtyText(meta[l.tempId]!.progress!)})`).join(" · ")}{qtyOff.length > 4 ? ` +${qtyOff.length - 4}` : ""}</span></span>
        </div>
      )}
      {orphanMos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ใบผลิตที่ผูกใบนี้แต่ไม่ตรงรายการไหน: <span className="font-mono">{orphanMos.map((m) => `${m.mo_no} (${num(m.qty)})`).join(", ")}</span> — เพิ่มรายการสินค้านี้ในใบ หรือย้ายใบผลิตไปใบสั่งขายที่ถูก
        </div>
      )}

      {/* รายการ */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-800">รายการสินค้า <span className="text-xs font-normal text-slate-400">({items.length})</span></h3>
          {main && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Icon name="folders" /> ชุด <b className="font-medium text-teal-800">{main.group.name}</b>
              {main.count < items.length && <span className="text-slate-400">(ยกเว้น {items.length - main.count} รายการ)</span>}
            </span>
          )}
          {grouped && (
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.key, true])))}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">กางทั้งหมด</button>
              <button type="button" onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.key, false])))}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">พับทั้งหมด</button>
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีรายการ — กด “แก้ไขรายการ” เพื่อเพิ่ม</div>
        ) : !grouped ? (
          <table className="w-full table-fixed"><colgroup><col className="w-10" /><col /><col className="w-28" /><col className="w-24" /><col className="w-28" /><col className="w-40" /></colgroup>
            <tbody className="divide-y divide-slate-100">{items.map((l) => row(l))}</tbody></table>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => {
              const opened = isOpen(g.key, g.items);
              const mo = g.items.filter((l) => hasMo(l)).length;
              return (
                <div key={g.key || "_none"}>
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !opened }))}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${opened ? "bg-slate-50/70" : ""}`}>
                    <span className={`text-slate-400 transition-transform ${opened ? "rotate-90" : ""}`}>›</span>
                    <code className="w-20 shrink-0 font-mono text-xs text-orange-700">{g.key || "—"}</code>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800" title={g.label}>{g.label}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">{g.items.length} แบบ</span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">{num(g.qty)} {units.length === 1 ? units[0] : ""}</span>
                    <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-800">{baht(g.total)}</span>
                    <span className={`w-16 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] ${mo === g.items.length || cancelled ? "bg-emerald-50 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      MO {mo}/{g.items.length}
                    </span>
                  </button>
                  {opened && (
                    <table className="w-full table-fixed border-t border-slate-100"><colgroup><col className="w-14" /><col /><col className="w-28" /><col className="w-24" /><col className="w-28" /><col className="w-40" /></colgroup>
                      <tbody className="divide-y divide-slate-100">{g.items.map((l) => row(l, true))}</tbody></table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <div className="text-[11px] text-slate-400">หมายเหตุ</div>
          <div className="whitespace-pre-wrap text-slate-700">{header.note || "—"}</div>
        </div>
        <SalesTotalsPreview result={totals} />
      </div>
    </div>
  );
}

/** ช่องใบผลิตของรายการ: เลขใบ (+ใบที่แตก/เปิดเพิ่ม) · เปิดผลิตกี่ชิ้นจากที่สั่ง · ส่งแล้ว */
function MoCell({ no, p }: { no: string | null; p: SoLineProgress | null }) {
  const nos = p?.mos.map((m) => m.mo_no) ?? (no ? [no] : []);
  const first = no && nos.includes(no) ? no : nos[0];
  const st = p ? soLineQtyState(p) : "ok";
  const tone = st === "under" ? "text-amber-700" : st === "over" ? "text-rose-700" : "text-slate-400";
  return (
    <div className="leading-tight" title={nos.join(", ")}>
      <span className="font-mono text-[11px] text-emerald-700">{first}</span>
      {nos.length > 1 && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">+{nos.length - 1} ใบ</span>}
      {p && (
        <div className={`text-[10px] ${tone}`}>
          {soLineQtyText(p)}{p.shipped > 0 ? ` · ส่ง ${(Math.round(p.shipped * 100) / 100).toLocaleString("th-TH")}` : ""}
        </div>
      )}
    </div>
  );
}
