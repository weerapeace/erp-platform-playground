"use client";

/**
 * ใบสั่งขาย → "เปิดใบขาย (ส่งของ)" (เจ้าของสั่ง 2026-11-21 · เลือกจาก widget)
 *   เลือกรายการ + ใส่จำนวนที่ส่งรอบนี้ (ตั้งให้เท่าค้างส่ง แก้ได้) → POST /api/so-orders/bill
 *   = ออกใบขาย (ยืนยัน + จัดส่ง ตัดของ) + ผูกใบสั่งผลิตของแต่ละรายการ → ใบสั่งขายรู้ "ส่งแล้ว/ค้างส่ง" เอง
 *   ผลลัพธ์ (ShipResultPanel): ใบสั่งผลิตที่ส่งไม่ครบ → ถามว่าชิ้นที่เหลืออยู่ขั้นไหน → ปุ่มไปบันทึกขั้นที่บอร์ด
 *     (ป๊อป "อัปเดตงาน" ของกลางที่บอร์ดจ่ายงาน ?cu=batch&mos= — ทุกขั้นบันทึกผ่านกติกาเดิมของบอร์ด ไม่เขียนสถานะตรง)
 * ของกลาง: ERPModal · HoverImage · DateInput · apiFetch · useToast · openLink
 * ย้อนกลับ: ใบขายที่ออกแล้ว ยกเลิกได้ที่หน้าใบขาย · ผูกผิดใบสั่งผลิต แก้ได้ที่ "อัปเดตสถานะ" ในใบสั่งขาย
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { openLink } from "@/lib/open-param";
import type { BillSourceLine } from "@/app/api/so-orders/bill/route";
import type { MoShipResult } from "@/app/api/so-orders/ship-lines";

const num = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type ShipResult = { invoice_id: string | null; so_number: string | null; mos: MoShipResult[]; skipped?: string[]; warning?: string | null; orders_shipped?: string[] };

/** ผลหลังส่งของ: ใบสั่งผลิตที่ส่งครบ / ยังเหลือ → ไปบันทึกขั้นของชิ้นที่เหลือที่บอร์ด */
export function ShipResultPanel({ r }: { r: ShipResult }) {
  const left = r.mos.filter((m) => m.partial);
  const full = r.mos.filter((m) => !m.partial);
  const board = (mos: string[]) => window.open(`/master/work-board?cu=batch&mos=${mos.map(encodeURIComponent).join(",")}`, "_blank");
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <Icon name="done" /> ออกใบขาย {r.so_number ? <b className="font-mono">{r.so_number}</b> : ""} แล้ว
        {r.invoice_id && <a href={openLink("/sales-orders", r.invoice_id)} target="_blank" rel="noopener noreferrer" className="ml-2 text-emerald-700 underline">เปิดดูใบขาย</a>}
        {!!r.orders_shipped?.length && <div className="mt-1 text-[12px]">ส่งครบทั้งใบแล้ว: {r.orders_shipped.join(", ")}</div>}
      </div>
      {r.warning && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{r.warning}</div>}
      {!!r.skipped?.length && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">ไม่ได้นับเข้าใบสั่งผลิต: {r.skipped.join(" · ")}</div>}
      {full.length > 0 && (
        <div className="text-sm text-slate-600">ส่งครบ {full.length} ใบสั่งผลิต: <span className="font-mono text-xs">{full.map((m) => m.mo_no).join(", ")}</span>
          <div className="text-[11px] text-slate-400">ใบที่ช่างส่งคืนครบแล้ว ระบบปิดงานให้เอง · ใบที่ยังไม่ได้บันทึกผลิต ไปอัปเดตขั้นที่บอร์ดได้</div></div>
      )}
      {left.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <div className="mb-1.5 text-sm font-medium text-violet-900">ส่งไม่ครบ — ชิ้นที่เหลืออยู่ขั้นไหน?</div>
          <ul className="space-y-1 text-sm">
            {left.map((m) => (
              <li key={m.mo_no} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-violet-800">{m.mo_no}</span>
                <span className="text-slate-600">สั่ง {num(m.mo_qty)} · ส่งแล้ว {num(m.shipped_after)} · <b className="font-medium text-violet-900">เหลือ {num(m.left)}</b></span>
                <button type="button" onClick={() => board([m.mo_no])} className="ml-auto h-7 rounded-md border border-violet-300 bg-white px-2 text-[11px] text-violet-700 hover:bg-violet-50">เลือกขั้น</button>
              </li>
            ))}
          </ul>
          {left.length > 1 && (
            <button type="button" onClick={() => board(left.map((m) => m.mo_no))} className="mt-2 h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700">
              เลือกขั้นทุกใบที่เหลือ ({left.length})</button>
          )}
          <div className="mt-1.5 text-[11px] text-violet-700/80">เปิดป๊อป “อัปเดตงาน” ที่บอร์ดจ่ายงาน (ของจริงอยู่ขั้นไหน — อยู่กับช่าง / QC รับเข้า / ยังไม่ได้ผลิต)</div>
        </div>
      )}
    </div>
  );
}

export function SoBillModal({ orderIds, open, onClose, onDone }: {
  orderIds: string[]; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [lines, setLines] = useState<BillSourceLine[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShipResult | null>(null);
  const key = orderIds.join(",");

  useEffect(() => {
    if (!open || !key) return;
    setResult(null); setLoading(true);
    apiFetch(`/api/so-orders/bill?ids=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => {
      const ls = ((j.data?.lines ?? []) as BillSourceLine[]);
      setLines(ls);
      setQty(Object.fromEntries(ls.map((l) => [l.so_line_id, l.remaining])));
      setPick(Object.fromEntries(ls.map((l) => [l.so_line_id, l.remaining > 0])));
    }).catch(() => toast.error("โหลดรายการไม่สำเร็จ")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const chosen = useMemo(() => lines.filter((l) => pick[l.so_line_id] && (qty[l.so_line_id] ?? 0) > 0), [lines, pick, qty]);
  const over = chosen.filter((l) => l.mo_nos.length > 0 && (qty[l.so_line_id] ?? 0) > l.remaining + 0.0001);
  const allPicked = lines.length > 0 && lines.filter((l) => l.remaining > 0).every((l) => pick[l.so_line_id]);

  const submit = async () => {
    if (!chosen.length) { toast.error("ติ๊กรายการและใส่จำนวนที่ส่งอย่างน้อย 1 รายการ"); return; }
    if (over.length) { toast.error(`ส่งเกินค้าง: ${over.map((l) => l.sku ?? l.product_name).join(", ")}`); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/so-orders/bill", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_date: date, picks: chosen.map((l) => ({ so_line_id: l.so_line_id, qty: qty[l.so_line_id] })) }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "ออกใบขายไม่สำเร็จ");
      setResult(j as ShipResult);
      toast.success(`ออกใบขาย ${j.so_number ?? ""} แล้ว`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ออกใบขายไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !busy && onClose()} size="lg" title="🧾 เปิดใบขาย (ส่งของ)"
      description={result ? undefined : "ติ๊กรายการที่ส่งรอบนี้ · ใส่จำนวน (ตั้งให้เท่าที่ค้างส่งไว้แล้ว) — ราคามาจากใบสั่งขาย"}
      footer={result
        ? <button onClick={onClose} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>
        : <>
          <span className="mr-auto text-[11px] text-slate-400">ออกใบ = ยืนยัน + จัดส่ง (ตัดของจากคลังสินค้าสำเร็จ) · ยกเลิกใบขายได้ที่หน้าใบขาย</span>
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => void submit()} disabled={busy || !chosen.length} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "กำลังออกใบ…" : `ออกใบขาย ${chosen.length} รายการ`}</button>
        </>}>
      {result ? <ShipResultPanel r={result} /> : loading ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-44"><span className="text-[11px] text-slate-500">วันที่ใบขาย</span><div className="mt-0.5"><DateInput value={date} onChange={setDate} /></div></label>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={allPicked} onChange={(e) => setPick(Object.fromEntries(lines.map((l) => [l.so_line_id, e.target.checked && l.remaining > 0])))} /> เลือกทุกรายการที่ค้าง
            </label>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {/* PC = ตาราง · มือถือ = การ์ดต่อรายการ (คอลัมน์ซ่อน) */}
            <div className="hidden grid-cols-[28px_40px_minmax(0,1fr)_80px_80px_80px_96px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 sm:grid">
              <span /><span /><span>สินค้า</span><span className="text-right">สั่ง</span><span className="text-right">ส่งแล้ว</span><span className="text-right">ค้าง</span><span className="text-right">ส่งรอบนี้</span>
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((l) => {
                const done = l.remaining <= 0 && l.mo_nos.length > 0;
                const q = qty[l.so_line_id] ?? 0;
                const bad = l.mo_nos.length > 0 && q > l.remaining + 0.0001;
                return (
                  <div key={l.so_line_id} className={`grid grid-cols-[28px_40px_minmax(0,1fr)_96px] items-center gap-2 px-3 py-2 sm:grid-cols-[28px_40px_minmax(0,1fr)_80px_80px_80px_96px] ${done ? "opacity-50" : ""}`}>
                    <input type="checkbox" checked={!!pick[l.so_line_id]} disabled={done} onChange={(e) => setPick((p) => ({ ...p, [l.so_line_id]: e.target.checked }))} />
                    <HoverImage url={l.image_url} size={36} previewSize={240} alt={l.product_name} rounded="rounded-md" />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-800" title={l.product_name}>{l.product_name}</div>
                      <div className="flex flex-wrap gap-x-1.5 text-[11px] text-slate-400">
                        {l.sku && <code className="font-mono text-orange-700">{l.sku}</code>}
                        {orderIds.length > 1 && l.order_no && <span>· {l.order_no}</span>}
                        {l.mo_nos.length ? <span>· {l.mo_nos.join(", ")}</span> : <span className="text-amber-600">· ไม่มีใบสั่งผลิต (นับส่งไม่ได้)</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 sm:hidden">สั่ง {num(l.ordered)} · ส่งแล้ว {num(l.shipped)} · <b className="font-medium">ค้าง {num(l.remaining)}</b></div>
                    </div>
                    <span className="hidden text-right text-sm tabular-nums text-slate-600 sm:block">{num(l.ordered)}</span>
                    <span className="hidden text-right text-sm tabular-nums text-slate-600 sm:block">{num(l.shipped)}</span>
                    <span className={`hidden text-right text-sm font-medium tabular-nums sm:block ${done ? "text-emerald-600" : "text-amber-700"}`}>{done ? "ครบ" : num(l.remaining)}</span>
                    <input type="number" min={0} step="any" value={q} disabled={done || !pick[l.so_line_id]}
                      onChange={(e) => setQty((x) => ({ ...x, [l.so_line_id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className={`h-8 w-full rounded-lg border px-2 text-right text-sm tabular-nums disabled:bg-slate-50 ${bad ? "border-rose-400 text-rose-700" : "border-slate-200"}`} />
                  </div>
                );
              })}
              {!lines.length && <div className="px-4 py-6 text-center text-sm text-slate-400">ไม่มีรายการ</div>}
            </div>
          </div>
          {over.length > 0 && <div className="text-xs text-rose-600">ใส่เกินจำนวนที่ค้างส่ง: {over.map((l) => l.sku ?? l.product_name).join(", ")}</div>}
        </div>
      )}
    </ERPModal>
  );
}
