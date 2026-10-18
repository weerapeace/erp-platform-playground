"use client";

/**
 * 🛒 ตั้งค่าดีไซน์ตะกร้า (แท็บ ดีไซน์ → 🛒 ตะกร้า) — ค่าใน theme.cart (lib/website-cart · มิเรอร์ storefront src/lib/cart-config.ts)
 * เว็บร้านวาดที่ components/cart/* — ลิ้นชักตะกร้า + หน้า /cart ใช้ตัววาดเดียวกัน
 * พรีวิว: ตอนอยู่แท็บนี้ หน้าตั้งค่าสั่งให้เว็บในพรีวิวเปิดตะกร้าค้างไว้ (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ดู ไม่ใส่ตะกร้าจริง)
 */
import type { ReactNode } from "react";
import { Seg } from "@/components/website-block-editor";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { CART_IMAGE_SIZES, CART_RECS_SOURCES, CART_STYLES, CART_WIDTHS, DEFAULT_TRUST_ITEMS, etaLine, freeShipLine, type CartConfig, type CartStyle } from "@/lib/website-cart";

const lbl = "block text-[11px] font-medium text-slate-500 mb-1";
const input = "w-full h-8 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400";
const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3";

/** การ์ดตั้งค่า (หัว + คำอธิบาย + สวิตช์เปิด/ปิด) — ใช้ร่วมกับแท็บ 💳 หน้าชำระเงิน (website-checkout-settings) */
export function Card({ title, hint, children, on, onToggle }: { title: string; hint?: string; children?: ReactNode; on?: boolean; onToggle?: (v: boolean) => void }) {
  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        {onToggle && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={!!on} onChange={(e) => onToggle(e.target.checked)} />
            {on ? "เปิด" : "ปิด"}
          </label>
        )}
      </div>
      {(on ?? true) && children}
    </div>
  );
}

export function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Text({ label, value, onChange, placeholder, max = 80 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number }) {
  return (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input className={input} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** ภาพย่อรูปแบบตะกร้า (ลิ้นชักขวา/ซ้าย/กลางจอ) */
function StyleThumb({ style }: { style: CartStyle }) {
  const panel = style === "modal" ? { left: "22%", width: "56%", top: "18%", height: "64%", borderRadius: 4 } : style === "drawer-left" ? { left: 0, width: "42%", top: 0, height: "100%" } : { right: 0, width: "42%", top: 0, height: "100%" };
  return (
    <span className="relative block w-full h-12 rounded-md bg-slate-200 overflow-hidden">
      <span className="absolute bg-white shadow" style={panel}>
        <span className="block mx-1.5 mt-1.5 h-1 rounded bg-slate-300" />
        <span className="block mx-1.5 mt-1 h-2.5 rounded bg-slate-100" />
        <span className="block mx-1.5 mt-1 h-2.5 rounded bg-slate-100" />
      </span>
    </span>
  );
}

export function CartSettings({
  value: c,
  onChange,
  shopSlug,
  onPreviewPage,
}: {
  value: CartConfig;
  onChange: (v: CartConfig) => void;
  shopSlug: string;
  /** สั่งพรีวิวไปหน้า (เช่น /cart) */
  onPreviewPage?: (path: string) => void;
}) {
  const set = (p: Partial<CartConfig>) => onChange({ ...c, ...p });
  const trust = c.trustItems;
  const setTrust = (items: CartConfig["trustItems"]) => set({ trustItems: items });
  const drag = useDragReorder((from, to) => setTrust(moveItem(trust, from, to)));
  // ตัวอย่างข้อความส่งฟรี (ยอดขาด ฿350)
  const fsSample = freeShipLine(c.freeShipText, "฿350");

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        👁 อยู่แท็บนี้ → พรีวิวเปิดตะกร้าค้างไว้ให้ดู (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ ไม่ใช่ตะกร้าจริง)
        {onPreviewPage && (
          <>
            {" · "}
            <button type="button" onClick={() => onPreviewPage("/cart")} className="text-blue-600 hover:underline">
              ดูหน้าตะกร้าเต็มหน้า (/cart)
            </button>
          </>
        )}
      </p>

      {/* ── หน้าตา ── */}
      <Card title="🧺 หน้าตาตะกร้า" hint="ค่าเริ่มต้น = แบบเดิม (ลิ้นชักขวา กว้างกลาง)">
        <div>
          <span className={lbl}>เปิดแบบ</span>
          <div className="grid grid-cols-3 gap-2">
            {CART_STYLES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ style: o.value })}
                className={`rounded-lg border p-1.5 text-[11px] text-center ${c.style === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                <StyleThumb style={o.value} />
                <span className="block mt-1">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>ความกว้าง (มือถือ = เต็มจอเสมอ)</span>
            <Seg value={c.width} onChange={(width) => set({ width })} options={CART_WIDTHS.map((w) => ({ v: w.value, l: `${w.label} ${w.px}px` }))} wheel />
          </div>
          <Text label="หัวข้อ" value={c.title} onChange={(title) => set({ title })} placeholder="ตะกร้า" max={40} />
        </div>
        <div>
          <span className={lbl}>กดไอคอนตะกร้าที่หัวเว็บ</span>
          <Seg
            value={c.openMode}
            onChange={(openMode) => set({ openMode })}
            options={[
              { v: "drawer", l: "เปิดลิ้นชัก (เดิม)" },
              { v: "page", l: "ไปหน้าตะกร้าเต็มหน้า /cart" },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-1">หน้า /cart ใช้ได้เสมอ (ส่งลิงก์ให้ลูกค้าได้) · กดใส่ตะกร้าจากการ์ดสินค้ายังเด้งลิ้นชักให้เห็นทันที</p>
        </div>
      </Card>

      {/* ── รายการสินค้า ── */}
      <Card title="🧾 รายการสินค้าในตะกร้า">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className={lbl}>ขนาดรูป</span>
            <Seg value={c.imageSize} onChange={(imageSize) => set({ imageSize })} options={CART_IMAGE_SIZES.map((s) => ({ v: s.value, l: s.label }))} wheel />
          </div>
          <div>
            <span className={lbl}>ทรงรูป</span>
            <Seg
              value={c.imageShape}
              onChange={(imageShape) => set({ imageShape })}
              options={[
                { v: "rounded", l: "มน (เดิม)" },
                { v: "square", l: "เหลี่ยม" },
                { v: "circle", l: "วงกลม" },
              ]}
            />
          </div>
          <div>
            <span className={lbl}>รูปในกรอบ</span>
            <Seg
              value={c.imageFit}
              onChange={(imageFit) => set({ imageFit })}
              options={[
                { v: "cover", l: "เต็มกรอบ (เดิม)" },
                { v: "contain", l: "เห็นครบ" },
              ]}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label="โชว์ตัวเลือกที่ลูกค้าเลือก (สี/ขนาด/ปั๊มชื่อ)" checked={c.showOptions} onChange={(showOptions) => set({ showOptions })} />
          <Check label="โชว์ราคาต่อชิ้น" hint="เช่น ฿320 / ชิ้น ใต้ชื่อ" checked={c.showUnitPrice} onChange={(showUnitPrice) => set({ showUnitPrice })} />
          <Check label="โชว์ราคาเต็มขีดฆ่า + “ประหยัด ฿X”" hint="เฉพาะสินค้าที่ตั้งราคาเต็มไว้" checked={c.showCompare} onChange={(showCompare) => set({ showCompare })} />
          <Check label="♡ ปุ่ม “ย้ายไปรายการโปรด”" hint="เอาออกจากตะกร้า + เก็บในรายการโปรด (ต้องเปิดระบบสมาชิก · ยังไม่เข้าสู่ระบบ = ไปหน้าเข้าสู่ระบบ)" checked={c.wishlist} onChange={(wishlist) => set({ wishlist })} />
        </div>
      </Card>

      {/* ── ตอนว่าง ── */}
      <Card title="🫙 ตอนตะกร้าว่าง" hint="เปิดสินค้าแนะนำไว้ → ตอนว่างก็โชว์สินค้าแนะนำให้ด้วย">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ข้อความ" value={c.emptyText} onChange={(emptyText) => set({ emptyText })} placeholder="ยังไม่มีสินค้าในตะกร้า" max={120} />
          <Text label="ปุ่ม (เว้นว่าง = ข้อความเดิมของร้าน)" value={c.emptyButton} onChange={(emptyButton) => set({ emptyButton })} placeholder="เลือกซื้อสินค้า" max={40} />
        </div>
      </Card>

      {/* ── ท้ายตะกร้า ── */}
      <Card title="💳 ท้ายตะกร้า (ยอดรวม + ปุ่ม)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ปุ่มสั่งซื้อ" value={c.checkoutText} onChange={(checkoutText) => set({ checkoutText })} placeholder="ดำเนินการสั่งซื้อ" max={40} />
          <Text label="ปุ่ม “เลือกซื้อต่อ” (เว้นว่าง = ไม่มีปุ่ม)" value={c.continueText} onChange={(continueText) => set({ continueText })} placeholder="เช่น เลือกซื้อต่อ" max={40} />
        </div>
        <Text label="ข้อความใต้ยอดรวม (เว้นว่าง = ไม่โชว์)" value={c.noteText} onChange={(noteText) => set({ noteText })} placeholder="ยังไม่รวมค่าจัดส่ง · คำนวณตอนชำระเงิน" max={120} />
        <Check label="ปุ่ม “ล้างตะกร้า”" checked={c.showClear} onChange={(showClear) => set({ showClear })} />
      </Card>

      <Card title="🚚 แถบ “อีก ฿X ส่งฟรี”" hint="ยอดส่งฟรีตั้งที่แท็บ 🏪 ข้อมูลร้าน (ส่งฟรีเมื่อยอดถึง) — ยังไม่ตั้ง = ไม่โชว์แถบ" on={c.freeShip} onToggle={(freeShip) => set({ freeShip })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ข้อความตอนยังไม่ถึง ({amount} = ยอดที่ขาด)" value={c.freeShipText} onChange={(freeShipText) => set({ freeShipText })} placeholder="อีก {amount} ส่งฟรี" />
          <Text label="ข้อความตอนถึงแล้ว" value={c.freeShipDone} onChange={(freeShipDone) => set({ freeShipDone })} placeholder="🎉 ได้ส่งฟรีแล้ว" />
        </div>
        <p className="text-[11px] text-slate-500">
          ตัวอย่าง: <b className="text-slate-700">{fsSample}</b>
          {!c.freeShipText.includes("{amount}") && <span className="text-amber-700"> · ⚠ ไม่มี {"{amount}"} ลูกค้าจะไม่เห็นว่าขาดอีกเท่าไร</span>}
        </p>
      </Card>

      {/* ── สินค้าแนะนำ ── */}
      <Card title="🛍 สินค้าแนะนำในตะกร้า" hint="ชวนซื้อเพิ่ม — ไม่โชว์ของที่อยู่ในตะกร้าแล้ว · ข้ามสินค้าหมด/ไม่มีราคา" on={c.recs} onToggle={(recs) => set({ recs })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="หัวข้อ" value={c.recsTitle} onChange={(recsTitle) => set({ recsTitle })} placeholder="คุณอาจชอบ" max={40} />
          <div>
            <span className={lbl}>จำนวนสูงสุด</span>
            <Seg value={String(c.recsLimit)} onChange={(v) => set({ recsLimit: Number(v) })} options={[2, 3, 4, 6, 8, 10, 12].map((n) => ({ v: String(n), l: String(n) }))} wheel />
          </div>
        </div>
        <div>
          <span className={lbl}>เลือกสินค้าจาก</span>
          <Seg value={c.recsSource} onChange={(recsSource) => set({ recsSource })} options={CART_RECS_SOURCES.map((s) => ({ v: s.value, l: s.label }))} />
          <p className="text-[11px] text-slate-500 mt-1">{CART_RECS_SOURCES.find((s) => s.value === c.recsSource)?.hint}</p>
        </div>
        {c.recsSource === "manual" && (
          <div>
            <span className={lbl}>รุ่นที่จะโชว์ (เรียงตามที่เลือก · สูงสุด 24)</span>
            <WebsiteProductPicker shopSlug={shopSlug} value={c.recsCodes} max={24} onChange={(recsCodes) => set({ recsCodes })} />
            {!c.recsCodes.length && <p className="text-[11px] text-amber-700 mt-1">⚠ ยังไม่ได้เลือกรุ่น — ลูกค้าจะไม่เห็นสินค้าแนะนำ</p>}
          </div>
        )}
        <Check
          label="ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีให้ถึงส่งฟรีขึ้นก่อน"
          hint="เช่น ขาดอีก ฿150 → สินค้าราคา ฿150 ขึ้นไปที่ใกล้ที่สุดขึ้นหน้า (ต้องตั้งยอดส่งฟรีในข้อมูลร้าน)"
          checked={c.recsFreeShip}
          onChange={(recsFreeShip) => set({ recsFreeShip })}
        />
      </Card>

      {/* ── ฟังก์ชันเพิ่ม ── */}
      <Card title="✨ ฟังก์ชันเพิ่มในตะกร้า" hint="ลูกค้ากรอก/เลือกในตะกร้า → ไปต่อหน้าชำระเงินให้เอง (ไม่ต้องกรอกซ้ำ)">
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label="🎟️ ช่องโค้ดส่วนลด" hint="ตรวจโค้ด + โชว์ส่วนลดให้ดูก่อน (ใช้คูปองในแท็บ 🎟️ คูปอง)" checked={c.coupon} onChange={(coupon) => set({ coupon })} />
          <Check label="⭐ แต้มที่จะได้" hint="สมาชิก: “สั่งครั้งนี้ได้ ~N แต้ม” · ยังไม่สมัคร: ชวนสมัคร (ต้องเปิดระบบแต้มในข้อมูลร้าน)" checked={c.points} onChange={(points) => set({ points })} />
          <Check label="🎀 ห่อของขวัญ" hint="ติ๊กห่อในตะกร้า (เขียนการ์ดตอนชำระเงิน · ต้องเปิดห่อของขวัญในข้อมูลร้าน)" checked={c.gift} onChange={(gift) => set({ gift })} />
          <Check label="📝 หมายเหตุถึงร้าน" hint="เช่น โทรก่อนส่ง — ไปเติมช่องหมายเหตุหน้าชำระเงิน" checked={c.note} onChange={(note) => set({ note })} />
        </div>
      </Card>

      <Card title="🛡 แถบความมั่นใจ (ใต้ปุ่มสั่งซื้อ)" hint="สูงสุด 4 ข้อ · ลาก ⠿ เพื่อเรียง" on={c.trust} onToggle={(v) => set({ trust: v })}>
        <div className="space-y-1.5">
          {trust.map((it, i) => (
            <div key={i} {...drag.rowProps(i)} className={`flex items-center gap-2 ${drag.rowCls(i)}`}>
              <DragHandle {...drag.handleProps(i)} />
              <input className="w-14 shrink-0 h-8 rounded-lg border border-slate-200 px-1 text-center text-sm focus:outline-none focus:border-blue-400" value={it.icon} maxLength={8} onChange={(e) => setTrust(trust.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))} aria-label="ไอคอน" />
              <input className={`${input} min-w-0`} value={it.text} maxLength={60} placeholder="ข้อความ" onChange={(e) => setTrust(trust.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <button type="button" onClick={() => setTrust(trust.filter((_, j) => j !== i))} className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300" title="ลบ">
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-3">
            {trust.length < 4 && (
              <button type="button" onClick={() => setTrust([...trust, { icon: "✅", text: "" }])} className="text-xs text-blue-600 hover:underline">
                + เพิ่มข้อ
              </button>
            )}
            <button type="button" onClick={() => setTrust(DEFAULT_TRUST_ITEMS.map((x) => ({ ...x })))} className="text-xs text-slate-500 hover:underline">
              ↺ ใช้ชุดเริ่มต้น
            </button>
          </div>
          {trust.some((x) => !x.text.trim()) && <p className="text-[11px] text-amber-700">⚠ ข้อที่ไม่มีข้อความจะไม่โชว์บนเว็บ</p>}
        </div>
      </Card>

      <Card title="📅 วันที่คาดว่าได้รับ" hint="นับวันทำการ (จ.–ศ.) จากวันที่ลูกค้าดูตะกร้า — เป็นค่าประมาณ" on={c.eta} onToggle={(eta) => set({ eta })}>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <label className="block">
            <span className={lbl}>เร็วสุด (วันทำการ)</span>
            <input type="number" min={0} max={60} className={input} value={c.etaMin} onChange={(e) => set({ etaMin: Math.max(0, Math.min(60, Number(e.target.value) || 0)), etaMax: Math.max(c.etaMax, Number(e.target.value) || 0) })} />
          </label>
          <label className="block">
            <span className={lbl}>ช้าสุด (วันทำการ)</span>
            <input type="number" min={c.etaMin} max={90} className={input} value={c.etaMax} onChange={(e) => set({ etaMax: Math.max(c.etaMin, Math.min(90, Number(e.target.value) || 0)) })} />
          </label>
          <div className="col-span-2">
            <Text label="ข้อความ ({from} {to} = วันที่)" value={c.etaText} onChange={(etaText) => set({ etaText })} placeholder="ได้รับประมาณ {from} – {to}" />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          ถ้าลูกค้าดูวันนี้จะเห็น: <b className="text-slate-700">🚚 {etaLine(c)}</b>
        </p>
      </Card>
    </div>
  );
}
