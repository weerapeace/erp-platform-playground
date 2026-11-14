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

## รอบ 5 ช่วง 1 (2026-11-14) — ชุดสี + เทียบ 2 สูตร
- **ชุดสี** เก็บใน `spec.colorways` = `[{ id, name, hw_color, picks: { [pinId]: Pick } }]` · "สีหลัก" = ของในจุดของสูตรเอง · ชุดสีอื่นเก็บเฉพาะจุดที่ต่าง (ไม่มีใน picks = เหมือนสีหลัก) · สูงสุด 8 ชุด
  กฎ: `applyColorway` (สูตรตามชุดสี → ใช้กับ prompt/ใบสรุป/สต็อกได้เลย) · `setColorwayPick` · `cleanColorways` (ตัดจุดที่ลบแล้ว) · `allSkuIds` (สต็อกทุกชุดสี)
  หน้าสูตร: `components/design-library/colorways.tsx` ColorwayBar (สลับ/เพิ่ม/ตั้งชื่อ/ลบ) + ColorwayTable (แถว = จุด · คอลัมน์ = ชุดสี · กดช่อง = แก้จุดนั้นในชุดสีนั้น)
  ตอนอยู่ชุดสีอื่น: เลือกของ = ของชุดสีนั้น · ย้ายจุด/หมวด/โน้ต = ทุกชุดสี
- **รูป GPT แยกชุดสี**: `design_library_renders.colorway_id` (null = สีหลัก) · เลขเวอร์ชันนับต่อ ชุดมุม+ชุดสี · ลบชุดสี = รูปของชุดสีนั้นไม่โชว์ (ไม่ลบไฟล์)
- **ใบสรุป** `/print/design-library/[id]?cw=<id>` → ใบของชุดสีนั้น + ตารางชุดสีทุกสี (`colorwayTableHtml`) · ปุ่มสลับชุดสีบนหน้าพิมพ์
- **เทียบ 2 สูตร** `/master/design-library/compare?a=&b=&ca=&cb=` (`components/design-library/compare.tsx` · กฎ `compareRecipes`) — ข้ามแม่แบบได้ · วัสดุจับคู่ตามหมวด · ไฮไลต์บรรทัดที่ต่าง · ทางเข้า: ปุ่ม "เทียบสูตร" หน้าคลัง/หน้าสูตร · "เทียบ" บนการ์ดสูตร
- migration `202612160100_design_library_colorways.sql` (+ `design_library_recipes.design_sheet_id` เตรียมไว้ให้ช่วง 3 ส่งเป็นใบงานออกแบบ)

## รอบ 5 ช่วง 2 (2026-11-14) — ทุนประมาณ + ใบสั่งทำตัวอย่าง
- **ทุนประมาณ** `lib/design-library-cost.ts` (pure + เทสต์) · แผง `components/design-library/cost-panel.tsx` ในหน้าสูตร — **เห็นเฉพาะ products.cost.view**
  - ปริมาณ: ผ้าตัว/ซับใน/หู = พื้นที่ชิ้นตัดจาก `bagPieces` (ตัวเดียวกับสตูดิโอ · ช่องที่วาดคิดแยก 2 ชั้น) → หลาด้วย `calcCostQty` area_face (หน้าผ้า SKU `fabric_width_cm` > `bom_calc_settings`) · เทป = รอบปากกระเป๋า · อื่น ๆ = 1 ชิ้น/จุด
  - ราคา: `skus_v2.standard_price` (GET /api/design-library/cost · products.cost.view) · ไม่มี = ใส่เอง (ผูกรหัสของ ใช้ร่วมทุกชุดสี) · รวมเงิน `bomMaterialCost` (แหล่งเดียว §37) + ค่าแรง + ค่าอื่น ๆ
  - เก็บค่าที่แก้ใน `spec.cost` · bundle ตัด spec.cost ให้คนไม่มีสิทธิ์ · save_recipe ของคนไม่มีสิทธิ์ = คงค่าเดิม
  - ขนาดเกินช่วงแม่แบบทรงสตูดิโอ (W 18–55 ฯลฯ) = เตือน "ควรแก้ปริมาณผ้าเอง"
- **ใบสั่งทำตัวอย่างให้ช่าง** `/print/design-library/[id]/techpack?cw=` · ข้อมูล `lib/design-library-techpack.ts` buildTechpackData (ไม่มีราคา/prompt) · ปริมาณจาก estimateCost
  - แม่แบบเอกสารกลาง entity **`dl_techpack`** → แก้หน้าตาที่ /admin/report-templates (ลงทะเบียน REPORT_ENTITY_DEFS + REPORT_USAGES + sample-docs แล้ว) · ไม่มีแถวใน DB = `DEFAULT_DL_TECHPACK_TEMPLATE`

## รอบ 5 ช่วง 3 (2026-11-14) — ส่งเป็นใบงานออกแบบ
- ปุ่ม **"ส่งเป็นใบงาน"** ในหน้าสูตร (design_library.edit + products.edit) → ป๊อป `components/design-library/send-to-sheet.tsx`: สร้างใบใหม่ / ใบเดิมที่สูตรจำไว้ / แนบเข้าใบอื่น (`DesignSheetPickerModal` กลาง)
- API `POST /api/design-library/send-to-sheet` · แปลงข้อมูล `lib/design-library-sheet.ts` (pure + เทสต์) · ใช้ตารางเดิมของใบงานทั้งหมด ไม่มีตารางใหม่
  - ใบใหม่: เลข DS จาก `nextDsNo` (ย้ายไป `app/api/design-sheets/shared.ts` ใช้ร่วมกับสร้างใบปกติ) · รายละเอียดงานลิงก์กลับสูตร + ใบสั่งทำตัวอย่าง · ⏳ ข้อตั้งต้นแบบใบใหม่ปกติ
  - รูป GPT ล่าสุด (ต่อมุม × ชุดสี) → `erp_playground_attachments` key R2 เดิม (แนบแล้วข้าม)
  - รูปแม่แบบ + หมุดวัสดุ (ชุดสีที่ดูอยู่ · จำนวนจากทุนประมาณ) → `design_sheet_spec_pages/_pins` หน้าใหม่ชื่อ "Design Library · <แม่แบบ> สูตร #n · <ชุดสี>" — ส่งซ้ำ = แทนหน้าชื่อเดียวกัน
  - ทุกชุดสี → `design_sheet_spec_colors` รวมกับของเดิม (แถวชื่อตรงใช้ร่วม · คอลัมน์ "<ชุดสี> · <สูตร>" ส่งซ้ำ = แทน)
  - ทุนประมาณ → `design_sheet_cost_lines` **ต่อท้าย** (products.cost.view เท่านั้น) · ผ้า = area_face (กว้าง = หน้าผ้า · ยาว = พื้นที่ ÷ หน้าผ้า → ใบงานคิดซ้ำได้เลขเดียวกัน) · เทป = length · ชิ้น = count · แก้จำนวนเอง = ตายตัว · ชนิดวัสดุตามชื่อในใบงาน (ผ้า/อะไหล่/ซิป/สาย/เทป) ตั้งทับได้ที่ตัวเลือกหมวด `config.cost_group`
  - จำใบงานไว้ที่ `design_library_recipes.design_sheet_id` → ป้าย "ใบงาน DS-…" ใต้ชื่อสูตร · กันกดซ้ำได้ใบงานซ้ำด้วย expect_sheet_id
- **กันรูปหาย**: `lib/r2-refs` นับ `design_library_renders` / `design_library_templates` / `design_sheet_spec_pages` แล้ว — ลบรูปในใบงานไม่ย้ายไฟล์ที่สูตรยังใช้เข้าถังขยะ
- ตัวอ่านร่วมฝั่งเซิร์ฟเวอร์ `lib/design-library-server.ts` (หน่วย/หน้าผ้า · ราคาทุน · ค่าคิดผ้า) ใช้ทั้ง bundle / cost / send-to-sheet

## รอบ 5 ช่วง 4 (2026-11-14) — เปลี่ยนเป็นสินค้าจริง
- ปุ่ม **"เปลี่ยนเป็นสินค้าจริง"** ในหน้าสูตร → ป๊อป `components/design-library/to-product.tsx` **ไม่เขียนข้อมูลเอง** (เจ้าของเลือก: ผ่านขั้นเดิมของใบงาน ไม่มีทางที่ 2)
  - ตรวจความพร้อม `productReadiness` (lib/design-library-sheet): ใบงาน · จำนวนสี = จำนวน SKU ลูก · วัสดุที่ผูกรหัสจริง / ที่ยังขาด
  - ขั้น 1 ส่งเข้าใบงาน (SendToSheetModal) · ขั้น 2 เปิด `/master/design-sheets?open=<ใบ>&action=sku` = เด้งตัวสร้าง SKU เดิม · ขั้น 3 `&tab=spec` → ปุ่ม "สร้างสูตร BOM" จากหมุด (ได้รหัสวัตถุดิบ + จำนวนจากสูตร)
- ใบงาน (ใช้ได้ทุกใบ): ตัวสร้าง SKU ปุ่ม **"ดึงสีจากตารางสี"** (1 แถวต่อชุดสี + รหัสถัดไป) · ลิงก์ `&tab=` / `&action=sku` · สร้าง BOM จากตีราคา ส่ง `item_sku_code` เป็นรหัสวัตถุดิบด้วย
- ตารางสีที่ส่งไปใบงาน: คอลัมน์จำด้วยรหัส `dl<id8>-…` (ส่งซ้ำแทนได้แม้เปลี่ยนชื่อ) · ชื่อคอลัมน์ = ชื่อชุดสีเฉย ๆ (ชนกับของเดิมถึงต่อท้ายชื่อสูตร) ไว้ใช้เป็นสี SKU


## รอบ 6 (2026-11-14) — ขนาดไม่บังคับ · prompt เปิด/ปิด/แก้/เพิ่ม · แกลเลอรีรูป
- **ขนาด/หูไม่บังคับ** (เจ้าของเลือก: ว่าง = ไม่ระบุ): `DEFAULT_SIZE` = 0 ทุกด้าน · หู `count -1` = ยังไม่ระบุ (`HANDLE_UNSET`) · 0 = ไม่มีหู
  - prompt/ใบสรุป ข้ามค่าที่เป็น 0 (`sizePhrase` / `handleText` · แก้บั๊ก "0 cm") · ใบสั่งทำตัวอย่าง = "—" · เทียบสูตร = "—"
  - ทุนประมาณ: ขนาดไม่ครบ (`sizeKnown`) = ผ้า/เทปคิดอัตโนมัติไม่ได้ บอกให้ใส่ขนาด · ส่งเข้าสตูดิโอ = เตือนให้ใส่ขนาดก่อน
  - วาดช่องตอนยังไม่มีขนาด = กรอบตัวอย่าง 30×35 (`panelSize`) · ช่อง `LenInput optional` โชว์ 0 เป็นช่องว่าง
  - ฟอร์มแม่แบบจัดใหม่: รูปซ้าย ข้อมูลขวา · การ์ดขนาด/หู ป้าย "ไม่บังคับ" · ช่องหูโผล่เมื่อเลือก 1/2 หู
- **Prompt** (`resolvePrompts` pure + เทสต์ · แผง `components/design-library/prompts-panel.tsx`)
  - ค่าเริ่มของทีม = ตัวเลือกรายการ **`prompt`** (⚙️ ตัวเลือก → Prompt): แถว code = คีย์ระบบ (grid4/inside/model/line/3d) + `config.default_on` · แม่แบบทีม = `config.text` ใส่คำแทน `PROMPT_VARS` ({กระเป๋า} {ขนาด} {หู} {วัสดุ} {สีอะไหล่} {ช่องนอก} {ช่องใน} {ประเภท} {ชื่อแม่แบบ} {อ้างอิง})
  - ต่อสูตร = `spec.prompts`: `on` (ทับค่าทีม) · `edits` (ข้อความแก้เอง + `base` = ข้อความระบบตอนแก้ → ต่างจากปัจจุบัน = เตือน "สูตรเปลี่ยนหลังแก้") · `custom` (≤10 · คำแทนได้)
  - ใบสรุป PDF พิมพ์เฉพาะ prompt ที่เปิด
- **รูปจาก GPT = แกลเลอรีเดียว** (ไม่แยกมุม · ลากวาง/Ctrl+V/หลายรูป ผ่าน `useFileDrop` + `uploadImagesWithDupCheck` + `UploadProgress`) · ยังแยกตามชุดสี
  - ⭐ `design_library_renders.is_starred` · `chosenRenders`: ติดดาว = ใช้ (ไม่มีดาว = รูปล่าสุด) → ใบสั่งทำตัวอย่าง / ส่งใบงาน / ปกการ์ด (ปกเลือกดาวสีหลักก่อน)
  - รูปเก่าที่แยกมุมยังอยู่ (ป้ายมุมเดิม) · ตั้งเป็นรูป Vector ของแม่แบบ = ปุ่มบนรูป (ผู้ดูแล)
- DB: `202612160200_design_library_round6.sql` (list_key + prompt · renders.is_starred)

## ยังไม่ทำ (รอบถัดไป)
- รอบ 5 ครบทั้ง 4 ช่วงแล้ว (2026-11-14)
- ปุ่มสร้างรูปในระบบเลย (เสียค่า API ต่อรูป — ต้องลง `lib/paid-services` ก่อน)
