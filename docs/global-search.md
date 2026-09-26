# Global Search (Ctrl+K / ⌘K) — ค้นข้ามโมดูล

กล่องค้นหากลางที่เปิดได้จากทุกหน้า (ปุ่ม 🔍 ในแถบซ้าย หรือกด `Ctrl+K`)
โค้ด: `components/global-search/index.tsx` (UI) + `app/api/global-search/route.ts` (API)

## ค้นอะไรได้บ้าง (ลำดับที่โชว์)

| กลุ่ม | แหล่งข้อมูล | กรองสิทธิ์ | กดแล้วไปไหน |
|---|---|---|---|
| 📄 หน้า / เมนู | ทะเบียนเมนูกลาง `erp_menu_items` (ชื่อเมนู, หมวด, ชื่อแอป, ลิงก์, **คำค้นเพิ่ม**) | สิทธิ์ของเมนู + สิทธิ์เข้าแอป (`erp_my_permissions`; admin เห็นหมด) | เปิดหน้านั้น |
| 📖 วิธีใช้งาน | คู่มือทีละขั้น `erp_help_guides` + `erp_help_guide_steps` (ชื่อ, คำอธิบาย, หมวด, เนื้อหาขั้นตอน) | ทุกคนที่ล็อกอิน | `/master/help-guides?guide=<id>` เปิดป๊อปคู่มือให้เลย |
| 📦 สินค้า (SKU) | `skus_v2` — code, name_th, barcode (มี pg_trgm index) | `products.view` · ราคาทุนโชว์เฉพาะ `products.cost.view` | `/master/skus?open=<id>` |
| 🏢 คู่ค้า | `partners_v2` — code, ชื่อไทย/อังกฤษ, เบอร์, เลขผู้เสียภาษี | `products.view` | `/master/partners?open=<id>` (PartnerManager เปิดป๊อปให้) |
| 🧾 ใบสั่งซื้อ (PO) | `purchase_orders_v2` — po_no, ชื่อร้าน (ตัด cancelled) | `products.view` | `/purchasing/po-list?open=<id>` |
| 🧾 ใบสำคัญรับ | `purchase_vouchers_v2` — pv_no, ร้าน, เลขพัสดุ, ขนส่ง | `products.cost.view` | `/purchasing/vouchers/<id>` |
| 🏭 ใบสั่งผลิต (MO) | `manufacturing_orders` — mo_no, SKU, ชื่อสินค้า, เลขใบสั่งขาย | `products.view` | ยังไม่เสร็จ → `/master/work-board?mo=<id>` · เสร็จแล้ว → หน้ารายการ MO |
| 🧾 ใบขาย / ใบกำกับ | `erp_playground_sales_orders` — so_number, tax_invoice_no, ลูกค้า | `so.view` | `/sales-orders?open=<id>` |
| 📝 ใบเสนอราคา | `erp_playground_quotations` — quote_number, ลูกค้า | `qt.view` | `/quotations` (หน้านั้นยังไม่มีลิงก์เปิดใบตรง) |
| 📑 ใบวางบิล | `erp_playground_billing_notes` — bill_number, ลูกค้า | `so.view` | `/billing-notes?open=<id>` |
| 🚚 ใบส่งสินค้า | `erp_playground_delivery_notes` — dn_number, ลูกค้า, เลขใบขาย | `so.view` | `/delivery-notes?id=<id>` |
| ➖ ใบลดหนี้ | `erp_playground_credit_notes` — cn_number, เลขใบกำกับอ้างอิง, ลูกค้า | `cn.view` | `/credit-notes?open=<id>` |
| 🎨 งาน Creative | `erp_creative_tasks` — task_no, ชื่องาน, สินค้า | `tasks.view` | `/tasks?task=<id>` |
| 🧑‍💼 พนักงาน | `employees` — รหัส, ชื่อเล่น, ชื่อ-สกุล, เบอร์ (เฉพาะ active · ไม่ค้นเลขบัตร/บัญชี) | `app.payroll` **และ** `employees.view` | `/payroll/employees/<id>` |
| 👤 ผู้ใช้ระบบ | `user_profiles` | `admin.users` | `/admin/users?id=<id>` |
| 🖼️ ไฟล์ / คลัง | `assets` (title, file_name, keywords) | ล็อกอิน | คลังไฟล์กลาง |

ข้อมูลธุรกิจทุกชนิดใช้ **ทะเบียนแหล่งค้น `SOURCES`** ใน route เดียวกัน (1 แถว = 1 ชนิด: ตาราง/คอลัมน์/สิทธิ์/ลิงก์) — เพิ่มชนิดใหม่ = เพิ่ม 1 แถว ไม่ต้องแตะ UI
ตัวจัดอันดับ = ของกลาง `lib/search-score.ts` (tokenize → token-AND ที่ DB ดึงผู้สมัคร 40 → scoreRow: รหัสตรงเป๊ะ 1,000,000 → ขึ้นต้น → มีคำ → ชื่อ) มาตรฐานเดียวกับ picker ทั้งระบบ

กติกาการจับคู่หน้า/คู่มือ: ตัดคำค้นด้วยเว้นวรรค **ทุกคำต้องเจอ** (AND) · ไม่สนตัวพิมพ์เล็ก/ใหญ่
คะแนน (มาก = ขึ้นก่อน): ชื่อขึ้นต้นด้วยคำค้น 100 → ชื่อมีคำค้น 85 → คำค้นเพิ่มตรงเป๊ะ 80 → คำค้นเพิ่มบางส่วน 70 → หมวด/ชื่อแอป 40 → ลิงก์ 30

## "คำค้นเพิ่ม" (คำพ้อง) — ให้คนพิมพ์คำที่นึกออกแล้วเจอหน้า

ปัญหา: ชื่อเมนูกับคำที่คนนึกออกไม่ตรงกัน เช่น อยากตั้ง "ค่าส่ง" แต่เมนูชื่อ "ร้านขนส่ง / เรทค่าส่ง" หรือ "ใบสำคัญรับ (ใบซื้อ)"

วิธีแก้: ไปที่ **⚙️ Settings → จัดการเมนู** กด `⋯` ที่เมนูนั้น → ช่อง **🔍 คำค้นเพิ่ม** พิมพ์คำคั่นด้วยลูกน้ำ เช่น `ค่าส่ง, ขนส่ง, shipping` → กดบันทึก
เก็บที่คอลัมน์ `erp_menu_items.search_keywords text[]` · เมื่อเจอผ่านคำพ้อง ผลค้นจะบอกว่า `ตรงกับคำค้น "ค่าส่ง"`

## ข้อจำกัด / สิ่งที่ยังไม่ทำ

- ค้นหน้า/คู่มือเป็นแบบ "มีคำนี้อยู่ไหม" ยังไม่ใช่ pg_trgm — ตารางเล็ก (~200 เมนู, ไม่กี่คู่มือ) จึงพอ; ทะเบียนเมนูแคชในหน่วยความจำ 60 วิ (แก้เมนูแล้วอาจต้องรอ 1 นาที)
- ทุกครั้งที่พิมพ์ยิง ~13 query พร้อมกัน (เฉพาะโมดูลที่มีสิทธิ์) — ตารางใหญ่ (skus_v2, partners_v2) มี trgm index แล้ว ตารางอื่น <400 แถว · ถ้าตารางไหนโตเกินพันแถวให้เพิ่ม `gin (col gin_trgm_ops)`
- ใบเสนอราคายังเปิดใบตรงไม่ได้ (หน้า /quotations เป็นแถวกางในตาราง ไม่มี `?open=`) · MO ที่เสร็จแล้วไปหน้ารายการเฉย ๆ (บอร์ดไม่โชว์ใบเสร็จ)
- RPC เดิม `erp_global_search` (ตาราง playground) เลิกใช้แล้ว — ลบทิ้งใน DB ได้เมื่อสะดวก
- ยังไม่จำผลที่เพิ่งกด (Recent Picks) และยังไม่มีคำสั่งลัด ("เปิด PO ใหม่") → **ก้อนที่ 3**
- คู่มือมีแค่ที่คนเขียนไว้ (ตอนนี้ 5 เรื่อง เรื่องคลังไฟล์ทั้งหมด) — เพิ่มได้ที่ `/master/help-guides`
