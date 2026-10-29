-- 🖥️ เครื่องเลือกรับเฉพาะบางเรื่องได้ — เจ้าของ (2026-10-29): "เด้งที่เบราว์เซอร์" ให้เด้งเฉพาะป๊อปเตือนงาน
-- เปิดจากเมนูผู้ใช้ (คอม) = ['report.popup'] · เปิดจากแอปแจ้งเตือน /notify = null (ทุกเรื่องตามประเภทที่เปิดไว้)
-- ส่งทดสอบ (push.test) ผ่านเสมอ · ตัวกรองนี้ใช้ใน lib/push-server dispatchPush
alter table public.erp_push_subscriptions add column if not exists event_filter text[];
comment on column public.erp_push_subscriptions.event_filter is 'null = ทุกเรื่อง · ไม่ null = รับเฉพาะ event_type ในรายการ (เช่น {report.popup} จากสวิตช์เด้งที่เบราว์เซอร์ในเมนูผู้ใช้)';
