# โหมดเลือก + Shift เลือกเป็นช่วง (ของกลาง)

`components/select-mode` (`useSelectMode` · `SelectModeButton` · `SelectModeBar`) + กฎ pure `lib/range-select` (`clickSelect` · `selectAllVisible` · เทสต์ `lib/__tests__/range-select.test.ts`)

เจ้าของเลือกจาก widget 2026-11-23: "โหมดเลือก + Shift เลือกช่วง ในตารางกลาง" + ข้อเสนอ 1-5

## ทำอะไร
| วิธีกด | ผล |
|---|---|
| กดช่องติ๊ก | สลับตัวนั้น — **กดได้ทั้งช่อง** (สูงเต็มแถว) ไม่ต้องเล็งกล่องเล็ก |
| **Shift + กด** (ช่องติ๊ก หรือแถวตอนอยู่โหมดเลือก) | เลือกทั้งช่วงจากตัวที่กดล่าสุด ตามลำดับที่เห็นบนจอ (ข้ามกลุ่มที่พับ) · ตัวตั้งต้นไม่ได้ติ๊ก = **เอาติ๊กออกทั้งช่วง** (แบบ Gmail) · Shift ไม่ลากคลุมข้อความ |
| ปุ่ม **"เลือก"** ในแถบเครื่องมือ | เข้าโหมดเลือก — กดตรงไหนของแถว/การ์ดก็ติ๊ก (ไม่เปิดรายละเอียด) · แถบฟ้าบอกวิธี + เลือกทั้งหมด / ล้าง / เสร็จ |
| มือถือ/แท็บเล็ต **กดค้าง** ~0.45 วิ ที่แถว/การ์ด | เข้าโหมดเลือก + ติ๊กตัวนั้น (สั่นเบา ๆ) · เลื่อนนิ้ว = ยกเลิก ไม่ทับการเลื่อนจอ |
| Esc | ออกจากโหมดเลือก (ที่เลือกไว้ยังอยู่) |
| Ctrl+A (ในโหมดเลือก) | เลือกทั้งหมดที่เห็น (แป้นไทยก็ได้ — shortcutKey) · ไม่แย่งตอนพิมพ์ในช่องกรอก |

## มีให้ในตัวแล้ว
- **MiniTable** `selectable` — ตาราง + การ์ด (cardPick / การ์ดธรรมดา) · ปุ่ม "เลือก" อยู่แถบเครื่องมือ (ตารางที่ไม่เคยมีแถบเครื่องมือ จะมีแถวเล็ก ๆ ที่มีปุ่มนี้ · `hideToolbar` = ไม่มีปุ่ม แต่ Shift/กดค้างยังใช้ได้)
- **DataTable** (ตารางที่มีช่องติ๊ก = bulk actions / bulk edit / selectable) — โหมดตาราง · กฎเดิมยังอยู่: ติ๊กไว้แล้ว ≥1 แถว = กดแถวเป็นการติ๊ก · ลำดับแถวเก็บตอนวาด (จัดกลุ่ม/พับกลุ่มถูกต้อง) · มุมมองการ์ดของ DataTable ยังไม่มีช่องติ๊ก
- ไม่บันทึกอะไรเอง — หน้าเจ้าของถือชุดที่เลือก (MiniTable `selected/onSelectedChange` · DataTable rowSelection เดิม) · ออกจากโหมดไม่ล้างที่เลือก

## ใช้เองในรายการที่เขียนเอง
```tsx
const sm = useSelectMode({ order: keysOnScreen, selected, onChange: setSelected });
<SelectModeButton mode={sm.mode} onToggle={sm.toggle} />
{sm.mode && <SelectModeBar count={selected.size} total={keysOnScreen.length} onAll={sm.selectAll} onClear={() => setSelected(new Set())} onDone={sm.exit} />}
<div onClick={(e) => (sm.mode ? sm.pick(key, e) : openDetail())} {...sm.pressProps(key)}>
  <span onClick={(e) => { e.stopPropagation(); sm.pick(key, e); }}><input type="checkbox" checked={selected.has(key)} readOnly /></span>
</div>
```
- `order` = ลำดับที่เห็นบนจอ หรือฟังก์ชันคืนลำดับ (ตารางที่รู้ลำดับตอนวาดเท่านั้น เช่น DataTable)

## ห้าม
- เขียน shift-click / โหมดเลือก / กดค้างเลือกเองในหน้า — ใช้ตัวนี้
- ⚠️ DataTable: ตัวที่ช่องติ๊กเรียก (`sm.pick`) ต้องประกาศก่อน `withSelectCol` (เคยมีบทเรียน render TDZ)
