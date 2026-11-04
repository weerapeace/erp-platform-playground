-- อัลบั้ม Contents: แคปชั่นร่างแยกตามแพลตฟอร์ม (เหมือนหน้าลงโพสต์) — เจ้าของอนุญาต 2026-11-04
-- { "<platform>": { "caption": "...", "hashtags": "#a #b", "caption_type": "short" } }
-- แพลตฟอร์มที่ยังไม่มีของตัวเอง = ใช้ caption_draft เดิมเป็นข้อความตั้งต้น · ส่งเข้าปฏิทิน = แคปชั่นแต่ละแพลตฟอร์มไปกับโพสต์
alter table public.content_albums add column if not exists caption_drafts jsonb not null default '{}'::jsonb;
comment on column public.content_albums.caption_drafts is 'แคปชั่นร่างแยกแพลตฟอร์ม {platform: {caption, hashtags, caption_type}} — ไม่มี = ใช้ caption_draft';
