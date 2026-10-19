# 🎯 SKU การตลาด (`/marketing/skus`)

แสดง **ทุกรุ่นสินค้า (Parent SKU ที่เปิดใช้งาน)** ให้ทีมการตลาดติดป้าย/หมายเหตุ — ไม่ต้องเลือกรุ่นเข้ารายการ (เดิมต้องเลือก · เลิกแล้ว 2026-10-09)

## ใช้ทำอะไร
- แยกแท็บตาม **แบรนด์** อัตโนมัติ (อ่านจาก `parent_skus_v2.brand_id`) · เรียงแท็บตามจำนวนรุ่นมาก→น้อย · รุ่นที่ไม่มีแบรนด์อยู่แท็บ "ไม่มีแบรนด์"
- ติด **ป้าย** ได้ 1 ป้ายต่อรุ่น เช่น 🔥 Hero / 🏷️ Clearance / 👜 Accessories — แอดมินเพิ่ม/แก้/ลบ/เรียงได้เองที่ "🏷️ ตั้งค่าป้าย"
- **หมายเหตุ** ต่อรุ่น (เช่น "ดันช่วง 11.11")
- **ป้ายเสริม (badge)** ติดได้หลายป้าย/รุ่น · โชว์เป็นชิปสีบน **มุมขวาบนของรูป** (การ์ด) / คอลัมน์ "ป้ายเสริม" (ตาราง) · กดชิป (หรือ "＋ ป้ายเสริม") → ติ๊กเลือก หรือ **พิมพ์คำใหม่แล้ว Enter = สร้าง+ติดทันที** · กรองด้วยเมนู "ป้ายเสริม: …" · ติดให้หลายรุ่นจากแถบลอยล่าง "＋ ติดป้ายเสริม" (เพิ่ม ไม่ลบของเดิม) · ตั้งต้น: ใหม่ / ขายดี / พร้อมส่ง
- **🎨 SKU ที่เหลือ** = สี/แบบ (SKU ย่อย) ที่ **เปิดในระบบ และทีมการตลาดไม่ได้ปิด** / ทั้งหมด เช่น 3/5 แบบ · กดแล้วเด้งรายการสี (โหลดตอนกด) มี **สวิตช์ เปิด/ปิด ทีละสี + ปุ่ม ✓ เปิดทั้งหมด / ✕ ปิดทั้งหมด (หัวป๊อป ค้างตอนเลื่อน) = เฉพาะการตลาด** (ตาราง `marketing_sku_variant_off` — ไม่แตะ `skus_v2.is_active` สียังขาย/สั่งซื้อ/ผลิตได้) · สีที่ปิดที่หน้า SKU = 🔒 ล็อก · สีปุ่ม: ครบ=เทา บางส่วน=เหลือง ไม่เหลือ=แดง · ⚠️ ไม่ใช่จำนวนชิ้นในคลัง
- **3 มุมมอง ☰ ตาราง / ▦ การ์ด / 🛠 ทำงาน** (ดูหัวข้อ "โหมดทำงาน" ด้านล่าง) — สลับแล้วจำเป็นค่าเริ่มต้นรายคน (`useViewPref` key `marketing_skus_view`) · การ์ดเลือกจำนวนต่อแถว 3-8 (`useGalleryColumns` · มือถือ 2 ใบ)
- **ค้นหา · เรียง · แบ่งหน้า ใช้ร่วมทั้ง 2 มุมมอง** — เรียง: ตามป้าย (จัดกลุ่มตามป้าย) / รหัส A→Z / SKU ที่เหลือน้อยก่อน / แก้ล่าสุด · หน้าละ 50/100/200 รุ่น (ของกลาง `Pager`)

## แก้ / ล้าง อยู่ตรงไหน
| ทำอะไร | ตรงไหน |
|---|---|
| ติด/เปลี่ยนป้าย | ช่องเลือกในคอลัมน์ "ป้าย" (หรือบนการ์ด) |
| เปลี่ยนป้ายหลายรุ่น | ติ๊กแถว/การ์ด (หรือหัวกลุ่ม) → แถบสีฟ้า "เปลี่ยนป้ายเป็น" · มีลิงก์ "เลือกทั้งหมด N รุ่นที่กรองอยู่" · ≥20 รุ่น = ถามยืนยัน · ≥200 รุ่น = ต้องพิมพ์ CONFIRM |
| ล้างป้าย | เลือก "— ไม่มีป้าย —" |
| หมายเหตุ | คลิกช่องหมายเหตุ → ป๊อปแก้ (ลบข้อความทั้งหมด = ลบหมายเหตุ) |
| ป้าย | "🏷️ ตั้งค่าป้าย" (2 แท็บ: ป้ายหลัก / ป้ายเสริม): เพิ่ม · แก้ชื่อ/ไอคอน/สี/คำอธิบาย แล้วกด "บันทึก" ต่อแถว · ลาก ⋮⋮ เรียงลำดับ · 🗑 ลบ (รุ่นที่ติดป้ายนั้นกลายเป็น "ยังไม่มีป้าย") |
| รุ่นที่ไม่อยากเห็น | ปิดใช้งาน Parent SKU ที่หน้าสินค้า (หน้านี้แสดงเฉพาะรุ่นที่เปิดใช้งาน) |

## ข้อมูล
- view `marketing_sku_overview` (security_invoker, ปิดสิทธิ์ anon/authenticated) = `parent_skus_v2` (is_active) + `marketing_skus` + จำนวน SKU ย่อย (index `idx_skus_v2_parent_active` → นับ ~3 ms)
- `marketing_sku_labels` — ป้าย (name unique ไม่สนตัวพิมพ์, icon, color hex, description, sort_order)
- `marketing_skus` — ค่าการตลาดต่อรุ่น (`parent_sku_id` unique) + `label_id` (ลบป้าย → null) + `note` · สร้างแถวเมื่อติดป้าย/หมายเหตุครั้งแรก (upsert)
- `marketing_sku_labels.kind` = `status` (ป้ายหลัก) / `badge` (ป้ายเสริม) · ชื่อห้ามซ้ำในชนิดเดียวกัน
- `marketing_sku_badge_map` (parent_sku_id, badge_id) — ป้ายเสริมของรุ่น · view คืน `badge_ids`
- `marketing_sku_variant_off` — สีที่ทีมการตลาดปิด (มีแถว = ปิด · เปิด = ลบแถว)
- migration: `202610091200_marketing_skus.sql`, `202610091400_marketing_sku_overview.sql`, `202610091600_marketing_variant_off.sql`, `202610091800_marketing_sku_badges.sql`

## API
- `GET /api/marketing/skus` — ทุกรุ่น (ไล่ดึงทีละ 1,000) + ป้าย + แบรนด์
- `PATCH /api/marketing/skus` `{ parent_sku_ids, label_id?, note? }` — upsert (ครั้งละ ≤500 รุ่น · หน้าเว็บแบ่งส่งให้เอง)
- `GET /api/marketing/skus/variants?parent_id=` — สี/แบบของรุ่น (ตอนกดดู) · `PATCH {sku_id, open}` สีเดียว / `PATCH {parent_id, open, all:true}` ทุกสีของรุ่น (ข้ามสีที่ปิดในระบบ) — เปิด/ปิดเฉพาะการตลาด (สิทธิ์ marketing.sku.manage · audit `marketing.variant.open|close`)
- `PUT /api/marketing/skus/badges` `{ parent_sku_ids, badge_ids, mode: set|add|remove }` — ป้ายเสริม (สิทธิ์ marketing.sku.manage · audit `marketing.badge.*`)
- `GET/POST/PATCH/DELETE /api/marketing/sku-labels` — ป้าย (`?kind=`/`kind` ใน body · PATCH `{order:[ids]}` = เรียงลำดับ) · **สร้างป้ายเสริม = marketing.sku.manage** (ทีมพิมพ์คำใหม่เองได้) · สร้างป้ายหลัก/แก้/ลบ = marketing.label.manage
- ตัวช่วย pure: `lib/marketing/sku-list.ts` (type + `cleanIds`/`cleanColor`/`countBy`/`sortMarketingSkus`)

## สิทธิ์ + ประวัติ
| สิทธิ์ | ใคร (ค่าเริ่มต้น) | ทำอะไรได้ |
|---|---|---|
| `marketing.sku.view` | admin / manager / staff | เปิดดูหน้า |
| `marketing.sku.manage` | admin / manager / staff | ติดป้าย/หมายเหตุ |
| `marketing.label.manage` | admin / manager | ตั้งค่าป้าย |

ทุกการเปลี่ยนแปลงลง `audit_logs` (`marketing.sku.update`, `marketing.label.create|update|reorder|delete`) พร้อมค่าก่อนแก้

## ของกลางที่ใช้ / ที่ปรับ
- MiniTable (จัดกลุ่มตามป้าย/ติ๊กหลายแถว) — **เพิ่ม prop `groupOrder`** · Pager · Popover · SearchableSelect · ColorInput · useDragReorder · HoverImage · ERPModal · ConfirmDialog (requireTyped) · Toast · useViewPref · GalleryColumns
- ParentSkuMultiPickerModal — **เพิ่ม prop `brandId`** (+ `/api/pickers/parent-skus?brand_id=` / `none`) — ทำไว้ตอนยังมีขั้นเลือกรุ่น ยังใช้ได้กับหน้าอื่น

## 🛠 โหมดทำงาน (มุมมองที่ 3 — ก้อนแรก 2026-10-18)
จัด "งาน" เป็นชุด แล้วติ๊กว่าแต่ละรุ่นทำถึงไหน เช่น **Clearance** (ใส่ส่วนลด ฿/% + ทำรูป/แก้ Lazada/แก้ Shopee) · **ลงเว็บไซต์** (ถ่ายรูป/เขียนรายละเอียด/ขึ้นเว็บ) · **งานอื่น ๆ** (ตั้งขั้นตอนเอง)

| ทำอะไร | ตรงไหน |
|---|---|
| สร้างงาน | ปุ่ม "🛠 ทำงาน" → "＋ สร้างงาน" · หรือติ๊กรุ่นในโหมดตาราง/การ์ด → แถบลอย "🛠 ใส่ในงาน…" → "＋ สร้างงานใหม่จากที่เลือก" (สร้างเสร็จพาไปที่งานนั้น) |
| ใส่รุ่นเข้างาน | แถบลอย "🛠 ใส่ในงาน…" เลือกงาน · หรือในงานกด "＋ เพิ่มรุ่น" → ป๊อปการ์ดแบบหน้านี้ (แยกแบรนด์ · กรองป้าย · ติ๊กหลายรุ่น · รุ่นที่อยู่ในงานแล้วติ๊กซ้ำไม่ได้) |
| ติ๊กขั้นตอน | กดชิปขั้นตอนในแถว (ชี้ดูว่าใครติ๊ก/เมื่อไหร่) · ติ๊กหลายรุ่นพร้อมกัน: ติ๊กแถว → แถบลอย "✓ ติ๊กขั้นตอน…" / "↺ เอาติ๊กออก…" |
| ส่วนลด (งาน Clearance) | ช่อง "ลด" + ปุ่ม ฿/% → ราคาใหม่คำนวณให้ · ลดเกิน 100% / เกินราคาเต็ม = ไม่ให้บันทึก |
| ราคาเต็ม | ดึงจากราคาขาย (`skus_v2.list_price`) ของสีที่ยังเปิด **ตอนใส่เข้างาน** · สีราคาไม่เท่ากัน = โชว์เป็นช่วง (990–1,290) และราคาใหม่เป็นช่วง · ไม่มีราคา = ช่องให้กรอก · กดที่ตัวเลขเพื่อแก้ |
| แก้งาน (ชื่อ/ขั้นตอน/ผู้รับผิดชอบ/วันครบกำหนด/ป้ายอัตโนมัติ) | "✏️ แก้ไขงาน" · ลบขั้นตอน = ที่ติ๊กไว้ในขั้นนั้นไม่นับ (มีเตือน) |
| ปิดงาน / เก็บ / ลบ | ปุ่มบนหัวงาน · เก็บแล้วดูได้ที่ "แสดงงานที่เก็บแล้ว" · ลบ = ถามยืนยัน (≥20 รุ่นต้องพิมพ์ CONFIRM) |
| เอารุ่นออกจากงาน | ✕ ท้ายแถว หรือ ติ๊กหลายแถว → "เอาออกจากงาน" |

**กฎที่เจ้าของเลือก (2026-10-18):**
1. ราคาใหม่ **เก็บในงานเท่านั้น ไม่แก้ราคาใน ERP** — ทีมไปแก้ใน Lazada/Shopee แล้วติ๊กขั้นตอน
2. ใส่รุ่นเข้างาน → **ติดป้ายหลักอัตโนมัติ** (งาน Clearance ตั้งต้น = "Clearance Products" · เปลี่ยน/ไม่ติดได้ในป๊อปงาน) · แทนป้ายเดิม มีประวัติ · เอารุ่นออกจากงาน ป้ายไม่เปลี่ยนกลับ
3. **ผู้รับผิดชอบ + วันครบกำหนด ระดับงาน** (ผู้รับผิดชอบหลายคน/ทั้งทีมได้ ตั้งแต่ 2026-10-18 — `marketing_work_jobs.assignees` jsonb [{id,name}] · assignee_id/assignee_name = คนแรก · 1 วันครบกำหนด) · เลยกำหนด = ตัวแดง + จุดแดงที่ชิปงาน

**ข้อมูล:** `marketing_work_jobs` (ชื่อ, kind clearance|website|custom, `steps` jsonb `[{key,label}]`, auto_label_id, assignee, due_date, status open|done|archived) · `marketing_work_job_items` (job × parent_sku unique, base_price_min/max, discount_value/unit baht|percent, `step_done` jsonb `{key:{at,by}}`) · RLS เปิดไม่มี policy (ผ่าน API เท่านั้น) · migration `202610230200_marketing_work_jobs.sql`
- คีย์ขั้นตอน (s1, s2…) ไม่เปลี่ยนตอนแก้ชื่อ/ย้ายลำดับ → ที่ติ๊กไว้ไม่หาย
- แบบงาน (ขั้นตอนตั้งต้น) ตอนนี้อยู่ในโค้ด `JOB_KINDS` — ก้อนถัดไปทำหน้าตั้งค่าแบบงานเอง

**API:** `GET/POST /api/marketing/work-jobs` · `GET/PATCH/DELETE /api/marketing/work-jobs/[id]` · `POST/PATCH/DELETE /api/marketing/work-jobs/[id]/items` (PATCH `{item_ids, step_key, done}` = ติ๊ก · `{item_id, discount_value?, discount_unit?, base_price_min?, base_price_max?}` = ราคา) · ดู = marketing.sku.view · แก้ทุกอย่าง = marketing.sku.manage · audit `marketing.work.create|update|delete|items_add|items_remove|item_update|step` (+ `marketing.sku.update` ตอนติดป้ายอัตโนมัติ พร้อม `via: งาน "…"`)

**โค้ด:** `app/marketing/skus/{work-mode,work-job-modal}.tsx` · กฎคำนวณ pure `lib/marketing/work-jobs.ts` (เทสต์ `lib/__tests__/marketing-work-jobs.test.ts`) · ฝั่งเซิร์ฟเวอร์ `lib/marketing/work-jobs-db.ts` · ของกลางที่ใช้: MiniTable · BulkActionBar · ERPModal/ConfirmDialog · MultiUserPicker · DateInput · MoneyInput · SearchableSelect · HoverImage · **MarketingSkuPickerModal** (`components/marketing-sku-picker-modal.tsx` — ป๊อปเลือกรุ่นแบบการ์ด ใช้ร่วมกับ ➕ เพิ่มสินค้าเข้าเว็บ)

### 🛠 โหมดทำงาน รอบ 2 (2026-10-18)
- มุมมอง ☰ ตาราง / ▦ การ์ด (จำรายคน `marketing_work_items_view`) · ค้นหาใช้ร่วมกัน · การ์ด: เรียงลำดับเดิม/รหัส/คืบหน้า · การ์ดต่อแถว (GalleryColumns) · หน้าละ 60
- กดรุ่น (แถว/รูป/รหัส) = เปิด drawer สินค้าตัวจริง (MasterRecordDrawer · ◀ ▶ ตามรายการที่เห็น) · ปุ่ม 🛍 = drawer ตั้งค่าเว็บไซต์ทุกร้าน (ของกลาง `components/parent-web-drawer.tsx` ห่อ ParentWebListings)
- ⊘ ขั้นตอนที่ "ไม่ต้องทำ" รายรุ่น: `marketing_work_job_items.step_skip` jsonb {key:{at,by}} (migration 202610230400) · ชิปเส้นประขีดฆ่า กดเพื่อกลับมาต้องทำ · ไม่นับในความคืบหน้า (itemProgress/jobProgress รับ skip · ข้ามทุกขั้น = เสร็จ) · ตั้งไม่ต้องทำ = เอาติ๊กขั้นนั้นออก · API PATCH items {item_ids, step_key, skip} + audit `marketing.work.skip` · แถบล่าง ⊘ ไม่ต้องทำ… / ↺ กลับมาต้องทำ…

### 📋 งานชุดรุ่น ↔ Task Manager (2026-10-19)
- เจ้าของขอ "อยากให้เพิ่มงานนี้ที่ Task Manager ได้ด้วย" → เลือก **ทั้งสองอย่าง**:
  - หัวงานในโหมดทำงาน: **📋 ส่งเข้า Task Manager** → สร้างงาน Creative 1 ใบ (ชื่อ/ผู้รับผิดชอบ/กำหนดส่ง/แบรนด์หลัก/ลิงก์กลับ) ผูกด้วย `marketing_work_jobs.creative_task_id` (migration 202610230500 · on delete set null) · ผูกแล้วปุ่มกลายเป็นลิงก์ `CT-… ↗`
  - หน้า Task Manager: ปุ่ม **🛠 งานชุดรุ่น** (สิทธิ์ marketing.sku.manage + tasks.create) → ป๊อปเดียวกับหน้านี้ (WorkJobModal) → ส่งเข้า Task Manager ให้เลย → เปิดการ์ด
- ซิงก์ฝั่งเซิร์ฟเวอร์ `syncLinkedTask` (lib/marketing/work-jobs-db): หลังติ๊ก/ไม่ต้องทำ/ใส่รุ่น/เอาออก/ปิด-เปิดงาน → `progress_percent` ของการ์ด = % งานชุดรุ่น · ปิดงาน = สถานะ done · เปิดใหม่ = in_progress · เริ่มติ๊ก (การ์ดยังรอคิว/พร้อมทำ) = in_progress (+ audit)
- drawer งานใน Task Manager: กล่อง 🛠 (app/tasks/work-job-link-box.tsx · GET /api/creative-tasks/[id]/work-job สิทธิ์ tasks.view) ความคืบหน้า + ปุ่มเปิดงานรุ่น (`/marketing/skus?job=<id>` → เปิดโหมดทำงานที่งานนั้น)
- API: POST/DELETE `/api/marketing/work-jobs/[id]/task` (ส่งเข้า / เลิกผูก — เลิกผูกยังไม่มีปุ่ม)

## ยังไม่ทำ
- โหมดทำงาน ก้อนถัดไป: หน้าตั้งค่า "แบบงาน" (ขั้นตอนตั้งต้นแก้เองได้) · ผู้รับผิดชอบรายขั้นตอน · แจ้งเตือนใกล้ครบกำหนด
- ยอดขาย/ออเดอร์ 7·30 วัน ต่อรุ่น (ต้องผูกรหัส Shopee ↔ SKU ก่อน — ตอนนี้ผูกแล้ว 0)
- Dashboard แยกแบรนด์ (จับคู่ร้าน ↔ แบรนด์)
