# 🧰 ชุดกระดานแก้งาน (board-kit) — ของกลาง

`components/board-kit` + `lib/board-kit.ts` · เพิ่ม 2026-11-26 (เจ้าของขอ "ปุ่มขยายกระดาน + กล่องเครื่องมือใช้สะดวก" · เลือกแบบ A)

> ⚠️ **2026-11-28 เจ้าของสั่ง "เอาระบบล็อกกระดานออกทั้งระบบ"** — ลบ `useBoardLock` / `BoardLockButton` / `BoardLockHint` / คีย์ L / ล็อกเข้มออกแล้ว
> ลูกกลิ้ง: เจ้าของเลือก **"เลื่อนหน้าเว็บ"** — หมุนเฉย ๆ = เลื่อนหน้าเว็บ (กรอบที่ซูมจนล้น = เลื่อนภาพในกรอบ) · **Ctrl/⌘ + ลูกกลิ้ง = ซูม** · ปุ่ม − / + ยังซูมได้ · แก้งานได้ทันทีไม่ต้องปลดอะไร
> ห้ามใส่ระบบล็อกกลับเอง

## ใช้ทำอะไร
| ชิ้น | ทำอะไร |
|---|---|
| `BoardToolbox` | กล่องเครื่องมือลอยซ้ายบน (แบบ A): ไอคอน + ชื่อ + ปุ่มลัด · ลากหัวกล่องย้าย · ปุ่ม ˄ ย่อเหลือไอคอน · จำตำแหน่ง/ย่อต่อคน · มือถือ = แถบล่างของกระดาน |
| `BoardShortcuts` | ป๊อปปุ่มลัดทั้งหมด (กด **?** หรือปุ่ม "ปุ่มลัด ?" ในกล่อง) |
| `BoardFullscreenButton` | ปุ่มขยายเต็มจอ ขนาดเท่าปุ่มซูม — ใช้คู่ `useFullscreenStage(key, { phoneAlways: false })` (ของกลางเดิม FullscreenStage · **F = ขยาย** · Esc = ออก) |
| `wheelAction(ctrl)` (lib) | `"zoom"` เมื่อกด Ctrl/⌘ · `"pass"` = ไม่ต้องทำอะไร ปล่อยเบราว์เซอร์เลื่อนเอง |
| `useCanvasZoom(box, initial, active)` (`components/block-print/use-zoom.ts`) | ซูมกล่องที่เลื่อนดูได้ด้วย Ctrl+ลูกกลิ้ง / ถ่าง 2 นิ้ว / ปุ่ม |

## วิธีใช้
```tsx
const fs = useFullscreenStage("my_board_fullscreen", { phoneAlways: false });
const groups: BoardToolGroup[] = [
  { key: "edit", label: "แก้งาน", tools: [
    { key: "select", icon: "i:pointer", label: "เลือก", hotkey: "V", active: tool === "select", onClick: () => setTool("select") },
    { key: "draw", icon: "i:line", label: "วาดเส้น", hotkey: "D", active: tool === "draw", onClick: () => setTool("draw") },
  ] },
  { key: "hist", label: "ประวัติ", tools: [
    { key: "undo", icon: "i:arrow-back-up", label: "ย้อนกลับ", hint: "Ctrl+Z", disabled: !canUndo, onClick: undo },
  ] },
];
<FullscreenStage fs={fs}>
  <div className="relative">   {/* กรอบกระดาน */}
    <MyCanvas onWheel={(e) => { if (wheelAction(e.ctrlKey || e.metaKey) === "pass") return; e.preventDefault(); /* ซูม */ }} />
    <div className="absolute right-2 top-2 flex flex-col gap-1">…ปุ่มซูม… <BoardFullscreenButton on={fs.on} onToggle={fs.toggle} /></div>
    <BoardToolbox prefKey="my_toolbox" groups={groups} />
  </div>
</FullscreenStage>
```
- `hotkey` = ตัวอักษรเดียว ชุดกลางผูกให้ (ใช้ตำแหน่งปุ่ม → แป้นไทยกดได้ · ไม่ทำงานตอนพิมพ์ในช่อง) — **หน้าห้ามผูกปุ่มเดียวกันซ้ำ** (เคยหมุน 2 รอบ) · **ห้ามใช้ F** (F = เต็มจอของ FullscreenStage) · `hint` = ปุ่มลัดที่หน้าผูกเอง แค่โชว์ (เช่น Ctrl+Z)
- ล้อเมาส์ต้องผูก `passive: false` และ **ห้าม preventDefault ตอน "pass"** (ไม่งั้นหน้าเว็บเลื่อนไม่ได้)

## ห้ามใช้เมื่อไหร่
- กระดานวาด Excalidraw (`CanvasSketch`) / ผัง `FlowchartBoard` — มีแถบเครื่องมือของตัวเอง
- ดูรูปซูมเฉย ๆ ไม่มีเครื่องมือ → `ZoomBox`

## สิทธิ์ / ประวัติ
- เก็บแค่ค่าตั้งส่วนตัว (ตำแหน่งกล่อง · เต็มจอ ใน user_ui_prefs) ไม่ใช่ข้อมูลธุรกิจ — ไม่ต้องลง audit log
- ย้อนกลับ/ทำซ้ำเป็นของหน้าที่ใช้ (ส่งเป็นเครื่องมือในกลุ่ม "ประวัติ")

## ใช้อยู่ที่
- ไฟล์ปัก `/master/embroidery/<id>` (`components/embroidery/editor.tsx` + `stitch-preview.tsx` prop `controls`/children) — `embroidery_toolbox` · `embroidery_board_fullscreen`
- บล็อกพิมพ์ `/master/block-print/<id>` — หน้าเลือกชิ้น `grouper.tsx` (`block_print_group_toolbox`) · หน้าจัดวาง `layout-editor.tsx` (`block_print_layout_toolbox`) · เต็มจอ `block_print_board_fullscreen`
- วางแบบบนผ้าลาย `/master/fabric-lay/plans/<id>` — `fabric_lay_toolbox` (หมุน R · พลิก M · เอาออก · ย้อน/ทำซ้ำ) · มือถือ: ไม่ได้เลือกชิ้น = นิ้วเลื่อนหน้าเว็บ · เลือกชิ้นแล้ว = นิ้วลากชิ้น
- หน้าต่างวาดชิ้น `ShapeEditor` — ใช้แค่ `wheelAction` (ลูกกลิ้ง = เลื่อนหน้าเว็บ · Ctrl = ซูม) · แถบเครื่องมือ/เต็มจอ/ย้อนกลับ ของตัวเอง (lib/pattern-tools)

## ไม่ใส่ (เจ้าของตัดสินแล้ว)
- ป๊อปแกะจากรูป (`pattern-studio/photo-modal`) — คงแบบเดิม: ลูกกลิ้งซูมทันที (เจ้าของสั่ง 2026-11-27 "คงแบบเดิม")

## ข้อจำกัด
- กล่องเครื่องมือจำตำแหน่งเป็น px จากมุมซ้ายบนของกระดาน — กระดานเล็กลงจะถูกดันกลับเข้าในกรอบเอง
- ค่า `*_board_lock` ที่เคยจำไว้ใน user_ui_prefs ยังค้างอยู่ (ไม่มีใครอ่านแล้ว ไม่กระทบ)
