# 💌 เขียนการ์ดของขวัญจากหมายเหตุออเดอร์

> เจ้าของสั่ง 2026-11-24 · เลือก widget แบบ A (ออกแบบแม่แบบครั้งเดียว ใบต่อไปแก้แค่ข้อความ) + ข้อเสนอ 1-10
> หน้า `/order-ops/gift-cards` (แอป ออเดอร์ออนไลน์ · ศูนย์ร้านออนไลน์ › ออเดอร์ · แพ็ก · ส่ง)

## ใช้ทำอะไร

ลูกค้าเขียนหมายเหตุมาในออเดอร์ (เช่น "รบกวนห่อของขวัญเขียนการ์ด Happy Birthday") → หน้านี้รวมออเดอร์ทุกร้านที่มีหมายเหตุ
คัดแยกให้เอง แล้วกด "เขียนการ์ด" ได้การ์ดพร้อมพิมพ์ ข้อความจากหมายเหตุใส่ไว้ให้แล้ว (แก้ได้)

| หน้า | ใช้ทำอะไร |
|---|---|
| `/order-ops/gift-cards` | แท็บ การ์ด/ห่อ · สลักชื่อ · อื่น ๆ · การ์ดทั้งหมด (รวมการ์ดไม่ผูกออเดอร์ + ถังขยะ) · แม่แบบ+ฟอนต์ (ผู้จัดการ) |
| `/order-ops/gift-cards/edit?order=<id>` | เขียนการ์ดใหม่ของออเดอร์ (ยังไม่บันทึกจนกด "บันทึกการ์ด") |
| `/order-ops/gift-cards/edit?id=<การ์ด>` | แก้การ์ด · พิมพ์ · PNG · ติ๊กเขียนมือแล้ว · ย้อนการบันทึกครั้งก่อน · ลบ |
| `/order-ops/gift-cards/edit?new=1` | การ์ดไม่ผูกออเดอร์ (ลูกค้าขอทางแชต) ใส่เลขออเดอร์ทีหลังได้ |
| `/order-ops/gift-cards/template?id=` | ออกแบบแม่แบบ (ลากวางเต็ม) · ผูกแบรนด์ · ตั้งเป็นแม่แบบหลัก |
| `/print/order-gift-cards?ids=` | พิมพ์หลายใบ: A4 มีเส้นประให้ตัด / 1 ใบต่อแผ่น · กดพิมพ์ = ติ๊กพิมพ์แล้ว (เอาออกได้) |

ทางลัด: ศูนย์ออเดอร์ — กดข้อความลูกค้าใต้แถว / ในรายละเอียดออเดอร์ "เขียนการ์ด" · สถานีแพ็ก — กล่องเตือนชมพู "ลูกค้าขอการ์ด"

## หมายเหตุลูกค้าอยู่ไหน (อ่านอย่างเดียว ไม่แตะตัวดึงออเดอร์)

`buyerNoteOf(platform_orders.raw)`: Shopee `raw.shopee.message_to_seller` · TikTok `raw.tiktok.buyer_message` · Lazada `raw.lazada.gift_message/remarks` · สร้างเอง `raw.note`
- ข้อมูลจริง 24 พ.ย. 69: มีหมายเหตุ 46 ใบ (Shopee 35 · TikTok 11) — **เป็นการ์ด/ห่อจริงแค่ 4 ใบ** ที่เหลือส่วนใหญ่สลักชื่อ
- Lazada: ตัวดึงยังไม่เก็บข้อความของขวัญ (remarks ว่างทั้ง 75 ใบ) · LINE ยังไม่มีออเดอร์จริง · เว็บร้านมีระบบการ์ดของตัวเอง (`/print/gift-cards`)

## ของกลางที่ใช้

- **ตัวออกแบบ** `components/card-designer` (`CardDesigner` · `CardPreview` · `useCardFonts`) — ทะเบียน key `card-designer`
- **กติกา** `lib/gift-card-design.ts` (เทสต์ `lib/__tests__/gift-card-design.test.ts`): ชนิดการ์ด (มม.) · cleanDoc · ฟอนต์ 20 แบบ · สติ๊กเกอร์ 14 แบบ · แม่แบบในตัว 3 แบบ · classifyNote / suggestMessage / extractEngraveText · cardHtml / cardsPrintHtml
- **PNG** `lib/gift-card-png.ts` (ฝังฟอนต์ก่อนแปลงด้วย lib/html-to-png)
- ตั้งค่าตัวอักษร = `TextStyleControl` · สี = `ColorInput` · รูปจากคลัง = `AssetPicker` · อัปรูป = `/api/admin/upload` (folder `gift-cards`) · จัดวาง A4 = `sheetGrid` ของการ์ดเว็บร้าน · พิมพ์ = `PrintFrame` + `printReportHtmlInNewWindow` + `usePrintLog("gift_card")`
- AI = ด่านกลาง `aiChat("ai.gift_card")` (ทะเบียน lib/paid-services · ตั้งคนใช้ได้ที่ศูนย์ AI) + การ์ดรู้จักแบรนด์

## ข้อมูล (migration `202612250400_order_gift_cards.sql`)

| ตาราง | เก็บอะไร |
|---|---|
| `order_gift_cards` | การ์ดต่อออเดอร์ (หลายใบได้) · doc (ชิ้นบนการ์ด) · prev_doc (ย้อน 1 ขั้น) · หมายเหตุลูกค้า ณ ตอนสร้าง · พิมพ์/เขียนมือแล้ว · deleted_at |
| `gift_card_templates` | แม่แบบ · แบรนด์ · is_default (หลัก 1 ใบต่อแบรนด์) · deleted_at |
| `order_note_kinds` | คนแก้การคัดแยก (การ์ด/สลัก) ต่อออเดอร์ — ไม่มีแถว = ใช้ที่ระบบเดา |
| `gift_card_fonts` | ฟอนต์แบรนด์ (ไฟล์ใน R2 `gift-card-fonts/`) · deleted_at |

ทุกตาราง RLS เปิด + revoke anon/authenticated → อ่าน/เขียนผ่าน `/api/order-gift-cards` เท่านั้น

## สิทธิ์ / ประวัติ

- `order_ops.view` ดู · `order_ops.edit` เขียน/พิมพ์/ย้ายแท็บ/ส่งไปคำสั่งสลัก · `order_ops.delete` ลบการ์ด · `order_ops.manage` แม่แบบ+ฟอนต์
- ทุกการสร้าง/แก้/พิมพ์/ลบ/กู้คืน ลง audit_logs พร้อม changes (doc = "แก้รายละเอียด")

## แก้ไข · ย้อนกลับ · ลบ

- แก้: ข้อความ · แม่แบบ · ทั้งใบ · เลขออเดอร์ (การ์ดไม่ผูก) · โน้ตภายใน · การคัดแยก
- ย้อน: ในตัวออกแบบ Ctrl+Z / Ctrl+Y · "ย้อนการบันทึกครั้งก่อน" (prev_doc) · ติ๊กพิมพ์/เขียนมือ เอาออกได้ · ลบแล้วกด "ย้อนกลับ" ในแจ้งเตือน
- ลบ: ถังขยะทุกชนิด (การ์ด/แม่แบบ/ฟอนต์) กู้คืนได้ · ยังไม่มีลบถาวร

## ข้อจำกัด

- PNG: ฟอนต์ต้องโหลดได้ตอนกด (ฟอนต์ไม่มา = ใช้ฟอนต์สำรอง) · Safari บางรุ่นแปลงไม่ได้
- ตอนพิมพ์ต้องตั้ง "ขนาดจริง 100%"
- ส่งไปคำสั่งสลักชื่อ = สร้างแถวใน `order_instructions` (หน้า /order-ops/instructions) ตั้งรูปแบบ/ตำแหน่งต่อที่หน้านั้น

## แท็บสลักชื่อ ดูจากสินค้า (รอบ 2 · เจ้าของเลือก widget 2026-11-25 แบบ B)

ออเดอร์เข้าแท็บ "สลักชื่อ" ได้ 3 ทาง (กติกากลาง `lib/order-ops.ts` → `engraveOfOrder` · เทสต์ `lib/__tests__/order-ops.test.ts`):

1. **รหัสท้าย SKU** เช่น `TTM130-01D/1` (ถอดด้วย `decodeEngraveSku` ตัวเดียวกับหน้าแพ็กของ · ตั้งรหัสที่หน้าตั้งค่าเครื่องสลัก)
2. **รุ่นสินค้าตั้ง "สินค้าสลักชื่อ"** = `parent_skus_v2.engrave_mode` (ช่องใน Parent SKU › รายละเอียด Platform · migration `202612250900_parent_engrave_mode`)
   - `optional` สลักได้ ไม่บังคับ → เข้าแท็บเมื่อมีรหัสท้าย/หมายเหตุบอกสลัก · ไม่เตือน
   - `required` ต้องสลักทุกชิ้น → ทุกออเดอร์เข้าแท็บ · เตือนเมื่อไม่มีหมายเหตุ
   - จับคู่รุ่นจาก `platform_order_items.matched_parent_sku_id` หรือ `matched_sku_id → skus_v2.parent_sku_id`
3. **หมายเหตุลูกค้า** (`classifyNote` แบบเดิม)

- **"สลัก แต่ไม่มีชื่อ"** = มีรหัสท้าย/รุ่นต้องสลัก แต่ไม่มีหมายเหตุ และยังไม่ส่ง/ไม่ยกเลิก → การ์ดตัวเลขสีแดง + ปุ่ม "ทักแชทลูกค้า"
- ปุ่มทักแชท: ถ้าช่องทางนั้นมีตัวต่อใน `lib/chat/registry` (`CHAT_ADAPTERS`) → เปิด `/chat` · ถ้ายังไม่ต่อ (Shopee/TikTok/Lazada ตอนนี้) → บอกตรง ๆ + คัดลอกเลขออเดอร์ + ลิงก์ Seller Centre (ออเดอร์ไม่ได้เก็บชื่อบัญชีผู้ซื้อ จึงลิงก์ตรงห้องไม่ได้)
- กดแถวเปิดลิ้นชัก `OrderDetailView` ของศูนย์ออเดอร์ (ต้องมีสิทธิ์ `platform_orders.view` ถึงเห็นรายละเอียด)
- แถบแนะนำ: รุ่นที่ชื่อมีคำว่า "สลัก" แต่ยังไม่ตั้ง → ลิงก์ไปตั้งเอง (ระบบไม่ตั้งให้)
- เมนู ⋮ ในแถว: ตั้งรุ่นเป็นสินค้าสลักชื่อได้ (`order_ops.manage` · POST action `engrave_mode` · ลง audit `parent_skus_v2` · ย้อนกลับจากแจ้งผลมุมจอ)

## รวมเป็นหน้า "คำสั่งพิเศษ & การ์ด" (2026-11-25 · เจ้าของเลือก widget ข้อ 1-5)

- หน้าเดียว `/order-ops/instructions` แบ่ง 5 ส่วน `?s=`: งานเข้า (ค่าเริ่ม · `?tab=card|engrave|engrave_missing|other`) · `orders` คำสั่งพิเศษ · `wait` รอของ · `cards` การ์ดทั้งหมด · `settings` แม่แบบ+ฟอนต์
- ชิ้นส่วนการ์ดย้ายไป `app/order-ops/gift-panels.tsx` (GiftInbox · GiftCardsList · GiftTemplates) · `/order-ops/gift-cards` = redirect ไปส่วนที่ตรงกัน (ลิงก์เก่าใช้ได้)
- ตัวเลขบนปุ่มส่วน: งานเข้า = การ์ดยังไม่ทำ + สลักที่ยังไม่ส่งไปสั่งสลัก (API `view=notes&counts=1` → `engrave_todo`) · คำสั่งพิเศษ = ยังไม่ทำ · รอของ = ยังไม่แจ้ง
- ปุ่ม "มีคำสั่งสลักแล้ว →" = `?s=orders&q=<เลขออเดอร์>&open=<id>` เปิดใบนั้นเลย
- เมนูเก่า "เขียนการ์ดของขวัญ" ปิด (is_active=false · กู้คืนได้ที่ตัวจัดการแอป) · เมนู "คำสั่งพิเศษ" เปลี่ยนชื่อเป็น "คำสั่งพิเศษ & การ์ด"

## แม่แบบเป็นกลุ่ม + แก้แม่แบบในตัว + การ์ดพับ A6 (2026-11-25 · widget รอบ 2 ข้อ 1-8)

- กลุ่ม: `gift_card_templates.group_name` (+ sort_order เดิม) · เลข 1,2,3 · เลื่อนลำดับ (POST `template_order`) · เปลี่ยนชื่อกลุ่ม (`template_group_rename`) · รวมกลุ่มด้วย `groupTemplates()` ใน lib/gift-card-design (ใช้ทั้งหน้าตั้งค่าและหน้าเขียนการ์ด)
- แก้แม่แบบในตัว: `/order-ops/gift-cards/template?id=builtin:xxx` → บันทึก = ฉบับแก้ (`replaces_builtin`) ซ่อนตัวในตัว · "คืนค่าเดิม" = ลบฉบับแก้ลงถังขยะ (ย้อนกลับได้)
- ป้าย "ใส่ข้อความได้ / ข้อความตายตัว" = `acceptsMessage(doc)` (มีชิ้น role=message) · ชื่อ role message บนจอ = "ข้อความจากลูกค้า" + กรอบเส้นปะเหลือง (ScreenMarks · ไม่ติดตอนพิมพ์)
- การ์ดพับ: `CardDoc.fold` = side|top · `inside` = ด้านใน · ขนาด = กระดาษ A5 ก่อนพับ (FOLD_SHEET) · `faceDoc/withFace/foldLine/newFoldedDoc` · ตัวออกแบบ `CardDesignerAny` (สลับด้านนอก/ใน) · แม่แบบในตัว "วันเกิด พับ A6"
- พิมพ์การ์ดพับ: ด้านนอกทุกใบก่อน แล้วด้านในทุกใบ (กลับปึกกระดาษ) · ตัวเลือก "หมุนด้านใน 180°" · A4 = วางแผ่น A5 มุมบนมีเส้นตัด

## ป๊อปคำสั่งพิเศษ: กล่องตั้งค่าต่อคำสั่ง + สถานะพิมพ์ + คำสั่งจากแชท (2026-11-25 · widget ข้อ 1-5)

- "ส่งไปสั่งสลัก" (งานเข้า › สลักชื่อ) = เปิดป๊อป InstructionForm ทันที `prefill` ออเดอร์/ช่องทาง/ลูกค้า/SKU/ชื่อจากหมายเหตุ/รูปแบบ-ตำแหน่งจากรหัสท้าย · บันทึกเมื่อกด "บันทึก"
- กดชิปคำสั่ง → กล่องตั้งค่า (ทะเบียน `commandBoxOf` ใน lib/order-ops): choice = ตัวเลือก (`order_ops_options` kind `command_choice` value `<คำสั่ง>|<กลุ่ม>`) · card = ข้อความ + ลิงก์ตัวเขียนการ์ด · swap = SkuPicker กลาง · text = ช่องข้อความ · ชนิดกล่องตั้งได้ใน "จัดการคำสั่ง" (instruction_command.value) · ค่าเก็บ `order_instructions.command_details`
- สถานะพิมพ์: ใบสลัก = `print_logs` doc_type `engrave_sheet` (usePrintLog ในหน้า /print/engrave-sheets · PrintHistoryBadge ในป๊อป) · การ์ด = order_gift_cards ของออเดอร์ · API ส่ง `print_state` + ตัวกรอง `?print=printed|unprinted`
- ปุ่ม "+ คำสั่งพิเศษ" หัวหน้ารวม = ป๊อปเปล่า ติ๊ก "ลูกค้าแจ้งทางแชท" (`via_chat` + `chat_note`) · ป้าย "แจ้งทางแชท" ในตาราง
- migration 202612251100 (command_details · via_chat · chat_note · kind command_choice + unique ตามคำสั่ง)
