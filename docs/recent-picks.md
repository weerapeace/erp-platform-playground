# Recent Picks — "เคยใช้ล่าสุด" ของกลางสำหรับทุก Picker/Dropdown

`lib/recent-picks.ts`

## ใช้ทำอะไร

จำ "ของที่เพิ่งเลือกไป" ของช่องเลือกข้อมูลทุกตัว แล้วเอาขึ้นมาโชว์บนสุดของ dropdown
ตอนที่ยังไม่พิมพ์ค้นหา — ผู้ใช้ที่สั่งซื้อจากร้านเดิมซ้ำ ๆ ไม่ต้องเลื่อนหาในรายการยาว ๆ ทุกครั้ง

เก็บไว้ในเครื่องผู้ใช้ (localStorage) — เป็น "ความสะดวกส่วนตัว" ของแต่ละคน/แต่ละเครื่อง
ไม่ใช่ข้อมูลระบบ จึงไม่ต้องมี permission / audit log

ก่อนหน้านี้แต่ละ picker เขียนโค้ดจำเองคนละชุด (5 ที่) และ dropdown บางตัวไม่มีเลย
ตอนนี้เหลือที่เดียว — แก้กฎ (เก็บกี่ตัว / เรียงยังไง) ที่นี่ ทุก picker เปลี่ยนตาม

## มีอะไรให้ใช้

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `useRecentPicks<V>(key, open)` | hook พร้อมใช้ — คืน `{ recent, favs, remember, toggle, forget }` (อ่านค่าใหม่ทุกครั้งที่ dropdown เปิด) |
| `loadRecent<V>(key)` / `pushRecent(key, item, limit?)` | อ่าน / จำ แบบไม่ผ่าน hook (เก็บ 6 ล่าสุด) |
| `loadFav<V>(key)` / `toggleFav(key, item)` / `isFav(key, id)` | ปักหมุดไว้บนสุด (เก็บ 12) |
| `removeRecent(key, id)` / `clearRecent(key)` | ลบออกจากประวัติ (เช่นของถูกลบไปแล้ว) |
| `RECENT_KEYS` | ทะเบียน key กลาง — `products` · `suppliers` · `skus` · `parentSkus` · `materials` |

**ใช้ key เดียวกัน = แชร์ประวัติกัน** เช่นเลือกร้านจากหน้าสั่งซื้อ แล้วไปเปิด `SupplierPicker`
ที่หน้าอื่น ก็เห็นร้านเดิมอยู่บนสุดเหมือนกัน

## เสียบไว้ให้แล้วที่ไหนบ้าง (ไม่ต้องทำเอง)

| Picker | key |
|---|---|
| `SupplierPicker` (`components/supplier-picker`) — ช่องเลือกร้านในหน้าสั่งซื้อ | `suppliers` |
| `SupplierPicker` (`components/pickers`) | `suppliers` |
| `ProductPicker` | `products` |
| `SkuPicker` | `skus` |
| `ParentSkuPicker` | `parentSkus` |
| `MaterialPicker` / `ComponentPicker` + ตารางสูตร BOM | `materials` |
| Master Picker Factory (ลูกค้า พนักงาน คลัง แผนก หน่วยนับ ภาษี ผู้ใช้) | `storageKey` ของแต่ละตัว + ปักหมุด ★ |

## ใส่ใน picker ตัวใหม่ยังไง

```tsx
const { recent, remember } = useRecentPicks<MyItem>(RECENT_KEYS.suppliers, open);

// ตอนผู้ใช้เลือก
const pick = (item: MyItem) => { remember(item); onChange(item); setOpen(false); };

// ตอนยังไม่พิมพ์ค้นหา → โชว์บนสุด
{!query.trim() && recent.length > 0 && (
  <>
    <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400">⏱ เคยใช้ล่าสุด</div>
    {recent.map(...)}
  </>
)}
```

## ข้อควรระวัง

- **กรองของที่ถูกลบทิ้งก่อนโชว์** — ประวัติเป็น snapshot เก่า ของอาจถูกลบ/เปลี่ยนชื่อไปแล้ว
  ถ้ามีรายการเต็มอยู่ในมือ (เช่น `SupplierPicker` ที่รับ `suppliers` มาทั้งชุด) ให้ map กลับไปหา
  ตัวจริงในรายการก่อน แล้วค่อยแสดง — ตัวที่หาไม่เจอให้ตัดทิ้ง
- **อย่าโชว์ซ้ำ** — ตัดรายการที่อยู่ในกลุ่ม "เคยใช้ล่าสุด" ออกจากรายการด้านล่าง
- **เป็นข้อมูลต่อเครื่อง** ล้าง cache/เปลี่ยนเครื่อง = เริ่มนับใหม่ (เป็นเรื่องปกติ ไม่ใช่บั๊ก)
