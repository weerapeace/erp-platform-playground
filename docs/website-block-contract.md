# สัญญาของ "widget" หน้าเว็บร้าน (Block Contract)

เอกสารนี้คือ **แหล่งเดียว** ที่บอกว่า widget หน้าเว็บร้านมีหน้าตาข้อมูลอย่างไร
และ **เพิ่ม widget ใหม่ต้องแตะอะไรบ้าง** — ทำตามนี้แล้วจะไม่มีอาการ "เพิ่มใน ERP แล้วเว็บไม่ขึ้น"

---

## ใครถือข้อมูลอะไร

| ที่ | ไฟล์ | หน้าที่ |
|---|---|---|
| **ERP** | `lib/website-blocks.ts` | ⭐ **แหล่งเดียวของชนิดบล็อก + ค่าตั้งต้น + การ sanitize** |
| **ERP** | `components/website-block-editor.tsx` | ฟอร์มกรอกของแต่ละ widget (ไม่ประกาศชนิดเอง — import จาก lib) |
| **เว็บร้าน** | `src/lib/blocks.ts` | สำเนาชนิด (เพื่อ type) + แปลง "รูปลักษณ์" เป็น CSS |
| **เว็บร้าน** | `src/components/home/BlockRenderer.tsx` | ตัวแสดงผลจริงของแต่ละ widget |

ข้อมูลเก็บเป็น JSON ใน `shops.home_layout` และ `store_pages.layout`
ส่งให้เว็บร้านผ่าน `/api/public/storefront/site` และ `/api/public/storefront/page` **แบบไม่แปลงอะไร**

> ⚠️ เคยเกิดจริง: ค่าตั้งต้นถูกเขียนซ้ำ 2 ที่ใน ERP แล้วเพี้ยนจากกันเงียบ ๆ
> (รหัสบล็อกคนละแบบ + ข้อความตั้งต้นไม่ตรงกัน) — ตอนนี้รวมเหลือที่เดียวแล้ว **ห้ามประกาศซ้ำอีก**

---

## ทุกบล็อกมีอะไรเหมือนกัน

```ts
{
  id: string            // ไม่ซ้ำภายในหน้าเดียวกัน
  type: BlockType       // ชนิด widget
  enabled: boolean      // ปิดชั่วคราวโดยไม่ลบ
  visibility: { desktop, tablet, mobile }
  style: BlockStyle     // "รูปลักษณ์" — ดูข้างล่าง
  ...ฟิลด์เฉพาะชนิด
}
```

### BlockStyle — ค่าเริ่มต้นต้องเป็น `auto` เสมอ

| ฟิลด์ | ค่าที่ได้ | ความหมายของ `auto` |
|---|---|---|
| `padTop` / `padBottom` | `auto` `none` `sm` `md` `lg` | ใช้ระยะห่างเดิมที่อยู่ในตัว widget |
| `width` | `auto` `narrow` `full` | ใช้กรอบเดิมของ widget |
| `align` | `auto` `left` `center` `right` | ใช้การจัดวางเดิม |
| `bg` | `auto` `page` `surface` `brand` `ink` `custom` | ไม่ใส่พื้นหลังทับ |
| `bgColor` | `#rrggbb` | ใช้เมื่อ `bg: "custom"` เท่านั้น |

**กฎเหล็ก:** `auto` = ห้ามเปลี่ยนหน้าตาของเดิมแม้แต่นิดเดียว
เพราะบล็อกที่สร้างไว้ก่อนมีระบบนี้จะไม่มีค่า `style` ติดมา

**เก็บเป็นชื่อขนาด/ชื่อสีจากธีม ห้ามเก็บเป็น pixel หรือรหัสสีตรง ๆ** (ยกเว้น `custom`)
เพื่อให้เว็บแต่ละร้านแปลงเป็นสเกลของตัวเอง และเปลี่ยนธีมร้านแล้วบล็อกเปลี่ยนตาม

---

## เพิ่ม widget ใหม่ — เช็กลิสต์ (ตั้งแต่ 2026-10-09: Schema-Driven)

> ตัวจัดหน้าใน ERP เป็นแบบ **Page → Section → Block → Settings** (คล้าย Shopify Online Store 2.0)
> ฟอร์มตั้งค่า/ค่าเริ่มต้น/การตรวจ "วาดเองจาก Schema" — เพิ่มชนิดใหม่ **ไม่ต้องเขียนฟอร์ม** อีกแล้ว

### ฝั่ง ERP (`C:/erp-local/wt-subs`)

1. `lib/website-schema.ts` — เพิ่มก้อนเดียวใน `SECTION_SCHEMAS`:
   - `meta` (ชื่อไทย/ไอคอน/คำอธิบาย/กลุ่ม) · `fields` (ช่องตั้งค่า: key/label/type/default/max/options/required/showIf)
   - `children` ถ้ามี Block ย่อย (key ของ array · itemLabel · max · fields ของแต่ละชิ้น · summary)
   - `summary` (ข้อความสรุปในต้นไม้) · `validate` (กฎตรวจเพิ่มจาก required)
   - ชนิดช่องที่ใช้ได้: text textarea number range select toggle image link href color list emoji video map products category
2. `lib/website-blocks.ts` — เพิ่มชื่อใน `BlockType` + interface ของชนิดนั้น (ให้ TypeScript รู้จัก) แล้วต่อเข้า union `Block`
3. `npx vitest run lib/__tests__/website-schema.test.ts` — ต้องเขียว (เทสต์ไล่ทุกชนิดอัตโนมัติ: newBlock→normalize ต้องได้ค่าเดิม, ค่าเริ่มต้นห้ามมีข้อความร้าน IG)

**ไม่ต้องแตะ:** `components/website-schema-form.tsx` (ฟอร์มวาดจาก fields) · `components/website-builder.tsx` (ต้นไม้/พรีวิว/แผงคุณสมบัติ) · API layout/pages (normalize จาก schema)

### ฝั่งเว็บร้าน (repo `weerapeace/storefront`)

4. `src/lib/blocks.ts` — เพิ่มชนิด + interface ให้ตรงกับ ERP (ชื่อฟิลด์ต้องเหมือนกันเป๊ะ)
5. เขียน component แสดงผล แล้วเพิ่ม 1 บรรทัดใน `REGISTRY` + `BLOCK_LABEL` ของ `src/components/home/BlockRenderer.tsx`
   - ถ้ามี Block ย่อย: ใส่ `{...childAttrs(item, i, 'ชื่อชิ้น')}` ที่ element นอกสุดของแต่ละชิ้น → คลิกเลือกจากพรีวิวใน ERP ได้ + ซ่อนตามอุปกรณ์ได้
6. `npm run check-schema` (เทียบกับ `/api/public/storefront/schema` ของ ERP) → `npm run build` → deploy

### กติกาข้อมูล
- ค่าตั้งค่าเก็บ "ระดับบน" ของบล็อก (ไม่ซ้อนใน settings) เหมือนเดิม → ข้อมูลเก่าใช้ได้ไม่ต้องย้าย
- Block ย่อยทุกชิ้นมี `id` / `enabled` / `visibility` (ERP เติมให้ตอน normalize · เว็บร้าน `parseBlocks` ตัดชิ้นที่ `enabled=false`)
- `style.mobile` = ค่าทับเฉพาะจอ < 768px (ระยะห่างบน/ล่าง/จัดข้อความ) · เว็บร้านแปลงเป็น `data-*-m` + CSS ท้าย globals.css
- API สาธารณะ `site`/`page` ส่งโครงที่ผ่าน normalize แล้ว (id ชิ้นย่อยตรงกับที่ตัวจัดหน้าเห็น)
