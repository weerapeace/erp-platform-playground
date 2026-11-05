"use client";

/**
 * ใบสั่งขาย — "หน้าสถานะ" (เจ้าของเลือกจาก widget 2026-11-05 · ต่อจากแบบ D+C ที่เปิดมาเป็นหน้าอ่าน)
 *   • หัวใบเป็นตัวหนังสือ + ป้ายสถานะใบ · แก้ต้องกด "แก้ไขรายการ" (ฟอร์มแก้ = SOLineEditor layout compact ในหน้าแม่)
 *   • แถบความคืบหน้า 5 ขั้น (รอเปิดผลิต → เปิดผลิตแล้ว → กำลังผลิต → ทำเสร็จ รอส่ง → ส่งลูกค้าแล้ว) — กดขั้นเพื่อกรองตาราง
 *     ขั้นต่อรายการคิดที่ GET /api/so-orders/[id] ด้วย lib/so-order-stage (กติกาเดียวกับมุมมอง "ตามชุด")
 *   • ตารางมีรูป (รูปปก SKU ไม่มีใช้ของรุ่น · HoverImage ของกลาง) + คอลัมน์สถานะ: ขั้นงาน · ใบผลิต · เปิดผลิต x/y · ส่ง x/y
 *   • จัดกลุ่มตามรุ่นได้ (สวิตช์ — lib/so-order-view) · เตือนรายการยังไม่ผูก / เปิดผลิตขาด-เกิน / ใบผลิตไม่ตรงรายการ
 *   • รายการที่ยังไม่มีใบผลิต: ปุ่ม "ผูกใบที่มี" (ตัวเลือกใบงานกลาง โหมดใบเดียว) · "เปิดใบใหม่" (open_mo เฉพาะรายการ)
 * ยอดเงิน: SalesTotalsPreview (ของกลางตัวเดียวกับใบขาย) · ยอดต่อรายการ: lib/mo-so-rule
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { SalesTotalsPreview, type EditorLine } from "@/components/sales-line-items";
import type { DocumentResult } from "@/lib/tax";
import { format as formatMoney } from "@/lib/money";
import { groupByModel, majorityGroup } from "@/lib/so-order-view";
import { soLineQtyState, soLineQtyText, type SoLineMo, type SoLineProgress } from "@/lib/mo-so-rule";
import { SO_LINE_STAGES, soShipState, type SoLineStage } from "@/lib/so-order-stage";

/** group.id ว่าง = ชุดใหม่ที่ยังไม่บันทึก */
type ReadMeta = {
  mo_id: string | null; mo_no: string | null; quote_no?: string | null; group: { id: string | null; name: string } | null;
  progress?: SoLineProgress | null;
  /** ขั้นงานของรายการ 0-4 (จาก API) */
  stage?: SoLineStage | null;
};

const num = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const baht = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayText = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");
const lineAmount = (l: EditorLine) => {
  const sub = (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
  const disc = l.discount_type === "percent" ? sub * ((Number(l.discount_value) || 0) / 100) : Number(l.discount_value) || 0;
  return Math.max(0, sub - disc);
};
const lineImage = (l: EditorLine) => l.image_url || (l.image_key ? `/api/r2-image?key=${encodeURIComponent(l.image_key)}&w=160` : null);

/** สีของแต่ละขั้น (ป้าย · แถบ) */
const STAGE_TONE: Record<SoLineStage, { chip: string; bar: string }> = {
  0: { chip: "bg-rose-50 text-rose-700", bar: "bg-rose-400" },
  1: { chip: "bg-sky-50 text-sky-700", bar: "bg-sky-400" },
  2: { chip: "bg-amber-50 text-amber-800", bar: "bg-amber-400" },
  3: { chip: "bg-violet-50 text-violet-700", bar: "bg-violet-400" },
  4: { chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
};
const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-blue-50 text-blue-700" },
  shipped: { label: "ส่งแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ยกเลิก", cls: "bg-rose-50 text-rose-700" },
};

export function SoOrderReadView({ header, lines, meta, totals, canOpenMo, onOpenMo, orphanMos = [], onLinkMo, onOpenLineMo }: {
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
  /** ปุ่มต่อรายการที่ยังไม่มีใบผลิต: ผูกใบที่มีอยู่ / เปิดใบใหม่เฉพาะรายการนี้ (ไม่ส่ง = ไม่มีสิทธิ์ → ไม่โชว์ปุ่ม) */
  onLinkMo?: (l: EditorLine) => void;
  onOpenLineMo?: (l: EditorLine) => void;
}) {
  const items = useMemo(() => lines.filter((l) => l.product_name.trim() || l.sku), [lines]);
  const main = useMemo(() => majorityGroup(items.map((l) => meta[l.tempId]?.group ?? null)), [items, meta]);
  const cancelled = header.status === "cancelled";
  const indexOf = new Map(lines.map((l, i) => [l.tempId, i + 1]));

  const hasMo = (l: EditorLine) => !!meta[l.tempId]?.mo_no || (meta[l.tempId]?.progress?.mos.length ?? 0) > 0;
  const stageOf = (l: EditorLine): SoLineStage => meta[l.tempId]?.stage ?? (hasMo(l) ? 1 : 0);
  const shipOf = (l: EditorLine) => soShipState(Number(l.qty) || 0, meta[l.tempId]?.progress?.shipped ?? 0);
  const noMo = items.filter((l) => !hasMo(l));
  const qtyOff = items.filter((l) => { const p = meta[l.tempId]?.progress; const st = p ? soLineQtyState(p) : "none"; return st === "under" || st === "over"; });

  // ความคืบหน้า: นับรายการต่อขั้น + ส่งบางส่วน (ยังไม่ครบ = อยู่ขั้นการผลิต)
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const l of items) c[stageOf(l)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, meta]);
  const partShipped = items.filter((l) => stageOf(l) < 4 && shipOf(l) === "part").length;

  const [filter, setFilter] = useState<SoLineStage | null>(null);
  const [grouped, setGrouped] = useState(false);
  const shown = filter === null ? items : items.filter((l) => stageOf(l) === filter);
  const groups = useMemo(() => groupByModel(shown, lineAmount), [shown]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const st = ORDER_STATUS[header.status] ?? { label: header.status, cls: "bg-slate-100 text-slate-600" };

  const row = (l: EditorLine, indent = false) => {
    const m = meta[l.tempId];
    const otherGroup = m?.group && main && m.group.id !== main.group.id;
    return (
      <tr key={l.tempId} className={!hasMo(l) && !cancelled ? "bg-rose-50/40" : ""}>
        <td className={`py-1.5 pr-1 text-center font-mono text-[11px] text-slate-400 ${indent ? "pl-6" : "pl-3"}`}>{indexOf.get(l.tempId)}</td>
        <td className="px-1 py-1.5"><HoverImage url={lineImage(l)} size={36} previewSize={280} alt={l.product_name} rounded="rounded-md" /></td>
        <td className="min-w-0 px-2 py-1.5">
          <div className="truncate text-sm text-slate-800" title={l.product_name}>{l.product_name}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            {l.sku && <code className="font-mono text-orange-700">{l.sku}</code>}
            {l.note && <span className="truncate">· {l.note}</span>}
            {otherGroup && <span className="rounded-full bg-teal-50 px-1.5 text-teal-800">ชุด {m?.group?.name}</span>}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm tabular-nums text-slate-700">{num(l.qty)} <span className="text-[11px] text-slate-400">{l.unit}</span></td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm tabular-nums text-slate-600">
          {baht(l.unit_price)}
          {!!l.discount_value && <div className="text-[10px] text-rose-600">ลด {l.discount_type === "percent" ? `${l.discount_value}%` : baht(l.discount_value)}</div>}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right text-sm font-medium tabular-nums text-slate-800">{baht(lineAmount(l))}</td>
        <td className="px-3 py-1.5">
          <StatusCell stage={stageOf(l)} moNo={m?.mo_no ?? null} p={m?.progress ?? null} qty={Number(l.qty) || 0} cancelled={cancelled} />
          {!hasMo(l) && !cancelled && (onLinkMo || onOpenLineMo) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {onLinkMo && <button type="button" onClick={() => onLinkMo(l)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] text-rose-700 hover:bg-rose-50"><Icon name="link" /> ผูกใบที่มี</button>}
              {onOpenLineMo && l.sku && <button type="button" onClick={() => onOpenLineMo(l)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"><Icon name="add" /> เปิดใบใหม่</button>}
            </div>
          )}
        </td>
      </tr>
    );
  };
  const cols = <colgroup><col className="w-10" /><col className="w-12" /><col /><col className="w-24" /><col className="w-24" /><col className="w-28" /><col className="w-44" /></colgroup>;

  return (
    <div className="space-y-3">
      {/* หัวใบ — ตัวหนังสือ ไม่ใช่ช่องกรอก */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
          {main && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Icon name="folders" /> ชุด <b className="font-medium text-teal-800">{main.group.name}</b>
              {main.count < items.length && <span className="text-slate-400">(ยกเว้น {items.length - main.count} รายการ)</span>}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm md:grid-cols-6">
          <div className="col-span-2"><div className="text-[11px] text-slate-400">ลูกค้า</div><div className="font-medium text-slate-800">{header.customerName || "—"}</div></div>
          <div><div className="text-[11px] text-slate-400">วันที่สั่ง</div><div className="text-slate-700">{dayText(header.orderDate) || "—"}</div></div>
          <div><div className="text-[11px] text-slate-400">กำหนดส่ง</div>
            {header.dueDate ? <div className="font-medium text-indigo-700">{dayText(header.dueDate)}</div> : <div className="text-amber-600">ยังไม่ระบุ</div>}</div>
          <div><div className="text-[11px] text-slate-400">เลข PO ลูกค้า</div><div className="text-slate-700">{header.poNo || "—"}</div></div>
          <div><div className="text-[11px] text-slate-400">ยอดรวมทั้งสิ้น</div><div className="font-semibold tabular-nums text-slate-800">{formatMoney(totals.grand_total)}</div></div>
          <div className="col-span-2"><div className="text-[11px] text-slate-400">บริษัท</div><div className="text-slate-700">{header.companyName || "—"}</div></div>
          <div className="col-span-2"><div className="text-[11px] text-slate-400">ผู้ขาย</div><div className="text-slate-700">{header.salePerson || "—"}</div></div>
          <div className="col-span-2"><div className="text-[11px] text-slate-400">รายการ · จำนวนรวม</div>
            <div className="text-slate-700">{items.length} รายการ · {num(items.reduce((s, l) => s + (Number(l.qty) || 0), 0))} {[...new Set(items.map((l) => l.unit || "ชิ้น"))].length === 1 ? (items[0]?.unit || "ชิ้น") : "หน่วย"}</div></div>
        </div>
      </div>

      {/* ความคืบหน้า 5 ขั้น — กดเพื่อกรอง */}
      {items.length > 0 && !cancelled && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>ความคืบหน้า {items.length} รายการ — กดขั้นเพื่อกรองตาราง</span>
            {filter !== null && <button type="button" onClick={() => setFilter(null)} className="text-blue-600 hover:underline">ดูทั้งหมด</button>}
          </div>
          <div className="mb-2.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {SO_LINE_STAGES.map((s) => counts[s.key] > 0 && (
              <span key={s.key} className={STAGE_TONE[s.key].bar} style={{ width: `${(counts[s.key] / items.length) * 100}%` }} title={`${s.label} ${counts[s.key]}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SO_LINE_STAGES.map((s) => (
              <button key={s.key} type="button" onClick={() => setFilter(filter === s.key ? null : s.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-left transition ${filter === s.key ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300"} ${counts[s.key] === 0 ? "opacity-60" : ""}`}>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STAGE_TONE[s.key].chip}`}>{s.label}</span>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800">{counts[s.key]}</div>
                {s.key === 4 && partShipped > 0 && <div className="text-[10px] text-slate-500">+ ส่งบางส่วนอีก {partShipped}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

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
          <h3 className="text-sm font-semibold text-slate-800">รายการสินค้า <span className="text-xs font-normal text-slate-400">({filter === null ? items.length : `${shown.length} จาก ${items.length}`})</span></h3>
          {filter !== null && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${STAGE_TONE[filter].chip}`}>กรอง: {SO_LINE_STAGES[filter].label}
              <button type="button" onClick={() => setFilter(null)} className="ml-1 opacity-70 hover:opacity-100" aria-label="ล้างตัวกรอง">×</button></span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-600">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> จัดกลุ่มตามรุ่น
            </label>
            {grouped && <>
              <button type="button" onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.key, true])))}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">กางทั้งหมด</button>
              <button type="button" onClick={() => setOpen(Object.fromEntries(groups.map((g) => [g.key, false])))}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">พับทั้งหมด</button>
            </>}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีรายการ — กด “แก้ไขรายการ” เพื่อเพิ่ม</div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">ไม่มีรายการในขั้นนี้ — <button type="button" onClick={() => setFilter(null)} className="text-blue-600 hover:underline">ดูทั้งหมด</button></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed">
              {cols}
              <thead className="bg-white text-[11px] text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-1.5 pl-3 pr-1 text-center font-medium">#</th><th className="px-1 py-1.5 text-left font-medium">รูป</th>
                  <th className="px-2 py-1.5 text-left font-medium">สินค้า</th><th className="px-2 py-1.5 text-right font-medium">จำนวน</th>
                  <th className="px-2 py-1.5 text-right font-medium">ราคา/หน่วย</th><th className="px-2 py-1.5 text-right font-medium">รวมก่อนภาษี</th>
                  <th className="px-3 py-1.5 text-left font-medium">สถานะ</th>
                </tr>
              </thead>
              {!grouped ? (
                <tbody className="divide-y divide-slate-100">{shown.map((l) => row(l))}</tbody>
              ) : groups.map((g) => {
                const opened = open[g.key] ?? (groups.length <= 3 || g.items.some((l) => !hasMo(l)));
                const minStage = Math.min(...g.items.map(stageOf)) as SoLineStage;
                return (
                  <tbody key={g.key || "_none"} className="divide-y divide-slate-100 border-t border-slate-100">
                    <tr className={`cursor-pointer hover:bg-slate-50 ${opened ? "bg-slate-50/70" : ""}`} onClick={() => setOpen((o) => ({ ...o, [g.key]: !opened }))}>
                      <td className="py-2 pl-3 text-center text-slate-400"><span className={`inline-block transition-transform ${opened ? "rotate-90" : ""}`}>›</span></td>
                      <td className="px-1 py-2"><HoverImage url={lineImage(g.items[0])} size={28} previewSize={240} alt={g.label} rounded="rounded" /></td>
                      <td className="min-w-0 px-2 py-2"><code className="mr-1.5 font-mono text-xs text-orange-700">{g.key || "—"}</code><span className="truncate text-sm text-slate-800">{g.label}</span>
                        <span className="ml-1.5 text-[11px] text-slate-400">{g.items.length} แบบ</span></td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-500">{num(g.qty)}</td>
                      <td />
                      <td className="px-2 py-2 text-right text-sm font-medium tabular-nums text-slate-800">{baht(g.total)}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] ${STAGE_TONE[minStage].chip}`}>ช้าสุด: {SO_LINE_STAGES[minStage].short}</span></td>
                    </tr>
                    {opened && g.items.map((l) => row(l, true))}
                  </tbody>
                );
              })}
            </table>
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

/** ช่องสถานะของรายการ: ขั้นงาน · ใบผลิต (+ใบที่แตก/เปิดเพิ่ม) · เปิดผลิต x/y (ขาด/เกิน) · ส่ง x/y */
function StatusCell({ stage, moNo, p, qty, cancelled }: { stage: SoLineStage; moNo: string | null; p: SoLineProgress | null; qty: number; cancelled: boolean }) {
  const nos = p?.mos.map((m) => m.mo_no) ?? (moNo ? [moNo] : []);
  const first = moNo && nos.includes(moNo) ? moNo : nos[0];
  const qst = p ? soLineQtyState(p) : "ok";
  const shipped = p?.shipped ?? 0;
  const pct = qty > 0 ? Math.min(100, Math.round((shipped / qty) * 100)) : 0;
  return (
    <div className="leading-tight">
      {!cancelled && <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STAGE_TONE[stage].chip}`}>{SO_LINE_STAGES[stage].label}</span>}
      {first ? (
        <div className="mt-0.5 text-[10px] text-slate-500" title={nos.join(", ")}>
          <span className="font-mono text-emerald-700">{first}</span>
          {nos.length > 1 && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">+{nos.length - 1} ใบ</span>}
          {p && (qst === "under" || qst === "over") && <span className={`ml-1 ${qst === "under" ? "text-amber-700" : "text-rose-700"}`}>{soLineQtyText(p)}</span>}
        </div>
      ) : !cancelled && <div className="mt-0.5 text-[10px] text-rose-600">ยังไม่มีใบผลิต</div>}
      {shipped > 0 && (
        <div className="mt-1">
          <div className="text-[10px] text-slate-500">ส่ง {num(shipped)}/{num(qty)}</div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
    </div>
  );
}
