-- path ในเครื่อง (Google Drive Desktop) ฐานต่อแบรนด์ ใช้ auto-fill ช่อง master_path ให้ตรงกับโครง Drive
alter table erp_brand_drive_folders add column if not exists local_base_path text;
-- แบรนด์อาจตั้งแค่ path ในเครื่องโดยไม่มี Drive folder id
alter table erp_brand_drive_folders alter column folder_id drop not null;
