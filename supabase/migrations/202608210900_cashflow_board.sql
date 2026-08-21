-- ============================================================
-- กระดานเงินสด (Cash Board) — ลากเลื่อนวันจ่าย/วันรับเงินได้จริง
-- ------------------------------------------------------------
-- หน้า /cashflow/board ให้ลากการ์ดไปวันอื่นแล้วกด "ยืนยัน" → เขียนวันใหม่ลงเอกสารต้นทาง
--
-- เอกสารส่วนใหญ่มีช่องวันอยู่แล้ว ใช้ของเดิมได้เลย:
--   ใบซื้อ    → purchase_orders_v2.payment_due_date
--   ใบวางบิล  → erp_playground_billing_notes.due_date
--   บิลจีน    → china_bills.transfer_date
--
-- ขาดอยู่อย่างเดียวคือใบขาย — วันเงินเข้าคำนวณจาก "วันขาย + เครดิตลูกค้า" ทุกครั้ง
-- ถ้าอยากเลื่อนเป็นราย ๆ (ลูกค้าโทรมาขอเลื่อน) ต้องมีที่จดวันที่ตกลงกันไว้
-- ============================================================

alter table public.erp_playground_sales_orders
  add column if not exists expected_payment_date date;

comment on column public.erp_playground_sales_orders.expected_payment_date is
  'วันที่คาดว่าจะได้รับเงินจริง — ตั้งจากกระดานเงินสด (/cashflow/board) · ถ้าว่างจะคำนวณจากวันขาย + เครดิตลูกค้า';

create index if not exists idx_so_expected_payment on public.erp_playground_sales_orders(expected_payment_date)
  where expected_payment_date is not null;

-- ============================================================
-- เมนู — อยู่ในแอปกระแสเงินสด บนสุด (เป็นหน้าที่เปิดบ่อยสุด)
-- ============================================================
-- หมายเหตุ: รันกับ production ครั้งแรกให้ตั้ง is_active = false ก่อน
-- แล้วเปิดหลังโค้ดขึ้นเว็บ — กันคนกดเมนูแล้วเจอ 404
insert into public.erp_menu_items
  (section, section_order, sort_order, icon, label, href, permission_key, app_keys, show_in_sidebar, show_in_launcher, is_active)
select 'ภาพรวม', 0, 0, '🧲', 'กระดานเงินสด', '/cashflow/board', 'cashflow.view',
       array['cashflow', 'loan-od'], true, true, true
where not exists (select 1 from public.erp_menu_items where href = '/cashflow/board');
