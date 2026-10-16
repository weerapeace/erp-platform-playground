# 🧵 Belt Builder — ออกแบบเข็มขัดเอง (Louis Montini)

## ใช้ทำอะไร
ให้ลูกค้าบนเว็บหน้าร้าน Louis Montini ประกอบเข็มขัดเอง: เลือกสายหนัง · หัวเข็มขัด · หูเข็มขัด · สลักชื่อ · ความยาวตามรอบเอว
แล้วเห็นพรีวิวเป็น **รูปถ่ายจริงซ้อนเป็นชั้น** ก่อนสั่งซื้อ · แอดมินเพิ่ม/ลบ/ตั้งราคาตัวเลือกเองจากหลังบ้าน ไม่ต้องแก้โค้ด

สถานะ: **ก้อน 1+2 (ฐานข้อมูล + หลังบ้าน) เสร็จ** · ก้อน 3 หน้าเว็บลูกค้า · ก้อน 4 สั่งซื้อ → ใบสั่งขาย ยังไม่ทำ

## ภาพรวมการซ้อนชั้น (ผืนผ้าใบคงที่ 1600×600 px)
| ชั้น | ชิ้น | รูป | จุดยึดเริ่มต้น {x,y,w,h} |
|---|---|---|---|
| 1 (ล่าง) | สายหนัง `strap` | PNG พื้นโปร่ง ถ่ายเต็มเส้นแนวนอน | 0, 300, 1600, 150 |
| 2 | หู `keeper` | PNG พื้นโปร่ง ด้านหน้าตรง | 235, 255, 65, 210 |
| 3 | หัว `buckle` | PNG พื้นโปร่ง ด้านหน้าตรง | 0, 225, 200, 300 |
| 4 (บน) | สลักชื่อ | **ตัวอักษรพิมพ์สด** ไม่ใช่รูป | กล่อง 1150, 330, 380, 90 (`DEFAULT_ENGRAVING_BOX`) |

จุดยึดปรับได้รายชิ้นจากหลังบ้าน (ลากในพรีวิว หรือพิมพ์ตัวเลข) · ชิ้นที่ยังไม่มีรูปจะวาดเป็นกล่องสีแทน (สีจาก `attrs.color_hex` / `metal_hex`)

## ข้อมูล (migration `202610201000_belt_builder.sql`)
- `belt_parts` — ชิ้นส่วน: `shop_id` · `part_type` (strap/buckle/keeper) · `code` (ห้ามซ้ำในร้าน) · `name_th/en` · `image_key` (R2 key จากคลังไฟล์) · `image_url` (สำรอง) · `anchor` jsonb · `attrs` jsonb (สี/กว้างสาย/ทรง/สีโลหะ — เว็บใช้ทำตัวกรอง) · `price_delta` ≥ 0 · `sort_order` · `is_active` · `deleted_at` (ลบแบบกู้คืนได้)
- `belt_size_rules` — กติกาไซซ์: `gender` (men/women) · `waist_min_in`/`waist_max_in` · `strap_formula` {mult, add_cm} · `hole_count` · `hole_spacing_cm`
- `belt_designs` — แบบของลูกค้า: `selections` {strap_id, buckle_id, keeper_id, engraving{text,font,position}, waist_in, gender, width_mm} · `total_price` · `status` (saved/in_cart/ordered) · `order_ref` · `member_id`
- RLS เปิดทั้ง 3 ตาราง ไม่มี policy = เข้าได้เฉพาะผ่าน API (service role)
- CHECK ที่ DB คุมอีกชั้น: part_type/gender/status อยู่ใน enum · anchor มี x,y,w,h · price_delta ≥ 0 · เอว min < max
- seed Louis Montini: สาย 6 สี × 2 กว้าง (35/40 มม.) · หัว 4 ทรง × 4 สีโลหะ · หู 4 แบบ · กติกาไซซ์ ชาย 28–46″ หญิง 24–38″ (รูปยังว่าง รออัปโหลดจริง)

## กฎกลาง `lib/belt-builder.ts` (pure · มี test `lib/belt-builder.test.ts`)
- `validatePart` / `validateSizeRule` — ใช้ทั้งฝั่ง API และฟอร์ม (ข้อความภาษาคน)
- `strapLengthCm(waistIn, formula)` = เอว(นิ้ว) × mult + add_cm (ค่าเริ่ม ×2.54 + 24) → ปัด 1 ตำแหน่ง
- `holePositionsCm` รูกลางตรงรอบเอว ที่เหลือห่างเท่ากัน · `pickSizeRule` เลือกกติกาตามเพศ+เอว · `totalPrice` ฐาน + delta ทุกชิ้น + ค่าสลัก
- ค่าคงที่: `BELT_CANVAS` · `DEFAULT_ANCHOR` · `LAYER_ORDER` · `PART_TYPE_LABEL` · `GENDER_LABEL`

## API `app/api/belt-builder/*` (guardApi `belt_builder.view` อ่าน / `belt_builder.edit` เขียน · writeAudit ทุกการเขียน)
handler กลางตัวเดียว `_shared.ts` + นิยามทรัพยากร `resources.ts` → 3 ทรัพยากรรูปแบบเดียวกัน (ตรงกับ MasterCRUD `restApi`):
```
GET    /api/belt-builder/{parts|size-rules|designs}?shop_id=&part_type=&include_inactive=true   → {data, total}
POST   /api/belt-builder/{res}                   → {data}   (ตรวจ validate* ก่อน · 400 + errors[] ถ้าไม่ผ่าน)
GET    /api/belt-builder/{res}/{id}              → {data}
PATCH  /api/belt-builder/{res}/{id}              → {data}   (ส่งเฉพาะฟิลด์ที่แก้ · audit เก็บ changes {from,to})
DELETE /api/belt-builder/{res}/{id}[?hard=1]     → {id}     (parts: soft = is_active=false + deleted_at · กู้คืน = PATCH is_active=true)
GET    /api/belt-builder/shops                   → ร้านที่เปิดอยู่ (ตัวเลือกบนหัวหน้า)
```
audit `entity_type` = belt_parts / belt_size_rules / belt_designs · action = create / update / restore / archive / delete

## หลังบ้าน `/admin/belt-builder` (เมนู 🌐 เว็บไซต์ → ออกแบบเข็มขัด)
ของกลางที่ใช้: `MasterCRUDPage` (+ flag ใหม่ `restApi: true` สำหรับ API ที่ไม่ใช่ master-v2) · DataTable กลาง · MasterRecordDrawer · `ImageInput` (อัปโหลด/เลือกจากคลังไฟล์ → R2 โฟลเดอร์ `belt-parts`)
- แท็บ **ชิ้นส่วน** — ชิปกรองประเภท (ทั้งหมด/สาย/หัว/หู) · ใน drawer: ช่องรูป · คุณสมบัติแบบ ชื่อ=ค่า (`AttrsEditor` มีคีย์แนะนำต่อประเภท) · **จุดยึด + พรีวิวซ้อนรูป** (`AnchorEditor`: ผืนผ้าใบย่อ + ชิ้นอ้างอิงของประเภทอื่นในร้านโชว์จาง ๆ · ลากย้าย/พิมพ์ x,y,w,h · ปุ่มค่าเริ่มต้น · เห็นผลทันทีก่อนบันทึก)
- แท็บ **กติกาไซซ์** — `StrapFormulaEditor` แก้ mult/add_cm + ตารางตัวอย่าง "เอวเท่านี้ → ตัดหนังกี่ซม. · รูอยู่ตรงไหน" สด
- แท็บ **แบบของลูกค้า** — อ่านอย่างเดียว · หน้าดูวาดพรีวิวจาก selections
- ของกลางพรีวิว: `components/belt-builder/belt-preview.tsx` (`BeltPreview` + `partToLayer`) — หน้าเว็บลูกค้า (ก้อน 3) ใช้กฎชุดเดียวกัน

## ทะเบียน
- สิทธิ์ `belt_builder.view` (admin/manager/staff) · `belt_builder.edit` (admin/manager) · ใน `Permission` type ด้วย
- `erp_modules`: belt_parts / belt_size_rules / belt_designs (+ erp_module_fields) → โผล่ใน "โมดูลทั้งหมด" ตั้ง Field Registry ได้ · หน้าจริงคือ /admin/belt-builder

## ก้อน 3 — หน้าเว็บลูกค้า (2026-10-16)
- **เปิดใช้ต่อร้าน:** ERP → ข้อมูลร้าน → กลุ่ม 🧵 `belt_enabled` + `belt_base_price` (0 = เว็บโชว์ "สอบถามราคาได้ที่ร้าน" ซ่อนราคาเพิ่ม) + `belt_engraving_fee` / `belt_engraving_max` (0 = ปิดสลัก) + `belt_lead_time` · ต้องมีสาย+หัวที่เปิดอยู่อย่างน้อยอย่างละ 1
- **payload สาธารณะ** site API `beltBuilder` (`lib/belt-builder-public.ts`): canvas · basePrice · leadTime · engraving {enabled,maxChars,fee,fonts[3],positions[3: tip/center/inside]} · parts[] (เฉพาะเปิด+ไม่ลบ) · sizeRules[]
- **API บันทึกแบบ** `POST /api/public/storefront/belt-designs` {shop, selections} → ตรวจ id ชิ้นส่วนเป็นของร้าน · กรองข้อความสลัก · เอวต้องอยู่ในกติกา · คิดราคาซ้ำฝั่งเซิร์ฟเวอร์ → แถว belt_designs (status saved) → {id, code (8 ตัวแรก), total} · `GET ?shop&id` โหลดกลับ (ลิงก์ `?design=<id>`)
- **Section ตัวจัดหน้า** `beltbuilder` (หมวดสินค้า): หัวข้อ · โชว์ราคา · โชว์คู่มือไซซ์ · ข้อความปุ่ม — ฝั่งเว็บเป็น SERVER_TYPES (พรีวิว ERP วาดจากเซิร์ฟเวอร์ด้วยข้อมูลร่าง)
- **เว็บร้าน (weerapeace/storefront)**: `src/lib/belt-builder.ts` (สำเนากฎ + parse) · `src/components/belt/BeltPreview.tsx` (ซ้อนชั้นเป็น % ของผืน · สลักใช้ cqw) · `BeltBuilderBody.tsx` (5 ขั้น: สาย กว้าง+สี → หัว ทรง+โลหะ → หู → สลัก → ไซซ์ · พรีวิว+ราคาติดบนจอ · บันทึกแบบ/ก๊อปลิงก์ · ปุ่มติดต่อสั่งทำ → /contact?design=รหัส) · หน้า `/belt-builder` สำเร็จรูป (404 ถ้าร้านไม่เปิด) · CSS `.belt-*` ใน globals.css
- ทดสอบแล้ว (dev): เลือกหัวโรสโกลด์ +250 → ราคา 1,750 · สลัก "LOUIS M." · เอว 32 → ตัดหนัง 105.3 ซม. · บันทึก → รหัสแบบ + reload ด้วย ?design= คืนค่าเดิม

## ก้อน 4 — ใส่ตะกร้า → ออเดอร์เว็บ (2026-10-16)
- **เว็บร้าน**: ร้านตั้งราคาฐานแล้ว → ปุ่มหลัก "ใส่ตะกร้า" (ยังไม่ตั้ง = "บันทึกแบบนี้" + "ติดต่อสั่งทำ" แบบเดิม) · กดแล้วบันทึกแบบก่อนถ้ายังไม่ได้บันทึกหรือเปลี่ยนอะไรหลังบันทึก (1 แบบ = 1 รหัส) → เข้าตะกร้าเป็น "สินค้าเสมือน" id `belt:<designId>` ชื่อ "เข็มขัดสั่งทำ · รหัสแบบ XXXX" ราคาจากแบบ (`beltCartProduct` ใน src/lib/belt-builder.ts) · ตะกร้า/เช็กเอาต์วาดได้โดยไม่แก้ · เช็กเอาต์ส่ง `{ beltDesignId, qty }` แทน productId (CheckoutClient)
- **ERP** `lib/website-orders.ts`: รับ items[].beltDesignId → `lib/belt-builder-order.ts` (pure + test) ตรวจว่าแบบเป็นของร้าน · ยังไม่เคยสั่ง · มีราคา → รายการ name/variant_label (สรุปแบบ) · unit_price = total_price ของแบบ (ไม่เชื่อราคาจากเว็บ) · `store_order_items.belt_design_id` (migration 202610201100) · หลังสร้างออเดอร์: `belt_designs.status=ordered + order_ref=เลขที่ออเดอร์` + audit `order`
- ออเดอร์เข้า **แท็บ 🧾 ออเดอร์ของเว็บร้าน** ใน ERP (store_orders) เหมือนสินค้าปกติ · แท็บ "แบบของลูกค้า" ใน /admin/belt-builder เห็นสถานะ "สั่งแล้ว" + เลขออเดอร์
- ทดสอบแล้ว (dev): ใส่ตะกร้า → เช็กเอาต์ COD → ออเดอร์ LM-256910-00001 รายการ "เข็มขัดสั่งทำ (สายดำ 35 มม. · หัวเข็มกลม ทอง · หู…)" ฿1,700 · แบบ = ordered · สั่งแบบเดิมซ้ำ = ปฏิเสธ "ถูกสั่งไปแล้ว" · (ข้อมูลทดสอบลบแล้ว)

## ยังไม่มี / ข้อควรรู้
- **ยังไม่ตัดสต๊อก** — ชิ้นส่วนเข็มขัดไม่ได้ผูกกับ SKU/สต๊อกในระบบ (ถ้าจะตัด ต้องเพิ่ม sku_id ให้ belt_parts แล้วตัดผ่าน ledger กลางตอนออเดอร์ "สำเร็จ")
- ออเดอร์เว็บ (store_orders) ทุกร้าน **ยังไม่ถูกแปลงเป็นใบสั่งขาย ERP** (คอลัมน์ erp_so_id มีแต่ไม่มีโค้ดแปลง) — เป็นงานกลางของระบบเว็บร้าน ไม่เฉพาะเข็มขัด
- ยังไม่มีรูปจริง — แอดมินต้องอัปโหลด PNG พื้นโปร่งทีละชิ้น (32 ชิ้นใน seed)
- ฟอนต์/ตำแหน่งสลักเป็นชุดตายตัวใน `lib/belt-builder-public.ts` (ENGRAVING_FONTS / ENGRAVING_POSITIONS) — ยังไม่ให้แอดมินตั้งเอง
- ระบบมีโมดูล `belt_*` เก่าของฝั่งผลิต (belt_hole, belt_width_size, belt_template …) อยู่ก่อนแล้ว — คนละชุดกับ Belt Builder ยังไม่ได้เชื่อม
