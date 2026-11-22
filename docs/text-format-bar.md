# แถบจัดข้อความ (TextFormatBar) — ของกลาง

`components/text-format-bar` · เจ้าของสั่ง 2026-11-22: "ตอนกำลังพิมพ์หรือคลุมดำ ต้องเปลี่ยนเครื่องมือเป็นจัดการ text ให้เลย · ทำเป็นของกลาง"

## ใช้ทำอะไร
แถบเครื่องมือข้อความที่ขึ้นมาตอนผู้ใช้กำลังพิมพ์ในช่องจัดรูปแบบ:
ตัวหนา · เอียง · ขีดเส้นใต้ · ขีดฆ่า · ขนาด · สีตัวอักษร · ไฮไลต์ · จัดชิดซ้าย/กลาง/ขวา · รายการ · ลิงก์ · ล้างรูปแบบ

- ปุ่มลัด Ctrl+B / I / U และ Ctrl+K (ลิงก์) — รองรับแป้นภาษาไทย (`lib/shortcut-key`)
- มือถือ/แท็บเล็ต (จอสัมผัส) = แถบติดเหนือแป้นพิมพ์ (ไม่ลอยบังข้อความ) · จอคอม = วางตรงที่ผู้ใช้วาง
- ปุ่มไม่ขโมยโฟกัสจากช่องพิมพ์ · จำคำที่คลุมดำไว้ (กดแผงสี/ลิงก์แล้วกลับมาทำกับคำเดิมได้)

## ใช้เมื่อไหร่
ช่องพิมพ์ `contentEditable` ที่เก็บข้อความจัดรูปแบบ — ตอนนี้ใช้ที่กระดาน flowchart กลาง: กล่องข้อความ (ดับเบิลคลิก) · ข้อในรายการงาน · ชื่อการ์ดรายการงาน/อัตโนมัติ

## ห้ามใช้เมื่อไหร่
- ช่องข้อความล้วน (`input` / `textarea`) — ไม่มีรูปแบบให้จัด
- กล่องข้อความยาวที่มีตาราง/รูป → `RichTextEditor` (components/rich-text · Tiptap) — ถ้าจะให้ใช้แถบนี้ ต้องเขียน adapter ของ Tiptap (งานรอบถัดไป)

## วิธีใช้
```tsx
import { TextFormatBar, domTextAdapter, applyTextShortcut, isInTextBar, useLinkRequest } from "@/components/text-format-bar";

const ref = useRef<HTMLDivElement>(null);
const [linkReq, askLink] = useLinkRequest();
<div onBlur={(e) => { if (!isInTextBar(e.relatedTarget)) save(); }}>
  {ready && ref.current && <TextFormatBar t={t} adapter={domTextAdapter(ref.current)} linkRequest={linkReq} />}
  <div ref={ref} contentEditable onKeyDown={(e) => applyTextShortcut(e, domTextAdapter(ref.current!), askLink)} />
</div>
```
- `useTextFormatTarget(scopeRef)` = ช่องพิมพ์ที่โฟกัสอยู่ในพื้นที่นั้น (ไว้สลับแถบเครื่องมือของหน้าเป็นแถบข้อความ)
- ตัวแก้แบบอื่นส่ง `TextFormatAdapter` ของตัวเอง (run / active / color / highlight / size / link)

## ความปลอดภัย
HTML ที่ได้ยังไม่กรอง — ผู้ใช้ต้องกรองก่อนเก็บ/แสดง · กระดานใช้ `sanitizeRich` (lib/flowchart-rich) ซึ่งรองรับไฮไลต์ (`background-color`) และลิงก์ (เฉพาะ http/https หรือหน้าในระบบ · เปิดแท็บใหม่เสมอ · `javascript:` ทิ้ง)

## ข้อจำกัด
- ใช้ `document.execCommand` (เบราว์เซอร์ทุกตัวยังรองรับ แต่เลิกพัฒนาแล้ว)
- ข้อในรายการงาน/ชื่อการ์ดเป็นบรรทัดเดียว (Enter = บันทึก) — ปุ่มรายการ/จัดชิดมีผลกับกล่องข้อความเท่านั้น
