# 🖨 ตั้งค่าหน้าพิมพ์แบบรายการ (ของกลาง)

## ใช้ทำอะไร
ใบพิมพ์ที่เป็น "ตาราง" (รายการรอจ่าย, งานเหมา, กำลังผลิต ฯลฯ) ปรับหน้าตาได้เองจาก **แผงขวาของหน้าพรีวิว** ไม่ต้องแก้โค้ด

- **แบบที่บันทึกไว้** — แบบสำเร็จรูป · แบบของทีม (แอดมินบันทึก) · แบบของฉัน · กดทีเดียวเปลี่ยนทั้งชุด
- **กระดาษ** A4/A5 แนวตั้ง/แนวนอน
- **ขนาด** ตัวอักษร (9–14px) · รูปสินค้า (ไม่แสดง/เล็ก 8มม./กลาง 13มม./ใหญ่ 20มม.) · ความแน่นแถว · แถวสลับสี
- **คอลัมน์** เปิด/ปิด · เลื่อนลำดับ · แก้ชื่อหัว · เพิ่มช่องว่างให้เขียนมือ (หมายเหตุ / ตรวจแล้ว ☐ / ลายเซ็นรับ)
  - **ช่องใหม่ (ตั้งชื่อเอง)** เพิ่มได้สูงสุด 8 ช่อง (key `c_<รหัส>` ต้องมีชื่อ) · ทุกช่องเขียนมือเลือกได้ว่าเป็น ช่องเขียน / ช่องติ๊ก ☐ และกว้าง แคบ 14 / กลาง 25 / กว้าง 40 มม.
- **ความกว้างคอลัมน์** ลากขอบหัวคอลัมน์ในพรีวิว (ดับเบิลคลิก = กลับค่าเดิม) · ปุ่ม "คืนเดิมทั้งหมด" ในแผง · ค่าเริ่มต้นต่อคอลัมน์มาจาก `widthMm` ในนิยามคอลัมน์ (ไม่กำหนด = ได้ที่ที่เหลือ เช่น ชื่อสินค้า)
- **เรียง & จัดกลุ่ม** (ตามที่รายงานรองรับ) · ขึ้นหน้าใหม่ทุกกลุ่ม
- **หัว-ท้าย** ชื่อรายงาน · หัวบริษัท (โลโก้จากทะเบียนบริษัท) · เลขหน้า "หน้า 1 / N" · ช่องเซ็นท้ายใบ
- บอก **จำนวนหน้าโดยประมาณ** ก่อนพิมพ์ · พรีวิวย่อให้พอดีกรอบเมื่อที่แคบ (ไม่กระทบตอนพิมพ์)

ค่าที่ตั้ง **จำต่อคน ต่อใบ** (ตามไปทุกเครื่อง) — แก้แล้วจำเอง ไม่ต้องกดบันทึก

## ชิ้นส่วน
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/list-print.ts` | ชนิดค่าตั้ง · ตรวจค่า · แบบ (preset) · `renderListTable` · `listPrintCss` · `signatureHtml` · `estimateListPages` (pure) |
| `components/report/use-list-print-settings.ts` | hook เก็บค่า: ต่อคน `user_ui_prefs "print_settings:<reportKey>"` · แบบของฉัน `"print_presets:<family>"` · แบบของทีม `ui_config admin_print_presets` |
| `components/report/list-print-panel.tsx` | `ListPrintPanel` แผงตั้งค่า |
| `components/report` `PrintFrame fit` | พรีวิวย่อให้พอดีกรอบ (เฉพาะบนจอ) · `onDocLoad` |
| `components/report/list-print-frame.tsx` | `ListPrintFrame` = PrintFrame + ลากขอบหัวคอลัมน์ปรับความกว้าง (`attachColumnResize` อ่าน `th[data-col]`) |
| `lib/work-board-print.ts` | ผู้ใช้รายแรก: ใบพิมพ์บอร์ดจ่ายงาน 5 แบบ + แบบสำเร็จรูป 3 แบบ |

## ใช้กับรายงานใหม่
1. นิยามคอลัมน์ `ListPrintColumn[]` (key, label, align, mono) + `defaultListPrintSettings(cols, {...})` — ห่อด้วย `useMemo`
2. `const print = useListPrintSettings({ reportKey: "<รายงาน>:<ใบ>", family: "<รายงาน>", available, defaults })`
3. สร้าง HTML: `resolveListColumns(print.settings, cols)` → `renderListTable(...)` · ต่อ `listPrintCss(settings)` ท้าย custom_css · `buildReportHtml`
4. พรีวิวใช้ `<ListPrintFrame html state={print} />` (ลากปรับความกว้างได้) · วาง `<ListPrintPanel state={print} available={cols} sorts={...} groups={...} builtinPresets={...} companies={...} estimatedPages={estimateListPages(counts, settings)} defaultTitle="..." canSaveTeam={can("admin.users")} />` ข้าง `<PrintFrame fit />`
5. ค่าข้อความทุกช่องต้อง `escapeHtml` ก่อนใส่ตาราง (renderListTable ไม่ escape ให้)

## สิทธิ์ / ประวัติ
- ค่าต่อคน + แบบของฉัน = ของคนนั้นคนเดียว (RLS user_ui_prefs)
- แบบของทีม: ทุกคนที่ล็อกอินอ่านได้ · บันทึก/ลบ ต้อง `admin.users` · ui-config เขียน audit `setting_change`

## ข้อจำกัด
- จำนวนหน้าเป็นค่าประมาณ (ชื่อยาวขึ้น 2 บรรทัดไม่ได้คิด)
- เลขหน้าใช้ `@page` margin box — โชว์ตอนพิมพ์/PDF ใน Chrome/Edge รุ่นใหม่ ไม่โชว์ในพรีวิวบนจอ
- ใบแยกโต๊ะ (กำลังผลิต/แผน) จัดกลุ่มตามโต๊ะเสมอ
