-- RLS remediation เฟส 3: ตารางเว็บร้าน — apps/store เข้าผ่าน service_role ฝั่ง server เท่านั้น (ไม่มี anon client)
-- เปิด RLS ไม่ตั้ง policy = ปิด anon/authenticated ที่เข้าตรง · service_role (เว็บร้าน+ERP) ยังทำงาน
alter table public.shops              enable row level security;
alter table public.shop_domains       enable row level security;
alter table public.store_pages        enable row level security;
alter table public.store_page_versions enable row level security;
