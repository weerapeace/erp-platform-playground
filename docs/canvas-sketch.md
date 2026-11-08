# CanvasSketch — กระดานวาด Excalidraw (ของกลาง)

`components/canvas-sketch/index.tsx` · API: `/api/canvas-sketch` · ตาราง: `erp_canvas_sketches` · ใช้จริง: Design Sheets แท็บ "🖌 กระดาน" · Campaign Canvas · บอร์ดจ่ายงาน มุมมอง "🗂 แคนวาส"

## ใช้ทำอะไร

กระดานวาดแบบ miro ผูกกับเอกสาร 1 ใบ: วางรูปจาก clipboard (Ctrl+V) / ลากไฟล์รูป, กล่อง, ลูกศร, ข้อความ, วาดเส้นอิสระ
ตอนบันทึกระบบ **ถ่ายภาพกระดานเป็น PNG เก็บใน R2** อัตโนมัติ → ใบพิมพ์/การ์ดเอาภาพไปแปะได้

## วิธีใช้ (โมดูลไหนก็ได้)

```tsx
import { CanvasSketch } from "@/components/canvas-sketch";

<CanvasSketch entityType="design_sheet" entityId={sheetId} editable={canEdit} height="58vh" />
```

### แทรกการ์ด/โซนจากภายนอก (controlsRef.insert)

ถือ `controlsRef` แล้วเรียก `insert(skeletons)` เพื่อแทรก element ลงกลางจอ (เช่นปุ่ม "เพิ่ม SKU Card / Section") — `skeletons` เป็น Excalidraw skeleton (`{type,x,y,...}`, x/y นับจาก 0 ระบบเลื่อนไปกลางจอให้) แล้วบันทึกอัตโนมัติเอง

```tsx
const ref = useRef<CanvasSketchControls | null>(null);
<CanvasSketch entityType="creative_board" entityId={boardId} controlsRef={ref} />
// ปุ่ม:
ref.current?.insert([
  { type: "rectangle", x: 0, y: 0, width: 250, height: 130, backgroundColor: "#fff", strokeColor: "#7c3aed", roundness: { type: 3 } },
  { type: "text", x: 14, y: 14, text: "📦 SKU-001\nชื่อสินค้า", fontSize: 16, strokeColor: "#1e293b" },
]);
```

ใช้จริง: Campaign Canvas (`app/tasks/campaigns/[id]`) — ปุ่ม Section (Frame) / SKU Card / Task Card

### อ่านกระดาน + รู้ตอนบันทึก (`controlsRef.getElements` / prop `onSaved`)

โมดูลที่ต้อง "เขียนผลการลากกลับเข้าข้อมูลจริง" ใช้คู่กันสองตัวนี้:

- `getElements()` — อ่าน element ดิบบนกระดาน (อ่านอย่างเดียว) เช่นดูว่าการ์ดอยู่ใน frame ไหน (`el.frameId`)
- `patchElements(fn)` — แก้ค่าบน element ที่มีอยู่ (คืน `null` = ไม่แก้ใบนั้น) เช่นจัดการ์ดเข้าช่อง (snap) / เปลี่ยนชื่อกรอบ · ถ้าไม่มีอะไรเปลี่ยนจริงจะไม่บันทึก (กันเซฟวนไม่จบ)
- ดับเบิลคลิกการ์ด (`onCardOpen`) จะ **ข้ามกรอบ (frame)** เสมอ — กรอบครอบทั้งโซน ถ้านับด้วยจะกลืนดับเบิลคลิกของการ์ดข้างใน (เคยทำให้กดการ์ดในบอร์ดจ่ายงานแล้วไม่มีอะไรเกิดขึ้น)
- `insert(skeletons, { fitImages: false })` — ข้ามการวัดสัดส่วนรูปจริง (ใช้กรอบที่ส่งมาเลย) → แทรกการ์ดพร้อมรูปทีละร้อยใบได้ทันที ไม่ต้องรอโหลดรูปทีละใบ
- `onSaved` — เรียกทุกครั้งที่บันทึกกระดานสำเร็จ (บันทึกอัตโนมัติหลังหยุดลาก ~2.5 วิ)

ใช้จริง: บอร์ดจ่ายงาน มุมมอง "🗂 แคนวาส" (`app/master/work-board/canvas-view.tsx`) — 1 frame = 1 โต๊ะ ·
ลากการ์ด "แผน" ข้ามกรอบ → `onSaved` → อ่าน `getElements()` → เทียบกับครั้งก่อน (`lib/work-board-canvas.ts` มีเทสต์) → PATCH แผนจ่ายงาน + จัดการ์ดเข้าช่อง (snap) + เขียนยอดจำนวน/ค่าแรงขึ้นหัวกรอบด้วย `patchElements` ·
การ์ด "ของจริง" ใส่ `locked: true` + สีเทา = เห็นได้ ลาก/แก้ไม่ได้

> กฎกันข้อมูลพัง: การ์ดที่หลุดออกนอกกรอบที่ระบบรู้จัก ให้ถือว่า "ไม่รู้" อย่าเขียนค่าว่างกลับเข้าข้อมูล

- 1 เอกสาร = 1 กระดาน (unique entity_type + entity_id)
- component จัดการโหลด/บันทึกเองทั้งหมด — **บันทึกอัตโนมัติ**: หยุดวาด ~2.5 วิ → save เอง + flush ตอนปิดแท็บ/ปิด modal · มีตัวบอกสถานะ (รอบันทึก/กำลังบันทึก/✓ แล้ว) · บันทึกพลาด (เน็ตสะดุด) → ขึ้น ⚠ + ปุ่มลองใหม่ และจะลองซ้ำเองเมื่อแก้ครั้งถัดไป
- ภาพถ่ายกระดาน: key ตายตัว `canvas-sketch/<type>/<id>.png` — บันทึกใหม่ทับของเก่า **ไม่มีไฟล์ขยะใน R2**
- ดึงภาพไปใช้: GET `/api/canvas-sketch?entity_type=..&entity_id=..` → `preview_url`

## การ์ดโฟลเดอร์ (ของกลาง `components/canvas-sketch/folder-card.tsx`)

- `<FolderCardModal open onClose onPlace={(skeletons) => controls.insert(skeletons)} />` — ป๊อปกรอกชื่อ + path แล้วคืนโครงการ์ดให้ผู้เรียกวางเอง
- `folderCardSkeleton({ path, label })` — โครงการ์ด (customData `kind: "folder"`)
- `openCanvasFolder(path)` — เรียกใน `onCardOpen` เมื่อ `data.kind === "folder"` → เปิด File Explorer ผ่าน `erpfolder:` (ลง `/erp-open-folder.reg` ครั้งเดียวต่อเครื่อง) + คัดลอก path สำรอง · กันเตือน "Leave site?" ให้เอง (suppressUnload)
- ใช้ที่: กระดานแคมเปญ (`/tasks/campaigns/[id]`) · แผนผังการเก็บไฟล์ (`/master/storage-plan`)

## ฝังลิงก์ YouTube / Pinterest / TikTok

- copy ลิงก์แล้วกด Ctrl+V บนกระดาน → ได้กล่องโชว์รูป/วิดีโอ (วางหลายลิงก์ทีเดียว = เรียงเป็นแถว) · คลิกกล่อง 1 ครั้งเพื่อกดเล่น/เลื่อนในกล่อง
- YouTube/Vimeo/Figma/X ฯลฯ = ของ Excalidraw เอง · **Pinterest + TikTok = ของเรา** (`lib/social-embed.ts` + `social-embed-frame.tsx` ผ่าน prop `validateEmbeddable`/`renderEmbeddable`/`onPaste`)
  - Pinterest: ทุกภาษา (www./es./th.) + ลิงก์สั้น `pin.it` · ตัวฝังทางการ `assets.pinterest.com/ext/embed.html` (พินวิดีโอเล่นได้) · ความสูงกล่องตามสัดส่วนรูปพินจริง · ยืด/หดกล่องได้ทุกขนาด — ตัวฝังกว้างได้แค่ 236–600 และสูงตามรูป จึงย่อ/ขยายทั้งการ์ดให้พอดีกล่อง (`pinterestFit`) ไม่ถูกตัด · TikTok ตัวเล่นยืดเต็มกล่องเอง
  - TikTok: `/@user/video/<เลข>` + ลิงก์สั้น `vt./vm.tiktok.com`, `tiktok.com/t/` · ตัวเล่นทางการ `tiktok.com/player/v1` (325×578)
- `/api/social-embed?url=` (ของกลาง) ย่อลิงก์สั้น (ยอมเด้งเฉพาะโดเมน Pinterest/TikTok) + ขนาด/สถานะพิน (พินถูกลบ/ส่วนตัว → กล่องบอก "ถูกลบหรือเป็นส่วนตัว")
- ลิงก์ที่เคยวางไว้เป็น**ข้อความ**ก่อนรองรับ → ปุ่ม "📌 แปลงลิงก์ Pinterest/TikTok เป็นรูป/วิดีโอ (N)" บนแถบกระดาน (โชว์เมื่อมี) ลิงก์ที่อยู่ใกล้กันเรียงเป็นแถวเริ่มที่มุมกลุ่ม แล้วเลื่อนลงไปที่ว่างใต้ของเดิม (กล่องฝังลอยทับทุกอย่าง — กันทับโน้ต) · ลิงก์เดิมเก็บอยู่ในกล่อง · ไม่เป็นขั้น Ctrl+Z (Excalidraw ไม่รับการลบข้อความที่มีแก้ค้างภายใน — ย้อนแล้วได้ครึ่ง ๆ) · วางลิงก์ใหม่ Ctrl+Z ย้อนได้ปกติ
- กล่องฝังเก็บแค่ลิงก์ (ไม่เก็บรูปลงระบบ) → กระดานไม่หนัก · คนที่เปิดกระดานพร้อมกันเห็นเหมือนกัน · แต่ถ้าเจ้าของพิน/คลิปลบ ก็หายตาม · ไม่ติดไปในภาพแคป "ส่ง LINE"

## ข้อจำกัด / ข้อควรรู้

- ขนาดกระดานจำกัด 8MB (รูปที่วางฝังใน scene) — วางรูปใหญ่หลายรูปมากๆ จะเตือน
- ไม่มีตารางสำเร็จรูป (วาดกล่องเรียงแทน)
- ตัวเสริม: `@excalidraw/excalidraw` v0.18 — โหลดเฉพาะหน้าที่ใช้ (dynamic import) ไม่ถ่วงหน้าอื่น
- สิทธิ์ API เลือกตาม entity_type ฝั่ง server (map `PERM` ใน route): `design_sheet`→products.* · `creative_board`→tasks.* · `work_board`→products.* · `storage_plan`→ดู assets.view / แก้ assets.manage · อื่นๆ default products.* (เพิ่ม entity ใหม่ก็เติม map — client ระบุสิทธิ์เองไม่ได้ กันสวมสิทธิ์ข้ามโมดูล)
- ลบเอกสารแม่ ไม่ได้ลบกระดานอัตโนมัติ (entity_id เป็น text ไม่มี FK) — ยอมรับได้: กระดานเก่าไม่โผล่ที่ไหน
