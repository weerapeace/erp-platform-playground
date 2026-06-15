-- ภาษาที่ผู้ใช้เลือก (ต่อบัญชี) — i18n เฟส L1 — additive
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'th';
