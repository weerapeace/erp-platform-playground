-- สีประจำตัวพนักงาน — ใช้กับ avatar (วงกลมตัวอักษร) ในงาน/งานย่อย ตั้งได้ในหน้า /admin/users
alter table user_profiles add column if not exists color text;
