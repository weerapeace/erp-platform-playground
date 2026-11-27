-- 🎓 ศูนย์เรียนรู้ (/misc/learn · แอปงานอื่นๆ) — ต่อยอดตารางคู่มือวิธีใช้งานเดิม (erp_help_guides) ไม่สร้างตารางที่ 2
--   kind = 'help' (คู่มือวิธีใช้ระบบเดิม · /master/help-guides) | 'lesson' (บทเรียนสอนพนักงาน)
--   status = 'draft' (ร่าง รอตรวจ — คนดูทั่วไปไม่เห็น) | 'published'
--   ขั้นตอน: เพิ่มลิงก์คลิป (YouTube/TikTok/Drive) + นาทีเริ่ม · คลิปสั้นอัปเอง (R2) · เช็กลิสต์
--   ลบ = เก็บไว้ก่อน (is_active=false + deleted_at) · ลบถาวรเฉพาะในถังขยะ
-- คู่มือ docs/learning-center.md

alter table public.erp_help_guides
  add column if not exists kind text not null default 'help',
  add column if not exists status text not null default 'published',
  add column if not exists source_url text,
  add column if not exists source_title text,
  add column if not exists drive_folder_url text,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by text,
  add column if not exists updated_by text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'erp_help_guides_kind_chk') then
    alter table public.erp_help_guides add constraint erp_help_guides_kind_chk check (kind in ('help','lesson'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'erp_help_guides_status_chk') then
    alter table public.erp_help_guides add constraint erp_help_guides_status_chk check (status in ('draft','published'));
  end if;
end $$;

create index if not exists erp_help_guides_kind_idx on public.erp_help_guides (kind, is_active);

alter table public.erp_help_guide_steps
  add column if not exists video_url text,
  add column if not exists video_start_sec integer,
  add column if not exists video_r2_key text,
  add column if not exists checklist jsonb not null default '[]'::jsonb;

-- สิทธิ์: ดูบทเรียน = ทุกตำแหน่ง · เพิ่ม/แก้/ลบ/เผยแพร่ = admin (ตั้งเพิ่มได้ที่หน้าสิทธิ์)
insert into public.erp_permissions (key, label, category, description, is_dangerous, sort_order) values
  ('learn.view',   'ดูศูนย์เรียนรู้',            'ศูนย์เรียนรู้ (Learning)', 'เปิดอ่านบทเรียนที่เผยแพร่แล้ว ติ๊กเช็กลิสต์ ดูคลิป', false, 2480),
  ('learn.manage', 'เพิ่ม/แก้/เผยแพร่บทเรียน', 'ศูนย์เรียนรู้ (Learning)', 'สร้าง แก้ เผยแพร่ ลบ (กู้คืนได้) บทเรียน + เห็นร่างที่รอตรวจ', false, 2490)
on conflict (key) do nothing;

insert into public.erp_role_permissions (role_key, permission_key) values
  ('admin', 'learn.view'), ('admin', 'learn.manage'),
  ('manager', 'learn.view'), ('staff', 'learn.view'), ('designer', 'learn.view'), ('PR_manager', 'learn.view')
on conflict do nothing;

-- กฎที่เก็บไฟล์: คลิปยาวของบทเรียน → Google Drive (คลิปสั้น ≤200MB อัปผ่านช่องวิดีโอกลาง = R2 คลังกลาง)
insert into public.erp_storage_rules (rule_key, label, label_en, description, file_types, provider, allowed_providers, lock_reason, sort_order, is_active)
select 'learning_videos', 'คลิปยาวของบทเรียน (ศูนย์เรียนรู้)', 'Long lesson videos (Learning center)',
  'คลิปสอนงานยาว ๆ แนบที่บทเรียน · คลิปสั้นเล่นในขั้นตอนใช้ช่องวิดีโอกลาง (R2)',
  array['mp4','mov','m4v','webm','pdf'], 'drive', array['drive'], 'คลิปยาวไฟล์ใหญ่ เก็บ Drive ไม่กินที่เก็บรูป', 170, true
where not exists (select 1 from public.erp_storage_rules where rule_key = 'learning_videos');
