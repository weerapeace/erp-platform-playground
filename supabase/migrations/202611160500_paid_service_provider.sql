-- ศูนย์ AI / API ที่เสียเงิน: เลือกผู้ให้บริการรายการ (เช่น อ่านสลิป = GPT หรือ Cloudflare · ส่งอีเมล = Resend หรือ Gmail)
-- null = ใช้ค่าเริ่มของทะเบียน (lib/paid-services providerChoices ตัวแรก) · เพิ่มคอลัมน์อย่างเดียว ข้อมูลเดิมไม่เปลี่ยน
alter table public.paid_service_settings add column if not exists provider text;
