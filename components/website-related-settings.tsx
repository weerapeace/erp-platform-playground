"use client";

/**
 * 🔗 แท็บ "แนะนำสินค้า" ในหน้าดีไซน์ — ตั้งที่เดียว: สินค้าที่เกี่ยวข้อง (กฎเชื่อมหลายชั้น) + 👀 สินค้าที่ดูล่าสุด
 * ใช้ 2 ที่ (ค่าเดียวกัน): แท็บ 🔗 แนะนำสินค้า + ⚙️ ของส่วน "สินค้าที่เกี่ยวข้อง/ดูล่าสุด" ในลำดับส่วนประกอบหน้าสินค้า
 *
 * ค่าที่แก้ = theme.product.parts.related / parts.recent · เปิด/ปิด = theme.product.hidden ("related" / "recent")
 *   (ตั้งลำดับ/ซ่อนแยกมือถือไว้ → สวิตช์นี้เปิด/ปิดของมือถือด้วย)
 * กฎ = lib/website-theme RELATED_RULES (มิเรอร์ storefront src/lib/related.ts — ทำตามลำดับจนครบจำนวน)
 * 📌 เลือกเองรายรุ่น = store_listings.web_related ตั้งในแท็บ 🛍 เว็บไซต์ ของสินค้า (ช่อง "🔗 สินค้าที่เกี่ยวข้องของรุ่นนี้")
 * ของกลาง: Card/Check/Text (website-cart-settings) · Seg · WebsiteProductPicker · useDragReorder
 */
import { Card, Check, Text } from "@/components/website-cart-settings";
import { Seg } from "@/components/website-block-editor";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { RELATED_RULES, legacySourceOf, type ProductParts, type ProductSection, type RelatedRule, type SiteTheme } from "@/lib/website-theme";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type Product = SiteTheme["product"];

const lbl = webForm.label;
const RELATED_COUNTS = [2, 3, 4, 6, 8];
const RECENT_COUNTS = [2, 3, 4, 6, 8, 10, 12];

/** ชื่อ/คำอธิบายกฎจาก lib/website-theme (RELATED_RULES — คงไทย) → แปลตอนแสดงในหน้าแอดมิน */
const RULE_EN: Record<string, string> = {
  "📌 เลือกเองรายรุ่น": "📌 Picked per model",
  "ตั้งในแท็บ 🛍 เว็บไซต์ ของแต่ละสินค้า → 🔗 สินค้าที่เกี่ยวข้องของรุ่นนี้ (รุ่นที่ไม่ได้ตั้ง = ข้ามไปกฎถัดไป)": "Set in each product's 🛍 Website tab → 🔗 Related products for this model (not set = skip to next rule)",
  "🧵 คอลเลกชันเดียวกัน": "🧵 Same collection",
  "ฟิลด์คอลเลกชันใน Parent SKU": "Collection field in Parent SKU",
  "📂 หมวดเดียวกัน": "📂 Same category",
  "หมวดหลักเดียวกันก่อน แล้วค่อยหมวดอื่นที่อยู่ร่วมกัน (รวมหมวดแม่)": "Same main category first, then other shared categories (incl. parent categories)",
  "🧶 วัสดุเดียวกัน": "🧶 Same material",
  "วัสดุที่ผูกไว้กับสินค้า (หน้าวัสดุ)": "Materials linked to the product (material page)",
  "💰 ราคาใกล้กัน": "💰 Similar price",
  "ราคาห่างไม่เกิน ±30% · ใกล้สุดก่อน": "Within ±30% · closest first",
  "★ สินค้าแนะนำ": "★ Featured",
  "รุ่นที่ติ๊ก ★ แนะนำ": "Models ticked ★ Featured",
  "🔥 ขายดี": "🔥 Best sellers",
  "จากยอดสั่งซื้อบนเว็บ": "From web orders",
  "🆕 มาใหม่": "🆕 New drops",
  "รุ่นที่เพิ่มขึ้นเว็บล่าสุด": "Models most recently added to the site",
  "✋ รายการที่เลือกไว้ (ทุกหน้าเหมือนกัน)": "✋ Picked list (same on every page)",
  "เลือกรุ่นด้านล่าง — โชว์ชุดเดียวกันทุกหน้าสินค้า": "Pick models below — same set on every product page",
  "🎲 สุ่ม": "🎲 Random",
  "สุ่มคงที่ต่อสินค้า (ไม่เปลี่ยนทุกครั้งที่โหลด)": "Fixed random per product (doesn't change on every load)",
};
const ruleEn = (th: string) => tr(th, RULE_EN[th] ?? th);

/** แก้เปิด/ปิดส่วนของหน้าสินค้า — คอม + มือถือ (ถ้ามือถือตั้งซ่อนแยกไว้) */
function withHidden(p: Product, key: ProductSection, on: boolean): Partial<Product> {
  const flip = (list: ProductSection[]) => (on ? list.filter((k) => k !== key) : list.includes(key) ? list : [...list, key]);
  return { hidden: flip(p.hidden), ...(p.mobile.hidden ? { mobile: { ...p.mobile, hidden: flip(p.mobile.hidden) } } : {}) };
}

export function RelatedSettings({
  product,
  onChange,
  shopSlug,
  only,
}: {
  product: Product;
  onChange: (patch: Partial<Product>) => void;
  shopSlug: string;
  /** ⚙️ ในลำดับส่วนประกอบ = โชว์เฉพาะส่วนนั้น (ไม่ส่ง = ทั้งสองการ์ด) */
  only?: "related" | "recent";
}) {
  const t = useT();
  const r = product.parts.related;
  const rc = product.parts.recent;
  const setRelated = (p: Partial<ProductParts["related"]>) => {
    const next = { ...r, ...p };
    onChange({ parts: { ...product.parts, related: { ...next, source: legacySourceOf(next.rules) } } });
  };
  const setRecent = (p: Partial<ProductParts["recent"]>) => onChange({ parts: { ...product.parts, recent: { ...rc, ...p } } });
  const relatedOn = !product.hidden.includes("related");
  const recentOn = !product.hidden.includes("recent");

  const drag = useDragReorder((from, to) => setRelated({ rules: moveItem(r.rules, from, to) }));
  const meta = (k: RelatedRule) => RELATED_RULES.find((x) => x.value === k)!;
  const unused = RELATED_RULES.filter((x) => !r.rules.includes(x.value));

  return (
    <div className="space-y-3">
      {only !== "recent" && (
        <Card
          title={t("🔗 สินค้าที่เกี่ยวข้อง (คุณอาจชอบ)", "🔗 Related products (You may like)")}
          hint={t("โชว์ใต้รายละเอียดสินค้า — เลือกว่าจะเชื่อมสินค้ากันด้วยอะไร เรียงลำดับได้ ระบบทำตามลำดับจนครบจำนวน", "Shows under product details — choose how products are linked, in order; the system follows the order until the count is reached")}
          on={relatedOn}
          onToggle={(v) => onChange(withHidden(product, "related", v))}
        >
          <div className="space-y-3">
            <Text label={t("หัวข้อ (ว่าง = \"สินค้าที่เกี่ยวข้อง\")", "Title (empty = default)")} obj={r} k="title" onPatch={(p) => setRelated(p as Partial<ProductParts["related"]>)} placeholder="เช่น คุณอาจชอบ · จับคู่กับรุ่นนี้" max={80} />
            <div>
              <span className={lbl}>{t("จำนวน", "Amount")}</span>
              <Seg value={String(r.count)} onChange={(v) => setRelated({ count: Number(v) })} options={RELATED_COUNTS.map((n) => ({ v: String(n), l: String(n) }))} wheel />
            </div>
          </div>

          <div>
            <span className={lbl}>{t("เชื่อมด้วย (ทำตามลำดับ · ลาก ⠿ เพื่อเรียง · ได้ครบจำนวนแล้วหยุด)", "Link by (in order · drag ⠿ to reorder · stops once the count is reached)")}</span>
            {r.rules.length === 0 && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-1.5">{t("ยังไม่ได้เลือกกฎ —", "No rules picked —")} {r.fill ? t("จะโชว์สินค้าหมวดเดียวกัน/สินค้าอื่นแทน", "same-category/other products will show instead") : t("ส่วนนี้จะไม่โชว์อะไร", "this section will show nothing")}</p>}
            <div className="space-y-1">
              {r.rules.map((k, i) => (
                <div key={k} {...drag.rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 ${drag.rowCls(i)}`}>
                  <DragHandle {...drag.handleProps(i)} />
                  <span className="w-5 h-5 shrink-0 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800">{ruleEn(meta(k).label)}</div>
                    <div className="text-[11px] text-slate-500">{ruleEn(meta(k).hint)}</div>
                  </div>
                  <button type="button" onClick={() => setRelated({ rules: r.rules.filter((x) => x !== k) })} className="text-xs text-slate-400 hover:text-rose-600 px-1.5" title={t("เอากฎนี้ออก", "Remove this rule")}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {unused.length > 0 && (
              <div className="mt-2">
                <span className="text-[11px] text-slate-400">{t("เพิ่มกฎ:", "Add rule:")}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {unused.map((x) => (
                    <button key={x.value} type="button" onClick={() => setRelated({ rules: [...r.rules, x.value] })} title={ruleEn(x.hint)} className="text-xs rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-slate-600 hover:border-blue-400 hover:text-blue-700">
                      ＋ {ruleEn(x.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {r.rules.includes("manual") && (
            <div>
              <span className={lbl}>{t("✋ รายการที่เลือกไว้ (", "✋ Picked list (")}{r.codes.length} {t("รุ่น · เรียงตามที่เลือก · โชว์ชุดเดียวกันทุกหน้าสินค้า)", "models · in picked order · same set on every product page)")}</span>
              <WebsiteProductPicker shopSlug={shopSlug} value={r.codes} max={24} onChange={(codes) => setRelated({ codes: codes.map((c) => c.toUpperCase()) })} />
            </div>
          )}

          <Check
            label={t("ได้ไม่ครบจำนวน → เติมด้วยสินค้าอื่น", "Not enough → fill with other products")}
            hint={t("หมวดเดียวกันก่อน แล้วสินค้าอื่นในร้าน (ปิด = โชว์เท่าที่กฎหาได้ · หาไม่ได้เลย = ส่วนนี้ไม่โชว์)", "Same category first, then other shop products (off = only what the rules find · nothing found = section hidden)")}
            checked={r.fill}
            onChange={(fill) => setRelated({ fill })}
          />
          <p className="text-[11px] text-slate-500 rounded-lg bg-slate-50 px-2.5 py-1.5">
            {t("📌 เลือกเองรายรุ่น: เปิดสินค้า → แท็บ 🛍 เว็บไซต์ → \"🔤 ปั๊มชื่อ · แบนเนอร์ · รายละเอียด · 🔗 เกี่ยวข้อง\" → ช่อง 🔗 สินค้าที่เกี่ยวข้องของรุ่นนี้ (ใช้เมื่อเปิดกฎ 📌 ไว้ด้านบน)", "📌 Pick per model: open the product → 🛍 Website tab → \"🔤 Name stamp · banner · details · 🔗 related\" → 🔗 Related products for this model (used when the 📌 rule is on above)")}
          </p>
        </Card>
      )}

      {only !== "related" && (
        <Card
          title={t("👀 สินค้าที่ดูล่าสุด", "👀 Recently viewed")}
          hint={t("รุ่นที่ลูกค้าเคยเปิดดูในเครื่องนี้ (ไม่รวมตัวที่เปิดอยู่) · ยังไม่เคยดูตัวอื่น = ไม่โชว์ (พรีวิวจึงอาจว่าง)", "Models the customer viewed on this device (excluding the current one) · nothing else viewed = hidden (so the preview may be empty)")}
          on={recentOn}
          onToggle={(v) => onChange(withHidden(product, "recent", v))}
        >
          <div className="space-y-3">
            <Text label={t("หัวข้อ (ว่าง = \"สินค้าที่ดูล่าสุด\")", "Title (empty = default)")} obj={rc} k="title" onPatch={(p) => setRecent(p as Partial<ProductParts["recent"]>)} placeholder="เช่น ที่คุณเพิ่งดู" max={80} />
            <div>
              <span className={lbl}>{t("จำนวนสูงสุด", "Max items")}</span>
              <Seg value={String(rc.count)} onChange={(v) => setRecent({ count: Number(v) })} options={RECENT_COUNTS.map((n) => ({ v: String(n), l: String(n) }))} wheel />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
