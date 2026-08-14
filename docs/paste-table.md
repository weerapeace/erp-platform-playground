# paste-table — อ่านตารางที่วางมาจาก Excel (ของกลาง)

`lib/paste-table.ts`

## ใช้ทำอะไร

ทุกที่ที่มีช่อง **"วางจาก Excel"** ให้ใช้ตัวนี้ — ห้ามเขียน `split("\t")` เองซ้ำอีก
(ก่อนหน้านี้เขียนซ้ำอยู่ 2 ที่: ลงรายการสินค้า `components/line-import` และนำเข้า Statement OD `app/od-facilities/import-modal.tsx` — ย้ายมาใช้ตัวนี้แล้วทั้งคู่)

รวมเรื่องน่าปวดหัวไว้ให้แล้ว:

- Excel คัดลอกมาเป็น **TAB** · บาง export เป็น **จุลภาค** → รองรับทั้งคู่
- ตัวเลขมีลูกน้ำ / มี ฿ / วงเล็บแบบบัญชี `(1,234)` = ติดลบ
- วันที่ที่คนไทยพิมพ์หลายแบบ รวม **พ.ศ.** และเลขซีเรียลของ Excel

## ฟังก์ชัน

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `parsePastedTable(text)` | ข้อความที่วางมา → `string[][]` (ตัดบรรทัดว่าง) |
| `dropHeaderRow(grid, /regex/)` | ตัดแถวหัวตารางออกถ้าผู้ใช้คัดลอกหัวมาด้วย |
| `looksLikeHeaderRow(cells, /regex/)` | เช็กว่าแถวนี้เป็นหัวตารางไหม |
| `parseNumberCell(v)` | `"1,234.50"` / `"฿1,234"` / `"(500)"` → `1234.5` / `1234` / `-500` · อ่านไม่ออก → `0` |
| `isNumericCell(v)` | ช่องนี้เป็นตัวเลขจริงไหม (แยก "ว่าง" ออกจาก "ศูนย์") |
| `parseDateCell(v)` | → `"YYYY-MM-DD"` · อ่านไม่ออก → `""` |
| `isDateCell(v)` | ช่องนี้อ่านเป็นวันที่ได้ไหม (ใช้เดาว่าคอลัมน์ไหนเป็นวันที่) |

### รูปแบบวันที่ที่รองรับ

```txt
2026-09-05        ISO
05/09/2026        วัน/เดือน/ปี
5-9-2569          พ.ศ. (ปีเกิน 2400 → ลบ 543 ให้เอง)
5.9.69            ปี 2 หลัก → 20xx
5 ก.ย. 2569       เดือนไทยแบบย่อ
5 Sep 2026        เดือนอังกฤษแบบย่อ
46266             เลขซีเรียลของ Excel
```

## ตัวอย่าง

```ts
import { parsePastedTable, dropHeaderRow, parseNumberCell, parseDateCell, isDateCell } from "@/lib/paste-table";

const grid = dropHeaderRow(parsePastedTable(text), /งวด|วันที่|เงินต้น/i);
for (const cells of grid) {
  // เดาว่ามีคอลัมน์ลำดับนำหน้าไหม
  const o = !isDateCell(cells[0]) && isDateCell(cells[1]) ? 1 : 0;
  const due = parseDateCell(cells[o]);
  if (!due) continue;                       // อ่านวันที่ไม่ได้ = ข้ามบรรทัด
  const amount = parseNumberCell(cells[o + 1]);
}
```

## ใครใช้อยู่

| ที่ | ใช้ทำอะไร |
|---|---|
| `components/line-import` | ลงรายการสินค้าในใบขาย/ใบสั่งซื้อ/ใบเสนอราคา |
| `app/od-facilities/import-modal.tsx` | นำเข้า Statement OD |
| `app/loan-contracts/installments-modal.tsx` | วางตารางผ่อนของธนาคารทั้งใบ |

## ข้อควรระวัง

- `parseNumberCell` คืน `0` เมื่ออ่านไม่ออก — ถ้าต้องแยก "ว่าง" ออกจาก "ศูนย์" ให้เช็ก `isNumericCell` ก่อน
- ตัวนี้ **ไม่อ่านไฟล์ .xlsx** (อ่านเฉพาะข้อความที่วางมา) — การอ่านไฟล์ยังใช้ไลบรารี `xlsx` แบบ dynamic import เหมือนเดิม เพราะเป็นไลบรารีหนัก
