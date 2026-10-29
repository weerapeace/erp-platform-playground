"use client";

/**
 * 📜 นโยบายจัดส่ง & คืนสินค้า + ♡ รายการโปรด — การ์ดในแท็บดีไซน์ → หน้าสินค้า (theme.product.policy / theme.product.wish)
 * ค่าเก็บในธีม (ต้องบันทึก/เผยแพร่) · กฎ + ค่าเริ่ม = lib/website-wish-policy (มิเรอร์ไปเว็บร้าน)
 * เว็บร้านวาดที่: help/PolicyLink (ลิงก์ + แผงข้าง/ป๊อป) · product-details (บรรทัดคืนสินค้า) · shop/WishlistHeart · member/wishlist · หน้า /wishlist
 */
import { Card, Check, Text } from "@/components/website-cart-settings";
import { Seg } from "@/components/website-block-editor";
import { POLICY_SLUGS, POLICY_TEXT, returnsLineText, type ProductPolicy, type ProductWish } from "@/lib/website-wish-policy";

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
  const live = pages.filter((x) => (x.status ?? "published") === "published");
  const found = p.page ? live.find((x) => x.slug === p.page) : POLICY_SLUGS.shipping.map((s) => live.find((x) => x.slug === s)).find(Boolean);
  const anyOn = p.returnsLine || p.link || p.cart;
  return (
    <Card title="📜 นโยบายจัดส่ง & คืนสินค้า" hint="บรรทัดคืนสินค้า + ลิงก์อ่านนโยบาย ในหน้าสินค้าและตะกร้า">
      <div className="space-y-2.5">
        <Check
          label={`บรรทัด “${returnsLineText(returnsDays || 14, "th")}”`}
          hint={`ต่อท้ายหัวข้อการจัดส่งในรายละเอียดสินค้า · จำนวนวันมาจาก ข้อมูลร้าน › การคืนสินค้า${returnsDays ? ` (ตอนนี้ ${returnsDays} วัน)` : ""}`}
          checked={p.returnsLine}
          onChange={(returnsLine) => onChange({ returnsLine })}
        />
        <Check label="ลิงก์ “อ่านนโยบาย…” ท้ายหัวข้อการจัดส่ง" hint="กดแล้วอ่านนโยบายเต็มได้เลย (ตั้งด้านล่างว่าเปิดแบบไหน)" checked={p.link} onChange={(link) => onChange({ link })} />
        <Check label="ลิงก์เดียวกันในตะกร้า" hint="ใต้ปุ่มชำระเงิน (ลิ้นชักตะกร้า + หน้า /cart)" checked={p.cart} onChange={(cart) => onChange({ cart })} />
      </div>

      {anyOn && shippingTitle && shippingTitle !== POLICY_TEXT.shipping.th && onRenameShipping && (
        <p className="text-xs text-slate-600 rounded-lg bg-slate-50 px-3 py-2">
          หัวข้อตอนนี้ชื่อ “{shippingTitle}” —{" "}
          <button type="button" className="text-blue-600 hover:underline" onClick={onRenameShipping}>
            เปลี่ยนเป็น “{POLICY_TEXT.shipping.th}”
          </button>
        </p>
      )}

      {(p.link || p.cart) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={lbl}>หน้านโยบาย</span>
            <select className={sel} value={p.page} onChange={(e) => onChange({ page: e.target.value })}>
              <option value="">หาเอง (แนะนำ){!p.page && found ? ` — ${found.title}` : ""}</option>
              {live.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.title} (/{x.slug})
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={lbl}>เปิดแบบ</span>
            <Seg
              value={p.open}
              onChange={(open) => onChange({ open })}
              options={[
                { v: "drawer", l: "แผงข้าง" },
                { v: "modal", l: "ป๊อปกลางจอ" },
                { v: "page", l: "หน้าเต็ม" },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <Text label="ข้อความลิงก์" obj={p} k="linkText" onPatch={(x) => onChange(x as Partial<ProductPolicy>)} placeholder={POLICY_TEXT.link.th} enPlaceholder={POLICY_TEXT.link.en} />
          </div>
          {!found && (
            <p className="sm:col-span-2 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800">
              ⚠️ ยังไม่เจอหน้านโยบายที่เผยแพร่แล้ว → ลิงก์จะยังไม่โชว์ ·{" "}
              <a className="underline" href={`/website/${encodeURIComponent(shopSlug)}?tab=pages`} target="_blank" rel="noreferrer">
                สร้าง/เผยแพร่ที่แท็บ หน้าเว็บ ↗
              </a>{" "}
              (ปุ่ม 🧭 สร้างชุดศูนย์ช่วยเหลือ มีหน้า “การจัดส่งและการคืนสินค้า”)
            </p>
          )}
          <p className="sm:col-span-2 text-[11px] text-slate-500">แผงข้าง/ป๊อป = โชว์ Section เอกสารของหน้านั้น ลูกค้าอ่านได้โดยไม่ออกจากหน้าสินค้า · มือถือเป็นแผ่นเลื่อนขึ้นจากล่าง</p>
        </div>
      )}
    </Card>
  );
}

const WISH_MODES: { v: ProductWish["mode"]; l: string; hint: string }[] = [
  { v: "members", l: "เฉพาะสมาชิก (เดิม)", hint: "ต้องเปิดระบบสมาชิก (ตั้งช่องทางเข้าสู่ระบบ) — ยังไม่เปิด = ไม่มีหัวใจเลย · ยังไม่เข้าสู่ระบบ กดแล้วชวนสมัคร" },
  { v: "guest", l: "ทุกคน ไม่ต้องสมัคร", hint: "กดหัวใจได้ทันที เก็บไว้ในเครื่องลูกค้า ดูได้ที่หน้า /wishlist · ถ้าภายหลังเปิดสมาชิก ล็อกอินแล้วย้ายเข้าบัญชีให้เอง" },
  { v: "off", l: "ปิด", hint: "ไม่มีหัวใจทั้งเว็บ (การ์ด · หน้าสินค้า · ตะกร้า)" },
];

export function WishSettings({ value: w, onChange }: { value: ProductWish; onChange: (patch: Partial<ProductWish>) => void }) {
  const mode = WISH_MODES.find((m) => m.v === w.mode) ?? WISH_MODES[0];
  return (
    <Card title="♡ รายการโปรด" hint="ใครกดใจได้ · ตำแหน่ง/หน้าตาหัวใจ ในหน้าสินค้าและการ์ด">
      <div>
        <span className={lbl}>ใครกดหัวใจได้</span>
        <Seg value={w.mode} onChange={(mode) => onChange({ mode })} options={WISH_MODES.map(({ v, l }) => ({ v, l }))} />
        <p className="text-[11px] text-slate-500 mt-1">{mode.hint}</p>
      </div>
      {w.mode !== "off" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={lbl}>หน้าสินค้า: ตำแหน่งหัวใจ</span>
              <Seg
                value={w.pos}
                onChange={(pos) => onChange({ pos })}
                options={[
                  { v: "button", l: "ข้างปุ่มตะกร้า" },
                  { v: "below", l: "ข้อความใต้ปุ่ม" },
                  { v: "image", l: "มุมรูปสินค้า" },
                ]}
              />
            </div>
            {w.pos === "button" && (
              <div>
                <span className={lbl}>หน้าตาหัวใจข้างปุ่ม</span>
                <Seg
                  value={w.style}
                  onChange={(style) => onChange({ style })}
                  options={[
                    { v: "outline", l: "กรอบ (เดิม)" },
                    { v: "icon", l: "ไอคอนเปล่า" },
                    { v: "text", l: "ไอคอน + คำ" },
                  ]}
                />
              </div>
            )}
            <div>
              <span className={lbl}>การ์ดสินค้า</span>
              <Seg
                value={w.card}
                onChange={(card) => onChange({ card })}
                options={[
                  { v: "hover", l: "ตอนชี้ (เดิม)" },
                  { v: "always", l: "โชว์ตลอด" },
                  { v: "off", l: "ไม่โชว์" },
                ]}
              />
            </div>
          </div>
          <Check label="มือถือ: หัวใจในแถบใส่ตะกร้าลอยล่างจอ" checked={w.mobileBar} onChange={(mobileBar) => onChange({ mobileBar })} />
          <p className="text-[11px] text-slate-500">
            💡 ไอคอนหัวใจ + จำนวนบนหัวเว็บ: หัวเว็บ › ชิ้นส่วน › ลาก “รายการโปรด” ไปวาง · ปุ่ม “ย้ายไปรายการโปรด” ในตะกร้า: แท็บตะกร้า
          </p>
        </>
      )}
    </Card>
  );
}
