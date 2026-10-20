-- 💳 เว็บร้าน: ลูกค้าแนบสลิปโอน (พร้อมเพย์) + ตรวจสลิปอัตโนมัติ (EasySlip) — เจ้าของเลือกแบบ A+B 2026-10-20
-- ต่อยอดตาราง store_payments เดิม (ว่าง 0 แถว · RLS เปิด ไม่มี policy = แตะได้เฉพาะ service role)
--   status        : pending (รอตรวจ) | verified (ยืนยันรับเงินแล้ว) | rejected (สลิปไม่ถูกต้อง)
--   auto_result   : ผลตรวจอัตโนมัติ — passed | duplicate | amount_mismatch | account_mismatch | not_slip | error | off
-- ออเดอร์: store_orders.payment_status เพิ่มค่า 'verifying' (ลูกค้าแนบสลิปแล้ว รอตรวจ) — คอลัมน์ text ไม่มี check อยู่แล้ว
-- รันแล้วบน Supabase ผ่าน MCP apply_migration (store_payments_slip_verify) 2026-10-20
alter table public.store_payments add column if not exists shop_id uuid references public.shops(id) on delete cascade;
alter table public.store_payments add column if not exists auto_result text;
alter table public.store_payments add column if not exists auto_note text;
alter table public.store_payments add column if not exists auto_raw jsonb;
alter table public.store_payments add column if not exists trans_ref text;
alter table public.store_payments add column if not exists slip_amount numeric;
alter table public.store_payments add column if not exists slip_date timestamptz;
alter table public.store_payments add column if not exists slip_sender text;
alter table public.store_payments add column if not exists slip_receiver text;
alter table public.store_payments add column if not exists reject_reason text;
alter table public.store_payments add column if not exists verified_by_name text;
alter table public.store_payments add column if not exists slip_mime text;
alter table public.store_payments add column if not exists slip_size integer;

create index if not exists idx_store_payments_shop_status on public.store_payments (shop_id, status);
create index if not exists idx_store_payments_trans_ref on public.store_payments (trans_ref) where trans_ref is not null;

comment on column public.store_payments.status is 'pending=รอตรวจ · verified=ยืนยันรับเงินแล้ว · rejected=สลิปไม่ถูกต้อง';
comment on column public.store_payments.auto_result is 'ผลตรวจสลิปอัตโนมัติ: passed|duplicate|amount_mismatch|account_mismatch|not_slip|error|off';
comment on column public.store_payments.trans_ref is 'เลขอ้างอิงธุรกรรมจากสลิป — ใช้กันสลิปเดียวใช้ซ้ำหลายออเดอร์';
