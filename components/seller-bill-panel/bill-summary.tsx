"use client";

/**
 * กล่อง "สรุปยอดบิล" (付款详情 ของ Taobao/1688) ในบิลร้าน — ยอดสินค้า · ส่วนลดท้ายบิล · ค่าส่งในจีน · ค่าธรรมเนียม · ยอดจ่ายจริง
 * ★ 2026-11-15 เจ้าของ: "ยอดสุดท้ายไม่ตรงบิล รวมทั้งสิ้นต้องได้ 347.53 (ตามบิล)"
 *   เทียบค่าสินค้าในแถวกับยอดสินค้าหลังลด (จับส่วนลดซ้ำ/แถวตกหล่น) · บอกเรทจากยอดจ่ายจริง · ใส่ลงใบแล้วขึ้นหัวใบให้เอง (lib/seller-bill syncSellerBillExtras)
 * สูตร: lib/seller-bill-summary · ใช้ใน components/seller-bill-panel เท่านั้น
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { billNetGoods, billPaidFx, type BillCur, type BillSummary } from "@/lib/seller-bill-summary";
import type { SellerBillLine } from "@/lib/seller-bill-match";

const n2 = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const inp = "h-7 w-20 px-1.5 text-xs border border-slate-200 rounded-md bg-white text-right tabular-nums disabled:bg-transparent disabled:border-transparent disabled:text-slate-700";
const sym = (c: BillCur | null) => (c === "THB" ? "฿" : "¥");

function Num({ label, value, onChange, ro, unit, tip }: { label: string; value: number | null; onChange: (v: number | null) => void; ro: boolean; unit: ReactNode; tip?: string }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-slate-600" title={tip}>
      <span className="whitespace-nowrap">{label}</span>
      {unit}
      <input type="number" inputMode="decimal" step="any" min={0} value={value ?? ""} disabled={ro} placeholder="—"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} onFocus={(e) => e.target.select()} className={inp} />
    </label>
  );
}
function CurToggle({ value, onChange, ro }: { value: BillCur | null; onChange: (c: BillCur) => void; ro: boolean }) {
  const v = value ?? "CNY";
  return (
    <button type="button" disabled={ro} onClick={() => onChange(v === "THB" ? "CNY" : "THB")} title={v === "THB" ? "ตอนนี้: บาท — กดเพื่อเปลี่ยนเป็นหยวน" : "ตอนนี้: หยวน — กดเพื่อเปลี่ยนเป็นบาท"}
      className="h-7 min-w-6 px-1 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60">{sym(v)}</button>
  );
}

export function BillSummaryBox({ s, lines, readonly, rereading, onChange, onReread }: {
  s: BillSummary; lines: SellerBillLine[]; readonly: boolean; rereading: boolean;
  onChange: (p: Partial<BillSummary>) => void; onReread: () => void;
}) {
  const net = billNetGoods(lines);
  const G = Number(s.goods_total) || 0, D = Number(s.discount_total) || 0;
  const expected = G > 0 ? Math.round((G - D) * 100) / 100 : null;
  const goodsDiff = expected != null ? Math.round((net - expected) * 100) / 100 : null;
  const fx = billPaidFx(s, net);
  const empty = [s.goods_total, s.discount_total, s.ship, s.fee, s.paid_total].every((x) => x == null);

  return (
    <div className="border-t border-slate-200 px-3 py-2 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon name="calc" mode="line" size={14} className="text-slate-500" />
        <span className="text-xs font-semibold text-slate-700">สรุปยอดบิล</span>
        <span className="text-[11px] text-slate-400">付款详情 — ยอดจ่ายจริงคือตัวตั้ง ใส่ลงใบแล้วค่าส่งในจีน / ค่าธรรมเนียม / เรท ขึ้นหัวใบให้เอง</span>
        {!readonly && (
          <button type="button" onClick={onReread} disabled={rereading} title="ให้ AI อ่านกล่อง 付款详情 จากรูปบิลเดิมอีกครั้ง (เสียค่า AI 1 ครั้ง)"
            className="ml-auto h-7 px-2.5 text-[11px] rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">{rereading ? "กำลังอ่าน…" : empty ? "ให้ AI อ่านยอดจากบิล" : "AI อ่านยอดใหม่"}</button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        <Num label="ยอดสินค้า" unit={<span className="text-[11px] text-slate-400">¥</span>} value={s.goods_total} ro={readonly} onChange={(v) => onChange({ goods_total: v })} tip="商品总价 — ยอดสินค้าก่อนหักส่วนลดท้ายบิล" />
        <span className="inline-flex items-center gap-1.5">
          <Num label="ส่วนลดท้ายบิล" unit={<span className="text-[11px] text-slate-400">¥</span>} value={s.discount_total} ro={readonly} onChange={(v) => onChange({ discount_total: v })} tip="店铺优惠 + 平台优惠 + 立减 … รวมกัน (ยอดบวก)" />
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600" title="ราคาต่อหน่วยในแถวเป็นราคาหลังลดแล้ว (Taobao โชว์ราคาที่จ่ายจริง + ราคาเดิมขีดฆ่า) — ติ๊กแล้วระบบล้างส่วนลดในแถว ไม่หักซ้ำ">
            <input type="checkbox" checked={s.discount_in_price} disabled={readonly} onChange={(e) => onChange({ discount_in_price: e.target.checked })} className="rounded border-slate-300" />
            ราคาในแถวหักแล้ว
          </label>
        </span>
        <Num label="ค่าส่งในจีน" unit={<span className="text-[11px] text-slate-400">¥</span>} value={s.ship} ro={readonly} onChange={(v) => onChange({ ship: v })} tip="运费 — ร้านส่งไปโกดังจีน · เฉลี่ยเข้าต้นทุนต่อชิ้น" />
        <Num label="ค่าธรรมเนียม" unit={<CurToggle value={s.fee_currency} ro={readonly} onChange={(c) => onChange({ fee_currency: c })} />} value={s.fee} ro={readonly} onChange={(v) => onChange({ fee: v, fee_currency: s.fee_currency ?? "THB" })} tip="支付手续费 — ค่าธรรมเนียมจ่ายเงิน (บัตร ~3%) · เฉลี่ยเข้าต้นทุนต่อชิ้น" />
        <Num label="ยอดจ่ายจริง" unit={<CurToggle value={s.paid_currency} ro={readonly} onChange={(c) => onChange({ paid_currency: c })} />} value={s.paid_total} ro={readonly} onChange={(v) => onChange({ paid_total: v, paid_currency: s.paid_currency ?? "THB" })} tip="实付款 — ยอดที่จ่ายจริง ใช้เทียบว่าใบตรงบิลไหม + คิดเรท" />
      </div>
      {!empty && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
          {goodsDiff != null && (Math.abs(goodsDiff) <= 0.05
            ? <span className="px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">ค่าสินค้าในแถว ¥{n2(net)} ตรงยอดสินค้าหลังลด</span>
            : <span className="px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200" title="ส่วนลดหักซ้ำ? (ติ๊ก ราคาในแถวหักแล้ว) · AI อ่านแถวตก? (+ เพิ่มรายการสินค้าเอง) · ราคา/จำนวนผิด?">
                ค่าสินค้าในแถว ¥{n2(net)} ≠ ยอดสินค้าหลังลด ¥{n2(expected)} (ต่าง ¥{n2(Math.abs(goodsDiff))})
              </span>)}
          {fx != null && (
            <span className="text-slate-600">
              จ่ายจริง ฿{n2(s.paid_total)}{s.fee_currency === "THB" && s.fee ? ` − ค่าธรรมเนียม ฿${n2(s.fee)}` : ""} ÷ ¥{n2(net + (Number(s.ship) || 0) + (s.fee_currency === "CNY" ? Number(s.fee) || 0 : 0))} = <b className="font-medium text-slate-800">เรท {fx.toFixed(4)}</b>
              {goodsDiff != null && Math.abs(goodsDiff) > 0.05
                ? <span className="text-amber-700"> · ยังไม่ตั้งเรทให้ — แก้ค่าสินค้าในแถวให้ตรงก่อน</span>
                : <span className="text-slate-400"> · ใส่ลงใบแล้วตั้งเรทนี้ให้</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
