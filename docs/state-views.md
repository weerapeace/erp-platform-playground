# สถานะหน้าจอกลาง — LoadingState / EmptyState / ErrorState

ไฟล์: `components/state-views/index.tsx` · เพิ่ม 2026-10-21 (audit แอปจัดการงาน Y2)

```tsx
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";

{loading ? <LoadingState />
  : error ? <ErrorState onRetry={() => void load()} />
  : rows.length === 0 ? <EmptyState icon="📣" title={t("ยังไม่มีแคมเปญ", "No campaigns yet")} hint={t("สร้างแคมเปญเพื่อ…", "…")}
      action={{ label: <>＋ {t("สร้างแคมเปญ", "Create campaign")}</>, onClick: openCreate }} />
  : …}
```

| ตัว | ใช้เมื่อ |
|---|---|
| `LoadingState` | กำลังโหลด (ข้อความค่าเริ่ม "กำลังโหลด...") |
| `EmptyState` | ไม่มีข้อมูล / ไม่มีสิทธิ์ดู (`icon="🔒"`) — ใส่ `action` เมื่อผู้ใช้ทำต่อได้จริง |
| `ErrorState` | โหลดพลาด + ปุ่มลองใหม่ — **ห้ามโชว์เป็น "ว่าง" หลอก ๆ** |
| `ConnectionError` (components/connection-error) | ฐานข้อมูลล่มทั้งหน้า |

ใช้อยู่ที่: /tasks (คิวงาน), แคมเปญ, คอนเทนต์, ปฏิทินคอนเทนต์, คิวรอตรวจ, ตั้งค่า, เทมเพลต, เทรนด์, ภาระงาน
