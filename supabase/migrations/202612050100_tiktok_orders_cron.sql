-- ตัวดึงออเดอร์ TikTok อัตโนมัติ (เจ้าของขอ 2026-11-12 "ดึงออเดอร์อัตโนมัติเป็นรอบ")
-- pg_cron เรียก /api/cron/tiktok-orders ทุก 30 นาที · route ดึงออเดอร์ที่เปลี่ยนสถานะใน 3 ชม.ล่าสุด (อ่านอย่างเดียว)
-- แบบเดียวกับคิวโพสต์โซเชียล (202611110100): โทเคนใน Vault + ตรวจผ่าน erp_cron_token_ok ตัวกลางเดิม
-- ไม่แตะข้อมูลอื่น · ยกเลิกได้: select cron.unschedule('tiktok-orders-every-30min');

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tiktok_orders_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'tiktok_orders_cron', 'โทเคนให้ pg_cron เรียก /api/cron/tiktok-orders');
  end if;
end $$;

-- ตั้งหลัง deploy route แล้วเท่านั้น · เรียกเว็บเฉพาะตอนมีแบรนด์เชื่อม TikTok อยู่
select cron.schedule('tiktok-orders-every-30min', '*/30 * * * *', $job$
  select net.http_post(
    url := 'https://erp-platform-playground.vercel.app/api/cron/tiktok-orders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_orders_cron')),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
  where exists (select 1 from public.platform_credentials c join public.erp_platforms p on p.id = c.platform_id
                 where p.code = 'tiktok' and c.meta->>'stage' = 'connected')
$job$);
