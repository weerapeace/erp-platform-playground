"use client";

/**
 * 🏛 ปรับหน้าตาของหน้าสินค้า Style จากเว็บแบรนด์หรู (ธีม → แท็บหน้าสินค้า) — ค่าเก็บที่ theme.product.luxe (lib/website-product-luxe)
 *   ภาพเรียงลง / 3 คอลัมน์: ชุดรูป 1–2 คอลัมน์ · % ฝั่งรูป · ช่องห่าง · ความสูงรูป
 *   ภาพเต็มจอ + เรื่องราว: ความสูง/ตำแหน่งชื่อ/สีตัวหนังสือ/ความมืดทับ ของรูปเต็มจอ · แถบงานคราฟต์ (เปิด-ปิด/สี/รูปซ้าย-ขวา/หัวข้อเอง)
 *   ทุกแบบ: แถวความมั่นใจใต้ปุ่มซื้อ (ไอคอน + ข้อความเอง ≤ 4 · ค่าเริ่มปิด)
 * ข้อความภาษาอังกฤษ = ปุ่ม 🌐 แปลภาษาของแท็บดีไซน์ / ศูนย์แปลภาษา (ช่อง title/eyebrow/text)
 */
import { RangeInput } from "@/components/range-input";
import { ColorPicker } from "@/components/color-picker";
import { LUXE_CHOICES, LUXE_MEDIA_WIDTH, LUXE_TRUST_MAX, type ProductLuxe } from "@/lib/website-product-luxe";
import { webForm } from "@/lib/website-form-styles";
import { SiteIconPicker } from "@/components/site-icon-picker";

const lbl = webForm.labelPlain;
const sel = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white";
const inp = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

export function ProductLuxeSetting({
  value,
  onChange,
  layout,
  colors,
}: {
  value: ProductLuxe;
  onChange: (v: Partial<ProductLuxe>) => void;
  layout: "stack" | "columns" | "story";
  colors: { brand: string; brandDeep: string; ink: string; page: string; surface: string };
}) {
  const v = value;
  const mw = layout === "story" ? null : LUXE_MEDIA_WIDTH[layout];
  const craftSwatch = v.craft.bg === "custom" ? v.craft.hex || colors.ink : colors[v.craft.bg];
  const setCraft = (p: Partial<ProductLuxe["craft"]>) => onChange({ craft: { ...v.craft, ...p } });
  const setTrust = (p: Partial<ProductLuxe["trust"]>) => onChange({ trust: { ...v.trust, ...p } });
  const items = v.trust.items;

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 space-y-4">
      <h4 className="text-sm font-semibold text-slate-800">🏛 ปรับหน้าตา Style นี้</h4>

      {mw && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>ชุดรูป</label>
            <select className={sel} value={v.gridCols} onChange={(e) => onChange({ gridCols: Number(e.target.value) === 2 ? 2 : 1 })}>
              {LUXE_CHOICES.gridCols.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>ความสูงรูปแต่ละรูป</label>
            <select className={sel} value={v.mediaHeight} onChange={(e) => onChange({ mediaHeight: e.target.value as ProductLuxe["mediaHeight"] })}>
              {LUXE_CHOICES.mediaHeight.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {v.gridCols === 2 && <p className="text-[11px] text-slate-400 mt-1">2 รูปต่อแถว: รูปคู่ใช้สัดส่วน 4:5 เสมอ (รูปแรกตามที่เลือก)</p>}
          </div>
          <div>
            <label className={lbl}>
              {layout === "stack" ? "ความกว้างฝั่งรูป (% ของจอ)" : "ความกว้างคอลัมน์รูปตรงกลาง (%)"} {v.mediaWidth === 0 && <span className="text-slate-400">— ตามแบบ ({mw.auto}%)</span>}
            </label>
            <div className="flex items-center gap-2">
              <RangeInput value={v.mediaWidth || mw.auto} min={mw.min} max={mw.max} unit="%" onChange={(n) => onChange({ mediaWidth: Math.round(n) })} />
              {v.mediaWidth !== 0 && (
                <button type="button" onClick={() => onChange({ mediaWidth: 0 })} className="text-[11px] text-slate-500 hover:text-blue-600 whitespace-nowrap">
                  ↺ ตามแบบ
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={lbl}>ช่องห่างระหว่างรูป</label>
            <select className={sel} value={v.gap} onChange={(e) => onChange({ gap: e.target.value as ProductLuxe["gap"] })}>
              {LUXE_CHOICES.gap.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {layout === "story" && (
        <>
          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">🎬 รูปเต็มจอ (รูปเปิดหน้าสินค้า หรือรูปแรก)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>ความสูง</label>
                <select className={sel} value={v.heroHeight} onChange={(e) => onChange({ heroHeight: e.target.value as ProductLuxe["heroHeight"] })}>
                  {LUXE_CHOICES.heroHeight.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>ตำแหน่งชื่อรุ่น</label>
                <select className={sel} value={v.heroPos} onChange={(e) => onChange({ heroPos: e.target.value as ProductLuxe["heroPos"] })}>
                  {LUXE_CHOICES.heroPos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>สีตัวหนังสือบนรูป</label>
                <select className={sel} value={v.heroText} onChange={(e) => onChange({ heroText: e.target.value as ProductLuxe["heroText"] })}>
                  {LUXE_CHOICES.heroText.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>ความมืดทับรูปตรงข้อความ (%) — 0 = ไม่มี</label>
                <RangeInput value={v.heroShade} min={0} max={80} step={5} unit="%" onChange={(n) => onChange({ heroShade: Math.round(n) })} />
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-1.5 cursor-pointer">
              <input type="checkbox" checked={v.craft.show} onChange={(e) => setCraft({ show: e.target.checked })} />
              🧵 แถบงานคราฟต์และวัสดุ
            </label>
            {v.craft.show && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={lbl}>สีพื้นแถบ</label>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded border border-slate-200 shrink-0" style={{ background: craftSwatch }} />
                    <select className={sel} value={v.craft.bg} onChange={(e) => setCraft({ bg: e.target.value as ProductLuxe["craft"]["bg"] })}>
                      {LUXE_CHOICES.craftBg.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {v.craft.bg === "custom" && (
                    <div className="mt-2">
                      <ColorPicker value={v.craft.hex || "#1f1e1c"} onChange={(hex) => setCraft({ hex })} />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">สีตัวหนังสือเลือกให้เอง (พื้นเข้ม = ตัวขาว · พื้นสว่าง = ตัวเข้ม)</p>
                </div>
                <div>
                  <label className={lbl}>รูปอยู่ด้าน</label>
                  <select className={sel} value={v.craft.side} onChange={(e) => setCraft({ side: e.target.value === "right" ? "right" : "left" })}>
                    <option value="left">รูปซ้าย · ข้อความขวา</option>
                    <option value="right">ข้อความซ้าย · รูปขวา</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>คำโปรยเล็กด้านบน</label>
                  <input className={inp} value={v.craft.eyebrow} maxLength={60} placeholder="ว่าง = งานคราฟต์และวัสดุ" onChange={(e) => setCraft({ eyebrow: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>หัวข้อ</label>
                  <input className={inp} value={v.craft.title} maxLength={120} placeholder="ว่าง = รายละเอียดที่ใส่ใจ" onChange={(e) => setCraft({ title: e.target.value })} />
                </div>
                <p className="sm:col-span-2 text-[11px] text-slate-400">เนื้อหาในแถบ = จุดเด่นที่ติ๊กใน Parent SKU (ไม่มี = คำอธิบายสินค้า) + ปุ่มวัสดุ · รุ่นที่ไม่มีข้อมูลเลย = ไม่โชว์แถบ · ข้อความอังกฤษ: ปุ่ม 🌐 แปลภาษา</p>
              </div>
            )}
          </div>
        </>
      )}

      <div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-1.5 cursor-pointer">
          <input type="checkbox" checked={v.trust.show} onChange={(e) => setTrust({ show: e.target.checked })} />
          ✔ แถวความมั่นใจใต้ปุ่มซื้อ
        </label>
        <p className="text-[11px] text-slate-400 mb-2">ใส่เฉพาะเรื่องที่ร้านทำได้จริง (เช่น ส่งฟรีเมื่อไร · คืนได้กี่วัน) — ไอคอน: เลือกไอคอนเส้น (สีตามตัวอักษร) / อีโมจิ / อัปโหลด · ข้อความอังกฤษ: ปุ่ม 🌐 แปลภาษา</p>
        {v.trust.show && (
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={it.id} className="flex items-center gap-2">
                {/* 🔣 ไอคอนเส้น (ชุดกลาง) / อีโมจิ / อัปโหลด — ของกลาง SiteIconPicker */}
                <SiteIconPicker value={it.icon} onChange={(icon) => setTrust({ items: items.map((x, j) => (j === i ? { ...x, icon } : x)) })} />
                <input className={inp} value={it.text} maxLength={60} placeholder="ข้อความสั้น ๆ" onChange={(e) => setTrust({ items: items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" onClick={() => setTrust({ items: items.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600 text-sm px-1" aria-label="ลบ">
                  ✕
                </button>
              </div>
            ))}
            {items.length < LUXE_TRUST_MAX && (
              <button type="button" onClick={() => setTrust({ items: [...items, { id: `t${Date.now().toString(36).slice(-5)}`, icon: "i:circle-check", text: "" }] })} className="text-xs text-blue-600 hover:underline">
                ＋ เพิ่มข้อ ({items.length}/{LUXE_TRUST_MAX})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
