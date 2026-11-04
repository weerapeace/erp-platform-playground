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
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/landed-cost";
import { SendToChinaPayButton } from "@/components/china-pay-send-button";
import { canConfirm, nextSteps, type CheckItem } from "@/lib/purchase-voucher-checklist";
import type { PoPayment, VoucherHeader } from "@/lib/purchase-voucher-server";

type Totals = { subtotal_foreign: number; subtotal_thb: number; ship_total_thb: number; grand_total_thb: number };
export type ConfirmResult = { pv_no: string; write_back: { po: boolean; price_list: boolean; sku: boolean; error?: string }[]; failed: number };

const ICON: Record<CheckItem["level"], { mark: string; cls: string }> = {
  ok: { mark: "✓", cls: "text-emerald-700" },
  block: { mark: "✕", cls: "text-rose-600" },
  warn: { mark: "!", cls: "text-amber-700" },
  info: { mark: "i", cls: "text-slate-500" },
};

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
    <ul className="space-y-1.5">
      {items.map((c) => (
        <li key={c.key} className="flex gap-2 text-[13px]">
          <span className={`w-4 h-4 mt-0.5 shrink-0 rounded-full border text-[10px] font-bold flex items-center justify-center ${ICON[c.level].cls} border-current`}>{ICON[c.level].mark}</span>
          <span className="min-w-0">
            <span className={c.level === "block" ? "text-rose-700" : c.level === "warn" ? "text-amber-800" : "text-slate-700"}>{c.label}</span>
            {c.hint && c.level !== "ok" && <span className="block text-[11px] text-slate-400">{c.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SummaryRows({ t, foreign, sym, fxRate }: { t: Totals; foreign: boolean; sym: string; fxRate: string | number | null }) {
  return (
    <dl className="text-sm space-y-1">
      {foreign && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า ({sym.trim()})</dt><dd className="tabular-nums">{sym}{fmtMoney(t.subtotal_foreign)}</dd></div>}
      {foreign && <div className="flex justify-between text-xs"><dt className="text-slate-400">เรท</dt><dd className="tabular-nums text-slate-500">× {fxRate || "—"}</dd></div>}
      <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า</dt><dd className="tabular-nums">฿{fmtMoney(t.subtotal_thb)}</dd></div>
      <div className="flex justify-between"><dt className="text-slate-500">ค่าส่ง <span className="text-[10px] text-slate-400">แยก</span></dt><dd className="tabular-nums text-orange-700">฿{fmtMoney(t.ship_total_thb)}</dd></div>
      <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5"><dt className="font-semibold text-slate-700">รวมทั้งสิ้น</dt><dd className="tabular-nums font-bold text-slate-900 text-lg">฿{fmtMoney(t.grand_total_thb)}</dd></div>
    </dl>
  );
}

/** ด้านขวาตอนเป็นร่าง: เช็กลิสต์ + สรุปยอด + บันทึกร่าง + ยืนยัน */
export function VoucherChecklistCard({ items, totals, foreign, sym, fxRate, dirty, saving, onSave, onConfirm }: {
  items: CheckItem[]; totals: Totals; foreign: boolean; sym: string; fxRate: string | number | null;
  dirty: boolean; saving: boolean; onSave: () => void; onConfirm: () => void;
}) {
  const ok = canConfirm(items);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">ก่อนยืนยัน</div>
      <CheckList items={items} />
      <div className="mt-3 pt-3 border-t border-slate-100"><SummaryRows t={totals} foreign={foreign} sym={sym} fxRate={fxRate} /></div>
      <button onClick={onConfirm} disabled={saving}
        className={`mt-3 w-full h-11 rounded-lg text-sm font-semibold text-white ${ok ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-300 hover:bg-orange-400"} disabled:opacity-50`}>
        ✓ ยืนยัน + ออกเลข
      </button>
      <button onClick={onSave} disabled={saving || !dirty}
        className="mt-2 w-full h-9 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        {saving ? "กำลังบันทึก…" : dirty ? "💾 บันทึกร่าง (ยังไม่ยืนยัน)" : "บันทึกร่างแล้ว"}
      </button>
      <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        <b className="font-medium text-slate-600">กดยืนยันแล้ว:</b> ได้เลขใบ PV · ราคาอัปเดตที่ใบสั่งซื้อ / ราคาร้าน / ต้นทุนสินค้า · ใบล็อกแก้ราคาไม่ได้ · ต่อไปจ่ายเงิน
      </div>
    </div>
  );
}

/** ป๊อปยืนยัน — บอกชัด ๆ ว่ากดแล้วเกิดอะไร (ใช้ข้อมูลจริงของใบ) */
export function VoucherConfirmModal({ header, items, totals, foreign, sym, fxRate, skuCount, confirming, onClose, onConfirm }: {
  header: VoucherHeader; items: CheckItem[]; totals: Totals; foreign: boolean; sym: string; fxRate: string | number | null;
  skuCount: number; confirming: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const blocks = items.filter((c) => c.level === "block");
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
      {blocks.length > 0 && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          ยังยืนยันไม่ได้ — {blocks.map((b) => b.label).join(" · ")}
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
          {foreign && st.goods === "todo" && <div className="mt-2"><SendToChinaPayButton voucherId={voucherId} currency={header.currency} status={header.status} variant="inline" /></div>}
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
