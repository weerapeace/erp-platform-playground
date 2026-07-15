-- แบรนด์ของ artwork + แม็ปโฟลเดอร์ Drive ตามแบรนด์ + ชื่อซับตามชนิด
alter table assets add column if not exists brand_id uuid;

create table if not exists erp_brand_drive_folders (
  brand_id uuid primary key,
  folder_id text not null,
  folder_label text,
  updated_at timestamptz default now()
);

alter table erp_artwork_drive_folders alter column folder_id drop not null;
alter table erp_artwork_drive_folders add column if not exists subfolder_name text;
