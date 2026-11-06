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
| `lib/audit.ts` | **เขียน** ประวัติ: `writeAudit` / `writeAuditMany` / `writeAuditFor` · `auditDiff(before, after)` จด "จาก → เป็น" · `auditRecordLabel(row)` จดเลขเอกสาร/ชื่อ |
| `lib/audit-format.ts` | **แปล** 1 แถวเป็นภาษาคน (`describeAudit`) — อ่านได้ทุกรูปแบบที่ระบบเคยจด · กลุ่มการกระทำ `ACTION_GROUPS` · บันทึกอัตโนมัติ `isAuditNoise` |
| `lib/audit-entities.ts` | entity_type → โมดูล + ชื่อหน้า + ลิงก์ (`ENTITY_INFO`) · เดาโมดูลจากชื่อ (`MODULE_RULES`) · ตัวกรองฝั่ง API (`moduleFilterOr`) |
| `lib/audit-view-server.ts` | ฝั่งเซิร์ฟเวอร์: ชื่อเล่นแทนอีเมล · ชื่อช่องจากทะเบียน field · **ซ่อนค่าตามสิทธิ์** · หาชื่อรายการของประวัติเก่า |
| `app/api/audit-logs/route.ts` | API อ่าน (กรอง + นับจริง + `view`) |
| `components/activity-feed` | `ActivityFeed` (แสดง) · `RecordHistoryDrawer` (ประวัติรายการเดียว) |
| `app/admin/audit-log` | หน้า (page = ด่านสิทธิ์ · audit-log-view = เนื้อหา) |

## จดประวัติแบบใหม่ (API ที่แก้ข้อมูล)
```ts
import { auditDiff, auditRecordLabel, writeAudit } from "@/lib/audit";

const { data: before } = await admin.from(table).select(Object.keys(patch).join(",")).eq("id", id).maybeSingle();
const { data: row } = await admin.from(table).update(patch).eq("id", id).select("*").single();
await writeAudit(admin, {
  action: "update", entityType: table, entityId: id, actorId: user.id, actorName,
  metadata: { changes: auditDiff(before, patch), ...auditRecordLabel(row) },
});
```
- `changes` = `[{ field, old, new }]` · ช่องที่ค่าเท่าเดิมไม่จด · ข้อความยาว/JSON ตัด ~300 ตัวอักษร (ฉบับเต็มอยู่ที่ระบบเวอร์ชัน `lib/record-versions`)
- ค่าความลับ (โทเคน) ส่ง `{ secret: [ชื่อช่อง] }` → จดแค่ "(ค่าความลับ)"
- ใส่ชื่อ/เลขเอกสารไว้ใน metadata เสมอ (เช่น `pr_no`, `code`, `name`) ไม่งั้นหน้าประวัติไม่รู้ว่า "รายการไหน"

### ที่จดค่าเดิม → ใหม่แล้ว (ขั้น 2)
- `PATCH /api/master-v2/[entity]/[id]` — แก้ข้อมูลหลักทุกตัว (SKU, Parent SKU, คู่ค้า, ราคาซัพพลายเออร์ ฯลฯ)
- `POST /api/master-v2/[entity]/bulk-update` — แก้หลายรายการ: ≤200 แถว จดรายแถว (`via: "bulk"`) + แถวสรุป · เกินนั้นจดแถวสรุปอย่างเดียว
- `POST /api/purchasing/pr-quick` — แก้ใบขอซื้อด่วน (จำนวน / วันที่สั่ง / ลิงก์)

### ยังไม่จดค่าเดิม (ทยอยทำทีละโมดูล)
งานครีเอทีฟ (`creative-tasks` จดแค่ชื่อช่อง) · BOM · ใบสั่งผลิต · แบรนด์ · เงินเดือน (`employees`/`employee_contracts` จดแค่ชื่อช่อง) · ใบออกแบบ

## ซ่อนค่าอ่อนไหว (จดไว้ แต่ซ่อนตอนแสดง)
- ช่องที่ทะเบียน field (`erp_module_fields`) ตั้ง `view_roles` / `sensitive_permission` — เช่น ราคาทุน (`products.cost.view`), บัญชีธนาคารคู่ค้า (admin/manager)
- งานบุคคล/เงินเดือน/เงินกู้: ช่องตัวเงิน/บัญชี ต้องมี `app.payroll` + `employees.view`
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
- ค่าที่เป็นรหัส (เช่น brand_id) ยังโชว์เป็น "รหัส …abcd" — ยังไม่แปลงเป็นชื่อ
- จำนวนบนการ์ด = นับสด 6 คำขอ (หน้าโหลด ~1–2 วินาที) ถ้าช้าค่อยทำฟังก์ชันนับใน DB
- ยังไม่มี "บันทึกการเข้าใช้หน้า" (ขั้น 3 — ต้องสร้างตารางใหม่ รอเจ้าของอนุมัติ)
