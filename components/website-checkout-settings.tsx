"use client";

/**
 * 💳 ตั้งค่าดีไซน์หน้าชำระเงิน (แท็บ ดีไซน์ → 💳 หน้าชำระเงิน) — ค่าใน theme.checkout (lib/website-checkout · มิเรอร์ storefront src/lib/checkout-config.ts)
 * เว็บร้านวาดที่ components/checkout/CheckoutClient.tsx (หน้ากรอก + หน้าขอบคุณ)
 * พรีวิว: แท็บนี้พาพรีวิวไป /checkout (ตะกร้าว่าง = เว็บใส่สินค้าตัวอย่างให้ดู ไม่ส่งออเดอร์จริง) · หน้าขอบคุณ = /checkout?pv=thanks
 * เปิด/ปิดช่องทางจ่าย · เลขพร้อมเพย์ · ค่าส่ง = แท็บข้อมูลร้าน
 */
import { Seg } from "@/components/website-block-editor";
import { Card, Check, Text } from "@/components/website-cart-settings";
import { CHECKOUT_TEXT, type CheckoutConfig } from "@/lib/website-checkout";
import { useT } from "@/components/i18n";

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
  const t = useT();
  const set = (p: Partial<CheckoutConfig>) => onChange({ ...c, ...p });
  const ppNoNumber = !!payInfo?.promptpay && !payInfo.promptpayNumber;
  const noPayment = !!payInfo && !payInfo.cod && !(payInfo.promptpay && payInfo.promptpayNumber);

  return (
    <div className="space-y-3">
      {/* ⚠️ ตั้งค่าที่ทำให้ลูกค้าไม่เห็นช่องทางจ่าย (แก้ที่แท็บข้อมูลร้าน) */}
      {(ppNoNumber || noPayment) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 space-y-0.5">
          {noPayment && <p>{t("⚠️ ยังไม่มีช่องทางชำระเงินที่ใช้ได้ — ลูกค้าจะกดยืนยันคำสั่งซื้อไม่ได้", "⚠️ No usable payment method yet — customers can't confirm orders")}</p>}
          {ppNoNumber && <p>{t("⚠️ เปิดรับโอนพร้อมเพย์อยู่ แต่ยังไม่ได้ใส่เลขพร้อมเพย์ — ลูกค้าจะไม่เห็นช่องนี้", "⚠️ PromptPay is on but no PromptPay number is set — customers won't see it")}</p>}
          <p className="text-amber-700">{t("ไปตั้งที่แท็บ 🏪 ข้อมูลร้าน → การสั่งซื้อ", "Set it in 🏪 Shop info → Ordering")}</p>
        </div>
      )}

      {onPreviewPage && (
        <p className="text-[11px] text-slate-500">
          {t("👁 พรีวิวด้านขวา (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ดู · กดยืนยันในพรีวิวไม่ส่งออเดอร์จริง) ·", "👁 Preview on the right (empty cart = sample products · confirming in the preview sends no real order) ·")}{" "}
          <button type="button" onClick={() => onPreviewPage("/checkout")} className="text-blue-600 hover:underline">
            {t("หน้าชำระเงิน", "Checkout")}
          </button>{" "}
          ·{" "}
          <button type="button" onClick={() => onPreviewPage("/checkout?pv=thanks")} className="text-blue-600 hover:underline">
            {t("หน้าขอบคุณ", "Thank-you page")}
          </button>
        </p>
      )}

      <Card title={t("🔤 ข้อความ", "🔤 Text")} hint={t("เว้นว่าง = ข้อความเริ่มต้น (โชว์จาง ๆ ในช่อง) · ภาษาอังกฤษแปลได้ที่ปุ่ม 🌐 EN ด้านบน", "Empty = default text (shown faded in the box) · translate to English with the 🌐 EN button above")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("หัวหน้า", "Page title")} obj={c} k="title" onPatch={set} placeholder={PH("title")} enPlaceholder={CHECKOUT_TEXT.title.en} max={60} />
          <Text label={t("ปุ่มยืนยัน", "Confirm button")} obj={c} k="confirmText" onPatch={set} placeholder={PH("confirmText")} enPlaceholder={CHECKOUT_TEXT.confirmText.en} max={40} />
        </div>
      </Card>

      <Card title={t("📝 ช่องที่ลูกค้ากรอก", "📝 Customer fields")} hint={t("ชื่อ · เบอร์โทร · บ้านเลขที่ = บังคับเสมอ (ใช้จัดส่ง)", "Name · phone · house no. = always required (for delivery)")}>
        <div className="divide-y divide-slate-100">
          <Row label={t("ชื่อ-นามสกุล · เบอร์โทร · บ้านเลขที่", "Full name · phone · house no.")}>
            <span className="text-[11px] text-slate-400">{t("🔒 บังคับเสมอ", "🔒 Always required")}</span>
          </Row>
          <Row label={t("อีเมล", "Email")} hint={t("ซ่อน = ไม่ถามเลย (สมาชิกที่ล็อกอินยังเติมให้เอง)", "Hidden = never asked (logged-in members still get it filled in)")}>
            <Seg value={c.email} onChange={(email) => set({ email })} options={[{ v: "opt", l: t("แสดง", "Show") }, { v: "req", l: t("บังคับ", "Required") }, { v: "hide", l: t("ซ่อน", "Hide") }]} />
          </Row>
          <Row label={t("ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์", "Subdistrict / district / province / postcode")}>
            <Seg value={c.addressDetail} onChange={(addressDetail) => set({ addressDetail })} options={[{ v: "opt", l: t("แสดง", "Show") }, { v: "req", l: t("บังคับ", "Required") }]} />
          </Row>
          <Row label={t("หมายเหตุถึงร้าน", "Note to shop")}>
            <Seg value={c.note} onChange={(note) => set({ note })} options={[{ v: "show", l: t("แสดง", "Show") }, { v: "hide", l: t("ซ่อน", "Hide") }]} />
          </Row>
        </div>
      </Card>

      <Card title={t("📐 การจัดวาง", "📐 Layout")}>
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">{t("สรุปคำสั่งซื้อ (จอคอม · มือถือเรียงเป็นคอลัมน์เดียวเสมอ)", "Order summary (desktop · mobile always single column)")}</span>
          <Seg value={c.layout} onChange={(layout) => set({ layout })} options={[{ v: "right", l: t("อยู่ขวา (เดิม)", "Right (original)") }, { v: "left", l: t("อยู่ซ้าย", "Left") }, { v: "top", l: t("คอลัมน์เดียว สรุปบน", "Single column, summary on top") }]} />
        </div>
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">{t("กล่องแต่ละส่วน", "Section boxes")}</span>
          <Seg value={c.boxStyle} onChange={(boxStyle) => set({ boxStyle })} options={[{ v: "card", l: t("มีกรอบ (เดิม)", "Bordered (original)") }, { v: "flat", l: t("เรียบ ไม่มีกรอบ", "Flat, no border") }]} />
        </div>
      </Card>

      <Card title={t("🔒 หัวเว็บ + มือถือ", "🔒 Header + mobile")} hint={t("ลดลูกค้าหลุดออกระหว่างจ่าย · ทำให้กดยืนยันง่ายบนมือถือ", "Fewer customers leaving mid-payment · easier to confirm on mobile")}>
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">{t("หัวเว็บตอนชำระเงิน", "Header during checkout")}</span>
          <Seg value={c.header} onChange={(header) => set({ header })} options={[{ v: "full", l: t("เต็ม (เดิม)", "Full (original)") }, { v: "simple", l: t("เรียบ: โลโก้ + ชำระเงินปลอดภัย", "Simple: logo + secure checkout") }]} />
          {c.header === "simple" && <p className="text-[11px] text-slate-500 mt-1">{t("ซ่อนเมนู · ไอคอน · แถบประกาศ · ท้ายเว็บ เหลือโลโก้กลาง + ← ตะกร้า + 🔒 ชำระเงินปลอดภัย", "Hides menu · icons · announcement bar · footer, leaving centered logo + ← cart + 🔒 secure checkout")}</p>}
        </div>
        <div>
          <span className="block text-[11px] font-medium text-slate-500 mb-1">{t("มือถือ: สรุปคำสั่งซื้อ", "Mobile: order summary")}</span>
          <Seg value={c.mobileSummary} onChange={(mobileSummary) => set({ mobileSummary })} options={[{ v: "bottom", l: t("อยู่ท้ายหน้า (เดิม)", "At the bottom (original)") }, { v: "collapse", l: t("แถบพับได้บนสุด", "Collapsible bar at top") }]} />
          {c.mobileSummary === "collapse" && <p className="text-[11px] text-slate-500 mt-1">{t("บนสุดเป็นแถบ “ดูสรุปคำสั่งซื้อ ▼ ฿…” กดแล้วกางรายการ/โค้ดส่วนลด · จอคอมเหมือนเดิม", "Top bar “View order summary ▼ ฿…” expands items/discount code · desktop unchanged")}</p>}
        </div>
        <Check label={t("มือถือ: ยอดรวม + ปุ่มยืนยันติดล่างจอ", "Mobile: total + confirm button stuck to the bottom")} hint={t("เลื่อนไปตรงไหนก็กดสั่งได้เลย", "Order from anywhere on the page")} checked={c.stickyConfirm} onChange={(stickyConfirm) => set({ stickyConfirm })} />
        <Check label={t("ยอดรวมในปุ่มยืนยัน", "Total in the confirm button")} hint={t("เช่น “ยืนยันคำสั่งซื้อ · ฿948”", "e.g. “Confirm order · ฿948”")} checked={c.confirmTotal} onChange={(confirmTotal) => set({ confirmTotal })} />
      </Card>

      <Card title={t("💳 ช่องทางชำระเงิน", "💳 Payment methods")} hint={t("ชื่อ/คำอธิบายที่ลูกค้าเห็น · เปิด-ปิดช่องทาง เลขบัญชี ค่าส่ง ตั้งที่แท็บ 🏪 ข้อมูลร้าน", "Names/descriptions customers see · turn methods on/off, account numbers, shipping fees in 🏪 Shop info")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("เก็บเงินปลายทาง: ชื่อ", "Cash on delivery: name")} obj={c} k="codLabel" onPatch={set} placeholder={PH("codLabel")} enPlaceholder={CHECKOUT_TEXT.codLabel.en} max={40} />
          <Text label={t("เก็บเงินปลายทาง: คำอธิบาย", "Cash on delivery: description")} obj={c} k="codHint" onPatch={set} placeholder={PH("codHint")} enPlaceholder={CHECKOUT_TEXT.codHint.en} max={80} />
          <Text label={t("โอนพร้อมเพย์: ชื่อ", "PromptPay transfer: name")} obj={c} k="promptpayLabel" onPatch={set} placeholder={PH("promptpayLabel")} enPlaceholder={CHECKOUT_TEXT.promptpayLabel.en} max={40} />
          <Text label={t("โอนพร้อมเพย์: คำอธิบาย", "PromptPay transfer: description")} obj={c} k="promptpayHint" onPatch={set} placeholder={PH("promptpayHint")} enPlaceholder={CHECKOUT_TEXT.promptpayHint.en} max={80} />
        </div>
        {payInfo && (
          <p className="text-[11px] text-slate-500">
            {t("ตอนนี้ลูกค้าเห็น:", "Customers currently see:")} {[payInfo.cod && t("เก็บเงินปลายทาง", "Cash on delivery"), payInfo.promptpay && payInfo.promptpayNumber && t("โอนพร้อมเพย์", "PromptPay transfer")].filter(Boolean).join(" · ") || t("— ยังไม่มี —", "— none yet —")}
          </p>
        )}
      </Card>

      <Card title={t("🛡 แถบความมั่นใจใต้ปุ่มยืนยัน", "🛡 Trust bar under the confirm button")} hint={t("ข้อความสั้น ๆ ให้ลูกค้าอุ่นใจก่อนกดสั่ง", "Short reassuring text before customers order")} on={c.trust} onToggle={(trust) => set({ trust })}>
        <Text label={t("ข้อความ (คั่นแต่ละข้อด้วย ·)", "Text (separate items with ·)")} obj={c} k="trustText" onPatch={set} placeholder={PH("trustText")} enPlaceholder={CHECKOUT_TEXT.trustText.en} max={160} />
      </Card>

      <Card title={t("📜 นโยบาย + ยอมรับเงื่อนไข", "📜 Policies + accept terms")} hint={t("ลิงก์ ข้อกำหนด · การจัดส่งและคืนสินค้า · ความเป็นส่วนตัว ใต้ปุ่มยืนยัน", "Links to terms · shipping & returns · privacy under the confirm button")}>
        <Check label={t("ลิงก์นโยบายใต้ปุ่มยืนยัน", "Policy links under the confirm button")} hint={t("โชว์เฉพาะหน้าที่เผยแพร่แล้ว (ศูนย์ช่วยเหลือ) · เปิดแบบเดียวกับที่ตั้งใน หน้าสินค้า › 📜 นโยบาย", "Only published pages (Help center) · opens the same way as set in Product page › 📜 Policies")} checked={c.policyLinks} onChange={(policyLinks) => set({ policyLinks })} />
        <Check label={t("ต้องติ๊กยอมรับเงื่อนไขก่อนสั่ง", "Must accept terms before ordering")} hint={t("ไม่ติ๊ก = กดยืนยันไม่ได้ (ขึ้นข้อความเตือน) · เปิดแล้วลิงก์นโยบายโชว์ด้วยเสมอ", "Not ticked = can't confirm (shows a warning) · when on, policy links always show")} checked={c.acceptTerms} onChange={(acceptTerms) => set({ acceptTerms })} />
        {c.acceptTerms && <Text label={t("ข้อความข้างช่องติ๊ก", "Text next to the checkbox")} obj={c} k="acceptText" onPatch={set} placeholder={PH("acceptText")} enPlaceholder={CHECKOUT_TEXT.acceptText.en} max={160} />}
      </Card>

      <Card title={t("🙏 หน้าขอบคุณ (หลังกดสั่ง)", "🙏 Thank-you page (after ordering)")} hint={t("เลขที่ออเดอร์ · วิธีจ่าย · สรุปรายการ ยังโชว์ตามเดิม · ไอคอน/ลูกเล่นตอนเปิด/รูปสินค้า/2 คอลัมน์/ขั้นตอนถัดไป/ข้อความจากร้าน/คูปองครั้งหน้า/โซเชียล/สินค้าแนะนำ ตั้งที่แท็บ 📄 หน้าพิเศษ", "Order no. · payment method · summary still show as before · icon/open effect/product images/2 columns/next steps/shop message/next-order coupon/social/recommendations are set in the 📄 Special pages tab")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("หัวข้อ", "Title")} obj={c} k="thanksTitle" onPatch={set} placeholder={PH("thanksTitle")} enPlaceholder={CHECKOUT_TEXT.thanksTitle.en} max={60} />
          <Text label={t("ข้อความใต้หัวข้อ ({shop} = ชื่อร้าน)", "Text under title ({shop} = shop name)")} obj={c} k="thanksText" onPatch={set} placeholder={PH("thanksText")} enPlaceholder={CHECKOUT_TEXT.thanksText.en} max={200} />
        </div>
        {onPreviewPage && (
          <button type="button" onClick={() => onPreviewPage("/checkout?pv=thanks")} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700">
            {t("👁 ดูพรีวิวหน้าขอบคุณ (ออเดอร์ตัวอย่าง)", "👁 Preview thank-you page (sample order)")}
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
