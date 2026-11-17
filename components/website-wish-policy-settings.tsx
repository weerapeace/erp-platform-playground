"use client";

/**
 * 📜 นโยบายจัดส่ง & คืนสินค้า + ♡ รายการโปรด — การ์ดในแท็บดีไซน์ → หน้าสินค้า (theme.product.policy / theme.product.wish)
 * ค่าเก็บในธีม (ต้องบันทึก/เผยแพร่) · กฎ + ค่าเริ่ม = lib/website-wish-policy (มิเรอร์ไปเว็บร้าน)
 * เว็บร้านวาดที่: help/PolicyLink (ลิงก์ + แผงข้าง/ป๊อป) · product-details (บรรทัดคืนสินค้า) · shop/WishlistHeart · member/wishlist · หน้า /wishlist
 */
import { Card, Check, Text } from "@/components/website-cart-settings";
import { Seg } from "@/components/website-block-editor";
import { POLICY_SLUGS, POLICY_TEXT, returnsLineText, type ProductPolicy, type ProductWish } from "@/lib/website-wish-policy";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type StorePageRef = { slug: string; title: string; status?: string };
const sel = "w-full h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-800 bg-white focus:outline-none focus:border-blue-400";
const lbl = "block text-xs font-medium text-slate-600 mb-1";

export function PolicySettings({
  value: p,
  onChange,
  pages,
  shopSlug,
  returnsDays,
  shippingTitle,
  onRenameShipping,
}: {
  value: ProductPolicy;
  onChange: (patch: Partial<ProductPolicy>) => void;
  /** หน้าเว็บของร้าน (แท็บ 📄 หน้าเว็บ) */
  pages: StorePageRef[];
  shopSlug: string;
  /** ข้อมูลร้าน › การคืนสินค้า (ไม่รู้ = undefined) */
  returnsDays?: number;
  /** ชื่อหัวข้อรายละเอียดที่ดึง "การจัดส่ง & ชำระเงิน" (ไม่มีหัวข้อนี้ = undefined) */
  shippingTitle?: string;
  onRenameShipping?: () => void;
}) {
  const t = useT();
  const live = pages.filter((x) => (x.status ?? "published") === "published");
  const found = p.page ? live.find((x) => x.slug === p.page) : POLICY_SLUGS.shipping.map((s) => live.find((x) => x.slug === s)).find(Boolean);
  const anyOn = p.returnsLine || p.link || p.cart;
  return (
    <Card title={t("📜 นโยบายจัดส่ง & คืนสินค้า", "📜 Shipping & returns policy")} hint={t("บรรทัดคืนสินค้า + ลิงก์อ่านนโยบาย ในหน้าสินค้าและตะกร้า", "Returns line + read-policy link on product page and cart")}>
      <div className="space-y-2.5">
        <Check
          label={t(`บรรทัด “${returnsLineText(returnsDays || 14, "th")}”`, `Line “${returnsLineText(returnsDays || 14, "th")}”`)}
          hint={`${t("ต่อท้ายหัวข้อการจัดส่งในรายละเอียดสินค้า · จำนวนวันมาจาก ข้อมูลร้าน › การคืนสินค้า", "Appended to the shipping section in product details · number of days comes from Shop info › Returns")}${returnsDays ? t(` (ตอนนี้ ${returnsDays} วัน)`, ` (currently ${returnsDays} days)`) : ""}`}
          checked={p.returnsLine}
          onChange={(returnsLine) => onChange({ returnsLine })}
        />
        <Check label={t("ลิงก์ “อ่านนโยบาย…” ท้ายหัวข้อการจัดส่ง", "“Read policy…” link after the shipping section")} hint={t("กดแล้วอ่านนโยบายเต็มได้เลย (ตั้งด้านล่างว่าเปิดแบบไหน)", "Opens the full policy (choose how it opens below)")} checked={p.link} onChange={(link) => onChange({ link })} />
        <Check label={t("ลิงก์เดียวกันในตะกร้า", "Same link in cart")} hint={t("ใต้ปุ่มชำระเงิน (ลิ้นชักตะกร้า + หน้า /cart)", "Below the checkout button (cart drawer + /cart page)")} checked={p.cart} onChange={(cart) => onChange({ cart })} />
      </div>

      {anyOn && shippingTitle && shippingTitle !== POLICY_TEXT.shipping.th && onRenameShipping && (
        <p className="text-xs text-slate-600 rounded-lg bg-slate-50 px-3 py-2">
          {t(`หัวข้อตอนนี้ชื่อ “${shippingTitle}” —`, `The section is currently named “${shippingTitle}” —`)}{" "}
          <button type="button" className="text-blue-600 hover:underline" onClick={onRenameShipping}>
            {t(`เปลี่ยนเป็น “${POLICY_TEXT.shipping.th}”`, `Rename to “${POLICY_TEXT.shipping.th}”`)}
          </button>
        </p>
      )}

      {(p.link || p.cart) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={lbl}>{t("หน้านโยบาย", "Policy page")}</span>
            <select className={sel} value={p.page} onChange={(e) => onChange({ page: e.target.value })}>
              <option value="">{t("หาเอง (แนะนำ)", "Auto-detect (recommended)")}{!p.page && found ? ` — ${found.title}` : ""}</option>
              {live.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.title} (/{x.slug})
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={lbl}>{t("เปิดแบบ", "Open as")}</span>
            <Seg
              value={p.open}
              onChange={(open) => onChange({ open })}
              options={[
                { v: "drawer", l: t("แผงข้าง", "Side panel") },
                { v: "modal", l: t("ป๊อปกลางจอ", "Center popup") },
                { v: "page", l: t("หน้าเต็ม", "Full page") },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <Text label={t("ข้อความลิงก์", "Link text")} obj={p} k="linkText" onPatch={(x) => onChange(x as Partial<ProductPolicy>)} placeholder={POLICY_TEXT.link.th} enPlaceholder={POLICY_TEXT.link.en} />
          </div>
          {!found && (
            <p className="sm:col-span-2 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800">
              {t("⚠️ ยังไม่เจอหน้านโยบายที่เผยแพร่แล้ว → ลิงก์จะยังไม่โชว์ ·", "⚠️ No published policy page found → the link won't show yet ·")}{" "}
              <a className="underline" href={`/website/${encodeURIComponent(shopSlug)}?tab=pages`} target="_blank" rel="noreferrer">
                {t("สร้าง/เผยแพร่ที่แท็บ หน้าเว็บ ↗", "Create/publish in the Pages tab ↗")}
              </a>{" "}
              {t("(ปุ่ม 🧭 สร้างชุดศูนย์ช่วยเหลือ มีหน้า “การจัดส่งและการคืนสินค้า”)", "(the 🧭 Create help center set button includes a “Shipping and returns” page)")}
            </p>
          )}
          <p className="sm:col-span-2 text-[11px] text-slate-500">{t("แผงข้าง/ป๊อป = โชว์ Section เอกสารของหน้านั้น ลูกค้าอ่านได้โดยไม่ออกจากหน้าสินค้า · มือถือเป็นแผ่นเลื่อนขึ้นจากล่าง", "Side panel/popup = shows that page's document Section so customers can read without leaving the product page · on mobile it's a bottom sheet")}</p>
        </div>
      )}
    </Card>
  );
}

const WISH_MODES: { v: ProductWish["mode"]; l: string; hint: string }[] = [
  { v: "members", get l() { return tr("เฉพาะสมาชิก (เดิม)", "Members only (default)"); }, get hint() { return tr("ต้องเปิดระบบสมาชิก (ตั้งช่องทางเข้าสู่ระบบ) — ยังไม่เปิด = ไม่มีหัวใจเลย · ยังไม่เข้าสู่ระบบ กดแล้วชวนสมัคร", "Requires the member system (set up a login method) — not on = no hearts at all · not logged in = clicking prompts sign-up"); } },
  { v: "guest", get l() { return tr("ทุกคน ไม่ต้องสมัคร", "Everyone, no sign-up"); }, get hint() { return tr("กดหัวใจได้ทันที เก็บไว้ในเครื่องลูกค้า ดูได้ที่หน้า /wishlist · ถ้าภายหลังเปิดสมาชิก ล็อกอินแล้วย้ายเข้าบัญชีให้เอง", "Hearts work right away, saved on the customer's device, viewable at /wishlist · if members are turned on later, items move into the account on login"); } },
  { v: "off", get l() { return tr("ปิด", "Off"); }, get hint() { return tr("ไม่มีหัวใจทั้งเว็บ (การ์ด · หน้าสินค้า · ตะกร้า)", "No hearts anywhere on the site (cards · product page · cart)"); } },
];

export function WishSettings({ value: w, onChange }: { value: ProductWish; onChange: (patch: Partial<ProductWish>) => void }) {
  const t = useT();
  const mode = WISH_MODES.find((m) => m.v === w.mode) ?? WISH_MODES[0];
  return (
    <Card title={t("♡ รายการโปรด", "♡ Wishlist")} hint={t("ใครกดใจได้ · ตำแหน่ง/หน้าตาหัวใจ ในหน้าสินค้าและการ์ด", "Who can add hearts · heart position/style on product page and cards")}>
      <div>
        <span className={lbl}>{t("ใครกดหัวใจได้", "Who can add hearts")}</span>
        <Seg value={w.mode} onChange={(mode) => onChange({ mode })} options={WISH_MODES.map(({ v, l }) => ({ v, l }))} />
        <p className="text-[11px] text-slate-500 mt-1">{mode.hint}</p>
      </div>
      {w.mode !== "off" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={lbl}>{t("หน้าสินค้า: ตำแหน่งหัวใจ", "Product page: heart position")}</span>
              <Seg
                value={w.pos}
                onChange={(pos) => onChange({ pos })}
                options={[
                  { v: "button", l: t("ข้างปุ่มตะกร้า", "Next to cart button") },
                  { v: "below", l: t("ข้อความใต้ปุ่ม", "Text below button") },
                  { v: "image", l: t("มุมรูปสินค้า", "Product image corner") },
                ]}
              />
            </div>
            {w.pos === "button" && (
              <div>
                <span className={lbl}>{t("หน้าตาหัวใจข้างปุ่ม", "Heart style next to button")}</span>
                <Seg
                  value={w.style}
                  onChange={(style) => onChange({ style })}
                  options={[
                    { v: "outline", l: t("กรอบ (เดิม)", "Outline (default)") },
                    { v: "icon", l: t("ไอคอนเปล่า", "Icon only") },
                    { v: "text", l: t("ไอคอน + คำ", "Icon + text") },
                  ]}
                />
              </div>
            )}
            <div>
              <span className={lbl}>{t("การ์ดสินค้า", "Product cards")}</span>
              <Seg
                value={w.card}
                onChange={(card) => onChange({ card })}
                options={[
                  { v: "hover", l: t("ตอนชี้ (เดิม)", "On hover (default)") },
                  { v: "always", l: t("โชว์ตลอด", "Always show") },
                  { v: "off", l: t("ไม่โชว์", "Hide") },
                ]}
              />
            </div>
          </div>
          <Check label={t("มือถือ: หัวใจในแถบใส่ตะกร้าลอยล่างจอ", "Mobile: heart in the floating add-to-cart bar")} checked={w.mobileBar} onChange={(mobileBar) => onChange({ mobileBar })} />
          <p className="text-[11px] text-slate-500">
            {t("💡 ไอคอนหัวใจ + จำนวนบนหัวเว็บ: หัวเว็บ › ชิ้นส่วน › ลาก “รายการโปรด” ไปวาง · ปุ่ม “ย้ายไปรายการโปรด” ในตะกร้า: แท็บตะกร้า", "💡 Heart icon + count in the site header: Header › Parts › drag “Wishlist” in · the “Move to wishlist” button in the cart: Cart tab")}
          </p>
        </>
      )}
    </Card>
  );
}
