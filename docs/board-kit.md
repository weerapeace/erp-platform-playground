# 🔒 ชุดกระดานแก้งาน (board-kit) — ของกลาง

`components/board-kit` + `lib/board-kit.ts` · เพิ่ม 2026-11-26 (เจ้าของขอ "lock กระดานไว้ + ปุ่มขยายกระดาน + กล่องเครื่องมือใช้สะดวก" · เลือกแบบ A + ข้อ 1-4)

## ใช้ทำอะไร
| ชิ้น | ทำอะไร |
|---|---|
| `useBoardLock(prefKey)` | ล็อกกระดาน · **ค่าเริ่มต้นล็อก** · จำต่อคน (useUserPref) · คีย์ **L** สลับ |
| `BoardLockButton` | ปุ่มกุญแจ ขนาดเท่าปุ่มซูม (วางในแถบซูมของกระดาน) |
| `BoardLockHint` | ฟองเตือนกลางกระดาน ตอนหมุนลูกกลิ้ง/กดแก้ขณะล็อก + ปุ่ม "ปลดล็อก" |
| `BoardToolbox` | กล่องเครื่องมือลอยซ้ายบน (แบบ A): ไอคอน + ชื่อ + ปุ่มลัด · ลากหัวกล่องย้าย · ปุ่ม ˄ ย่อเหลือไอคอน · จำตำแหน่ง/ย่อต่อคน · มือถือ = แถบล่างของกระดาน |
| `BoardShortcuts` | ป๊อปปุ่มลัดทั้งหมด (กด **?** หรือปุ่ม "ปุ่มลัด ?" ในกล่อง) |
| `BoardFullscreenButton` | ปุ่มขยายเต็มจอ ขนาดเท่าปุ่มซูม — ใช้คู่ `useFullscreenStage(key, { phoneAlways: false })` (ของกลางเดิม FullscreenStage · F = ขยาย · Esc = ออก) |

## ล็อกทำอะไรบ้าง
- **ล็อกอยู่**: หมุนลูกกลิ้งบนกระดาน = เลื่อนหน้าเว็บตามปกติ (กระดานไม่ซูมเอง) · **Ctrl/⌘ + ลูกกลิ้ง = ซูม** · ลากเลื่อนภาพ/คลิกเลือกชิ้นยังได้
- **ล็อกเข้ม** (เจ้าของเลือกข้อ 4): เครื่องมือที่ `editing: true` กดไม่ได้ → ฟอง "ปลดล็อกก่อนแก้งาน" · หน้าต้องปิดการลาก/แก้บนกระดานเองเมื่อ `lock.locked` (เช่น ไฟล์ปักปิดลากทิศ/แก้จุด)
- **ปลดล็อก**: ลูกกลิ้งเฉย ๆ = ซูม (หรือเลื่อนภาพ ตามกระดาน — `wheelAction(locked, ctrl, wheelZooms)`) · แก้งานได้ทุกเครื่องมือ
- มือถือ: ล็อก = นิ้วเดียวเลื่อนหน้าเว็บได้ (`touch-action: pan-x pan-y`) · ปลด = นิ้วเลื่อน/ถ่างซูมกระดาน

## วิธีใช้
```tsx
const lock = useBoardLock("my_board_lock");
const fs = useFullscreenStage("my_board_fullscreen", { phoneAlways: false });
const groups: BoardToolGroup[] = [
  { key: "edit", label: "แก้งาน", tools: [
    { key: "select", icon: "i:pointer", label: "เลือก", hotkey: "V", active: tool === "select", onClick: () => setTool("select") },
    { key: "draw", icon: "i:line", label: "วาดเส้น", hotkey: "D", editing: true, active: tool === "draw", onClick: () => setTool("draw") },
  ] },
  { key: "hist", label: "ประวัติ", tools: [
    { key: "undo", icon: "i:arrow-back-up", label: "ย้อนกลับ", hint: "Ctrl+Z", disabled: !canUndo, onClick: undo },
  ] },
];
<FullscreenStage fs={fs}>
  <div className="relative">   {/* กรอบกระดาน */}
    <MyCanvas onWheel={(e) => { const a = wheelAction(lock.locked, e.ctrlKey || e.metaKey); if (a === "pass") return lock.nudge(); … }} />
    <div className="absolute right-2 top-2 flex flex-col gap-1">…ปุ่มซูม… <BoardLockButton lock={lock} /><BoardFullscreenButton on={fs.on} onToggle={fs.toggle} /></div>
    <BoardToolbox prefKey="my_toolbox" lock={lock} groups={groups} />
    <BoardLockHint lock={lock} />
  </div>
</FullscreenStage>
```
- `hotkey` = ตัวอักษรเดียว ชุดกลางผูกให้ (ใช้ตำแหน่งปุ่ม → แป้นไทยกดได้ · ไม่ทำงานตอนพิมพ์ในช่อง) · `hint` = ปุ่มลัดที่หน้าผูกเอง แค่โชว์ (เช่น Ctrl+Z)
- ล้อเมาส์ต้องผูก `passive: false` และ **ห้าม preventDefault ตอน "pass"** (ไม่งั้นหน้าเว็บเลื่อนไม่ได้)

## ห้ามใช้เมื่อไหร่
- กระดานวาด Excalidraw (`CanvasSketch`) / ผัง `FlowchartBoard` — มีแถบเครื่องมือของตัวเอง
- ดูรูปซูมเฉย ๆ ไม่มีเครื่องมือ → `ZoomBox`

## สิทธิ์ / ประวัติ
- เก็บแค่ค่าตั้งส่วนตัว (ล็อก · ตำแหน่งกล่อง · เต็มจอ ใน user_ui_prefs) ไม่ใช่ข้อมูลธุรกิจ — ไม่ต้องลง audit log
- ย้อนกลับ/ทำซ้ำเป็นของหน้าที่ใช้ (ส่งเป็นเครื่องมือในกลุ่ม "ประวัติ")

## ใช้อยู่ที่
- ไฟล์ปัก `/master/embroidery/<id>` (`components/embroidery/editor.tsx` + `stitch-preview.tsx` prop `locked`/`controls`/children) — key `embroidery_board_lock` · `embroidery_toolbox` · `embroidery_board_fullscreen` · เพิ่มทำซ้ำ (Ctrl+Y)

## ยังไม่ได้ใส่ (รอบถัดไป)
- บล็อกพิมพ์ (`components/block-print` — ซูมด้วย Ctrl อยู่แล้ว มีปุ่มกระจาย) · หน้าต่างวาดชิ้น `ShapeEditor` · ป๊อปแกะจากรูป (`pattern-studio/photo-modal` — ลูกกลิ้งซูมทันที ตามที่เคยเลือกไว้)

## ข้อจำกัด
- กล่องเครื่องมือจำตำแหน่งเป็น px จากมุมซ้ายบนของกระดาน — กระดานเล็กลงจะถูกดันกลับเข้าในกรอบเอง
