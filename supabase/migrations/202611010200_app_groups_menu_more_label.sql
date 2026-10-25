-- ชื่อปุ่มรวมเมนู ("เพิ่มเติม ▾") บนแถบเมนูของแอปเดี่ยว /app/<key>
-- ตั้งที่ ⚙️ ตั้งค่าแอป → แท็บ "จัดเรียง / ซ่อนเมนู" (components/app-settings-panel · กฎ lib/app-menu-layout)
-- null / ว่าง = ใช้ค่าเริ่มต้น "เพิ่มเติม" · เพิ่มช่องอย่างเดียว ไม่แตะข้อมูลเดิม
alter table public.erp_app_groups add column if not exists menu_more_label text;
