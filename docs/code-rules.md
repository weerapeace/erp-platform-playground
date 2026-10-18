# 🔤 กฎรหัสสินค้า (Code) — Parent SKU / SKU

## ใช้ทำอะไร
- **ซ้ำ = ห้าม** โดยไม่สนตัวเล็ก/ใหญ่และช่องว่างหัวท้าย ("mgn194-01" ซ้ำกับ "MGN194-01")
- **พิมพ์เล็ก / ช่องว่างหัวท้าย = เตือน** ยังบันทึกได้ (มีรหัสวัตถุดิบที่ตั้งใจใช้ตัวเล็ก เช่น Bag-1) + ปุ่ม "เปลี่ยนเป็น …" แก้ 1 คลิก

## ชั้นที่กัน
1. **DB (กันจริงทุกทาง):** `unique(upper(btrim(code))) WHERE is_active = true` ทั้ง `parent_skus_v2` / `skus_v2` (migration `202610240200_code_unique_case_insensitive`) — ถังขยะไม่จองรหัสเหมือนเดิม
2. **เช็กสดตอนพิมพ์:** `GET /api/master-v2/<entity>/check-code?code=&exclude_id=` (products.view) → `{ duplicate, warnings }`
3. **หน้าจอ:** `components/code-check-hint` (`useCodeCheck` + `CodeCheckMessages`)
   - ตัวแก้สินค้ากลาง (MasterCRUD) ช่อง `code` ของ moduleKey ใน `CODE_RULE_MODULES` — ซ้ำ = กันกดบันทึก + "ดูตัวที่ซ้ำ"
   - แถวเพิ่ม SKU ในตารางลูก (relation-multi) — ซ้ำ = ปุ่มเพิ่มกดไม่ได้ · ปุ่ม 🔢 ไล่เลขนับแบบไม่สนตัวพิมพ์
4. `parseDupError` แกะ error ของ index แบบ expression (`Key (upper(btrim(code)))=(…)`) เป็นช่อง `code`

## กฎกลาง
`lib/code-rules.ts` (pure + test): `codeWarnings` · `normalizeCode` · `sameCode` · `CODE_RULE_TABLES` / `CODE_RULE_MODULES`
เพิ่มตารางอื่น = ใส่ชื่อในรายการ + สร้าง index แบบเดียวกันที่ DB

## ข้อจำกัด
- SKU Wizard / คัดลอก / นำเข้า ยังไม่มีป้ายเตือนพิมพ์เล็กบนหน้าจอ (แต่ DB กันซ้ำแล้ว)
