"use client";

/**
 * ✨ ของเสริมของหน้าสินค้า Style ใหม่ (ภาพเรียงลง + แผงค้าง / 3 คอลัมน์ / ภาพเต็มจอ + เรื่องราว) — ธีม → แท็บหน้าสินค้า
 * ค่าเก็บที่ theme.product.extras · เว็บร้าน src/components/shop/ProductShowcase.tsx อ่านไปใช้ · ค่าเริ่มเปิดทั้งหมด
 */
import type { ProductExtras, ProductLayout } from "@/lib/website-theme";

const ITEMS: { key: keyof ProductExtras; icon: string; label: string; hint: string }[] = [
  { key: "stickyBuy", icon: "🛒", label: "แถบใส่ตะกร้าลอยล่างจอ (คอม)", hint: "เลื่อนผ่านปุ่มซื้อไปแล้ว แถบชื่อ + ราคา + ปุ่มใส่ตะกร้าโผล่ด้านล่าง · มือถือมีแถบลอยเสมออยู่แล้ว" },
  { key: "pairWith", icon: "🧩", label: "ส่วน \"ใส่คู่กับ\"", hint: "สินค้าที่เกี่ยวข้อง 3 ชิ้นแรก (ตามกฎ 🔗 แนะนำสินค้า) โชว์ใกล้ปุ่มซื้อ · ที่เหลืออยู่ในส่วน \"คุณอาจชอบ\"" },
  { key: "lightbox", icon: "🔍", label: "กดรูปดูเต็มจอ + ซูม", hint: "กดรูปไหนก็ได้ เปิดดูทั้งชุดเต็มจอ แตะรูปเพื่อซูม" },
  { key: "progress", icon: "▮", label: "แถบบอกตำแหน่งรูป", hint: "เส้นบาง ๆ + ตัวนับ 1/4 บอกว่าดูรูปที่เท่าไรแล้ว (มือถือ = แถบใต้รูปที่ปัด)" },
  { key: "thumbs", icon: "▦", label: "แถบรูปย่อกดกระโดด (คอม)", hint: "รูปเล็กเรียงข้างชุดรูป กดแล้วเลื่อนไปรูปนั้นทันที (แบบ Saint Laurent)" },
  { key: "heroVideo", icon: "🎬", label: "รูปเปิดหน้าสินค้าอยู่ในชุดรูป", hint: "รุ่นที่ตั้งรูปเปิด (รูป/วิดีโอ) ไว้ = ชิ้นแรกของชุดรูป (ภาพเรียงลง / 3 คอลัมน์) · วิดีโอเล่นเอง เงียบ วนซ้ำ" },
  { key: "hoverZoom", icon: "🔎", label: "ชี้รูปแล้วซูม (คอม)", hint: "เอาเมาส์วางบนรูป รูปขยายตามตำแหน่งเมาส์ ดูผิวหนัง/ตะเข็บใกล้ ๆ" },
];

export function ProductExtrasSetting({ value, onChange, layout }: { value: ProductExtras; onChange: (v: Partial<ProductExtras>) => void; layout: ProductLayout }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <h4 className="text-sm font-semibold text-slate-800">✨ ของเสริมของ Style นี้</h4>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">
        {layout === "story"
          ? "แบบเรื่องราว: รูปแรก (หรือรูปเปิดหน้าสินค้า) = รูปเต็มจอ · ส่วนงานคราฟต์ใช้จุดเด่น/วัสดุ/คำอธิบายที่มีอยู่แล้ว (รุ่นที่ไม่มีข้อมูล = ซ่อนเอง)"
          : "ชิ้นส่วนราคา-ตะกร้า · รายละเอียด · แบนเนอร์ · คุณอาจชอบ ใช้ชุดเดียวกับโชว์เคส (ตั้งด้านล่าง)"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ITEMS.map((it) => {
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
