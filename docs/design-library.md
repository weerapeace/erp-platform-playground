# 📚 Design Library (คลังแม่แบบกระเป๋า)

## ใช้ทำอะไร
ทีมเลือก **แม่แบบกระเป๋า** → ปรับเป็น **สูตร** (กดจุดบนรูป → เลือกวัสดุ/สี/อะไหล่/โลโก้ · วาดช่อง · ใส่ขนาด) →
ออก **ใบสรุป PDF** (เส้นชี้จากจุดไปรูปชิ้นส่วน + ตารางสรุป + ช่อง + prompt) → เอาไปให้ GPT สร้างรูป →
**อัปรูปที่ได้กลับมา** เก็บเป็นเวอร์ชัน แยกตามชุดมุม พร้อมชื่อคนอัป

เจ้าของสั่ง 2026-11-13 (ดู widget 3 รอบ) · หน้า `/master/design-library` (เมนู แอปออกแบบ → 🎨 ออกแบบสินค้า)

## ต่างจากของที่คล้ายกัน
| ของ | งาน |
|---|---|
| ตัวประกอบสินค้า (`configurator_*`) | ให้ **ลูกค้าเว็บร้าน** ออกแบบเอง ประกอบรูปจากรูปถ่ายพื้นใสหลายชั้น ผูกกับร้าน |
| ใบงานออกแบบ (`design_sheets`) | งานจริงที่เดินสถานะ ตีราคา ผลิต — ถูกอ่านจากรายงาน/อีเมล/MO |
| **Design Library** | ไอเดีย/สูตรภายในทีม → ใบสรุป + prompt ให้ GPT · แยกตารางโดยตั้งใจ ไม่ปนกับใบงาน |

## แนวคิด / ตาราง
| คำ | ตาราง | หมายเหตุ |
|---|---|---|
| แม่แบบ | `design_library_templates` | รูปจริง + รูปลายเส้น (สลับดู) + ขนาดตั้งต้น |
| สูตร | `design_library_recipes` | `spec` jsonb: `size` · `hw_color` · `pins[]` · `pockets{front,back,inside_front,inside_back}` |
| ตัวเลือก | `design_library_choices` | หมวด · สีอะไหล่ · สีด้าย · แบบช่อง · กฎห้ามคู่ — **ทีมเพิ่ม/แก้/ลบเองได้** (ปุ่ม ⚙️ ตัวเลือก) |
| รูปจาก GPT | `design_library_renders` | ชุดมุม `grid4` / `inside` / `model` / `other` · `version` +1 ทุกครั้ง · `created_by_name` |

### จุด (pin) + แหล่งของแต่ละหมวด
พิกัดจุด = % ของรูป · แต่ละจุดเลือก 1 หมวด → หมวดบอก "เลือกจากไหน" (`config.source`):
- `swatch` แผงผ้า — ของกลาง `SwatchBrowser` โหมด `onPickSpot` (ได้รูปแผง + กรอบชิ้น → ใบสรุปตัดรูปชิ้นด้วย viewBox)
- `sku` SKU — `SkuPicker` · หมวดที่ติ๊ก `config.hw` = ใช้ **สีอะไหล่ทั้งใบ** (เลือกครั้งเดียว)
- `color` รหัสสี — จากรายการ `thread_color` (หรือ `config.color_list`)
- `logo` อัปโหลด หรือเลือกจากคลังรูป (`AssetPicker`)
- `sku_text` SKU หรือเขียนเอง
ของที่เลือกเก็บ **สำเนา** รหัส/ชื่อ/รูป ณ ตอนเลือก (เปิดย้อนหลังได้แม้แผง/SKU ถูกแก้) · สต็อกดึงสดทุกครั้ง

### ช่อง
4 ฝั่ง: ด้านนอกหน้า · ด้านนอกหลัง · **ข้างในฝั่งหน้า · ข้างในฝั่งหลัง** · ฝั่งละได้หลายกล่อง (สูงสุด 12) · หน่วย ซม. · แต่ละกล่องมีแบบช่อง + รายละเอียด (เข้า prompt)

### Prompt (3 ชุด)
1. **4 มุมรวมรูปเดียว** (ตาราง 2×2: หน้า · หลัง · ข้าง · เอียง)  2. **ข้างใน**  3. **คนสะพาย**
อ้างเลขจุด `[ref N]` ตรงกับเลขบนใบสรุป → แนบใบสรุปไปกับ prompt

### คำเตือน (ไม่บล็อก)
- กฎห้ามคู่: `config = { a: "zip:ZP-5G", b: "hw_color:silver", reason }` — สูตรมีทั้ง a และ b = เตือน
- วัสดุหมด (≤ 0) / เหลือน้อย (< 10) จากสต็อกจริง (`lib/sku-stock`)

## ไฟล์
- กฎกลาง (pure + เทสต์): `lib/design-library.ts` · `lib/design-library.test.ts` (cleanSpec · ruleHits · stockHits · buildPrompts · buildBriefHtml · pocketPanelSvg)
- API: `app/api/design-library/[resource]` (templates/recipes/choices/renders ผ่าน `lib/crud-resource-api`) · `actions` (new_recipe / save_recipe / add_render) · `bundle` (overview / template_id / recipe_id / stock_ids)
- หน้า: `components/design-library/*` (library · template-form · choices-manager · recipe-editor · pick-panel · pocket-editor) · route `app/master/design-library/**`
- ใบสรุป: `app/print/design-library/[id]` (PrintToolbar / PrintFrame กลาง · `?mode=vector`)
- migration `supabase/migrations/202612150100_design_library.sql` (4 ตาราง · ตัวเลือกตั้งต้น · สิทธิ์ · เมนู · ทะเบียนโมดูล)

## สิทธิ์ / ประวัติ
- `design_library.view` ดู (admin/manager/staff) · `.edit` สร้าง/แก้สูตร + อัปรูป (admin/manager/staff) · `.manage` แม่แบบ + ตัวเลือก (admin/manager) — ให้ทีมออกแบบเพิ่มรายคนได้ที่หน้าสิทธิ์
- ตาราง RLS เปิด ไม่มี policy = เข้าได้ผ่าน API เท่านั้น · ทุกการเขียนลง `audit_logs`

## รอบ 4 (2026-11-14)
- **ประเภทกระเป๋า** = รายการ `bag_type` ใน ⚙️ ตัวเลือก (รหัส = ตัวนำหน้า เช่น HANB · ชื่ออังกฤษใช้ใน prompt) · แม่แบบเก็บรหัสประเภทใน `category`
  ฟอร์มแม่แบบ: เลือกประเภท → รหัสขึ้นเอง `nextTemplateCode` (HANB-001…) แก้ได้ (ซ้ำ = ไม่ให้บันทึก) · ชื่อเติมคำนำให้ · แม่แบบเก่าที่พิมพ์ทรงเองยังใช้ได้
- **หูกระเป๋า** `spec.handle` = ความสูงหู · กว้าง · ระยะห่าง · จำนวน (0–2) · ความยาวรวม (0 = ประมาณจากครึ่งวงรี + เย็บติด 4 ซม.×2 `handleLength`)
- **ซม./นิ้ว**: ปุ่มสลับจำต่อคน (`useViewPref` "design_library_unit") · เก็บเป็น ซม. เสมอ (`lib/length-units`) · ใบสรุป + prompt โชว์ 2 หน่วย `bothUnits`
- **รูปลายเส้น** ย้ายออกจากฟอร์มแม่แบบ → prompt ชุดที่ 4 "ลายเส้น" → อัปที่ช่องรูป "ลายเส้น" (`view_key = line`) → ปุ่ม "ตั้งเป็นรูป Vector ของแม่แบบ" (`actions set_template_vector` · design_library.manage)
- **3D** 2 ทาง: prompt ชุดที่ 5 (เว็บแปลงรูปเป็น 3D — ดูทรง ขนาดไม่แม่น) · ปุ่ม **ส่งเข้าสตูดิโอแพทเทิร์น** = สร้างแพทเทิร์นใหม่ `template.dl_draft = { params: toStudioParams(spec), notice, recipe_id }`
  → สตูดิโอเปิดตัวสร้างจากแม่แบบพร้อมค่านี้ตอนยังไม่มีชิ้น (`PatternStudio startDraft` · `dlDraftOf`) · ส่งช่องด้านหน้าได้ช่องแรกช่องเดียว · ต้องมีสิทธิ์ pattern_studio.edit
- **ช่องรูปกลาง MediaUploadField** วาง Ctrl+V ได้แล้ว (ทั้งระบบ) · ฟอร์มแม่แบบใช้ช่องนี้
- migration `202612150200_design_library_bag_types.sql` (ขยาย list_key/view_key + ประเภทตั้งต้น 5 ตัว)

## ยังไม่ทำ (รอบถัดไป)
- ราคาทุนประมาณสด · เทียบ 2 สูตรข้างกัน · ปุ่มส่งเป็นใบงานออกแบบ
- ปุ่มสร้างรูปในระบบเลย (เสียค่า API ต่อรูป — ต้องลง `lib/paid-services` ก่อน)
