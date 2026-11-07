# ประวัติการใช้งาน (Audit Log) — ของกลาง

> ใคร ทำอะไร ที่หน้าไหน รายการไหน และ **เปลี่ยนจากอะไรเป็นอะไร**
> อัปเดต 2026-11-06 (ขั้น 1 + ขั้น 2)

## ใช้ทำอะไร
- หน้า `/admin/audit-log` (ผู้จัดการขึ้นไป · `admin.audit_log`) — ดูประวัติทั้งระบบ กรองตามคน / โมดูล / ช่วงวัน / ประเภท / ค้นเลขเอกสาร
- กดชื่อรายการ → ลิ้นชัก "ประวัติของรายการนี้" (ทุกครั้งที่เคยเกิดกับรายการนั้น) + ปุ่มเปิดหน้ารายการ
- กล่องประวัติในหน้าอื่น (ใบขอซื้อ ใบวางบิล Dashboard ฯลฯ) ใช้ `ActivityFeed` ตัวเดียวกัน → ได้รายละเอียดเพิ่มทันที

## ชิ้นส่วน
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/audit.ts` | **เขียน** ประวัติ: `writeAudit` / `writeAuditMany` / `writeAuditFor` · `auditChangeMeta(before, patch)` ก้อน "จาก → เป็น" พร้อมใส่ metadata · `auditSnapshot(admin, table, id)` อ่านค่าเดิม · `auditLinesDiff` เทียบรายการบรรทัด (วัตถุดิบ/รายการเอกสาร) · `auditDiff` ตัวเทียบพื้นฐาน · `auditRecordLabel(row)` จดเลขเอกสาร/ชื่อ |
| `lib/audit-format.ts` | **แปล** 1 แถวเป็นภาษาคน (`describeAudit`) — อ่านได้ทุกรูปแบบที่ระบบเคยจด · กลุ่มการกระทำ `ACTION_GROUPS` · บันทึกอัตโนมัติ `isAuditNoise` |
| `lib/audit-entities.ts` | entity_type → โมดูล + ชื่อหน้า + ลิงก์ (`ENTITY_INFO`) · เดาโมดูลจากชื่อ (`MODULE_RULES`) · ตัวกรองฝั่ง API (`moduleFilterOr`) |
| `lib/audit-view-server.ts` | ฝั่งเซิร์ฟเวอร์: ชื่อเล่นแทนอีเมล · ชื่อช่องจากทะเบียน field · **ซ่อนค่าตามสิทธิ์** · หาชื่อรายการของประวัติเก่า · **รหัสอ้างอิง → ชื่อ** (relation_config ในทะเบียน field ก่อน แล้ว `REF_FIELDS`) |
| `app/api/audit-logs/route.ts` | API อ่าน (กรอง + นับจริง + `view`) |
| `components/activity-feed` | `ActivityFeed` (แสดง) · `RecordHistoryDrawer` (ประวัติรายการเดียว) |
| `app/admin/audit-log` | หน้า (page = ด่านสิทธิ์ · audit-log-view = เนื้อหา) |

## จดประวัติแบบใหม่ (API ที่แก้ข้อมูล)
```ts
import { auditChangeMeta, auditRecordLabel, auditSnapshot, writeAudit } from "@/lib/audit";

const before = await auditSnapshot(admin, table, id);          // อ่านค่าเดิม (อ่านไม่ได้ = null ไม่ล้ม)
const { data: row } = await admin.from(table).update(patch).eq("id", id).select("*").single();
await writeAudit(admin, {
  action: "update", entityType: table, entityId: id, actorId: user.id, actorName,
  metadata: { ...auditRecordLabel(row), ...auditChangeMeta(before, patch) },
});
```
- ผลลัพธ์ `changes` = `[{ field, old, new }]` · ช่องที่ค่าเท่าเดิมไม่จด · ข้อความยาว/JSON ตัด ~300 ตัวอักษร (ฉบับเต็มอยู่ที่ระบบเวอร์ชัน `lib/record-versions`)
- ไม่มีค่าเดิม → จดแค่ชื่อช่อง (`changed_fields`) เหมือนระบบเดิม
- `{ opaque: [ช่อง] }` = ก้อนข้อมูลภายใน (config / รูปที่ส่งเข้าสินค้า / ลิงก์ชุด / บรีฟ HTML) → จดแค่ "แก้รายละเอียด" (`changed_detail`) ไม่จดค่า
- `{ onlyKnown: true }` = ฟอร์มที่ส่งชื่อช่องไม่ตรงคอลัมน์ → เทียบเฉพาะช่องที่มีในค่าเดิม
- ฟอร์มที่แปลงชื่อช่องก่อนบันทึก (เช่น เงินเดือน) → อ่าน `auditSnapshot` ทั้ง "ก่อน" และ "หลัง" แล้ว `auditChangeMeta(before, after)` (แม่นกว่าเทียบกับ body)
- บันทึกรายการบรรทัดแบบแทนที่ทั้งชุด (วัตถุดิบในสูตร) → `auditLinesDiff(เดิม, ใหม่, { key, qty, uom, name, noun })` ได้แถว "วัตถุดิบ X: 2 ม. → 3 ม." / เพิ่ม / เอาออก
- ค่าความลับ (โทเคน) ส่ง `{ secret: [ชื่อช่อง] }` → จดแค่ "(ค่าความลับ)"
- ค่าที่เป็นรหัสอ้างอิง (แบรนด์/คน/สินค้า/คู่ค้า/แผนก) จดเป็นรหัสได้เลย — หน้าประวัติแปลงเป็นชื่อให้เอง (ช่องใหม่ที่ยังไม่มีในทะเบียน field → เพิ่มใน `REF_FIELDS`)
- ใส่ชื่อ/เลขเอกสารไว้ใน metadata เสมอ (เช่น `pr_no`, `code`, `name`) ไม่งั้นหน้าประวัติไม่รู้ว่า "รายการไหน"

### ที่จดค่าเดิม → ใหม่แล้ว (ขั้น 2)
- `PATCH /api/master-v2/[entity]/[id]` — แก้ข้อมูลหลักทุกตัว (SKU, Parent SKU, คู่ค้า, ราคาซัพพลายเออร์ ฯลฯ)
- `POST /api/master-v2/[entity]/bulk-update` — แก้หลายรายการ: ≤200 แถว จดรายแถว (`via: "bulk"`) + แถวสรุป · เกินนั้นจดแถวสรุปอย่างเดียว
- `POST /api/purchasing/pr-quick` — แก้ใบขอซื้อด่วน (จำนวน / วันที่สั่ง / ลิงก์)
- (2026-11-07) งานครีเอทีฟ: `PATCH /api/creative-tasks/[id]` · งานย่อย `PATCH .../subtasks` · แก้หลายงาน `POST /api/creative-tasks/bulk` (รายงาน) · คอนเทนต์ `PATCH /api/creative-content/[id]`
- (2026-11-07) ใบสั่งผลิต `PATCH /api/mo/[id]` (จำนวน/กำหนดส่ง/ไซส์ "S×10, M×20") · เช็กลิสต์วัตถุดิบ `PATCH /api/mo/material` (มีอยู่/ต้องซื้อ/เตรียม/ตัด) · สูตร `PATCH /api/bom/[id]` (หัวสูตร + วัตถุดิบเพิ่ม/เอาออก/เปลี่ยนจำนวน)
- (2026-11-07) บุคคล/เงินเดือน: `PATCH /api/payroll/core/[entity]/[id]` (พนักงาน/สัญญา/ตั้งค่าเงินเดือน) · `PATCH /api/payroll/master/[entity]/[id]` + `bulk-update` (แผนก/บริษัท/งวด/วันหยุด ฯลฯ) — ตอนนี้จด "ใครทำ" จากบัญชีที่ล็อกอินด้วย (เดิมว่าง)
- (2026-11-07) แบรนด์ `PATCH /api/brands` · งานติดตามในรายการ `PATCH /api/record-tasks/[id]`
- (2026-11-07) ใบออกแบบ: หัวใบ `PATCH /api/design-sheets/[id]` (ค่าใช้จ่ายเพิ่ม/แบ่งกำไร = แก้รายละเอียด ไม่เก็บตัวเลข) · ราคาเสนอ `quotes/[qid]` + `quotes/batch` · ใบแจ้งลูกค้า `notices/[noticeId]` · คอมเมนต์ `comments/[cid]` · ตีราคา `cost-lines` (ยอดต้นทุนรวม + วัตถุดิบเปลี่ยน, ชื่อช่อง `cost_line:`)

### ยังไม่จดค่าเดิม (ทยอยทำทีละโมดูล)
ตั้งค่างานครีเอทีฟ (ตัวเลือก/เทมเพลต/แคมเปญ) · ค่าแรง/เหมาในสูตร (`bom_labor_rate`/`bom_piecework` จดแค่จำนวน) · API อื่นที่ยังจดแค่ชื่อช่อง

## ซ่อนค่าอ่อนไหว (จดไว้ แต่ซ่อนตอนแสดง)
- ช่องที่ทะเบียน field (`erp_module_fields`) ตั้ง `view_roles` / `sensitive_permission` — เช่น ราคาทุน (`products.cost.view`), บัญชีธนาคารคู่ค้า (admin/manager)
- งานบุคคล/เงินเดือน/เงินกู้: ช่องตัวเงิน/บัญชี ต้องมี `app.payroll` + `employees.view`
- ใบออกแบบ/ราคากลางออกแบบ (`design_sheet*`, `design_price_item*`): ช่องที่ชื่อมี price/cost/profit/margin/amount/total ต้องมีสิทธิ์ดูต้นทุน (`products.cost.view`) — กฎเดียวกับหน้าใบออกแบบ
- ค่าที่ซ่อน **ถูกตัดออกจาก metadata ก่อนส่ง** (ไม่ถึงเบราว์เซอร์) · บนจอขึ้น "ซ่อนค่า — คุณไม่มีสิทธิ์ดูช่องนี้"
- admin เห็นทุกค่า

## API `GET /api/audit-logs`
`entity_type` `entity_id` `action` (ตรงตัว) `group` (create/update/status/delete/output) `module` `actor` (user id) `q` `from`/`to` (YYYY-MM-DD เวลาไทย) `noise` (1 รวมบันทึกอัตโนมัติ) `counts=1` `include=actors` `limit` (≤200) `offset`
- ไม่ระบุวัน + ไม่เจาะรายการ = 90 วันล่าสุด (กันช้า — ตาราง ~95,000 แถว)
- บันทึกอัตโนมัติ (ซ่อนเป็นค่าเริ่มเมื่อไม่เจาะรายการ): กระดานเซฟเอง `canvas_update` · `file/upload` · `platform_email` (สคริปต์นำเข้าอีเมล)
- กลุ่ม/โมดูลฝั่ง API ใช้กติกาเดียวกับป้ายบนจอ — เทสต์ `lib/audit-format.test.ts` ยืนยันกับ entity_type จริงทั้ง 239 ชนิด

## เพิ่มชนิดเอกสารใหม่
1. เขียนประวัติด้วย `writeAudit` + ใส่เลขเอกสาร/ชื่อ + `changes` จาก `auditDiff`
2. อยากให้ชื่อหน้าสวย/กดเปิดได้ → เพิ่ม 1 แถวใน `ENTITY_INFO` (`lib/audit-entities.ts`) — หน้าปลายทางต้องรองรับ `?open=<id>` (`lib/open-param`)
3. ประวัติเก่าไม่มีชื่อ → เพิ่มใน `LABEL_SOURCES` (`lib/audit-view-server.ts`) ให้หาชื่อจากตารางจริง

## ข้อจำกัด
- ประวัติก่อน 2026-11-06 ส่วนใหญ่จดแค่ "แก้ช่องไหน" — ย้อนหลังหาค่าเดิมไม่ได้
- ค่าที่เป็นรหัสแปลงเป็นชื่อได้เฉพาะช่องที่รู้ปลายทาง (ทะเบียน field / `REF_FIELDS`) — ช่องอื่นยังโชว์ "รหัส …abcd"
- จำนวนบนการ์ด = นับสด 6 คำขอ (หน้าโหลด ~1–2 วินาที) ถ้าช้าค่อยทำฟังก์ชันนับใน DB
- ยังไม่มี "บันทึกการเข้าใช้หน้า" (ขั้น 3 — ต้องสร้างตารางใหม่ รอเจ้าของอนุมัติ)
