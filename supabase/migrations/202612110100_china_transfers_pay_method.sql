-- แอปโอนเงินจีน: ช่องทางจ่ายของรายการโอน (2026-11-13 เจ้าของขอ "โอนตรงผ่าน WeChat")
--   bank    = โอนเงินบาทผ่านธนาคาร ซื้อหยวนเข้าบัญชีจีน (เดิมทั้งหมด)
--   balance = จ่ายจากยอดคงเหลือบัญชีจีนล้วน (ไม่มีโอนเงินไทย · ไม่ใช้เรท)
--   wechat  = จ่ายตรงผ่าน WeChat (ไม่หักยอดคงเหลือ · ไม่ตัดบิล CTW · ยอดบาทกรอกทีหลังได้ → amount_transferred_thb = 0 ระหว่างรอ)
-- ไม่สร้างตารางใหม่ — ใช้ china_transfers เดิม · ยอดคงเหลือ (china_balance_current) ไม่เปลี่ยนสูตร เพราะ wechat บันทึก leftover = 0

alter table public.china_transfers
  add column if not exists pay_method text not null default 'bank';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'china_transfers_pay_method_chk') then
    alter table public.china_transfers
      add constraint china_transfers_pay_method_chk check (pay_method in ('bank', 'balance', 'wechat'));
  end if;
end $$;

-- รายการเดิมที่จ่ายจากยอดคงเหลือล้วน (โอนจริง ฿0 + ยอดคงเหลือลด) → balance
update public.china_transfers
   set pay_method = 'balance'
 where pay_method = 'bank' and amount_transferred_thb = 0 and leftover_rmb < 0;

comment on column public.china_transfers.pay_method is 'ช่องทางจ่าย: bank=โอนผ่านธนาคาร · balance=จ่ายจากยอดคงเหลือจีน · wechat=โอนตรงผ่าน WeChat (ยอดบาท 0 = รอกรอก)';
