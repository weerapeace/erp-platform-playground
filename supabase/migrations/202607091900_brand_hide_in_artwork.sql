-- ซ่อนแบรนด์จากตัวเลือกในคลัง Artwork (บางแบรนด์ไม่ต้องใช้ใน picker นี้)
alter table brands add column if not exists hide_in_artwork boolean default false;
