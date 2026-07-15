-- แม็ป ชนิดงาน (artwork_type) → โฟลเดอร์ปลายทางใน Google Shared Drive
-- ไม่มีแม็ป = ใช้โฟลเดอร์ฐาน (env GOOGLE_DRIVE_ROOT_FOLDER_ID / GOOGLE_SHARED_DRIVE_ID)
create table if not exists erp_artwork_drive_folders (
  artwork_type text primary key,
  folder_id text not null,
  folder_label text,
  updated_at timestamptz default now()
);
