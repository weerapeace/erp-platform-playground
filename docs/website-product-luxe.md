# หน้าสินค้า Style จากเว็บแบรนด์หรู (2026-10-21)

ERP → เว็บไซต์ → ดีไซน์ → แท็บหน้าสินค้า → **เลือก Style** มีเพิ่ม 3 แบบ (นอกจาก คลาสสิก / โชว์เคส)

| ค่า (`theme.product.layout`) | ชื่อ | อ้างอิง | หน้าตา |
|---|---|---|---|
| `stack` | ภาพเรียงลง + แผงค้าง | Bottega Veneta, Celine, The Row | รูปเต็มความสูงจอเรียงลงฝั่งซ้าย · ชื่อ/ราคา/ปุ่มซื้อ/รายละเอียด ค้างขวา |
| `columns` | 3 คอลัมน์ | SSENSE, Acne Studios, Jil Sander | ซ้ายชื่อ+คำอธิบาย+รายละเอียด (ค้าง) · กลางรูปเรียงลง · ขวาราคา+ตัวเลือก+ปุ่มซื้อ (ค้าง) |
| `story` | ภาพเต็มจอ + เรื่องราว | Jacquemus, Loewe, Aesop | รูปเต็มจอ + ชื่อรุ่นตัวใหญ่ → รูปคู่ข้อมูลสินค้า → แถบงานคราฟต์/วัสดุ → ใส่คู่กับ → รูปที่เหลือ |

## หลักการ
- **ไม่มีข้อมูลใหม่** — ทั้ง 3 แบบเป็น "การจัดวางใหม่" ของชิ้นส่วนชุดเดียวกับโชว์เคส (`SHOWCASE_FAMILY`): ราคา-ตะกร้า (`parts.buy.items` ลำดับ/ซ่อน/ขนาดเดิม) · ชุดรายละเอียด (`detailItems` + `detailsStyle`) · แบนเนอร์ · คุณอาจชอบ · ดูล่าสุด (ตาม `sections`/`hidden`)
- แท็บตั้งค่าที่เคยโชว์เฉพาะโชว์เคส (ลำดับส่วนประกอบ · ชุดรายละเอียด · ขนาดตัวอักษร) โชว์กับ 3 แบบใหม่ด้วย · ช่อง "แกลเลอรีรูปสินค้า" (editorial/spotlight) ใช้กับโชว์เคสเท่านั้น
- แบบเรื่องราว: รูปเปิดหน้าสินค้า (Hero รายรุ่น/รายสี) = รูปเต็มจอ ไม่มี = รูปแรก · แถบงานคราฟต์ใช้ **จุดเด่น (highlights) → ไม่มีใช้คำอธิบาย** + ชื่อวัสดุที่มีหน้าวัสดุ (ลิงก์ `/materials/<slug>`) · ไม่มีอะไรเลย = ไม่โชว์แถบ

## ✨ ของเสริม `theme.product.extras` (ค่าเริ่มเปิดทั้งหมด · ตั้งที่ `components/website-product-extras-setting.tsx`)
- `stickyBuy` — คอม: แถบชื่อ+สี+ราคา+ใส่ตะกร้าลอยล่างจอ เมื่อเลื่อนผ่านชุดปุ่มซื้อแล้ว (ใช้หน้าตา `.pd-bar` ของโชว์เคส) · มือถือมีแถบลอย `.pd-sticky` เสมอ (ปุ่มใส่ตะกร้าในชุดราคา-ตะกร้าซ่อนบนมือถือ)
- `pairWith` — "ใส่คู่กับ" = สินค้าที่เกี่ยวข้อง 3 ชิ้นแรก (กฎ 🔗 แนะนำสินค้า) · ส่วน "คุณอาจชอบ" แสดงที่เหลือ (ไม่ซ้ำ)
- `lightbox` — กดรูปดูเต็มจอ + ซูม (ของกลาง `src/components/ui/ImageLightbox.tsx`)
- `progress` — แถบ/ตัวนับตำแหน่งรูป (คอม) · จุดใต้แถวปัด (มือถือ)

## รอบ 2 (2026-10-21) — ปรับได้ครบเหมือนโชว์เคส + ของใหม่ 8 อย่าง + วัสดุปิดได้
- **ค่าของโชว์เคสที่ Style ใหม่รับแล้ว:** เอฟเฟกต์รูป (`imageEffect` → คลาส `pdx-fx-*`) · % รูปในกรอบ (`imageSize` → `--pdx-inset`) · การแสดงรูป เต็มกรอบ/พอดี/อัตโนมัติ (`imageFit` → `pdx-fit-*` + useAutoFit) · พื้นหลังรูป · สีแล้วรูป (`colorMode` set = ชุดรูปของสี · jump = เลื่อนไปรูปสี) · ชื่อรุ่น/เส้นทาง/ชื่อรอง เปิด-ปิด · ระยะห่างด้านบนของส่วนรูปใหญ่ (`partBox.gallery.spaceTop`)
- ช่องของแกลเลอรีโชว์เคสที่ไม่ใช้ (กี่รูปพร้อมกัน · กว้าง/สูงแกลเลอรี · แถบลอยล่างรูป · ปุ่มตั้งแบบ Gucci) **ซ่อน** ใน ⚙️ เมื่อเป็น Style ใหม่ (PartSettings `luxe`)
- **🏛 ปรับหน้าตา Style นี้** `theme.product.luxe` (`lib/website-product-luxe.ts` ↔ เว็บร้าน `src/lib/product-luxe.ts` แก้คู่กัน · UI `components/website-product-luxe-setting.tsx`): `gridCols` 1/2 · `mediaWidth` % (0 = ตามแบบ · ช่วงตาม `LUXE_MEDIA_WIDTH`) · `gap` · `mediaHeight` · `heroHeight/heroPos/heroText/heroShade` · `craft` {show, bg, hex, side, eyebrow, title} · `trust` {show (ค่าเริ่มปิด), items ≤ 4 (icon, text)}
- ข้อความ `craft.eyebrow/title` + `trust.items[].text` แปลอังกฤษได้ (ชื่อช่องอยู่ใน THEME_TEXT_KEYS แล้ว · carryTranslations เก็บ `_en` · เทสต์แล้ว)
- **ของเสริมใหม่** `extras`: `thumbs` (รูปย่อค้างซ้ายบนคอลัมน์รูป กดแล้วเลื่อน) · `heroVideo` (รูปเปิดหน้าสินค้าเป็นชิ้นแรกของชุดรูป A/B) · `hoverZoom` (คอม · ขยาย 2 เท่าตามเมาส์ + ขอรูป sizes 100vw ตอนเริ่มซูม)
- **🧵 วัสดุกดได้ "ปิด"** `materialView: "off"` — ProductShowcase ส่ง materialLinks ว่างให้รายละเอียด/คำอธิบาย/ปุ่มในแถบงานคราฟต์ · MaterialViewer ไม่ทำงาน

## ไฟล์
- ERP: `lib/website-theme.ts` (`ProductLayout`, `SHOWCASE_FAMILY`, `ProductExtras`, `PRODUCT_LAYOUTS`, normalize) · `components/website-theme-panel.tsx` (ภาพร่าง 3 แบบ) · เทสต์ `lib/__tests__/website-product-layouts.test.ts`
- เว็บร้าน: `src/lib/site-config.ts` (มิเรอร์) · `src/components/shop/ProductShowcase.tsx` (สร้างชิ้นส่วน → ส่งให้ ProductLuxe) · `src/components/shop/ProductLuxe.tsx` · CSS `.pdx-*` ใน `globals.css`
- มือถือ: รูปเป็นแถวปัด scroll-snap · 3 คอลัมน์ใช้ `display: contents` + `order` (ชื่อ → รูป → ปุ่มซื้อ → รายละเอียด)

## กับดักที่เจอ
- ตัวค้าง (sticky) ข้างในกล่องที่ `align-items: start` = ไม่มีที่ให้เลื่อน → แผงต้อง `align-self: stretch`
- แผงค้างที่ยาวกว่าจอ → `max-height` + เลื่อนในแผงได้ (ไม่งั้นท้ายแผงโดนตัด)
- รูปเต็มจอแบบเรื่องราว: วัดจุดเริ่มจริงด้วย JS (`--pdx-hero-top`) — หัวเว็บทึบ/ลอยทับ สูงไม่เท่ากัน
