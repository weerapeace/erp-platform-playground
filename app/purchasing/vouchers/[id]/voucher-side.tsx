"use client";
/**
 * 🧾 ใบสำคัญรับ แบบ B (เจ้าของเลือก 2026-11-04) — ชิ้นส่วนของหน้า /purchasing/vouchers/[id]
 *   CollapseCard        กล่องพับ (ของที่ใช้ไม่บ่อย: ค่าส่งละเอียด · อ่านบิลจีน AI)
 *   VoucherChecklistCard  ด้านขวาตอนเป็นร่าง: เช็กลิสต์ก่อนยืนยัน + สรุปยอด + ปุ่มยืนยัน + "กดแล้วจะเกิดอะไร"
 *   VoucherConfirmModal   ป๊อปยืนยัน: บอก 4 อย่างที่จะเกิด (ออกเลข · อัปเดตราคา 3 ที่ · ใบล็อก · ต่อไปจ่ายเงิน)
 *   VoucherNextSteps      หลังยืนยัน: งานถัดไป 3 ช่อง (พิมพ์ใบซื้อ · จ่ายค่าสินค้า · ค่าส่ง)
 * กติกาเช็กลิสต์/สถานะงานถัดไป = lib/purchase-voucher-checklist (pure, มีเทสต์) · ยืนยันจริงที่ API .../confirm
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/landed-cost";
import { SendToChinaPayButton } from "@/components/china-pay-send-button";
import { RateStaleChip } from "@/components/fx-rate-quick";
import { canConfirm, fxAbnormal, fxDeviationPct, fxDeviationText, nextSteps, type CheckItem } from "@/lib/purchase-voucher-checklist";
import type { PoPayment, VoucherHeader } from "@/lib/purchase-voucher-server";

type Totals = { subtotal_foreign: number; subtotal_thb: number; ship_total_thb: number; grand_total_thb: number; discount_foreign?: number; discount_thb?: number;
  /** ★ 2026-11-15 ค่าส่งในจีน (สกุลใบ/บาท) · ค่าธรรมเนียมจ่ายเงิน ฿ · ยอดจ่ายร้าน ฿ · ยอดจ่ายจริงตามบิล ฿ */
  seller_ship_foreign?: number; seller_ship_thb?: number; pay_fee_thb?: number; shop_total_thb?: number; paid_total_thb?: number | null;
  /** ★ 2026-11-15 ค่าส่งเป็นยอดที่พิมพ์เอง (ทับเรท) */
  ship_manual?: boolean };

/** ★ 2026-11-15 บรรทัดค่าส่งในจีน + ค่าธรรมเนียมจ่ายเงิน (ไม่มี = ไม่โชว์) — ใช้ทั้งกล่องก่อนยืนยันและสรุปใบที่ยืนยันแล้ว */
function ExtraRows({ t, foreign, sym, fxRate }: { t: Totals; foreign: boolean; sym: string; fxRate: string | number | null }) {
  const ship = t.seller_ship_foreign ?? 0, fee = t.pay_fee_thb ?? 0;
  return (<>
    {ship > 0 && (
      <div className="flex justify-between gap-2"><dt className="text-slate-500" title="运费 — ร้านส่งไปโกดัง · เฉลี่ยเข้าต้นทุนต่อชิ้น">ค่าส่งในจีน{foreign ? <span className="text-[11px] text-slate-400"> {sym}{fmtMoney(ship)} × {r4(Number(fxRate) || 0)}</span> : null}</dt>
        <dd className="tabular-nums">฿{fmtMoney(t.seller_ship_thb ?? ship)}</dd></div>
    )}
    {fee > 0 && <div className="flex justify-between"><dt className="text-slate-500" title="支付手续费 — ค่าธรรมเนียมจ่ายเงิน (บาท) · เฉลี่ยเข้าต้นทุนต่อชิ้น">ค่าธรรมเนียมจ่ายเงิน</dt><dd className="tabular-nums">฿{fmtMoney(fee)}</dd></div>}
  </>);
}
/** ★ 2026-11-15 เทียบยอดจ่ายจริงตามบิล (ยอดจ่ายร้าน = ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม) */
function PaidRow({ t }: { t: Totals }) {
  const paid = Number(t.paid_total_thb) || 0;
  if (!(paid > 0)) return null;
  const diff = Math.round(((t.shop_total_thb ?? 0) - paid) * 100) / 100;
  const ok = Math.abs(diff) <= 1;
  return (
    <div className={`flex justify-between gap-2 text-xs ${ok ? "text-emerald-700" : "text-amber-700"}`}>
      <dt>จ่ายจริงตามบิล ฿{fmtMoney(paid)}</dt>
      <dd className="tabular-nums">{ok ? "ตรง ✓" : `ยอดใบ${diff > 0 ? "มากกว่า" : "น้อยกว่า"} ฿${fmtMoney(Math.abs(diff))}`}</dd>
    </div>
  );
}
export type ConfirmResult = { pv_no: string; write_back: { po: boolean; price_list: boolean; sku: boolean; error?: string }[]; failed: number };

// ★ 2026-11-15 กล่อง "ก่อนยืนยัน" แบบ B (เจ้าของเลือก: "แต่ละ section ดูกลืนกัน") — แถวที่ต้องดูเป็นแถบสีทั้งแถว ไม่ใช่แค่ไอคอนเล็ก
const ROW: Record<CheckItem["level"], { icon: string; row: string; ic: string; hint: string }> = {
  ok: { icon: "done", row: "text-slate-700", ic: "text-emerald-600", hint: "text-slate-400" },
  block: { icon: "forbidden", row: "bg-rose-50 text-rose-700", ic: "text-rose-600", hint: "text-rose-500" },
  warn: { icon: "warning", row: "bg-amber-50 text-amber-800", ic: "text-amber-600", hint: "text-amber-700/80" },
  info: { icon: "info", row: "text-slate-600", ic: "text-slate-400", hint: "text-slate-400" },
};
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function CollapseCard({ title, summary, defaultOpen = false, tone, children }: {
  title: React.ReactNode; summary?: React.ReactNode; defaultOpen?: boolean; tone?: "warn"; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white border rounded-xl ${tone === "warn" ? "border-amber-300" : "border-slate-200"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/60 rounded-xl">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="flex items-center gap-2 min-w-0">
          {summary && <span className="text-xs text-slate-500 truncate">{summary}</span>}
          <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="space-y-1">
      {items.map((c) => (
        <li key={c.key} className={`flex gap-2 text-[13px] rounded-md px-2 py-1 ${ROW[c.level].row}`}>
          <Icon name={ROW[c.level].icon} mode="line" size={15} className={`mt-0.5 shrink-0 ${ROW[c.level].ic}`} />
          <span className="min-w-0">
            <span>{c.label}</span>
            {c.hint && c.level !== "ok" && <span className={`block text-[11px] ${ROW[c.level].hint}`}>{c.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** ป้ายสรุปหัวกล่องตรวจ: ติด N (ยืนยันไม่ได้) · เตือน N · พร้อมยืนยัน */
function CheckChip({ items }: { items: CheckItem[] }) {
  const b = items.filter((c) => c.level === "block").length;
  const w = items.filter((c) => c.level === "warn").length;
  const [text, cls] = b ? [`ติด ${b}`, "bg-rose-100 text-rose-700"] : w ? [`เตือน ${w}`, "bg-amber-100 text-amber-800"] : ["พร้อมยืนยัน", "bg-emerald-100 text-emerald-700"];
  return <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{text}</span>;
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2"><Icon name={icon} mode="line" size={14} className="text-slate-400" />{children}</div>;
}

/**
 * ★ 2026-11-14 เจ้าของ: "บางทีไม่รู้เรท แต่รู้ยอดบาท — อยากแก้ราคาบาท แล้วให้คำนวณเรทให้ใหม่เอง"
 * ช่อง "ค่าสินค้า ฿" กดแก้ได้ (ใบสกุลต่างประเทศ · ใบร่าง) → หน้าใบคิดเรทใหม่ให้ (lib/landed-cost fxForTargetThb)
 */
/**
 * แถว "¥ยอด × เรท = ฿ยอด" — ช่องบาทกดแก้ได้ (onSet ไม่ส่ง = ดูอย่างเดียว)
 * ★ 2026-11-15 เจ้าของ: "อยากให้เตือนเวลาพิมพ์เกินไปเยอะ" — ระหว่างพิมพ์บอกเรทที่จะได้ · เรทต่างจากเรทวันที่ใบเกิน 10%
 *   กด Enter แล้วยังไม่เปลี่ยน ถามก่อน [ใช้ยอดนี้จริง] / [แก้ใหม่] (เกณฑ์ = FX_WARN_PCT ใน lib/purchase-voucher-checklist)
 */
function GoodsThbRow({ t, sym, rate, refFx, onSet, onEditFx, refFxDate, docDate }: { t: Totals; sym: string; rate: number; refFx: number | null; onSet?: (thb: number) => void; onEditFx?: () => void; refFxDate?: string | null; docDate?: string | null }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [ask, setAsk] = useState<number | null>(null);   // ยอดที่ทำให้เรทผิดปกติ — รอให้ตอบก่อน
  const foreignAmt = t.subtotal_foreign;
  const rateOf = (thb: number) => (foreignAmt > 0 ? thb / foreignAmt : 0);
  const dev = fxDeviationPct(rate, refFx);
  const typed = Number(edit);
  const previewRate = edit != null && typed > 0 ? rateOf(typed) : 0;
  const pDev = fxDeviationPct(previewRate, refFx);
  const askDev = ask != null ? fxDeviationPct(rateOf(ask), refFx) : null;
  const commit = () => {
    if (edit == null) return;
    const v = Number(edit);
    setEdit(null);
    if (!onSet || !(Number.isFinite(v) && v > 0) || Math.abs(v - t.subtotal_thb) < 0.005) return;
    if (fxAbnormal(fxDeviationPct(rateOf(v), refFx))) { setAsk(v); return; }
    onSet(v);
  };
  const editable = !!onSet && foreignAmt > 0 && ask == null;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <dt className="text-slate-500 tabular-nums">{sym}{fmtMoney(foreignAmt)} × {onEditFx ? (
          /* ★ 2026-11-22 แบบ B: แตะเรท → ตัวเปลี่ยนเรท (เฉพาะใบนี้ / ตั้งเป็นเรทกลางวันนี้) */
          <button type="button" onClick={onEditFx} className={`underline decoration-dotted underline-offset-2 hover:text-sky-700 ${fxAbnormal(dev) ? "text-red-600 font-semibold" : "text-sky-800"}`}
            title={fxAbnormal(dev) && refFx ? `${fxDeviationText(dev as number, refFx)} — แตะเพื่อเปลี่ยนเรท` : "แตะเพื่อเปลี่ยนเรท (เฉพาะใบนี้ หรือตั้งเป็นเรทกลางวันนี้)"}>{rate || "—"} <Icon name="edit" mode="line" size={12} className="inline -mt-0.5" /></button>
        ) : <span className={fxAbnormal(dev) ? "text-red-600 font-semibold" : "text-slate-700"}
          title={fxAbnormal(dev) && refFx ? fxDeviationText(dev as number, refFx) : "เรทแปลงเป็นบาท (แก้ที่หัวใบ)"}>{rate || "—"}</span>}
          {onEditFx && <RateStaleChip rateDate={refFxDate} refDate={docDate} className="ml-1 align-middle" />}</dt>
        <dd className="tabular-nums">
          {edit != null ? (
            <input autoFocus type="number" inputMode="decimal" step="any" min={0} value={edit} onChange={(e) => setEdit(e.target.value)}
              onBlur={(e) => { if (e.currentTarget.dataset.cancel) setEdit(null); else commit(); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.dataset.cancel = "1"; e.currentTarget.blur(); } }}
              className="w-28 h-7 px-1.5 text-right text-sm tabular-nums border border-blue-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-300" title="พิมพ์ยอดบาทที่จ่ายจริง แล้วกด Enter — ระบบคิดเรทให้ใหม่" />
          ) : editable ? (
            <button type="button" onClick={() => setEdit(t.subtotal_thb > 0 ? String(t.subtotal_thb) : "")} title="รู้ยอดบาทแต่ไม่รู้เรท? กดแก้ยอดบาท — ระบบคิดเรทให้ใหม่ (เรท = บาท ÷ ยอดสกุลใบ)"
              className="group inline-flex items-center gap-1 rounded px-1 -mr-1 tabular-nums font-medium text-slate-800 hover:bg-blue-50 hover:text-blue-700">
              ฿{fmtMoney(t.subtotal_thb)}<Icon name="edit" mode="line" size={12} className="text-slate-300 group-hover:text-blue-600" />
            </button>
          ) : <span className="font-medium text-slate-800">฿{fmtMoney(t.subtotal_thb)}</span>}
        </dd>
      </div>
      {/* ระหว่างพิมพ์: บอกเรทที่จะได้ + เทียบเรทวันที่ใบ */}
      {edit != null && previewRate > 0 && (fxAbnormal(pDev) && refFx
        ? <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700"><Icon name="warning" mode="line" size={12} className="mt-0.5 shrink-0" />เรทจะเป็น {r4(previewRate)} — {fxDeviationText(pDev as number, refFx)}</div>
        : <div className="mt-1 text-[11px] text-slate-500">เรทจะเป็น {r4(previewRate)}{pDev != null && refFx ? ` · ใกล้เคียงเรทวันที่ใบ (${refFx})` : ""}</div>)}
      {/* กด Enter แล้วเรทผิดปกติ: ถามก่อน */}
      {ask != null && refFx != null && askDev != null && (
        <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs text-amber-800">
          <div className="flex items-start gap-1 font-semibold"><Icon name="warning" mode="line" size={13} className="mt-0.5 shrink-0" />เรทจะเป็น {r4(rateOf(ask))} — {fxDeviationText(askDev, refFx)}</div>
          <div className="mt-0.5 text-amber-700">ถ้าใช้เรทวันที่ใบ ยอดควรอยู่ราว ฿{fmtMoney(foreignAmt * refFx)} — ยอด ฿{fmtMoney(ask)} พิมพ์ผิดหรือเปล่า?</div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => { const v = ask; setAsk(null); onSet?.(v); }} className="h-7 px-2.5 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700">ใช้ยอดนี้จริง</button>
            <button type="button" onClick={() => { setEdit(String(ask)); setAsk(null); }} className="h-7 px-2.5 rounded-md border border-amber-300 bg-white hover:bg-amber-100">แก้ใหม่</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ส่วน "ยอดเงิน" ของกล่องก่อนยืนยัน (พื้นเทาอ่อน) — ส่วนลด · ¥ × เรท = ฿ · ค่าส่ง */
/** ★ 2026-11-15 เจ้าของ: "อยากใส่ค่าส่งเองได้" — กดดินสอพิมพ์ยอดค่าส่งเอง (ทับเรท · นับเสมอแม้ใบไม่คิดค่าส่ง) · "ใช้ตามเรท" = ล้างยอดที่พิมพ์ */
function ShipRow({ t, onSet }: { t: Totals; onSet?: (thb: number | null) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const manual = !!t.ship_manual;
  const commit = (v: string) => { setEdit(null); if (!onSet) return; const s = v.trim(); if (s === "") return; const n = Number(s); if (Number.isFinite(n) && n >= 0) onSet(Math.round(n * 100) / 100); };
  return (
    <div className="flex justify-between items-center gap-2">
      <dt className="text-slate-500">ค่าส่ง <span className="text-[10px] text-slate-400">{manual ? "ใส่เอง" : "แยก"}</span>
        {manual && onSet && edit === null && <button type="button" onClick={() => onSet(null)} title="ล้างยอดที่พิมพ์ — กลับไปคิดตามเรท คิว/กก." className="ml-1.5 text-[10px] text-blue-600 hover:underline">ใช้ตามเรท</button>}
      </dt>
      <dd className="flex items-center gap-1">
        {edit !== null ? (
          <input autoFocus type="number" inputMode="decimal" step="any" min={0} value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="ยอดค่าส่ง ฿"
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).dataset.cancel = "1"; (e.target as HTMLInputElement).blur(); } }}
            onBlur={(e) => { if (e.currentTarget.dataset.cancel) { setEdit(null); return; } commit(e.currentTarget.value); }}
            className="h-7 w-24 px-1.5 text-sm text-right tabular-nums border border-blue-300 rounded-md bg-white" />
        ) : (<>
          <span className="tabular-nums text-orange-700">฿{fmtMoney(t.ship_total_thb)}</span>
          {onSet && <button type="button" onClick={() => setEdit(t.ship_total_thb > 0 ? String(t.ship_total_thb) : "")} title="พิมพ์ยอดค่าส่งเอง (เฉลี่ยลงสินค้าตามคิว/กก. หรือจำนวนชิ้น)" aria-label="พิมพ์ยอดค่าส่งเอง"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Icon name="edit" mode="line" size={12} /></button>}
        </>)}
      </dd>
    </div>
  );
}

function MoneySection({ t, foreign, sym, fxRate, refFx, onSetGoodsThb, onSetShip, onEditFx, refFxDate, docDate }: { t: Totals; foreign: boolean; sym: string; fxRate: string | number | null; refFx: number | null; onSetGoodsThb?: (thb: number) => void; onSetShip?: (thb: number | null) => void; onEditFx?: () => void; refFxDate?: string | null; docDate?: string | null }) {
  const disc = t.discount_foreign ?? 0;
  const cur = foreign ? sym : "฿";
  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
      <SectionTitle icon="calc">ยอดเงิน</SectionTitle>
      <dl className="text-sm space-y-1">
        {disc > 0 && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้าก่อนลด</dt><dd className="tabular-nums">{cur}{fmtMoney(t.subtotal_foreign + disc)}</dd></div>}
        {disc > 0 && <div className="flex justify-between text-red-600"><dt>ส่วนลดรวม</dt><dd className="tabular-nums">−{cur}{fmtMoney(disc)}{foreign && (t.discount_thb ?? 0) > 0 ? <span className="ml-1 text-[11px] text-red-400">(฿{fmtMoney(t.discount_thb)})</span> : null}</dd></div>}
        {foreign
          ? <GoodsThbRow t={t} sym={sym} rate={Number(fxRate) || 0} refFx={refFx} onSet={onSetGoodsThb} onEditFx={onEditFx} refFxDate={refFxDate} docDate={docDate} />
          : <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า{disc > 0 ? " สุทธิ" : ""}</dt><dd className="tabular-nums font-medium text-slate-800">฿{fmtMoney(t.subtotal_thb)}</dd></div>}
        <ExtraRows t={t} foreign={foreign} sym={sym} fxRate={fxRate} />
        <ShipRow t={t} onSet={onSetShip} />
        <PaidRow t={t} />
      </dl>
    </div>
  );
}

function SummaryRows({ t, foreign, sym, fxRate }: { t: Totals; foreign: boolean; sym: string; fxRate: string | number | null }) {
  return (
    <dl className="text-sm space-y-1">
      {/* ★ 2026-11-14 ส่วนลดรวม (เจ้าของขอ "มีเขียนตรงสรุปด้วยว่าส่วนลดรวมเท่าไหร่") — ค่าสินค้าด้านล่าง = หักส่วนลดแล้ว */}
      {(t.discount_foreign ?? 0) > 0 && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้าก่อนลด{foreign ? ` (${sym.trim()})` : ""}</dt><dd className="tabular-nums">{foreign ? sym : "฿"}{fmtMoney(t.subtotal_foreign + (t.discount_foreign ?? 0))}</dd></div>}
      {(t.discount_foreign ?? 0) > 0 && <div className="flex justify-between text-red-600"><dt>ส่วนลดรวม</dt><dd className="tabular-nums">−{foreign ? sym : "฿"}{fmtMoney(t.discount_foreign)}{foreign && (t.discount_thb ?? 0) > 0 ? <span className="ml-1 text-[11px] text-red-400">(฿{fmtMoney(t.discount_thb)})</span> : null}</dd></div>}
      {foreign && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า ({sym.trim()}){(t.discount_foreign ?? 0) > 0 ? " สุทธิ" : ""}</dt><dd className="tabular-nums">{sym}{fmtMoney(t.subtotal_foreign)}</dd></div>}
      {foreign && <div className="flex justify-between text-xs"><dt className="text-slate-400">เรท</dt><dd className="tabular-nums text-slate-500">× {fxRate || "—"}</dd></div>}
      <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า</dt><dd className="tabular-nums">฿{fmtMoney(t.subtotal_thb)}</dd></div>
      <ExtraRows t={t} foreign={foreign} sym={sym} fxRate={fxRate} />
      <div className="flex justify-between"><dt className="text-slate-500">ค่าส่ง <span className="text-[10px] text-slate-400">แยก</span></dt><dd className="tabular-nums text-orange-700">฿{fmtMoney(t.ship_total_thb)}</dd></div>
      <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5"><dt className="font-semibold text-slate-700">รวมทั้งสิ้น</dt><dd className="tabular-nums font-bold text-slate-900 text-lg">฿{fmtMoney(t.grand_total_thb)}</dd></div>
      <PaidRow t={t} />
    </dl>
  );
}

/** ด้านขวาตอนเป็นร่าง: เช็กลิสต์ + สรุปยอด + บันทึกร่าง + ยืนยัน */
export function VoucherChecklistCard({ items, totals, foreign, sym, fxRate, refFx = null, dirty, saving, onSave, onConfirm, onSetGoodsThb, revise = null, onSetShip, hideSave = false, onEditFx, refFxDate = null, docDate = null }: {
  items: CheckItem[]; totals: Totals; foreign: boolean; sym: string; fxRate: string | number | null;
  /** เรทอ้างอิง (เรทหยวนวันที่ใบ) — ใช้เตือนเรทผิดปกติ · ไม่มี = ไม่เทียบ */
  refFx?: number | null;
  /** ★ 2026-11-22 แตะเรทในกล่องยอดเงิน → ตัวเปลี่ยนเรท (components/fx-rate-quick) · ไม่ส่ง = เรทอ่านอย่างเดียว */
  onEditFx?: () => void; refFxDate?: string | null; docDate?: string | null;
  dirty: boolean; saving: boolean; onSave: () => void; onConfirm: () => void;
  /** แก้ยอดค่าสินค้าบาท → หน้าใบคิดเรทใหม่ (ใบร่างสกุลต่างประเทศ) */
  onSetGoodsThb?: (thb: number) => void;
  /** ★ 2026-11-15 กำลังแก้ใบที่ยืนยันแล้ว → ปุ่มหลัก = บันทึกการแก้ไข (เวอร์ชันถัดไป) · ไม่ใช่ยืนยัน + ออกเลข */
  revise?: { nextRev: number } | null;
  /** ★ 2026-11-15 พิมพ์ยอดค่าส่งเองในส่วนยอดเงิน (null = กลับไปคิดตามเรท) */
  onSetShip?: (thb: number | null) => void;
  /** หน้าใบมีแถบบันทึกร่างติดล่างจอแล้ว → ไม่ต้องมีปุ่มบันทึกซ้ำในการ์ด */
  hideSave?: boolean;
}) {
  const ok = canConfirm(items);
  // ★ 2026-11-15 แบบ B: การ์ดเดียว 4 ช่อง — ตรวจ (ขาว) · ยอดเงิน (เทาอ่อน) · รวมทั้งสิ้น (แถบเข้ม) · ปุ่ม
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-3">
        <SectionTitle icon="inspect">ตรวจก่อนยืนยัน<CheckChip items={items} /></SectionTitle>
        <div className="-mx-2"><CheckList items={items} /></div>
      </div>
      <MoneySection t={totals} foreign={foreign} sym={sym} fxRate={fxRate} refFx={refFx} onSetGoodsThb={onSetGoodsThb} onSetShip={onSetShip} onEditFx={onEditFx} refFxDate={refFxDate} docDate={docDate} />
      <div className="bg-slate-800 text-white px-4 py-2.5 flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-200">รวมทั้งสิ้น</span>
        <span className="text-xl font-bold tabular-nums">฿{fmtMoney(totals.grand_total_thb)}</span>
      </div>
      <div className="px-4 py-3">
        <button onClick={onConfirm} disabled={saving}
          className={`w-full h-11 rounded-lg text-sm font-semibold text-white ${revise ? (ok ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 hover:bg-blue-400") : ok ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-300 hover:bg-orange-400"} disabled:opacity-50`}>
          {revise ? `✓ บันทึกการแก้ไข → เวอร์ชัน ${revise.nextRev}` : "✓ ยืนยัน + ออกเลข"}
        </button>
        {!hideSave && (
          <button onClick={onSave} disabled={saving || !dirty}
            className="mt-2 w-full h-9 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            {saving ? "กำลังบันทึก…" : dirty ? (revise ? "💾 เก็บที่แก้ไว้ก่อน (ยังไม่จบการแก้)" : "💾 บันทึกร่าง (ยังไม่ยืนยัน)") : (revise ? "เก็บที่แก้แล้ว" : "บันทึกร่างแล้ว")}
          </button>
        )}
        <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          {revise
            ? <><b className="font-medium text-slate-600">กดบันทึกการแก้ไขแล้ว:</b> เลขใบเดิม · เก็บใบเดิมเป็นประวัติ · ราคาใหม่อัปเดตที่ใบสั่งซื้อ / ราคาร้าน / ต้นทุนสินค้า · จ่ายเงินไปแล้วและยอดเปลี่ยน = ระบบเตือน</>
            : <><b className="font-medium text-slate-600">กดยืนยันแล้ว:</b> ได้เลขใบ PV · ราคาอัปเดตที่ใบสั่งซื้อ / ราคาร้าน / ต้นทุนสินค้า · ใบล็อกแก้ราคาไม่ได้ · ต่อไปจ่ายเงิน</>}
        </div>
      </div>
    </div>
  );
}

/** ป๊อปยืนยัน — บอกชัด ๆ ว่ากดแล้วเกิดอะไร (ใช้ข้อมูลจริงของใบ) */
export function VoucherConfirmModal({ header, items, totals, foreign, sym, fxRate, skuCount, confirming, onClose, onConfirm, poPlanLabels = [] }: {
  header: VoucherHeader; items: CheckItem[]; totals: Totals; foreign: boolean; sym: string; fxRate: string | number | null;
  skuCount: number; confirming: boolean; onClose: () => void; onConfirm: () => void;
  /** ★ 2026-11-15 งานแก้ใบสั่งซื้อที่เลือกไว้ในบิลร้าน (ลด PO ตามบิล / ปิดยอดของที่ไม่มา) — ทำหลังยืนยันใบ */
  poPlanLabels?: string[];
}) {
  const blocks = items.filter((c) => c.level === "block");
  const fxWarn = items.find((c) => c.key === "fx" && c.level === "warn");
  const pos = header.po_nos.length ? header.po_nos.join(", ") : "—";
  const step = (n: number, title: string, body: React.ReactNode) => (
    <li className="flex gap-2.5">
      <span className="w-6 h-6 shrink-0 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0"><div className="text-sm font-medium text-slate-800">{title}</div><div className="text-xs text-slate-500 leading-relaxed">{body}</div></div>
    </li>
  );
  return (
    <ERPModal open onClose={() => !confirming && onClose()} size="md" storageKey="pv-confirm-b"
      title="✓ ยืนยันใบสำคัญรับ" description={`${header.seller_name ?? ""} · ฿${fmtMoney(totals.grand_total_thb)}`}
      footer={<>
        <button onClick={onClose} disabled={confirming} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยังก่อน</button>
        <button onClick={onConfirm} disabled={confirming || blocks.length > 0} className="px-5 h-9 text-sm font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">{confirming ? "กำลังยืนยัน…" : "ยืนยัน + ออกเลข"}</button>
      </>}>
      {poPlanLabels.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <div className="font-medium">จะแก้ใบสั่งซื้อด้วย ({poPlanLabels.length}) — ตามที่เลือกไว้ในบิลร้าน</div>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">{poPlanLabels.map((x, k) => <li key={k}>{x}</li>)}</ul>
          <div className="mt-1 text-[11px] text-amber-700">ของที่ปิดยอด หน้าขอซื้อ / ใบสั่งผลิตจะกลับเป็น &quot;ต้องซื้อ&quot;</div>
        </div>
      )}
      {blocks.length > 0 && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          ยังยืนยันไม่ได้ — {blocks.map((b) => b.label).join(" · ")}
        </div>
      )}
      {/* ★ 2026-11-15 เรทผิดปกติ (ต่างจากเรทวันที่ใบเกิน 10%) — เตือนอีกรอบก่อนกดยืนยัน (ยืนยันได้) */}
      {fxWarn && (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <Icon name="warning" mode="line" size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <span>{fxWarn.label} — ตรวจยอดบาท/เรทอีกทีก่อนยืนยัน</span>
        </div>
      )}
      <div className="rounded-lg bg-slate-50 px-3 py-2 mb-3"><SummaryRows t={totals} foreign={foreign} sym={sym} fxRate={fxRate} /></div>
      <div className="text-xs font-semibold text-slate-600 mb-2">กดแล้วจะเกิด 4 อย่าง</div>
      <ol className="space-y-2.5">
        {step(1, "ได้เลขใบสำคัญ PV-ปี-ลำดับ", <>ขึ้นที่หัวใบนี้ · ใบย้ายไปแท็บ “ยืนยันแล้ว” ในรายการใบสำคัญรับ</>)}
        {step(2, "อัปเดตราคา 3 ที่ (ไม่รวมค่าส่ง)", <>ใบสั่งซื้อ {pos} (ราคาต่อหน่วย + ยอดใบ) · ราคาของร้าน {header.seller_name ?? ""} · ต้นทุนบนสินค้า {skuCount} รายการ{foreign ? ` (ทั้ง ${sym.trim()} และบาท)` : ""}</>)}
        {step(3, "ใบล็อก แก้ราคาในใบนี้ไม่ได้อีก", <>ถ้าผิด กด “ยกเลิกใบนี้” — ระบบคืนราคาเดิมให้ และใบรับ {header.gr_nos.join(", ") || ""} กลับไปรอออกใบสำคัญใหม่</>)}
        {step(4, "ต่อไป: จ่ายเงิน", <>ด้านขวาจะมีการ์ด “งานถัดไป”: พิมพ์ใบซื้อ · จ่ายค่าสินค้า ({foreign ? "ร้านจีน: ส่งไปโอนเงินจีน" : "ติ๊กว่าจ่ายแล้ว"}){totals.ship_total_thb > 0 ? " · จ่ายค่าส่ง" : ""}</>)}
      </ol>
      <p className="mt-3 text-[11px] text-slate-400">สต๊อกไม่เปลี่ยน (ของเข้าคลังไปแล้วตอนออกใบรับ)</p>
    </ERPModal>
  );
}

const STATE_CHIP: Record<string, { text: string; cls: string }> = {
  done: { text: "เสร็จแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  billed: { text: "ลงบิลแล้ว รอโอน", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  todo: { text: "ต้องทำ", cls: "bg-orange-50 text-orange-700 border-orange-300" },
  none: { text: "ไม่ต้องทำ", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};

/** หลังยืนยัน: งานถัดไป 3 ช่อง (ใช้ handler เดิมของหน้า: mark-paid / ค่าส่ง) */
export function VoucherNextSteps({ voucherId, header, foreign, sym, canEdit, payBusy, lastConfirm, onMarkPoPaid, shippingSlot }: {
  voucherId: string; header: VoucherHeader; foreign: boolean; sym: string; canEdit: boolean; payBusy: boolean;
  lastConfirm: ConfirmResult | null;
  onMarkPoPaid: (p: PoPayment, paid: boolean) => void;
  /** ส่วนจ่ายค่าส่ง (ของเดิมในหน้า — ปุ่มจ่าย + ผูกบิลค่าส่ง) */
  shippingSlot: React.ReactNode;
}) {
  const st = nextSteps(header.po_payments, header.ship_total_thb, header.shipping_payment_status === "paid");
  const allDone = (st.goods === "done" || st.goods === "none") && (st.shipping === "done" || st.shipping === "none");
  const wb = lastConfirm?.write_back ?? [];
  const cnt = { po: wb.filter((r) => r.po).length, pl: wb.filter((r) => r.price_list).length, sku: wb.filter((r) => r.sku).length };
  const Chip = ({ s }: { s: string }) => <span className={`text-[11px] px-1.5 py-0.5 rounded border ${STATE_CHIP[s].cls}`}>{STATE_CHIP[s].text}</span>;
  const Head = ({ n, title, s }: { n: number; title: string; s?: string }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] flex items-center justify-center">{n}</span>{title}</span>
      {s && <Chip s={s} />}
    </div>
  );
  return (
    <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden">
      <div className="bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <div className="font-semibold">✅ ยืนยันแล้ว · <span className="font-mono">{header.pv_no}</span></div>
        <div className="text-xs text-emerald-700 mt-0.5">{header.confirmed_at ? formatDate(header.confirmed_at) : ""}{header.confirmed_by ? ` · ${header.confirmed_by}` : ""}</div>
        {lastConfirm && (
          <div className="text-xs mt-1">
            อัปเดตราคาแล้ว: ใบสั่งซื้อ {cnt.po} บรรทัด · ราคาร้าน {cnt.pl} · ต้นทุนสินค้า {cnt.sku}
            {lastConfirm.failed > 0 && <span className="block text-amber-700">⚠ อัปเดตไม่สำเร็จ {lastConfirm.failed} รายการ — ดูในประวัติการแก้</span>}
          </div>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div className="text-xs font-semibold text-slate-500">งานถัดไป</div>
        <div>
          <Head n={1} title="พิมพ์ใบซื้อ" />
          <div className="text-[11px] text-slate-400 mt-0.5 mb-1.5">เก็บเข้าแฟ้ม / ส่งบัญชี</div>
          <a href={`/print/purchase-voucher/${voucherId}`} target="_blank" rel="noreferrer" className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center">🖨 พิมพ์ใบซื้อ</a>
        </div>
        <div>
          <Head n={2} title="จ่ายค่าสินค้า" s={st.goods} />
          <div className="text-[11px] text-slate-400 mt-0.5 mb-1.5">ยอดตามราคาในใบนี้ · {foreign ? "ร้านจีน: ส่งไปโอนเงินจีน (ใบสั่งซื้อเป็นจ่ายแล้วเองเมื่อโอนครบ)" : "จ่ายแล้วกดติ๊กทีละใบ"}</div>
          <div className="space-y-1.5">
            {header.po_payments.map((p) => {
              const paid = String(p.payment_status).toLowerCase() === "paid";
              return (
                <div key={p.po_id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-600">{p.po_no}</span>
                    <span className="tabular-nums font-medium text-slate-800">฿{fmtMoney(p.goods_thb)}{foreign ? <span className="text-[11px] text-slate-400 font-normal"> ({sym}{fmtMoney(p.goods_foreign)})</span> : null}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    {paid
                      ? <span className="text-xs text-emerald-700">🟢 จ่ายแล้ว {p.paid_date ? formatDate(p.paid_date) : ""}{p.paid_via === "china_bill" ? " · ผ่านบิลจีน" : ""}</span>
                      : p.china_bill_id ? <span className="text-xs text-amber-800">🟡 ลงบิลแล้ว รอโอน</span>
                      : <span className="text-xs text-orange-700">🟠 ยังไม่จ่าย</span>}
                    {canEdit && (paid
                      ? (p.paid_via !== "china_bill" && <button onClick={() => onMarkPoPaid(p, false)} disabled={payBusy} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">↩ ยกเลิกจ่าย</button>)
                      : !p.china_bill_id && <button onClick={() => onMarkPoPaid(p, true)} disabled={payBusy} className={`h-7 px-2.5 text-[11px] font-medium rounded-md border disabled:opacity-50 ${foreign ? "border-slate-200 text-slate-500 bg-white hover:bg-slate-50" : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}>{foreign ? "ติ๊กจ่ายเอง" : "💰 จ่ายแล้ว"}</button>)}
                  </div>
                </div>
              );
            })}
            {header.po_payments.length === 0 && <div className="text-xs text-slate-400">ใบนี้ไม่มีใบสั่งซื้อ (รายการเพิ่มเอง)</div>}
          </div>
          {foreign && (st.goods === "todo" || !!header.china_bill_id) && <div className="mt-2"><SendToChinaPayButton voucherId={voucherId} currency={header.currency} status={header.status} chinaBillId={header.china_bill_id} variant="inline" /></div>}
        </div>
        <div>
          <Head n={3} title="ค่าส่ง" s={st.shipping} />
          {st.shipping === "none"
            ? <div className="text-[11px] text-slate-400 mt-0.5">รอบนี้ไม่มีค่าส่ง</div>
            : <div className="mt-1.5">{shippingSlot}</div>}
        </div>
        {allDone && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">✓ ครบทุกช่อง — ใบนี้ปิดงานแล้ว</div>}
      </div>
    </div>
  );
}
