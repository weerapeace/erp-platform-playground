# Phase 1.1 Permission Keys

Phase 1.1 แยกสิทธิ์ API ที่เสี่ยงออกจาก `admin.field_registry` ตัวเดียว เพื่อให้กำหนดบทบาทได้ละเอียดขึ้นในหน้า Roles & Permissions หรือ migration รอบถัดไป

| Permission | ใช้กับงาน |
| --- | --- |
| `admin.schema.view` | ดูรายชื่อ table และ column สำหรับ field creator |
| `admin.schema.create_table` | สร้าง table/module ใหม่จากหน้า admin |
| `admin.schema.add_field` | เพิ่ม field/column ใหม่ |
| `admin.schema.delete_field` | ลบ field และอาจลบ column จริง |
| `admin.module_layout.edit` | แก้ layout ฟอร์มกลางของ module |
| `admin.field_registry.edit` | แก้ field registry ทีละ field |
| `admin.field_registry.bulk_edit` | bulk update/reorder field registry |
| `files.upload` | อัปโหลดไฟล์เข้า R2 |
| `files.delete` | ลบไฟล์ออกจาก R2 |
| `payroll.calculate` | สั่งคำนวณเงินเดือนแบบ background job |

Phase 1.2 เพิ่ม migration `supabase/migrations/202606180920_phase_1_2_granular_permissions.sql` เพื่อ register permission keys เหล่านี้ใน `erp_permissions` และ grant ให้ role `admin` เป็นค่าเริ่มต้น

หมายเหตุ: ถ้าต้องการให้ manager หรือ staff ใช้บาง action เช่น `files.upload` หรือ `payroll.calculate` ให้เพิ่มในหน้า Roles & Permissions หลัง migration ถูก apply แล้ว ไม่ควรให้สิทธิ์กว้างเกินจำเป็นตั้งแต่แรก
