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
- 🌐 **2 ภาษา**: ช่องข้อความ (text/textarea/link/list) มีภาษาอังกฤษคู่ใน `<key>_en` (ปุ่ม = ข้อความบนปุ่มอย่างเดียว · รายการ = string[] เรียงตามไทย) + `_i18n` (สถานะการแปล ไม่ต้องใช้ฝั่งเว็บร้าน) — ไม่มีคำแปล = ไม่มีช่อง `_en` เลย · เว็บร้านเลือกด้วยกฎ "อังกฤษว่าง = ใช้ไทย" · ช่องที่ไม่ใช่ภาษาตั้ง `i18n: false` · รายละเอียด `docs/bilingual-content.md`

## รูปแยกจอมือถือ (`mobileImageKey`)

Section ที่มีรูปเต็มจอ (hero · image · slideshow/สไลด์) มีช่อง `mobileImageKey` คู่กับ `imageKey`
ว่าง = ใช้รูปเดียวกับคอม · ฝั่งเว็บร้านแสดงด้วย `<picture><source media="(max-width: 767px)">` (breakpoint เดียวกับ `md:`)
เพิ่ม Section ใหม่ที่มีรูปเต็มจอ ให้ใช้ชื่อ key นี้เหมือนกัน

## ชุดหน้าตารูปของกลาง (imageLookFields + FramedImage)
- ERP `lib/website-schema.ts` `imageLookFields({ ratio, frame?, allowAuto?, ratioHint?, autoFrame? })` = ช่อง ratio · frame (มุมมน/เหลี่ยม/วงกลม/โค้ง/หัวใจ/หยัก/โพลารอยด์/แสตมป์) · border · borderColor
- เว็บร้าน `src/components/home/FramedImage.tsx` วาดรูปตามชุดนี้ + crop (CSS `.gal-img` `.gal-fr-*` `.gal-paper-*` ใน globals.css)
- ใช้อยู่ (เพิ่ม 2026-10-14): 💬 รีวิว (รูปจากลูกค้ารายรีวิว + ดาว `showStars` ปิดไว้ก่อน = หน้าตาเดิม · `rating` "1"–"5") · 📸 ฟีด Instagram (Section ใหม่ `instagram`: handle/profileUrl/buttonText/columns/mobileColumns/gap · รายรูป imageKey/crop/alt/href ว่าง = โปรไฟล์ · กรอบเริ่ม rect · เว็บร้าน InstagramBlockView)
- ใช้อยู่: แกลเลอรีรูป · รูปคู่ข้อความ (+ `imgSize` ความกว้างรูป %) · หลายคอลัมน์ (ค่าเริ่ม 4:3 มุมมน = แบบเดิม · ครอปรายคอลัมน์) · รูปภาพ (ค่าเริ่ม ratio "auto" ตามรูปจริง + frame "auto" = เต็มจอเหลี่ยม/อื่นมุมมน แบบเดิม · `mobileKey` รูปมือถือแยก) — Section ใหม่ที่มีรูปให้ใช้ชุดนี้ ไม่เขียนกรอบเอง
- `autoFrame` = เพิ่มตัวเลือกทรง "อัตโนมัติ" (Section ตัดสินเองตามค่าอื่น) — เว็บร้านต้องแปลง "auto" เป็นทรงจริงก่อนส่งให้ FramedImage

## 📝 ข้อความประกอบรูปของกลาง (imageCaptionFields + ImageCaption) — เพิ่ม 2026-10-18
- ERP `lib/website-schema.ts` `imageCaptionFields()` = ช่องระดับ Section กลุ่มใหม่ **"ข้อความประกอบรูป"** (`FieldGroup` `caption` · ท้ายแท็บเนื้อหา):
  `capShow` · `capPos` (below ใต้รูป / card การ์ดมีพื้น / overlay ซ้อนบนรูป / hover โผล่ตอนชี้ — ปุ่มรูปย่อ sketch `cap-*`) · `capAlign` (auto = ตามรูปลักษณ์ Section) · `capGap` ·
  หัวข้อ `capTitleFont` (CANVAS_FONTS) `capTitleSize` (xs–xl) `capTitleWeight` `capTitleColor`+`capTitleHex` `capTitleUpper` · คำอธิบาย `capTextSize` (xs–l) `capTextColor`+`capTextHex` ·
  `capLinkStyle` (text/button) · `capShade` (แถบมืดบนรูป %) · `capCardBg`+`capCardHex` · `capMobile` (all / title = หัวข้ออย่างเดียว / none = ซ่อน)
  - สี "auto" = ใต้รูป/การ์ด ตามธีม (หัวข้อ ink · คำอธิบาย muted) · บนรูป = ขาว
- ชิ้นย่อยต้องมี `title` (หัวข้อ) · `caption` (คำอธิบาย) · `linkText` (ข้อความลิงก์ — โชว์เมื่อมี `href`) → แปล 2 ภาษาได้เองตามกฎ `<key>_en`
- **ค่าเริ่มทุกช่อง = แบบเดิมของแกลเลอรี** (ใต้รูป · 14px สีรอง · ห่าง 8px · เต็มจอเว้นขอบ 12px) — บล็อกเก่าที่มีแค่ `caption` หน้าตาเหมือนเดิมทุกพิกเซล
- เว็บร้าน: ตัวแปลง `src/lib/image-caption.ts` (`captionLook` · `hasCaption` · `captionFontHref`) + ตัววาด `src/components/home/ImageCaption.tsx`
  - บนรูป/ตอนชี้ = ส่งเป็น children ของ `FramedImage` (ตัดตามทรงกรอบ) · ทั้งรูปเป็นลิงก์ → ข้อความลิงก์เป็นแค่ป้าย (ห้าม `<a>` ซ้อน)
  - CSS `.gal-cap-on` `.gal-cap-hover` (จอสัมผัสเห็นตลอด) `.gal-card` ใน globals.css
- ใช้อยู่: แกลเลอรีรูป · Section ใหม่ที่มีรูป+ข้อความรายรูป ให้ใช้ชุดนี้ ไม่เขียนเอง

## 🛍 ลุคบุ๊กกดซื้อได้ — ปรับเพิ่ม 2026-10-18 (ค่าเริ่มทุกช่อง = หน้าตาเดิม)
- จุดละหลายสินค้า: `spots[].code` สูงสุด 6 (ตัวแรก = หลัก · การ์ดเลื่อนดู ‹ 1/3 ›) · `spots[].label` ป้ายข้างจุด (ว่าง = ชื่อสินค้า)
- สินค้าเพิ่มเติมไม่มีจุด: `more` (รหัสรุ่น ≤ 12) → อยู่ใน "รายการทั้งลุค" (แผงข้างรูปแบบรายการ / รายการใต้รูป / มือถือแบบรายการ)
- รูป: `imgFrame` (rounded/rect) · แบบข้างรูป: `sideMode` (card เดิม / list รายการทั้งลุค + ราคารวม) · `imgWidth` 50/58(เดิม)/65/70 — รูปอยู่ขวาก็ได้ช่องกว้างตามที่ตั้ง
- จุด: `dotColor` (white เดิม/ink/brand/brandDeep/custom+`dotHex`) · `dotSize` s/m(เดิม)/l · `dotPulse` auto(เฉพาะวงกลม เดิม)/on/off · `dotLabel` ป้ายชื่อข้างจุด
- การ์ด: `cardBg` (auto เดิม/page/surface/white/brandSoft/custom+`cardHex`) · `cardAlign` · `addStyle` · `viewStyle` (outline เดิม/brand/dark/link) · `showTotal`+`totalText`
- รายการใต้รูป: `listTitle` · `listStyle` grid(เดิม)/carousel (ProductsCarousel กลาง) · `listCols` auto(ธีม)/2–6 · มือถือ `mobileLayout` same/list (ซ่อนการ์ด/ป๊อป → รายการใต้รูป)
- เว็บร้าน: `src/components/home/LookbookBody.tsx` (SpotCard · LookList · LookCard) · CSS `.lb-*` ใน globals.css (จุดใช้ตัวแปร `--lb-dot-*` · คอลัมน์ `--lb-fr`)
- 🎞 **สไลด์ (2026-10-19)**: `mode` single/slides · `imageKey2`–`imageKey6` · `lookNames` (list · แปล EN ได้) · จุด `look` "1"–"6" (ช่องโชว์เฉพาะหลายลุค = `showIfParent` · วางจุดบนรูปลุคนั้น = `pointLook`) · `joinPrev` = ต่อสไลด์กับลุคบุ๊กก่อนหน้า (เว็บร้าน `parseBlocks` รวมเป็น `joined` ของกล่องแรก ไม่วาดแยก) · `slideNav` both/arrows/dots · `slideEffect` slide/fade · `slideAuto`+`slideSec` (ใช้ของกล่องแรกที่ตั้งสไลด์) · เว็บร้าน `LookSlider` + `LookView`
- ของกลางใหม่ใน schema: `FieldDef.showIfParent` (ช่องของชิ้นย่อยโชว์ตามค่าของ Section แม่) · `FieldDef.pointLook` (ช่องจุดบนรูปเลือกรูป `${pointImage}${n}` ตามลุคของชิ้น)

## ⭐ แม่แบบ Section + 🕘 ประวัติเวอร์ชัน
- **แม่แบบ Section** — ตาราง `website_section_templates` (migration 202610150200 · RLS เปิด ไม่มี policy · เข้าผ่าน API service role เท่านั้น)
  - API `/api/website/section-templates` GET/POST/PATCH(ชื่อ)/DELETE · ทุกการกระทำลง audit · ผืนผ้าใบในแม่แบบบันทึกรูปถูกใช้ (module `website_section_template`)
  - ตัวกลาง `lib/website-section-templates.ts`: `cleanTemplateBlock` (normalizeBlocks + ตัด id · รับเฉพาะชนิดที่ schema รู้จัก) · `defaultTemplateName`
  - หน้าจอ `components/website-section-templates.tsx`: ปุ่ม 💾 หัวแผงขวา → `SaveSectionTemplateDialog` · คลัง Section กลุ่ม "⭐ แม่แบบที่บันทึกไว้" (`SectionTemplateGroup` ร้านนี้ก่อน · ✏️ แก้ชื่อ · 🗑 ลบ ConfirmDialog) · Section ทดลองที่ร้านยังไม่เปิด = ใส่ไม่ได้
  - ใส่ = `freshCopy()` ใน website-builder (id ใหม่ทั้ง Section + ชิ้นย่อย — ตัวเดียวกับปุ่มทำสำเนา) ต่อท้ายหน้า · แก้ทีหลังไม่กระทบแม่แบบ
- **ประวัติเวอร์ชัน** — บันทึกตอนกดเผยแพร่ (หน้าแรก `store_home_versions` · หน้าอื่น `store_page_versions` โครงเดียวกัน)
  - API `/api/website/layout/versions` (หน้าแรก) · `/api/website/pages/versions` (หน้าอื่น) — GET 30 เวอร์ชันล่าสุด · POST กู้คืน = เขียนลงร่างเท่านั้น (เว็บจริงไม่เปลี่ยน) + audit
  - ตัวแปลงกลาง `lib/website-versions.ts` `toWebVersion` (จำนวน + ชื่อ Section ที่เปิดใช้) · หน้าจอ `components/website-version-history.tsx` `VersionHistoryDrawer` (Drawer + ConfirmDialog กลาง) — ปุ่ม 🕘 ทั้งหน้าแรกและหน้าอื่น · ใส่ผลผ่าน apply() จึงกด ↶ ย้อนได้

## 🔤 ตัวอักษรหัวข้อต่อ Section + มือถือแยก (style.text · style.mobile)
- ERP `lib/website-blocks.ts` `BlockStyle.text` = `{ font, size, weight, color, colorHex, subColor, subColorHex }` · ค่าเริ่ม "auto" ทุกช่อง = หน้าเว็บเหมือนเดิม
  - ฟอนต์/สี/ความหนา = ชุดเดียวกับผืนผ้าใบ (`CANVAS_FONTS` · `CANVAS_COLORS` · `CANVAS_WEIGHTS`) — ค่านอกรายการถูกล้างเป็น "auto" ตอน normalize · สีเองไม่มีรหัสสี = "auto"
  - ขนาด = ชื่อสเกล `s|m|l|xl|xxl` (ไม่ใช่ px) → เว็บร้านแปลงเป็น clamp() ย่อตามจอ
- `style.mobile` เพิ่ม `hSize` (ขนาดหัวข้อเฉพาะมือถือ) · `hideEyebrow` · `hideSub`
- แผงตั้ง: `StylePanel` แท็บ "🔤 ตัวอักษร" + แท็บ "📲 มือถือ" — โชว์เฉพาะ Section ที่มีหัวข้อ (`sectionHasHeading(type)` · ผืนผ้าใบ/โชว์สินค้าเด่นมีตัวตั้งเองแล้ว → ไม่โชว์)
- ตัวเลือกฟอนต์/จุดสี = ของกลาง `components/website-text-pickers.tsx` (`FontPickList` · `ColorSwatches` · `useShopTheme` · `usePreviewFonts`) ใช้ร่วมกับผืนผ้าใบ
- เว็บร้าน `blockStyleAttrs` (src/lib/blocks.ts) → `data-h-font|data-h-size|data-h-weight|data-h-color|data-sub-color` + ตัวแปร `--sec-h-*` · มือถือ `data-h-size-m|data-hide-eyebrow-m|data-hide-sub-m`
  - CSS globals.css "ตัวอักษรหัวข้อต่อ Section": หัวข้อ = `h1/h2` ของ Section · ตัวเล็ก = `.eyebrow` · คำโปรย = `<p>` ถัดจากหัวข้อ → **Section ใหม่ต้องเขียนหัวข้อตามแบบนี้** ถึงจะปรับได้
  - ฟอนต์นอกธีม: `BlockFontLink` (block-registry.tsx) ใส่ `<link precedence>` ในตัวห่อ Section — React ยกขึ้น head + ไม่โหลดซ้ำ

## ช่องชนิด crop (ส่วนที่เห็น/ซูมของรูป)
- `f("crop", "...", "crop", { cropImage: "imageKey", cropRatio: "ratio" })` เก็บ `{ x, y, zoom }` — ฟอร์มวาดของกลาง `ImageCropBox` (components/image-crop-box.tsx · ลากกรอบ/คลิกรูป + ซูม) กรอบตามสัดส่วนใน Section แม่
- ไม่มีช่องสัดส่วน (รูปเต็มจอ) ใช้ `cropBox: "16:7"` = กรอบตายตัว ≈ แบนเนอร์บนจอคอม — ใช้ที่แบนเนอร์หลัก (Hero) · สไลด์ (รายสไลด์) · เว็บร้านวาดด้วย `cropStyle(crop)` (src/lib/image-crop.ts · ค่ากลาง = ไม่ใส่ style)
- เว็บร้านวาดสูตรเดียวกัน: `object-fit: cover; object-position: x% y%; transform: scale(zoom/100); transform-origin: x% y%` (ใช้ที่แกลเลอรีรูป · รูปคู่ข้อความ · หลายคอลัมน์ · รูปภาพ · แบนเนอร์หลัก · สไลด์ · รูปพื้นหลังผืนผ้าใบใช้ ImageCropBox ตัวเดียวกัน)

## 🃏 การ์ดในส่วนนี้ (Section ตารางสินค้า)
- ERP `lib/website-schema.ts` `PRODUCT_CARD_FIELDS` (กลุ่ม `card`): สวิตช์หลัก `cardUseShop` (ค่าเริ่ม true = ตามการ์ดของร้าน ดีไซน์ → การ์ดสินค้า เหมือนเดิม) + สวิตช์ `cardName/cardPrice/cardBadge/cardCompare/cardPriceFrom/cardUnit/cardCategory/cardStock/cardSwatches/cardColorCount/cardQuickAdd/cardQuickView` + `cardTitleLines` ("1"–"3") + `cardAlign`
- ปิดสวิตช์หลัก → ฟอร์มก๊อปการ์ดของร้านที่เผยแพร่อยู่มาเป็นค่าเริ่ม (`FieldDef.copyShopCard` + `SchemaFormContext.themeCard` จาก `/api/website/layout` · `/api/website/pages?pageId=`) → แก้การ์ดของร้านทีหลังไม่ลามมาที่ Section นี้
- เว็บร้าน: `src/lib/card-override.ts` (`cardOverrideOf` · `applyCardOverride`) + `src/components/shop/CardSettings.tsx` (`CardSettingsProvider` ห่อใน ProductsBlockBody · `useCardConfig()` แทน `useTheme().card`) — ProductCard · ProductTile · ProductsSpotlight อ่านค่าเดียวกัน ทุกรูปแบบการโชว์
- ป้าย: เปิด = ตามที่ร้านตั้ง · ปิด = ไม่มีป้าย (สินค้าหมดขึ้นเสมอ) · ปุ่มตะกร้า/ดูด่วน: เปิด = แบบปุ่มของร้าน (ร้านปิดไว้ = โผล่ตอนชี้ / ปุ่มตามุมรูป)
- แบบรูปนำ (`PRODUCT_TILE_LAYOUTS` = mosaic/lookbook/spotlight) ไม่มีป้าย/สต๊อก/หมวด/จุดสี/ปุ่ม → สวิตช์พวกนี้ `showIf` เฉพาะเมื่อคอมหรือมือถือเป็นการ์ดเต็ม (`CARD_LAYOUTS`) · เพิ่มรูปแบบใหม่ต้องใส่ลิสต์ใดลิสต์หนึ่ง (มี test กัน)

## 🗂 แท็บตามรุ่นสินค้า (Section ตารางสินค้า · รูปแบบ "แท็บ") — 2026-10-21
- ERP `lib/website-schema.ts` (โชว์เมื่อคอม/มือถือเป็น "แท็บ" · `TABS_LAYOUT`): `tabBy` cat (เดิม) | parent · `tabParents` (รหัสรุ่น สูงสุด 12 · ว่าง = รุ่นของสินค้าใน Section) · `tabStyle` both | img | txt · `tabRest` (ต่อท้าย SKU รุ่นอื่น) · `tabRestSep` (คำคั่น "รุ่นอื่น"/"More styles") · `tabBody` grid (เดิม) | carousel — ค่าเริ่มทุกช่อง = หน้าตาเดิม
- เว็บร้าน `src/lib/product-tabs.ts` (`parentTabs` · `trimCommonWords` ตัดคำนำหน้าที่ทุกแท็บมีเหมือนกัน) → `ProductsTabs` (แท็บรูป/ชื่อ · ตาราง/เลื่อนข้าง) · `ProductsCarousel` รับ `sepAt/sepLabel` · CSS `.ptab-*` `.ptabs-sep` `.pc-sep`
- กดแท็บรุ่น: Section "เลือก SKU เอง" = เฉพาะสีที่เลือก · แหล่งอื่น/รุ่นที่ไม่ได้เลือกสีไว้ = ทุกสีของรุ่น · ต่อท้าย = การ์ด SKU อื่นใน Section
- รอบ 2: `tabThumbs` (ช่องชนิด skus · รูปแท็บ = รูปของ SKU ที่เลือก รุ่นละ 1) · `tabThumbShape` circle|rounded|square · `tabThumbSize` / `tabThumbSizeM` (px · 0 = อัตโนมัติ / 80% ของคอม → CSS `--pt-s` `--pt-sm` `--pt-r` `--pt-cr`) · `tabNav` scroll|arrows (◀ ▶ โผล่เมื่อแท็บล้น) · `tabMax` (0 = ทุกแท็บ · เกิน = ปุ่ม +N) · `tabColsM` auto|1|2|3 + `columns` = การ์ดต่อแถวใต้แท็บ (ProductGrid `columnsMobile` · ProductsCarousel `perView/perViewM` → `.pc-fit` `--pc-w/--pc-wm`)

## 🎞️ สไลด์โชว์ (slideshow)
- ช่องใหม่ทุกช่องค่าเริ่ม = หน้าตาเดิม: `shape` (height/21:9/16:9/3:2/1:1/4:5/full · ปุ่มรูปย่อ `ss-*`) · `shapeMobile` (same + 3:4) · `width` (full/contained) · `transition` (fade/slide/zoom/peek) · `arrows` (always/hover/none) · `indicator` (dots/lines/number/progress/none) · `navColor` · `titleSize` · `textColor` · รายสไลด์ `textPos` (auto + 9 จุด `pos-*` ของกลาง) · `overlayStyle` (solid/gradient) · `wholeLink`
- กรอบ crop ของชิ้นสไลด์ = `cropRatio: "shape"` ของ Section แม่ · ค่าไม่ใช่สัดส่วน (height/full) → ใช้ `cropBox` "16:7" (ของกลาง CropField: ค่า Section ไม่ใช่ N:N + มี cropBox = ใช้ cropBox)
- เว็บร้าน `src/components/home/Slideshow.tsx` + CSS `.ss-*` (globals.css): รูปทรงคอม/มือถือแยกด้วยตัวแปร `--ss-ar/-m` `--ss-h/-m` `--ss-minh/-m` · ปัดนิ้ว · ชี้เมาส์ = หยุด · ลดการเคลื่อนไหว = ไม่เลื่อนเอง/ไม่ซูม · "อยู่ในกรอบ" ไม่นับเป็นรูปเต็มจอ (Header โปร่งใส)

## ⚡ พรีวิวสด (ตัวจัดหน้า → iframe เว็บร้าน)

- ERP `components/website-builder.tsx`: พรีวิวโหลดเสร็จ → ส่ง `storefront-live-hello` · เว็บร้านตอบ `storefront-live-ready` → ทุกครั้งที่แก้ ส่ง `storefront-blocks-live {blocks}` (รวบเป็น 1 ครั้งต่อเฟรม)
- เว็บร้าน `src/components/home/LiveBlocks.tsx` (ใช้เฉพาะ ?preview=1): `parseBlocks` แล้ววาดใหม่ทันที · รับเฉพาะจาก origin ของ `NEXT_PUBLIC_ERP_BASE_URL` (+ localhost ตอน dev)
  - Section ทั่วไป = วาดใหม่ในเบราว์เซอร์ · Section ที่ดึงข้อมูล = ใช้ที่เซิร์ฟเวอร์วาดมา (รูปลักษณ์ตัวห่อเปลี่ยนสด) · ผืนผ้าใบ = วาดครั้งเดียวต่อ id (รับสดทาง `storefront-canvas-update`)
- บันทึกร่าง (1.5 วิ) แล้วโหลดพรีวิวใหม่ **เฉพาะ** เมื่อ `previewReloadSig` เปลี่ยน = เนื้อหาของ Section ที่ดึงข้อมูล (ย้ายลำดับ/รูปลักษณ์ไม่นับ) · เว็บร้านรุ่นเก่าที่ไม่ตอบ = แบบเดิม (แก้อะไรก็โหลดใหม่)

## ผืนผ้าใบอิสระ (canvas)

Section ที่วางชิ้นตำแหน่งอิสระ — สัญญาข้อมูล/การคุยสดกับพรีวิว อยู่ที่ `docs/website-canvas.md`
