"use client";

/**
 * 👀 ShippingCustomerPreview — "ลูกค้าจะเห็นแบบนี้" ในแท็บ 🚚 การจัดส่ง
 *
 * ช่องลองสมมติตะกร้า (ยอด/จำนวนชิ้น/รหัสไปรษณีย์/เก็บปลายทาง) + กล่อง "วิธีจัดส่ง" หน้าตาตามหน้าชำระเงินจริงของเว็บร้าน
 * (storefront src/components/checkout/ShippingMethodBox — ข้อความชุดเดียวกัน) + สรุปของวิธีที่กำลังแก้
 * คิดด้วย lib/website-shipping ตัวเดียวกับเว็บร้านและตอนรับออเดอร์ → ตัวเลขตรงของจริง
 */
import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { cutoffText, quoteMethod, visibleMethods, type ShippingConfig } from "@/lib/website-shipping";

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const QUICK_POSTALS: [string, string][] = [["10200", "กทม."], ["50000", "เชียงใหม่"], ["84320", "เกาะสมุย"]];

export function ShippingCustomerPreview({ cfg, selectedId }: { cfg: ShippingConfig; selectedId: string | null }) {
  const [subtotal, setSubtotal] = useState("990");
  const [qty, setQty] = useState("1");
  const [postal, setPostal] = useState("10200");
  const [cod, setCod] = useState(false);
  const ctx = useMemo(() => ({ subtotal: Math.max(0, Number(subtotal) || 0), qty: Math.max(1, Math.floor(Number(qty) || 1)), postal, cod: false }), [subtotal, qty, postal]);
  // เหมือนหน้าชำระเงิน: กล่องวิธีส่งคิดแบบยังไม่เลือก COD (ค่า COD ไปบวกตอนเลือกวิธีจ่าย)
  const rows = useMemo(() => visibleMethods(cfg).map((m) => ({ m, q: quoteMethod(m, ctx, cfg) })), [cfg, ctx]);
  const sel = cfg.methods.find((m) => m.id === selectedId) ?? null;
  const sq = sel ? quoteMethod(sel, { ...ctx, cod }, cfg) : null;
  const now = new Date();
  const small = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums focus:border-blue-400 focus:outline-none";

  return (
    <div className="space-y-3" data-quote-preview>
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">🧮 ลองสมมติตะกร้าลูกค้า</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <label className="space-y-0.5">
            <span className="block">ยอดสินค้า (บาท)</span>
            <MoneyInput value={subtotal} onChange={setSubtotal} className={`${small} w-full`} />
          </label>
          <label className="space-y-0.5">
            <span className="block">จำนวนชิ้น</span>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${small} w-full`} />
          </label>
          <div className="col-span-2 space-y-0.5">
            <span className="block">รหัสไปรษณีย์ผู้รับ</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <input value={postal} onChange={(e) => setPostal(e.target.value.replace(/\D/g, "").slice(0, 5))} className={`${small} w-20 font-mono`} aria-label="รหัสไปรษณีย์ผู้รับ" />
              {QUICK_POSTALS.map(([p, t]) => (
                <button key={p} type="button" onClick={() => setPostal(p)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${postal === p ? "border-blue-400 bg-white text-blue-700" : "border-slate-200 bg-white/70 text-slate-500 hover:text-slate-700"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="col-span-2 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} /> ลูกค้าเลือกเก็บเงินปลายทาง
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-shipping-methods-preview>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h4 className="text-base font-semibold text-slate-900">วิธีจัดส่ง</h4>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">หน้าชำระเงินของลูกค้า</span>
        </div>
        {!rows.length && <p className="text-sm text-slate-400">ยังไม่มีวิธีที่เปิดอยู่ — ลูกค้าจะสั่งซื้อไม่ได้</p>}
        <div className="flex flex-col gap-2">
          {rows.map(({ m, q }) => {
            const on = m.id === selectedId;
            const off = q.reason === "area";
            const line = off
              ? "ส่งไม่ถึงรหัสไปรษณีย์นี้"
              : [
                  m.eta ? (m.kind === "ship" && /^\d/.test(m.eta) ? `ถึงภายใน ${m.eta}` : m.eta) : "",
                  cutoffText(m, now),
                  !m.codAllowed && m.kind === "ship" ? "ไม่รับเก็บเงินปลายทาง" : "",
                  q.remoteFee ? `รวมพื้นที่ห่างไกล ${money(q.remoteFee)}` : "",
                ].filter(Boolean).join(" · ");
            return (
              <div key={m.id} className={`flex items-start gap-2.5 rounded-xl border p-3 ${off ? "opacity-50" : ""} ${on ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                <span className={`mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${on ? "border-slate-900 bg-slate-900 ring-2 ring-inset ring-white" : "border-slate-300"}`} />
                <span className="text-lg leading-none">{m.kind === "pickup" ? "🏪" : "🚚"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900">{m.name || "(ไม่มีชื่อ)"}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{off ? "—" : q.fee ? money(q.fee) : "ฟรี"}</span>
                  </span>
                  {line && <span className="mt-0.5 block text-xs text-slate-500">{line}</span>}
                  {!off && q.toFree > 0 && <span className="mt-1 block text-xs text-emerald-700">ซื้ออีก {money(q.toFree)} ส่งฟรี</span>}
                  {m.note && <span className="mt-1 block text-xs text-slate-600">📍 {m.note}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {sel && sq && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" data-quote-selected>
          {!sel.enabled ? (
            <span className="text-slate-400">“{sel.name}” ปิดอยู่ — ลูกค้าไม่เห็นวิธีนี้</span>
          ) : !sq.available ? (
            <span className="text-rose-700">“{sel.name}”: {sq.reason === "area" ? "ส่งไม่ถึงรหัสไปรษณีย์นี้" : "เก็บเงินปลายทางไม่ได้กับวิธีนี้"}</span>
          ) : (
            <>
              ถ้าลูกค้าเลือก <b>{sel.name}</b>: ค่าส่ง <b className="tabular-nums">{money(sq.fee)}</b>
              {sq.codFee ? <> + เก็บปลายทาง <b className="tabular-nums">{money(sq.codFee)}</b></> : null}
              {sq.freeApplied ? " (ได้ส่งฟรีแล้ว)" : ""}
              {sq.box ? <> · แพ็กกล่อง <b>{sq.box}</b></> : null}
            </>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-400">คิดด้วยสูตรเดียวกับเว็บร้านจริงและตอนรับออเดอร์</p>
    </div>
  );
}
