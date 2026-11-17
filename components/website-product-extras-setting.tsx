"use client";

/**
 * ✨ ของเสริมของหน้าสินค้า Style ใหม่ (ภาพเรียงลง + แผงค้าง / 3 คอลัมน์ / ภาพเต็มจอ + เรื่องราว) — ธีม → แท็บหน้าสินค้า
 * ค่าเก็บที่ theme.product.extras · เว็บร้าน src/components/shop/ProductShowcase.tsx อ่านไปใช้ · ค่าเริ่มเปิดทั้งหมด
 */
import type { ProductExtras, ProductLayout } from "@/lib/website-theme";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

const items = (): { key: keyof ProductExtras; icon: string; label: string; hint: string }[] => [
  { key: "stickyBuy", icon: "🛒", label: tr("แถบใส่ตะกร้าลอยล่างจอ (คอม)", "Floating add-to-cart bar (desktop)"), hint: tr("เลื่อนผ่านปุ่มซื้อไปแล้ว แถบชื่อ + ราคา + ปุ่มใส่ตะกร้าโผล่ด้านล่าง · มือถือมีแถบลอยเสมออยู่แล้ว", "After scrolling past the buy button, a bar with name + price + add-to-cart appears at the bottom · mobile always has one") },
  { key: "pairWith", icon: "🧩", label: tr("ส่วน \"ใส่คู่กับ\"", "\"Pair with\" section"), hint: tr("สินค้าที่เกี่ยวข้อง 3 ชิ้นแรก (ตามกฎ 🔗 แนะนำสินค้า) โชว์ใกล้ปุ่มซื้อ · ที่เหลืออยู่ในส่วน \"คุณอาจชอบ\"", "First 3 related products (per 🔗 Recommendations rules) show near the buy button · the rest go in \"You may like\"") },
  { key: "lightbox", icon: "🔍", label: tr("กดรูปดูเต็มจอ + ซูม", "Tap image for full screen + zoom"), hint: tr("กดรูปไหนก็ได้ เปิดดูทั้งชุดเต็มจอ แตะรูปเพื่อซูม", "Tap any image to view the whole set full screen, tap to zoom") },
  { key: "progress", icon: "▮", label: tr("แถบบอกตำแหน่งรูป", "Image position indicator"), hint: tr("เส้นบาง ๆ + ตัวนับ 1/4 บอกว่าดูรูปที่เท่าไรแล้ว (มือถือ = แถบใต้รูปที่ปัด)", "Thin line + 1/4 counter showing which image you're on (mobile = bar under the swipeable image)") },
  { key: "thumbs", icon: "▦", label: tr("แถบรูปย่อกดกระโดด (คอม)", "Thumbnail jump bar (desktop)"), hint: tr("รูปเล็กเรียงข้างชุดรูป กดแล้วเลื่อนไปรูปนั้นทันที (แบบ Saint Laurent)", "Small images beside the set, click to jump to that image (Saint Laurent style)") },
  { key: "heroVideo", icon: "🎬", label: tr("รูปเปิดหน้าสินค้าอยู่ในชุดรูป", "Product cover in the image set"), hint: tr("รุ่นที่ตั้งรูปเปิด (รูป/วิดีโอ) ไว้ = ชิ้นแรกของชุดรูป (ภาพเรียงลง / 3 คอลัมน์) · วิดีโอเล่นเอง เงียบ วนซ้ำ", "Models with a cover (image/video) show it first in the set (stacked / 3 columns) · videos autoplay, muted, looping") },
  { key: "hoverZoom", icon: "🔎", label: tr("ชี้รูปแล้วซูม (คอม)", "Hover to zoom (desktop)"), hint: tr("เอาเมาส์วางบนรูป รูปขยายตามตำแหน่งเมาส์ ดูผิวหนัง/ตะเข็บใกล้ ๆ", "Hover over an image to zoom where the mouse is, to see leather/stitching up close") },
];

export function ProductExtrasSetting({ value, onChange, layout }: { value: ProductExtras; onChange: (v: Partial<ProductExtras>) => void; layout: ProductLayout }) {
  const t = useT();
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <h4 className="text-sm font-semibold text-slate-800">{t("✨ ของเสริมของ Style นี้", "✨ Extras for this style")}</h4>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">
        {layout === "story"
          ? t("แบบเรื่องราว: รูปแรก (หรือรูปเปิดหน้าสินค้า) = รูปเต็มจอ · ส่วนงานคราฟต์ใช้จุดเด่น/วัสดุ/คำอธิบายที่มีอยู่แล้ว (รุ่นที่ไม่มีข้อมูล = ซ่อนเอง)", "Story style: first image (or product cover) = full-screen image · the craft section uses existing highlights/materials/description (models without data = hidden)")
          : t("ชิ้นส่วนราคา-ตะกร้า · รายละเอียด · แบนเนอร์ · คุณอาจชอบ ใช้ชุดเดียวกับโชว์เคส (ตั้งด้านล่าง)", "Price/cart block · details · banners · You may like use the same set as Showcase (set below)")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items().map((it) => {
          const on = value[it.key];
          return (
            <label key={it.key} className={`flex items-start gap-2 rounded-xl border p-2.5 cursor-pointer transition ${on ? "border-blue-500 bg-blue-50/60" : "border-slate-200 hover:border-slate-400"}`}>
              <input type="checkbox" className="mt-0.5" checked={on} onChange={(e) => onChange({ [it.key]: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {it.icon} {it.label}
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{it.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
