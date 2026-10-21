# TaskCard — การ์ดงานกลาง (แอปจัดการงาน)

ไฟล์: `app/tasks/task-card.tsx` · ย้ายจาก overview-kanban 2026-10-21 (audit แอปจัดการงาน Y2)

การ์ดงานใบเดียวใช้ทุกที่: บอร์ดการ์ด · มุมมอง WIP · "งานของฉัน" ในภาพรวม · กระดานลากวาง

```tsx
import { TaskCard, taskCardCfg } from "./task-card";

const CFG = taskCardCfg({ cover: true, brand: true, assignee: true, due: true, priority: true, taskNo: true });
<TaskCard task={task} cfg={CFG} extra={{ statusPill: true, accentLeft: "#7c3aed", badge: <span>⭐</span> }} />
```

- `cfg` (KanbanTheme) เลือกโชว์: รูปปก · แบรนด์ · ผู้รับผิดชอบ · กำหนดส่ง · ความสำคัญ · ความคืบหน้า · เลขที่งาน · ประเภท · สินค้า · ชี้แล้วโชว์รายละเอียด (hoverCard)
- `taskCardCfg(p)` = ค่าตั้งต้นปิดทุกอย่าง เปิดเฉพาะที่ระบุ (บอร์ดใช้ธีมที่ผู้ใช้ตั้งเอง)
- `extra`: ป้ายสถานะ · นับวันกำหนดส่ง · แถบสีซ้าย · ป้ายเล็กหน้าป้ายความสำคัญ · ยืดเต็มช่อง
- **ห้ามเขียนการ์ดงานใหม่เองในหน้า** — ขาดอะไรให้เพิ่มตัวเลือกในไฟล์นี้
