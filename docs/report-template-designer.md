# Report Template Designer

ระบบนี้เป็นของกลางสำหรับออกแบบเอกสารพิมพ์ เช่น ใบเสนอราคา, ใบขอซื้อ, ใบสั่งซื้อ และเอกสารอื่นในอนาคต

## ใช้ทำอะไร

- สร้าง template หลายเวอร์ชันโดยไม่ต้องเขียน code
- เลือก field จากรายการ เช่น เลขที่เอกสาร, ลูกค้า, วันที่, ยอดรวม
- สร้างตารางรายการแบบ relation เช่น `lines` แล้วเลือก column ที่ต้องการโชว์
- Preview เอกสารด้วยข้อมูลตัวอย่างก่อน publish
- Publish template ที่ต้องการให้ระบบพิมพ์จริง

## สถานะ Template

- `Draft` = กำลังแก้ไข ยังไม่ใช้พิมพ์จริง
- `Published` = ใช้พิมพ์จริง
- `Archived` = เก็บไว้ ไม่ใช้แล้ว

ข้อมูลสถานะและเลขเวอร์ชันเก็บใน `report_templates.description` ด้วย prefix `__designer:{...}__` เพื่อเลี่ยงการเพิ่ม schema ใหม่ในเฟสแรก

## การใช้งานในระบบพิมพ์

หน้า print ควรโหลด template ตาม `entity_type` แล้วเลือก active/default ก่อน ถ้าไม่มี template ที่ publish แล้ว ให้ fallback เป็น template เดิมของเอกสารนั้น

ตัวอย่างใบเสนอราคาใช้ `entity_type=qt`

## Template Syntax

- `{{field}}` แสดงค่า field แบบ escape HTML
- `{{{field_html}}}` แสดง HTML ที่ระบบสร้างให้ เช่น รูปสินค้า
- `{{#lines}} ... {{/lines}}` วนรายการสินค้า

## ข้อจำกัดตอนนี้

- ยังไม่ใช่ drag-and-drop เต็มรูปแบบ
- ยังไม่มีการปรับตำแหน่งด้วย mouse บน A4 canvas
- many2many/relation table รองรับจาก config กลางก่อน เช่น `lines`

แนวทางต่อไปคือเพิ่ม layout canvas แบบลากวางจริง โดยยังใช้ field/table/version config ชุดนี้เป็นฐาน
