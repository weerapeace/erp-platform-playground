-- 🚚 Shippop (ชุด 9 · 2026-10-22) — ข้อมูลการจองขนส่งของออเดอร์ (lib/shippop · ShippopInfo)
-- { mode: sim|live, purchaseId, trackingCode (SP… = รหัส Shippop), courierCode, courierTrackingCode, price, codAmount, status, bookedAt, history[] }
-- เลขพัสดุที่ลูกค้าเห็นยังอยู่ช่องเดิม tracking_no / tracking_carrier (จองแล้วเติมให้)
alter table public.store_orders add column if not exists shippop jsonb;
create index if not exists store_orders_shippop_tracking_idx on public.store_orders ((shippop->>'trackingCode')) where shippop is not null;
comment on column public.store_orders.shippop is 'การจองขนส่งผ่าน Shippop (null = ยังไม่จอง) — webhook หาออเดอร์จาก trackingCode';
