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

## เพิ่ม widget ใหม่ — เช็กลิสต์

### ฝั่ง ERP (`C:/erp-local/assets-verify`)

1. `lib/website-blocks.ts`
   - เพิ่มชื่อใน `BlockType`
   - เพิ่ม `interface XxxBlock extends BlockBase` แล้วต่อเข้า union `Block`
   - เพิ่มรายการใน `BLOCK_META` (ชื่อไทย/ไอคอน/คำอธิบาย/กลุ่ม)
   - เพิ่ม `case` ใน `newBlock()` (ค่าตั้งต้น)
   - เพิ่ม `case` ใน `normalizeBlocks()` — **ต้อง sanitize ทุกฟิลด์** (`str`/`num`/`imgKey`/`link`)
   - เพิ่มกฎเตือนใน `validateBlocks()` ถ้ามีช่องที่ปล่อยว่างแล้วพัง
2. `components/website-block-editor.tsx`
   - เพิ่ม `case` ใน `blockSummary()` (ข้อความสรุปในรายการ)
   - เพิ่ม `case` ใน `BlockEditor()` (ฟอร์มกรอก)
   - **ห้ามประกาศชนิดหรือค่าตั้งต้นซ้ำในไฟล์นี้**
3. `lib/__tests__/website-blocks.test.ts` — รันเทสต์ ต้องเขียว
   (มีเทสต์ที่ไล่ทุกชนิดใน `BLOCK_META` อยู่แล้ว ถ้าลืมทำค่าตั้งต้นจะแดงเอง)

### ฝั่งเว็บร้าน (เช่น `Program App/ig-international`)

4. `src/lib/blocks.ts` — เพิ่มชนิดให้ตรงกับ ERP
5. `src/components/home/BlockRenderer.tsx`
   - เพิ่มชื่อไทยใน `BLOCK_LABEL`
   - เพิ่ม `case` ใน `renderOne()` + เขียน component แสดงผล
6. `npm run build` ต้องผ่าน แล้ว deploy

> ถ้าทำถึงข้อ 3 แล้วหยุด: widget จะโผล่ใน ERP แต่**ไม่ขึ้นบนเว็บ**
> โหมดพรีวิวจะขึ้นป้าย "ยังแสดง widget นี้บนเว็บไม่ได้" ให้เห็น (ลูกค้าไม่เห็นอะไร)

---

## ข้อควรรู้เรื่องหลายร้าน

- ตอนนี้ระบบบล็อกชุดนี้มี **เว็บ IG International ใช้อยู่ร้านเดียว**
- Pixiedustie ใช้บล็อกคนละชุด (`hero`, `product-grid`) ที่มาจากระบบเดิม
  → `normalizeBlocks` **เก็บบล็อกที่ไม่รู้จักไว้เฉย ๆ ห้ามทิ้ง** ไม่งั้นกดเผยแพร่ครั้งเดียวหน้าเว็บร้านนั้นหาย
- ยังไม่จำเป็นต้องทำ "ตัวแสดงผลกลาง" ใช้ร่วมหลายร้าน เพราะแต่ละร้านหน้าตาคนละแนวโดยตั้งใจ
  (จะคุ้มก็ต่อเมื่อมีร้านที่ 2 มาใช้บล็อกชุดนี้จริง)

---

## เว็บร้านที่ยังไม่ผูก Git

`ig-international` **ไม่ได้ผูก Git** ต้องสั่ง deploy เองจากเครื่อง:

```bash
cd "C:/Users/Gogo/Documents/Claude/Projects/Program App/ig-international"
npx vercel --prod
```

ผูก Git แล้วจะ deploy อัตโนมัติเหมือน ERP — ขั้นตอน (เจ้าของทำเอง):
1. สร้าง repo เปล่าบน GitHub
2. ในโฟลเดอร์เว็บ: `git init` → `git add .` → `git commit` → `git remote add origin <url>` → `git push -u origin main`
3. Vercel → โปรเจกต์ `ig-international` → Settings → Git → เชื่อม repo นั้น
