# ผืนผ้าใบอิสระ (Section ชนิด `canvas`)

> ของกลางสำหรับหน้าเว็บร้าน — วางรูป / ข้อความ / ปุ่ม / ของตกแต่ง **ตรงไหนก็ได้** แล้วแต่ละชิ้นกดไปหน้าต่าง ๆ ได้
> ทดลองใช้กับ Pixiedustie ก่อน (สวิตช์ "🧪 ทดลองใช้ผืนผ้าใบอิสระ" ในแท็บข้อมูลร้าน)

## ใช้ทำอะไร / ใช้เมื่อไหร่

- หัวเว็บหรือแบนเนอร์ที่อยากจัดแบบนิตยสาร (รูปทรงวงรี/โค้งประตู ข้อความลายมือ ของตกแต่ง ซ้อนกัน)
- หน้าแนะนำแบรนด์/คอลเลกชันที่อยากให้หน้าตาไม่เหมือนเทมเพลต

**ไม่ควรใช้** กับสิ่งที่ข้อมูลเปลี่ยนบ่อย เช่น ตารางสินค้า/หมวด — ใช้ Section สินค้าเดิม (ดึงจาก ERP อัตโนมัติ)

## วิธีใช้ (คนจัดหน้า)

1. ตัวจัดหน้า → `+ เพิ่ม Section` → 🎨 ผืนผ้าใบอิสระ (เห็นเมื่อเปิดสวิตช์ทดลองของร้านแล้ว)
2. เลือกผืน → แผงขวา "เพิ่มบนผืน": 🖼️ รูป · 🔤 ข้อความ · 🔘 ปุ่ม · 🎀 ของตกแต่ง
3. ในพรีวิว: ลากย้าย · จับมุมย่อ-ขยาย (รูป/ของตกแต่งรักษาสัดส่วน · Shift = อิสระ) · จุดกลมด้านบน = หมุน (Shift = ทีละ 15°)
   · มีเส้นชมพูช่วยจัดแนว (ขอบ/กึ่งกลางผืนและชิ้นอื่น · กด Alt ระหว่างลาก = ปิด) · ดับเบิลคลิกข้อความพิมพ์แก้ตรงนั้น · ลากแถบ ↕ ใต้ผืนปรับความสูง
4. คีย์ลัดในพรีวิว: ลูกศรขยับ 1 (Shift = 10) · Delete ลบ · Ctrl+D สำเนา · Ctrl+Z / Ctrl+Shift+Z ย้อน/ทำซ้ำ · Esc เลิกเลือก
5. แต่ละชิ้นตั้ง "กดแล้วไปที่" ได้: หน้าในเว็บ / หมวดสินค้า / สินค้า / เลื่อนไปส่วนอื่นในหน้านี้ / ลิงก์ภายนอก
6. ชั้นหน้า-หลัง: ปุ่ม ⤒ ↑ ↓ ⤓ ในแผงขวา (ในต้นไม้ด้านซ้าย บน = อยู่หลังสุด)

## มือถือ

- เฟส 1: จอ < 768px **เรียงชิ้นลงมาอัตโนมัติ** ตามตำแหน่ง บน→ล่าง แล้วซ้าย→ขวา · ข้อความจัดกึ่งกลาง (ตั้ง "มือถือ: ชิดซ้าย" ได้)
- ของตกแต่งที่เพิ่มใหม่ตั้ง "ซ่อนบนมือถือ" ไว้ให้ (ตำแหน่งอิสระไม่มีความหมายเมื่อเรียงเป็นแถว)
- เฟส 2 (ยังไม่ทำ): จัดหน้ามือถือแยกเองได้ + ปุ่ม "สร้างจากหน้าคอม"

## ข้อมูล (เก็บใน `shops.home_layout` / `store_pages.layout` เหมือน Section อื่น)

```ts
{
  id, type: "canvas", enabled, visibility, style,   // style.bg = สีพื้นผืน (เต็มความกว้างจอ)
  height: 560,              // ความสูงผืน (หน่วย)
  bgImageKey: null,         // รูปพื้นหลังผืน (r2 key)
  mobileAlign: "center",    // มือถือ: center | left
  items: [{                 // ลำดับใน array = ลำดับวาด (ตัวแรกอยู่หลังสุด)
    id, enabled, kind: "image" | "text" | "button" | "shape",
    x, y, w, h, rotate, opacity, hideMobile, locked,   // หน่วยบนผืนกว้าง 1200 (จอ 1200px = 1:1)
    href, newTab,                                       // กดแล้วไปที่ (กรอง javascript: ทิ้งทั้ง ERP และเว็บร้าน)
    // ข้อความ/ปุ่ม: text | label, variant, font, size, weight, italic, uppercase, spacing, lineHeight, align, color, colorHex, bg, bgHex
    // รูป: imageKey, alt, frame (rect|rounded|ellipse|arch), fit, border (none|line|double|dotted|lace), borderColor, borderHex, borderWidth, borderGap
    // ของตกแต่ง: shape (bow|heart|sparkle|star|flower|pearls|lace|scallop|wave|line|arch|rect|ellipse), outline, strokeWidth, color
  }]
}
```

- สีเก็บเป็น **ชื่อสีของธีม** (`ink` `brand` `brandDeep` `brandSoft` `muted` `page` `surface` `white`) หรือ `custom` + hex → เปลี่ยนธีมแล้วผืนเปลี่ยนตาม
- ฟอนต์ `display`/`body` = ตามธีม · ชื่ออื่นต้องอยู่ในรายการ (`CANVAS_FONTS` ERP = `CANVAS_FONT_FAMILIES` เว็บร้าน) เว็บร้านโหลด Google Fonts ให้เอง

## ไฟล์

| ที่ | ไฟล์ | หน้าที่ |
|---|---|---|
| ERP | `lib/website-canvas.ts` | ตัวเลือก (ชนิด/ทรง/กรอบ/ฟอนต์/สี/ลาย) · ชิ้นเริ่มต้นตอนกดเพิ่ม · สรุป · ตรวจก่อนเผยแพร่ |
| ERP | `lib/website-schema.ts` | `canvas` ใน `SECTION_SCHEMAS` + `canvasItemFields()` (ช่องตั้งค่าของชิ้น) |
| ERP | `components/website-canvas-tools.tsx` | คุยสดกับพรีวิว (`useCanvasBridge`) · ปุ่มเพิ่มชิ้น · จัดชั้น |
| ERP | `components/website-link-picker.tsx` + `lib/website-links.ts` | ของกลาง "กดแล้วไปที่" (ช่องชนิด `target`) |
| เว็บร้าน | `src/lib/canvas.ts` | ชนิด + `parseCanvasBlock` (กรองซ้ำทุกช่อง) + ตัวช่วยสี/ฟอนต์/มือถือ |
| เว็บร้าน | `src/components/home/CanvasSection.tsx` | วาด + ลาก/ย่อ/หมุน/เส้นจัดแนว/พิมพ์แก้ (เฉพาะโหมดแก้ไข) |
| เว็บร้าน | `src/components/home/CanvasShapes.tsx` | ลายของตกแต่ง SVG + กรอบลูกไม้รอบรูป |
| เว็บร้าน | `src/app/globals.css` หัวข้อ "ผืนผ้าใบอิสระ" | ตำแหน่ง (cqw) · มือถือเรียงลงมา · จุดจับ/เส้นจัดแนว |

## คุยกับพรีวิวแบบสด (ไม่โหลดหน้าใหม่)

| ทิศ | ข้อความ | เมื่อไหร่ |
|---|---|---|
| ERP → เว็บ | `storefront-canvas-update {block}` | ข้อมูลผืนเปลี่ยน (แก้ในแผง/undo/ลากเสร็จ) และหลังพรีวิวโหลดใหม่ |
| เว็บ → ERP | `storefront-canvas-change {blockId, items?:[{id,x,y,w,h,rotate,text}], height?}` | ลาก/ย่อ/หมุน/พิมพ์แก้/ปรับความสูง เสร็จ |
| เว็บ → ERP | `storefront-canvas-delete` / `storefront-canvas-duplicate {blockId, childId}` | กด Delete / Ctrl+D ในพรีวิว |
| เว็บ → ERP | `storefront-canvas-key {action: undo/redo}` | Ctrl+Z ในพรีวิว |

- เลือกชิ้น = ใช้ `storefront-block-click {blockId, childId}` ตัวเดิมของ PreviewBridge (ชิ้นมี `data-child-id`)
- บันทึกร่างอัตโนมัติแล้วตัวจัดหน้า **ไม่โหลดพรีวิวใหม่** ถ้าแก้แค่ในผืน (`previewStructureSig`) — พรีวิวรับสดอยู่แล้ว
- ⚠️ CSS ตำแหน่งชิ้นต้อง specificity สูงกว่า `html.pv-edit [data-child-id]{position:relative}` ของ PreviewBridge

## สิทธิ์ / ประวัติ

- แก้ได้เฉพาะคนที่เข้าตัวจัดหน้าได้ (สิทธิ์ `products.edit` เหมือน Section อื่น) · บันทึก/เผยแพร่ผ่าน API layout/pages เดิม → เก็บเวอร์ชัน + audit log เหมือนเดิม
- สวิตช์ทดลองเปิด/ปิดในแท็บข้อมูลร้าน (บันทึก audit ผ่าน API settings เดิม)

## ข้อจำกัดที่รู้แล้ว

- ชิ้นต่าง ๆ อยู่ในกรอบกว้าง 1200 กลางจอ — พื้นสี/รูปพื้นเต็มจอได้ แต่ชิ้นยังยืดเต็มจอไม่ได้
- เลือกได้ทีละชิ้น (ยังไม่มีเลือกหลายชิ้น/จับกลุ่ม)
- ยังไม่ส่งให้ AI ช่วยจัดหน้า (ต้องจัดตำแหน่งด้วยตา)
