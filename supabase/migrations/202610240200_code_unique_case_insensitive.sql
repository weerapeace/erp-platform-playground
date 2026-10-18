-- 🔤 รหัสสินค้าห้ามซ้ำแบบ "ไม่สนตัวเล็ก/ใหญ่ + ช่องว่างหัวท้าย" (เจ้าของอนุญาต 2026-10-18)
--
-- เดิม: unique(code) WHERE is_active = true → "mgn194-01" กับ "MGN194-01" บันทึกได้ทั้งคู่ (ช่องโหว่)
-- ใหม่: เพิ่ม unique(upper(btrim(code))) WHERE is_active = true — กันทุกทางที่สร้างรหัส (ฟอร์ม/ตาราง SKU ลูก/Wizard/คัดลอก/นำเข้า)
-- ยังคงกติกาเดิม: รหัสในถังขยะ (is_active=false) ไม่จองรหัส · ตัวพิมพ์เล็กยังบันทึกได้ (หน้าจอแค่เตือน)
-- ตรวจข้อมูลจริงก่อนสร้าง: Parent 0 คู่ · SKU 0 คู่ ที่ชนกันแบบนี้
-- ข้อความ error จาก index นี้: Key (upper(btrim(code)))=(…) → parseDupError แกะเป็นช่อง "code" ให้หน้าจอชี้ช่องได้

create unique index if not exists parent_skus_v2_code_ci_active_key
  on public.parent_skus_v2 (upper(btrim(code))) where is_active = true;

create unique index if not exists skus_v2_code_ci_active_key
  on public.skus_v2 (upper(btrim(code))) where is_active = true;
