# MiniTable — ตารางเล็กกลาง

`components/mini-table/index.tsx`

ตารางย่อยกลางสำหรับใช้ในป๊อปอัป / แผงข้าง / แท็บ ที่ไม่ต้องหนักเท่า Universal DataTable
แต่ยังได้ **ค้นหา + เรียงลำดับ + จัดกลุ่ม + เลือกหลายแถว** มาให้ในตัวเสมอ

## ใช้เมื่อไหร่
- ตารางเล็ก ๆ ในป๊อปอัป/แผง/แท็บ (เช่น หน้า "ขอซื้อ" บนบอร์ดจ่ายงาน, รายการวัตถุดิบ, รายการย่อยในฟอร์ม)
- ต้องการ search / sort / group แบบเบา ๆ โดยไม่อยากตั้งค่า Field Registry / Saved Views

## ห้ามใช้เมื่อไหร่
- หน้า List หลักของโมดูล (ใช้ **Universal DataTable** `components/data-table` — มี Field Registry, Saved Views, Column Manager, Export, Permission ครบ)

## Props สำคัญ
| prop | ผล |
|---|---|
| `rows`, `columns`, `rowKey` | ข้อมูล + นิยามคอลัมน์ (บังคับ) |
| `searchText(row) => string` | ใส่แล้ว **มีช่องค้นหา** (ค้นจากข้อความที่คืน) |
| `searchValue` + `onSearchChange` | คุมคำค้นจากภายนอก — ใส่ค่าเดียวกันให้หลายตาราง = **พิมพ์ครั้งเดียวกรองทุกตาราง** (ใช้ที่บอร์ดจ่ายงาน: รอจ่าย + จ่ายแล้ว) · ไม่ส่ง = ตารางเก็บคำค้นของตัวเองเหมือนเดิม |
| `column.sortValue(row)` | คอลัมน์ไหนใส่ → **เรียงได้** — คลิกหัวคอลัมน์เพื่อเรียง/สลับทิศ (▲▼) หรือใช้เมนูเรียงในแถบเครื่องมือ (ทำงานคู่กัน) |
| `sortKey` + `sortDir` + `onSortChange` | คุมการเรียงจากภายนอก — ใช้เมื่อลำดับต้องตรงกับที่อื่น (เช่น ใบพิมพ์) หรือต้องจำค่ารายคน (ใช้ที่ตารางสินค้าที่ขาย `components/sold-products-table`) · ไม่ส่ง = ตารางเก็บการเรียงเองเหมือนเดิม |
| `groupBy(row) => string` | ใส่แล้ว **มีปุ่มจัดกลุ่ม** + หัวกลุ่มติ๊กเลือกทั้งกลุ่ม |
| `groupOrder(name) => number` | (ไม่บังคับ) ลำดับกลุ่ม — เลขน้อยขึ้นก่อน · ไม่ใส่ = เรียงตามชื่อกลุ่ม (เช่น SKU การตลาดเรียงตามลำดับป้าย) |
| `selectable` + `selected` + `onSelectedChange` | เลือกหลายแถว (controlled) |
| `title`, `actions`, `footnote`, `emptyText`, `maxHeightClass` | ส่วนหัว/ท้าย/สถานะว่าง |
| `resizable` | เปิดให้ **ลากขอบหัวคอลัมน์ปรับความกว้าง** ได้ (opt-in — ไม่ใส่ = เหมือนเดิม) · คอลัมน์ที่ลากแล้วกลายเป็น px คอลัมน์อื่นยังแบ่งพื้นที่เหลือ |
| `storageKey` | ใส่คู่กับ `resizable` เพื่อ **จำความกว้างไว้ในเครื่อง** (localStorage) · มีลิงก์ "รีเซ็ตความกว้าง" ในแถบเครื่องมือ |
| `widths` + `onWidthsChange` | คุมความกว้างจากภายนอก (เช่น เก็บในมุมมอง) — ไม่ใช้ localStorage · ระหว่างลากเก็บในตารางเอง ปล่อยเมาส์ค่อยส่งออก |
| `fitContent` | พอดีเนื้อหา — คอลัมน์ `fr` ใช้ความกว้างขั้นต่ำ ไม่ยืดเต็มจอ |
| `fill` + `stickyCols` | เต็มกล่องแม่ เลื่อนในตัว หัวตารางติดบน + ล็อกคอลัมน์ซ้าย — **ล็อกจริงเฉพาะตอนตารางล้นจอ** (ไม่ล้น = ไม่สร้างช่อง sticky หลายร้อยชิ้น) |
| `lazyRows` | ตารางยาวหลายร้อยแถว: แถวนอกจอไม่ถูกวาด (CSS `content-visibility:auto`) → เลื่อนลื่น · ใช้คู่ `fill`/`stickyCols` · ⚠️ ในช่องห้ามมี popup absolute/fixed ที่ไม่ผ่าน portal (โดนตัด) — HoverImage/FloatingDropdown/ERPModal ผ่าน portal แล้วใช้ได้ |
| `onScrollTop(top, el)` | เลื่อนในตาราง (fill) — ไว้ซ่อน/โชว์ของเหนือตาราง · ใช้ ref/CSS ไม่ใช่ state (กันทั้งหน้าวาดใหม่ระหว่างเลื่อน) |
| `layout="cards"` + `renderCard` (+ `cardGrid`) | 1 แถว = 1 การ์ด · ค้นหา/เรียง/จัดกลุ่ม/เลือกได้เหมือนตาราง |
| `cardPick` | การ์ดแบบหยิบเลือก (คู่ `selectable`): **กดทั้งใบ = ติ๊ก** · ช่องติ๊กลอยมุมซ้ายบน · เนื้อการ์ดชิดขอบ (รูปเต็มใบ) — ใช้ที่ป๊อปเลือกสินค้า/SKU ของเว็บ |
| `extraSorts=[{ key, label, compare }]` | เรียงแบบพิเศษที่ไม่ผูกคอลัมน์ (เช่น "เลือกล่าสุดก่อน") — อยู่บนสุดของเมนูเรียง · ทางเดียว ไม่มีปุ่มสลับทิศ · ใช้คู่ `sortKey` ถ้าอยากให้เป็นค่าเริ่ม |
| `columnMenu={{ onMove, onHide, canHide }}` | ปุ่ม ⋮ ที่หัวคอลัมน์ (โผล่ตอนชี้ · iPad โชว์ตลอด): เรียงน้อย→มาก/มาก→น้อย/เลิกเรียง · ย้ายซ้าย/ขวา + ซ่อน (เมื่อส่งตัวจัดการ — หน้าเจ้าของเปลี่ยน columns เอง) · **พอดีเนื้อหา** (วัดทุกช่องแบบ max-content) + คืนความกว้างเดิม (เมื่อ `resizable`) · ทุกช่องมี `data-col` |

ป๊อปเลือกหลายรายการของ **จัดการ Website** ใช้ตัวห่อกลาง `components/website-pick-modal.tsx` (ERPModal + MiniTable + สลับ ☰ ตาราง / ▦ การ์ด จำต่อคน + เรียงเลือกล่าสุดก่อน) — อย่าทำป๊อปเลือกสินค้าของเว็บแยกเอง

คอลัมน์: `{ key, header, cell:(row)=>node, align?, width?, sortValue?, sortLabel? }`
`width` = grid track (`"6rem"`, `"1fr"`, `"1.5fr"`).
เมื่อ `resizable` คอลัมน์จะ `overflow-hidden` (เนื้อหายาวถูกตัด ไม่ล้นทับคอลัมน์อื่น) — cell ที่อยากได้ "…" ให้หุ้มด้วย `className="block truncate"`.

## ตัวอย่าง
ดูตัวจริงที่ `app/master/work-board/purchase-needs.tsx` (consumer ตัวแรก)

```tsx
<MiniTable
  rows={rows} rowKey={(r) => r.id}
  columns={[
    { key:"name", header:"ชื่อ", width:"1fr", sortValue:(r)=>r.name, sortLabel:"ชื่อ", cell:(r)=>r.name },
    { key:"qty", header:"จำนวน", width:"6rem", align:"right", sortValue:(r)=>r.qty, cell:(r)=>r.qty },
  ]}
  searchText={(r) => `${r.code} ${r.name}`}
  groupBy={(r) => r.type} groupLabel="จัดกลุ่มตามประเภท"
  selectable selected={sel} onSelectedChange={setSel}
/>
```

## หมายเหตุ
- เลือกแถวเป็นแบบ controlled — เจ้าของหน้าถือ state `Set<string>` เอง (เพื่อเอาไปทำ bulk action ต่อ)
- ยังไม่มี: pagination, inline edit, export → ถ้าต้องการให้ใช้ Universal DataTable แทน
