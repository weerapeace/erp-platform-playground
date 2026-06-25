# แผนละเอียด — Dashboard ผลิต (Production Dashboard)

> หน้าแรกของแอป "ผลิต/จ่ายงาน" · รวมงานผลิตทุกสถานะไว้ดูที่เดียว · กรองซ้าย + สลับดู การ์ด/ตาราง/ปฏิทิน + ค้นหา/จัดกลุ่ม
> สถานะ: **เฟส 1+2 เสร็จ + deploy** (API + หน้า + เมนู + landing + จัดกลุ่ม + ปฏิทิน) — เหลือเฟส 3 ขัดเงา
>
> **ตัดสินแล้ว:** (1) "งานเสร็จรอส่ง" = **ส่งงานคืนแล้ว** (`wo_submissions`) · (2) **1 แถว = 1 ใบสั่งผลิต (MO-centric)** · (3) หน้าแรกแอปผลิต/จ่ายงาน

---

## 1. เป้าหมาย (ภาษาคน)
หน้าจอเดียวที่หัวหน้าฝ่ายผลิตเปิดแล้วเห็นภาพรวมทั้งหมด: งานไหนยังไม่จ่าย, งานไหนกำลังทำ, งานเหมา, งานเสร็จรอส่ง — แล้วเจาะดู/ค้นหา/จัดกลุ่ม/ดูปฏิทินกำหนดส่งได้

## 2. ตำแหน่ง + การตั้งเป็นหน้าแรก
- ไฟล์หน้า: `app/master/production-dashboard/page.tsx`
- ตั้งเป็น **landing ของแอปผลิต/จ่ายงาน**: แก้ `erp_app_groups.default_href` ของแอปนั้น → `/master/production-dashboard`
  (เดิมแอปจ่ายงาน landing = `/master/work-board` — ดู memory `menu_app_structure`, `purchasing_dashboard`)
- เพิ่มเมนู `erp_menu_items` ให้โผล่ + การ์ด/ปุ่มในหน้า dashboard ลิงก์ไป **บอร์ดจ่ายงาน** และหน้าผลิตอื่น ๆ
- ระวัง sessionStorage `appdeep:` override หน้าล่าสุด (ดู memory `purchasing_dashboard`)

## 3. แถบ filter ซ้าย — นิยาม + แหล่งข้อมูล (ของเดิมมีครบ)
| Filter | นิยาม | แหล่งข้อมูล |
|---|---|---|
| งานทั้งหมด | ใบสั่งผลิต active ทั้งหมด | `manufacturing_orders` (is_active, status ≠ cancelled) |
| งานยังไม่จ่าย | เหลือจ่าย > 0 | work-board `pending` (qty − dispatched) |
| งานกำลังผลิต | มีใบจ่ายงาน active ยังไม่เสร็จ | `mo_work_orders` status dispatched/partial_return |
| งานเหมารายชิ้น | มีงานเหมาจ่ายรายชิ้น | `mo_piecework` (is_active) |
| งานเสร็จรอส่ง | ส่งงานคืน/ผ่าน QC รอส่งออก | `wo_submissions` / `qc-warehouse` (ยืนยันนิยามเฟส 1) |

**หน่วยข้อมูล (decision):** เริ่มแบบ **MO-centric** (1 แถว = 1 ใบสั่งผลิต) มี flag/ความคืบหน้าในตัว → ภาพรวมอ่านง่าย · คลิกเจาะดูระดับใบจ่ายงาน/ช่างทีหลัง (เฟส 4) · *ยืนยันกับเจ้าของช่วงเฟส 1*

## 4. API รวมข้อมูล — `/api/mo/production-dashboard`
GET → `{ counts, jobs }`
- `counts`: `{ all, unassigned, in_production, piecework, done_waiting }` (ตัวเลขบนปุ่ม filter)
- `jobs[]` (MO-centric, ฟิลด์รวม):
  ```
  id, mo_no, product_sku, product_name, image_url, brand, brand_color,
  qty, dispatched, remaining, due_date, status,
  categories: string[]        // MO เดียวอยู่ได้หลายกลุ่ม (จ่ายบางส่วน + ทำบางส่วน)
  ready, prep_done, cut_done,  // ความพร้อม
  progress: { dispatched, made, done },   // ความคืบหน้า
  piecework?: { total_qty, rate, status },
  labor_value?: number,        // มูลค่าค่าแรงรวม (เฟส 4)
  ```
- ใช้ logic เดียวกับ `/api/mo/work-board` (reuse query/นับ dispatched/piecework) — **ยิงครั้งเดียว** (ตาม memory `perf_and_central_default`, `perf_contention_load_order`)
- guardApi(products.view) + supabaseAdmin (ของกลาง)

## 5. โหมดดู (3 แบบ) — ใช้ของกลางสูงสุด
- **ตาราง + การ์ด** = **DataTable กลาง** มีปุ่มสลับในตัวอยู่แล้ว (`cardConfig` + `defaultViewMode`) → ได้ทั้งคู่ฟรี
  - คอลัมน์: รูป(HoverImage) · SKU · ชื่อ · จำนวน · ความคืบหน้า/เหลือ · กำหนดส่ง · สถานะ(badge lib/status-config) · (+เฉพาะกลุ่ม: โต๊ะ/ช่าง, เรตเหมา)
  - search/sort/filter/group/export = มีในตัว DataTable
- **ค้นหา + ☑️ จัดกลุ่ม** = ของ DataTable/MiniTable (group by แบรนด์/Parent SKU/สถานะ)
- **ปฏิทิน** = **ของใหม่ (เบา ๆ ไม่ใช้ไลบรารีหนัก)** — กริดเดือน, วางงานตาม `due_date`, สีตามสถานะ, คลิกวัน → รายการงานวันนั้น, ปุ่มเดือนก่อน/ถัดไป

## 6. โครงหน้า (layout)
```
┌───────────────────────────────────────────────┐
│ 📊 Dashboard ผลิต           [ตาราง|การ์ด|ปฏิทิน] │
├──────────┬────────────────────────────────────┤
│ filter   │  🔍 ค้นหา…        ☑️ จัดกลุ่ม          │
│ ทั้งหมด N │                                     │
│ ยังไม่จ่าย N│   ← DataTable (ตาราง/การ์ด)          │
│ กำลังผลิต N│      หรือ ปฏิทิน ตามโหมด             │
│ เหมา N    │                                     │
│ เสร็จรอส่ง N│                                    │
└──────────┴────────────────────────────────────┘
```
- มือถือ/แท็บเล็ต: filter เป็นแถบ chip บนแทน sidebar (responsive)

## 7. แผนเป็นเฟส (ทำทีละส่วน เห็นผลเร็ว)
**เฟส 1 — โครง + ตาราง + การ์ด + filter** ⭐ (ได้ของใช้จริง)
- API `/api/mo/production-dashboard` (counts + jobs)
- หน้า + แถบ filter ซ้าย (5 ปุ่ม + ตัวเลขนับ live)
- DataTable (เปิด cardConfig → ได้ทั้งตาราง+การ์ด) + search + group
- ตั้งเป็น landing แอป (default_href) + เมนู
- *ยืนยันนิยาม "เสร็จรอส่ง" + MO-centric*

**เฟส 2 — ปฏิทิน**
- ปฏิทินเดือน (custom เบา) · งานตามกำหนดส่ง · คลิกวันดูงาน · สีตามสถานะ · เลยกำหนด=แดง

**เฟส 3 — ขัดเงา**
- คลิกงาน → ป๊อปอัปรายละเอียด (reuse RelationPeek/checklist) หรือลิงก์ไปบอร์ดจ่ายงาน
- สรุปต่อ filter (จำนวนงาน/มูลค่าค่าแรง/เลยกำหนด) เป็นการ์ดเลขด้านบน
- ไฮไลต์งานเลยกำหนดส่ง / ใกล้ครบกำหนด

## 8. ของกลางที่ใช้ (ไม่สร้างซ้ำ)
DataTable (ตาราง+การ์ด+search+group+export) · lib/status-config (badge สถานะ) · HoverImage (รูป) · guardApi · supabaseAdmin · PlaygroundShell · (ปฏิทิน = ใหม่ตัวเดียว)

## 9. ความเร็ว (กฎถาวร perf_and_central_default)
- API ยิงครั้งเดียว (รวมทุกอย่าง) · รูปย่อผ่าน `/api/r2-image?w=` · content โหลดก่อน เลื่อนของรอง · แคชเมนู/แอป (shell-cache)

## 10. จุดที่ตัดสินแล้ว / ที่เหลือ
1. ✅ "งานเสร็จรอส่ง" = **ส่งงานคืนแล้ว** (`wo_submissions`) — งานที่ช่างส่งคืนผ่านบอร์ด รอ QC/ส่งออก
2. ✅ **MO-centric** (1 แถว = 1 ใบสั่งผลิต) มีความคืบหน้าในตัว · คลิกเจาะดูระดับโต๊ะ/ช่าง (เฟส 3)
3. ⬜ คอลัมน์/ฟิลด์เด่นบนการ์ด — ตัดสินตอนทำเฟส 1 (default: รูป · SKU · แบรนด์ · ความคืบหน้า · กำหนดส่ง · สถานะ)
