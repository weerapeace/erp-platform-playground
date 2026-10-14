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
   - ชนิดช่องที่ใช้ได้: text textarea number range select toggle image link href target color list emoji video map products category
   - `target` = "กดแล้วไปที่" เลือกจากรายการ (หน้า/หมวด/สินค้า/ส่วนในหน้า/ภายนอก) เก็บเป็น href string — ใช้แทน `href` ในของใหม่
   - `showIf` ใส่ได้หลายเงื่อนไข (array = ต้องตรงทุกข้อ) และ `eq` เป็น array ได้ (= ค่าใดค่าหนึ่ง)
   - Section ทดลอง: ใส่ `meta.beta: "beta_xxx"` → โชว์ในคลังเฉพาะร้านที่เปิดสวิตช์นั้น (store_settings) · เพิ่มสวิตช์ใน lib/website-site-info.ts
2. `lib/website-blocks.ts` — เพิ่มชื่อใน `BlockType` + interface ของชนิดนั้น (ให้ TypeScript รู้จัก) แล้วต่อเข้า union `Block`
3. `npx vitest run lib/__tests__/website-schema.test.ts` — ต้องเขียว (เทสต์ไล่ทุกชนิดอัตโนมัติ: newBlock→normalize ต้องได้ค่าเดิม, ค่าเริ่มต้นห้ามมีข้อความร้าน IG)

**ไม่ต้องแตะ:** `components/website-schema-form.tsx` (ฟอร์มวาดจาก fields) · `components/website-builder.tsx` (ต้นไม้/พรีวิว/แผงคุณสมบัติ) · API layout/pages (normalize จาก schema)

### ฝั่งเว็บร้าน (repo `weerapeace/storefront`)

4. `src/lib/blocks.ts` — เพิ่มชนิด + interface ให้ตรงกับ ERP (ชื่อฟิลด์ต้องเหมือนกันเป๊ะ)
5. เขียน component แสดงผล แล้วเพิ่ม 1 บรรทัดในทะเบียน + `BLOCK_LABEL`
   - ไม่ต้องดึงข้อมูล (ส่วนใหญ่) → `PURE_REGISTRY` ใน `src/components/home/block-registry.tsx` (⚠️ ห้าม async/ของเฉพาะเซิร์ฟเวอร์) → พรีวิวสดวาดใหม่ทันที
   - ต้องดึงข้อมูลสินค้า/หมวด (async) → `SERVER_REGISTRY` ใน `BlockRenderer.tsx` + ใส่ชนิดใน `SERVER_TYPES` (เว็บร้าน) และ `LIVE_RELOAD_TYPES` (ERP `lib/website-live-preview.ts`)
   - ถ้ามี Block ย่อย: ใส่ `{...childAttrs(item, i, 'ชื่อชิ้น')}` ที่ element นอกสุดของแต่ละชิ้น → คลิกเลือกจากพรีวิวใน ERP ได้ + ซ่อนตามอุปกรณ์ได้
6. `npm run check-schema` (เทียบกับ `/api/public/storefront/schema` ของ ERP) → `npm run build` → deploy

### กติกาข้อมูล
- ค่าตั้งค่าเก็บ "ระดับบน" ของบล็อก (ไม่ซ้อนใน settings) เหมือนเดิม → ข้อมูลเก่าใช้ได้ไม่ต้องย้าย
- Block ย่อยทุกชิ้นมี `id` / `enabled` / `visibility` (ERP เติมให้ตอน normalize · เว็บร้าน `parseBlocks` ตัดชิ้นที่ `enabled=false`)
- `style.mobile` = ค่าทับเฉพาะจอ < 768px (ระยะห่างบน/ล่าง/จัดข้อความ) · เว็บร้านแปลงเป็น `data-*-m` + CSS ท้าย globals.css
- API สาธารณะ `site`/`page` ส่งโครงที่ผ่าน normalize แล้ว (id ชิ้นย่อยตรงกับที่ตัวจัดหน้าเห็น)

## รูปแยกจอมือถือ (`mobileImageKey`)

Section ที่มีรูปเต็มจอ (hero · image · slideshow/สไลด์) มีช่อง `mobileImageKey` คู่กับ `imageKey`
ว่าง = ใช้รูปเดียวกับคอม · ฝั่งเว็บร้านแสดงด้วย `<picture><source media="(max-width: 767px)">` (breakpoint เดียวกับ `md:`)
เพิ่ม Section ใหม่ที่มีรูปเต็มจอ ให้ใช้ชื่อ key นี้เหมือนกัน

## ชุดหน้าตารูปของกลาง (imageLookFields + FramedImage)
- ERP `lib/website-schema.ts` `imageLookFields({ ratio, frame?, allowAuto?, ratioHint?, autoFrame? })` = ช่อง ratio · frame (มุมมน/เหลี่ยม/วงกลม/โค้ง/หัวใจ/หยัก/โพลารอยด์/แสตมป์) · border · borderColor
- เว็บร้าน `src/components/home/FramedImage.tsx` วาดรูปตามชุดนี้ + crop (CSS `.gal-img` `.gal-fr-*` `.gal-paper-*` ใน globals.css)
- ใช้อยู่: แกลเลอรีรูป · รูปคู่ข้อความ (+ `imgSize` ความกว้างรูป %) · หลายคอลัมน์ (ค่าเริ่ม 4:3 มุมมน = แบบเดิม · ครอปรายคอลัมน์) · รูปภาพ (ค่าเริ่ม ratio "auto" ตามรูปจริง + frame "auto" = เต็มจอเหลี่ยม/อื่นมุมมน แบบเดิม · `mobileKey` รูปมือถือแยก) — Section ใหม่ที่มีรูปให้ใช้ชุดนี้ ไม่เขียนกรอบเอง
- `autoFrame` = เพิ่มตัวเลือกทรง "อัตโนมัติ" (Section ตัดสินเองตามค่าอื่น) — เว็บร้านต้องแปลง "auto" เป็นทรงจริงก่อนส่งให้ FramedImage

## ช่องชนิด crop (ส่วนที่เห็น/ซูมของรูป)
- `f("crop", "...", "crop", { cropImage: "imageKey", cropRatio: "ratio" })` เก็บ `{ x, y, zoom }` — ฟอร์มวาดของกลาง `ImageCropBox` (components/image-crop-box.tsx · ลากกรอบ/คลิกรูป + ซูม) กรอบตามสัดส่วนใน Section แม่
- ไม่มีช่องสัดส่วน (รูปเต็มจอ) ใช้ `cropBox: "16:7"` = กรอบตายตัว ≈ แบนเนอร์บนจอคอม — ใช้ที่แบนเนอร์หลัก (Hero) · สไลด์ (รายสไลด์) · เว็บร้านวาดด้วย `cropStyle(crop)` (src/lib/image-crop.ts · ค่ากลาง = ไม่ใส่ style)
- เว็บร้านวาดสูตรเดียวกัน: `object-fit: cover; object-position: x% y%; transform: scale(zoom/100); transform-origin: x% y%` (ใช้ที่แกลเลอรีรูป · รูปคู่ข้อความ · หลายคอลัมน์ · รูปภาพ · แบนเนอร์หลัก · สไลด์ · รูปพื้นหลังผืนผ้าใบใช้ ImageCropBox ตัวเดียวกัน)

## ⚡ พรีวิวสด (ตัวจัดหน้า → iframe เว็บร้าน)

- ERP `components/website-builder.tsx`: พรีวิวโหลดเสร็จ → ส่ง `storefront-live-hello` · เว็บร้านตอบ `storefront-live-ready` → ทุกครั้งที่แก้ ส่ง `storefront-blocks-live {blocks}` (รวบเป็น 1 ครั้งต่อเฟรม)
- เว็บร้าน `src/components/home/LiveBlocks.tsx` (ใช้เฉพาะ ?preview=1): `parseBlocks` แล้ววาดใหม่ทันที · รับเฉพาะจาก origin ของ `NEXT_PUBLIC_ERP_BASE_URL` (+ localhost ตอน dev)
  - Section ทั่วไป = วาดใหม่ในเบราว์เซอร์ · Section ที่ดึงข้อมูล = ใช้ที่เซิร์ฟเวอร์วาดมา (รูปลักษณ์ตัวห่อเปลี่ยนสด) · ผืนผ้าใบ = วาดครั้งเดียวต่อ id (รับสดทาง `storefront-canvas-update`)
- บันทึกร่าง (1.5 วิ) แล้วโหลดพรีวิวใหม่ **เฉพาะ** เมื่อ `previewReloadSig` เปลี่ยน = เนื้อหาของ Section ที่ดึงข้อมูล (ย้ายลำดับ/รูปลักษณ์ไม่นับ) · เว็บร้านรุ่นเก่าที่ไม่ตอบ = แบบเดิม (แก้อะไรก็โหลดใหม่)

## ผืนผ้าใบอิสระ (canvas)

Section ที่วางชิ้นตำแหน่งอิสระ — สัญญาข้อมูล/การคุยสดกับพรีวิว อยู่ที่ `docs/website-canvas.md`
