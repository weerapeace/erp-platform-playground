# ใบงานออกแบบ — แท็บ 📐 รายละเอียดงาน

เจ้าของขอ 2026-11-05: เลือกรูปที่มี/เพิ่มรูป → วาด (สี่เหลี่ยม · วงกลม · ข้อความ · เส้น) + **หมุดเพิ่ม SKU วัตถุดิบ** + สรุปวัตถุดิบ + ตารางสี

## รอบ 1 (ทำแล้ว)

- แท็บใหม่ถัดจาก "ข้อมูลงาน" · โค้ด `components/design-sheet-detail/spec-tab.tsx` (โหลดแบบ dynamic ตอนเปิดแท็บ · เปิดแล้วคงไว้ สลับแท็บไม่ทิ้งที่แก้)
- รูป = หลายหน้า เลือกจากรูปทุกแหล่งในใบงาน (`/api/design-sheets/[id]/images`) หรืออัปโหลดผ่าน `ImageManager` กลาง (รูปเข้าแกลเลอรีใบงานด้วย)
- วาดบนรูป = ของกลาง `ImageMarkup` (ดู `docs/image-markup.md`)
- หมุด = ส่วนประกอบ (เช่น ตัวกระเป๋า) + SKU วัตถุดิบ (`ComponentPicker` กลาง) + จำนวน/หน่วย/หมายเหตุ · เลขหมุดเรียงทั้งใบ · หมุดส้ม = ยังไม่เลือก SKU
- สรุปวัตถุดิบ: รวมหมุดที่ใช้ SKU เดียวกันทุกหน้า → "ใช้ที่ #1 #3" + จำนวนรวมแยกตามหน่วย
- ย้อนกลับได้ 50 ขั้น · ปุ่ม 💾 บันทึกรายละเอียดงาน · ปิดป๊อปตอนมีแก้ค้าง = เตือน (บันทึกแล้วปิด รวมแท็บนี้ด้วย)

## ข้อมูล

- `design_sheet_spec_pages` (sheet_id, title, image_key, image_url, image_w/h, shapes jsonb, sort_order)
- `design_sheet_spec_pins` (sheet_id, page_id, no, x/y %, part_name, sku_id→skus_v2 on delete set null, sku_code/sku_name snapshot, qty, uom, note)
- RLS เปิดแบบไม่มี policy (เหมือนตารางใบงานอื่น) — อ่าน/เขียนผ่าน API `GET/PUT /api/design-sheets/[id]/spec` เท่านั้น (products.view / products.edit · audit `spec_update`)
- PUT = บันทึกทั้งชุด (ลบหน้าเดิม → หมุดหายตาม cascade → insert ใหม่) แบบเดียวกับบรรทัดตีราคา
- หา "SKU นี้ใช้ในใบงานไหน" ได้จาก `design_sheet_spec_pins.sku_id` (มี index)

## รอบถัดไป

- รอบ 2: ตารางสี (ส่วนประกอบ × สีของรุ่น) เลือกสีจากแผงผ้า (`sku_swatches`) / SKU / ดูดสีจากรูป (`ImageEyedropper`)
- รอบ 3: สรุปวัตถุดิบ → ส่งไปแท็บตีราคา / สร้างสูตร BOM · ใบสั่งตัวอย่างพิมพ์รูป+หมุด+ตาราง
