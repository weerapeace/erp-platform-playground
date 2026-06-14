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
| `column.sortValue(row)` | คอลัมน์ไหนใส่ → **เรียงได้** (มีเมนูเรียง + ปุ่มสลับทิศ) |
| `groupBy(row) => string` | ใส่แล้ว **มีปุ่มจัดกลุ่ม** + หัวกลุ่มติ๊กเลือกทั้งกลุ่ม |
| `selectable` + `selected` + `onSelectedChange` | เลือกหลายแถว (controlled) |
| `title`, `actions`, `footnote`, `emptyText`, `maxHeightClass` | ส่วนหัว/ท้าย/สถานะว่าง |

คอลัมน์: `{ key, header, cell:(row)=>node, align?, width?, sortValue?, sortLabel? }`
`width` = grid track (`"6rem"`, `"1fr"`, `"1.5fr"`).

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
