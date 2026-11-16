# ศูนย์งานแก้แอป (`/admin/app-changes`)

เจ้าของขอ 2026-11-16: "แก้ APP บ่อยมาก ส่วนใหญ่ดีไซน์และจุกจิกในแต่ละหน้า … อยากเห็นภาพรวมง่าย ๆ เชื่อมกับแผนผังการทำงาน และกระดานแผนทีม"
เลือกจาก widget: ภาพรวมแบบ **A รายการจัดกลุ่ม** + ข้อเสนอ 1-4 (คำสั่ง AI · ส่งเข้าแผนทีม · ตัวเลขบนแผนผัง · ป้ายขึ้นเว็บ) · เฉพาะผู้มีสิทธิ์ `report.manage` (ไม่ได้เลือกให้พนักงานทุกคนใช้)

## ใช้ทำอะไร

| ส่วน | ที่อยู่ | ทำอะไร |
|---|---|---|
| ป๊อป "ขอแก้หน้านี้" | เมนูโปรไฟล์ทุกหน้า (`components/app-change/menu-item.tsx` → `request-modal.tsx`) | ใส่หน้าที่เปิดอยู่ให้เอง · ติ๊กของกลางในหน้านั้น · กล่องแผนผังที่ผูกหน้าติ๊กไว้ก่อน · แนบภาพ (ลากวาง/Ctrl+V — `FileMultiInput`) · ติ๊ก "ด่วน" |
| หน้าภาพรวม | `/admin/app-changes` (`components/app-change/hub.tsx`) | จัดกลุ่ม ตามหน้า / ตามของกลาง / ตามสถานะ · ค้นหา · ติ๊กหลายข้อ → คำสั่งให้ AI · เปลี่ยนสถานะ · ส่งเข้าแผนทีม · `?flow=n:qt` กรองตามกล่องแผนผัง · `?id=` ไฮไลต์ใบ |
| ผลกระทบของกลาง | กดชื่อของกลางในรายการ | หน้าทั้งหมดที่ใช้ตัวนั้น + งานแก้ค้างต่อหน้า (`/api/app-changes/context?part=`) |
| แผนทีม | ปุ่ม "แผนทีม" ต่อรายการ | ใช้ `AddToPlanButton` กลาง · source = `/admin/app-changes?id=<id>` (การ์ดในแผนทีมกดกลับมาที่งานแก้ได้) |
| แผนผังการทำงาน | ชิปสีส้มในรายการ → `/master/flow-map?node=<id>` | ป้ายส้ม "แก้ N" ที่ขอบล่างกล่อง + ปุ่ม "งานแก้ N" หัวลิ้นชักกล่อง (components/flow-map/index.tsx · ข้อมูล `GET /api/app-changes/flow-counts`) → `/admin/app-changes?flow=n:<id>` · เปิด `/master/flow-map?node=<id>` = เปิดลิ้นชักกล่องนั้นเลย |
| ป้ายขึ้นเว็บ | อัตโนมัติ | รหัส `[CH-xxxxxx]` (6 ตัวแรกของ id) ในบรรทัดแรกของ commit → อยู่ในคิวรอ = "รอขึ้นเว็บ" · อยู่บน prod แล้ว = "ขึ้นเว็บแล้ว" + ระบบปรับสถานะเป็น resolved เอง (audit `by: deploy`) |

## ข้อมูล

ไม่มีตารางใหม่ — ใช้ `issue_reports` ของแจ้งปัญหาเดิม + 3 ช่อง (migration `202612180500_issue_reports_page_parts.sql`, เจ้าของอนุญาต 2026-11-16):

- `page_path` text — หน้าที่ขอแก้ (มีค่า = ใบจากศูนย์งานแก้ · ใบแจ้งปัญหาทั่วไปของพนักงาน = null)
- `parts` jsonb — key ของกลางใน `lib/shared-parts-registry.ts` (API ตัดค่าที่ไม่มีในทะเบียน)
- `flow_refs` jsonb — `[{kind:"n"|"e", ref}]` กล่อง/เส้นใน `lib/flow-map.ts` (API ตัดค่าที่ไม่มีจริง)

สถานะใช้ของเดิม: open = รอทำ · in_progress = กำลังทำ · resolved = เสร็จ/ขึ้นเว็บแล้ว · closed = ปิด (ไม่ทำ)

## ตัวช่วยกลาง `lib/app-change.ts` (pure + เทสต์ `lib/__tests__/app-change.test.ts`)

- `partsForPage(path, SHARED_PARTS, usage)` — หน้านี้ใช้ของกลางอะไร (กลับด้านจาก `lib/shared-parts-usage.json` ที่นับจากโค้ดตอน build · route แบบ `[id]` จับคู่ได้)
- `pagesForPart(key, …)` — แก้ของกลางตัวนี้กระทบหน้าไหน
- `flowNodesForPage(path, FLOW_NODES)` — กล่องแผนผังที่ปุ่ม "เปิดหน้า" ชี้มาหน้านี้
- `groupChanges(rows, by)` · `changeCode(id)` · `codesInText(msg)` · `deployMarks(waiting, live)` · `changeBadge(status, mark)` · `buildChangePrompt(items)`

## API

| เส้นทาง | สิทธิ์ | ทำอะไร |
|---|---|---|
| `GET /api/app-changes/context?path=` / `?part=` | report.create | ของกลาง + กล่องแผนผังของหน้า / หน้าที่ใช้ของกลาง (ไม่แตะ DB) |
| `POST /api/issue-reports` | report.create | รับ `page_path`, `parts`, `flow_refs` เพิ่ม (ล้างค่าก่อนบันทึก · audit มี page) |
| `GET /api/issue-reports?page=&part=` | report.create | กรองตามหน้า/ของกลาง |
| `GET /api/app-changes/deploy-marks` | report.manage | ป้าย รอขึ้น/ขึ้นแล้ว — ถาม GitHub ผ่านแคชกลาง `lib/deploy-status` (`getLiveCommitMessages` 100 commit ล่าสุดของ prod, แคช ≥120 วิ) |
| `GET /api/app-changes/flow-counts` | report.create | `{counts: {"n:qt": 2}}` งานแก้ค้างต่อกล่อง/เส้น |

## กติกาสำหรับ AI ที่รับงานแก้

คำสั่งที่คัดลอกจากหน้านี้บอกไว้แล้ว: อ่าน CLAUDE.md · แก้ของกลางต้องรัน `npm run where-used` · งานหน้าจอทำ widget ก่อน · **ใส่ `[CH-xxxxxx]` ในบรรทัดแรกของ commit** (หลายข้อใส่หลายรหัสได้) → ป้ายขึ้นเว็บทำงานเอง

## ห้าม / ข้อจำกัด

- ห้ามทำปุ่มลอยแยก — ศูนย์แจ้งเตือน Pet เป็นของลอยตัวเดียวของระบบ (เลยวางเป็นแถวในเมนูโปรไฟล์ ทั้งแถบบนมือถือและแถบข้าง PC)
- ของกลางที่หน้าใช้ = เฉพาะที่ import ตรงในไฟล์ของหน้านั้น (ตัวสแกนนับจากโค้ด) — ของที่หน้าใช้ผ่านชิ้นอื่นอาจไม่ขึ้น พิมพ์บอกในช่องข้อความแทน
- ป้ายขึ้นเว็บดูได้ย้อน 100 commit ของ prod — งานเก่ากว่านั้นที่ยัง open ต้องปรับสถานะเอง
- ใบแจ้งปัญหาทั่วไป (page_path ว่าง) ไม่ขึ้นในศูนย์นี้ ดูที่ `/issue-report`
