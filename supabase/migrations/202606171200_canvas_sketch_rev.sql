-- กระดานวาด: เพิ่มเลขเวอร์ชัน (rev) สำหรับกันเซฟทับกันเวลาหลายคนแก้พร้อมกัน
-- เซฟจะตรวจว่า rev ตรงกับที่โหลดมาไหม ถ้าไม่ตรง = มีคนแก้แทรก → รวมงานแล้วเซฟใหม่ (ฝั่ง client)
alter table erp_canvas_sketches add column if not exists rev integer not null default 0;
