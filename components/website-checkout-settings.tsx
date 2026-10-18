"use client";

/**
 * 💳 ตั้งค่าดีไซน์หน้าชำระเงิน (แท็บ ดีไซน์ → 💳 หน้าชำระเงิน) — ค่าใน theme.checkout (lib/website-checkout · มิเรอร์ storefront src/lib/checkout-config.ts)
 * เว็บร้านวาดที่ components/checkout/CheckoutClient.tsx (หน้ากรอก + หน้าขอบคุณ)
 * พรีวิว: แท็บนี้พาพรีวิวไป /checkout (ตะกร้าว่าง = เว็บใส่สินค้าตัวอย่างให้ดู ไม่ส่งออเดอร์จริง) · หน้าขอบคุณ = /checkout?pv=thanks
 * เปิด/ปิดช่องทางจ่าย · เลขพร้อมเพย์ · ค่าส่ง = แท็บข้อมูลร้าน
 */
import { Seg } from "@/components/website-block-editor";
import { Card, Text } from "@/components/website-cart-settings";
import { CHECKOUT_TEXT, type CheckoutConfig } from "@/lib/website-checkout";

export interface CheckoutPayInfo {
  cod: boolean;
  promptpay: boolean;
  /** กรอกเลขพร้อมเพย์แล้วหรือยัง (ไม่มี = ลูกค้าไม่เห็นช่องพร้อมเพย์) */
  promptpayNumber: boolean;
}

const PH = (k: keyof typeof CHECKOUT_TEXT) => CHECKOUT_TEXT[k].th;

export function CheckoutSettings({
  value: c,
  onChange,
  payInfo,
  onPreviewPage,
}: {
  value: CheckoutConfig;
  onChange: (next: CheckoutConfig) => void;
  payInfo?: CheckoutPayInfo | null;
  /** พาพรีวิวไปหน้านั้น ("/checkout" · "/checkout?pv=thanks") */
  onPreviewPage?: (path: string) => void;
}) {
  const set = (p: Partial<CheckoutConfig>) => onChange({ ...c, ...p });
  const ppNoNumber = !!payInfo?.promptpay && !payInfo.promptpayNumber;
  const noPayment = !!payInfo && !payInfo.cod && !(payInfo.promptpay && payInfo.promptpayNumber);

  return (
    <div className="space-y-3">
      {/* ⚠️ ตั้งค่าที่ทำให้ลูกค้าไม่เห็นช่องทางจ่าย (แก้ที่แท็บข้อมูลร้าน) */}
      {(ppNoNumber || noPayment) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 space-y-0.5">
          {noPayment && <p>⚠️ ยังไม่มีช่องทางชำระเงินที่ใช้ได้ — ลูกค้าจะกดยืนยันคำสั่งซื้อไม่ได้</p>}
          {ppNoNumber && <p>⚠️ เปิดรับโอนพร้อมเพย์อยู่ แต่ยังไม่ได้ใส่เลขพร้อมเพย์ — ลูกค้าจะไม่เห็นช่องนี้</p>}
          <p className="text-amber-700">ไปตั้งที่แท็บ 🏪 ข้อมูลร้าน → การสั่งซื้อ</p>
        </div>
      )}

      {onPreviewPage && (
        <p className="text-[11px] text-slate-500">
          👁 พรีวิวด้านขวา (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ดู · กดยืนยันในพรีวิวไม่ส่งออเดอร์จริง) ·{" "}
          <button type="button" onClick={() => onPreviewPage("/checkout")} className="text-blue-600 hover:underline">
            หน้าชำระเงิน
          </button>{" "}
          ·{" "}
          <button type="button" onClick={() => onPreviewPage("/checkout?pv=thanks")} className="text-blue-600 hover:underline">
            หน้าขอบคุณ
          </button>
        </p>
      )}

      <Card title="🔤 ข้อความ" hint="เว้นว่าง = ข้อความเริ่มต้น (โชว์จาง ๆ ในช่อง) · ภาษาอังกฤษแปลได้ที่ปุ่ม 🌐 EN ด้านบน">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="หัวหน้า" value={c.title} onChange={(title) => set({ title })} placeholder={PH("title")} max={60} />
          <Text label="ปุ่มยืนยัน" value={c.confirmText} onChange={(confirmText) => set({ confirmText })} placeholder={PH("confirmText")} max={40} />
        </div>
      </Card>

      <Card title="📝 ช่องที่ลูกค้ากรอก" hint="ชื่อ · เบอร์โทร · บ้านเลขที่ = บังคับเสมอ (ใช้จัดส่ง)">
        <div className="divide-y divide-slate-100">
          <Row label="ชื่อ-นามสกุล · เบอร์โทร · บ้านเลขที่">
            <span className="text-[11px] text-slate-400">🔒 บังคับเสมอ</span>
          </Row>
          <Row label="อีเมล" hint="ซ่อน = ไม่ถามเลย (สมาชิกที่ล็อกอินยังเติมให้เอง)">
            <Seg value={c.email} onChange={(email) => set({ email })} options={[{ v: "opt", l: "แสดง" }, { v: "req", l: "บังคับ" }, { v: "hide", l: "ซ่อน" }]} />
          </Row>
          <Row label="ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์">
            <Seg value={c.addressDetail} onChange={(addressDetail) => set({ addressDetail })} options={[{ v: "opt", l: "แสดง" }, { v: "req", l: "บังคับ" }]} />
          </Row>
          <Row label="หมายเหตุถึงร้าน">
            <Seg value={c.note} onChange={(note) => set({ note })} options={[{ v: "show", l: "แสดง" }, { v: "hide", l: "ซ่อน" }]} />
          </Row>
        </div>
      </Card>

      <Card title="📐 การจัดวาง">
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">สรุปคำสั่งซื้อ (จอคอม · มือถือเรียงเป็นคอลัมน์เดียวเสมอ)</span>
          <Seg value={c.layout} onChange={(layout) => set({ layout })} options={[{ v: "right", l: "อยู่ขวา (เดิม)" }, { v: "left", l: "อยู่ซ้าย" }, { v: "top", l: "คอลัมน์เดียว สรุปบน" }]} />
        </div>
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">กล่องแต่ละส่วน</span>
          <Seg value={c.boxStyle} onChange={(boxStyle) => set({ boxStyle })} options={[{ v: "card", l: "มีกรอบ (เดิม)" }, { v: "flat", l: "เรียบ ไม่มีกรอบ" }]} />
        </div>
      </Card>

      <Card title="💳 ช่องทางชำระเงิน" hint="ชื่อ/คำอธิบายที่ลูกค้าเห็น · เปิด-ปิดช่องทาง เลขบัญชี ค่าส่ง ตั้งที่แท็บ 🏪 ข้อมูลร้าน">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="เก็บเงินปลายทาง: ชื่อ" value={c.codLabel} onChange={(codLabel) => set({ codLabel })} placeholder={PH("codLabel")} max={40} />
          <Text label="เก็บเงินปลายทาง: คำอธิบาย" value={c.codHint} onChange={(codHint) => set({ codHint })} placeholder={PH("codHint")} max={80} />
          <Text label="โอนพร้อมเพย์: ชื่อ" value={c.promptpayLabel} onChange={(promptpayLabel) => set({ promptpayLabel })} placeholder={PH("promptpayLabel")} max={40} />
          <Text label="โอนพร้อมเพย์: คำอธิบาย" value={c.promptpayHint} onChange={(promptpayHint) => set({ promptpayHint })} placeholder={PH("promptpayHint")} max={80} />
        </div>
        {payInfo && (
          <p className="text-[11px] text-slate-500">
            ตอนนี้ลูกค้าเห็น: {[payInfo.cod && "เก็บเงินปลายทาง", payInfo.promptpay && payInfo.promptpayNumber && "โอนพร้อมเพย์"].filter(Boolean).join(" · ") || "— ยังไม่มี —"}
          </p>
        )}
      </Card>

      <Card title="🛡 แถบความมั่นใจใต้ปุ่มยืนยัน" hint="ข้อความสั้น ๆ ให้ลูกค้าอุ่นใจก่อนกดสั่ง" on={c.trust} onToggle={(trust) => set({ trust })}>
        <Text label="ข้อความ (คั่นแต่ละข้อด้วย ·)" value={c.trustText} onChange={(trustText) => set({ trustText })} placeholder={PH("trustText")} max={160} />
      </Card>

      <Card title="🙏 หน้าขอบคุณ (หลังกดสั่ง)" hint="เลขที่ออเดอร์ · วิธีจ่าย · สรุปรายการ ยังโชว์ตามเดิม">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="หัวข้อ" value={c.thanksTitle} onChange={(thanksTitle) => set({ thanksTitle })} placeholder={PH("thanksTitle")} max={60} />
          <Text label="ข้อความใต้หัวข้อ ({shop} = ชื่อร้าน)" value={c.thanksText} onChange={(thanksText) => set({ thanksText })} placeholder={PH("thanksText")} max={200} />
        </div>
        {onPreviewPage && (
          <button type="button" onClick={() => onPreviewPage("/checkout?pv=thanks")} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700">
            👁 ดูพรีวิวหน้าขอบคุณ (ออเดอร์ตัวอย่าง)
          </button>
        )}
      </Card>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <div className="shrink-0 w-48">{children}</div>
    </div>
  );
}
