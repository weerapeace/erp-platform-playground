-- 📋 สรุปงาน (ใบงานออกแบบ) — ชุดสรุปที่บันทึกไว้ เปิดแก้ / พิมพ์ / คัดลอกเป็นรูป / ส่งซ้ำได้
-- เจ้าของขอ: เลือกใบงานที่ยังไม่ปิด · เลือกข้อมูล+รูปที่จะโชว์ · แยก 1 งานเป็นหลายรายการตามรูป · ฉบับลูกค้า/ฉบับภายใน
-- items = [{ sheet_id, images: ["/api/r2-image?key=…"], split, labels: [], notes: [] }]
--   split=false → 1 แถว (labels[0] = ชื่อที่โชว์แทนชื่อใบงาน, notes[0] = หมายเหตุ)
--   split=true  → 1 แถวต่อรูป (labels[i]/notes[i] ของรูปที่ i)
-- ข้อมูลใบงาน (ชื่อ/สถานะ/กำหนดส่ง) ดึงสดตอนเปิด · อ่าน/เขียนผ่าน API เท่านั้น (เปิด RLS ไม่มี policy)

create table if not exists public.design_sheet_summaries (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  audience         text not null default 'internal' check (audience in ('internal', 'customer')),
  columns          text[] not null default '{}',
  items            jsonb not null default '[]'::jsonb,
  note             text,
  is_active        boolean not null default true,
  created_by       uuid,
  created_by_name  text,
  updated_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists design_sheet_summaries_active_idx on public.design_sheet_summaries (is_active, updated_at desc);

alter table public.design_sheet_summaries enable row level security;
