-- สีธีม (accent) ส่วนตัวต่อผู้ใช้ — additive
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS theme_color text;
