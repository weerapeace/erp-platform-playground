# อัปรูปเข้าแกลเลอรีสินค้า (ของกลาง `lib/gallery-upload`)

ใช้ทำอะไร: อัปรูปเข้า "แกลเลอรีรูป" ของระเบียน (SKU / Parent SKU · ตาราง `erp_playground_attachments` ผ่าน `POST /api/attachments`)

- `uploadGalleryFile(file, { entityType, entityId, actor })` → ย่อด้านกว้าง ≤ 1500px · เช็กขนาด ≤ 2MB หลังย่อ · ไม่เกิน 9 รูป (API เช็กซ้ำ) → คืน id
- `removeGalleryFile(id)` → ลบรูปที่เพิ่งเพิ่ม (ปุ่ม "ย้อนกลับ") · ไฟล์ย้ายเข้าถังขยะ R2 เก็บ 30 วัน
- รูปแรก = รูปหลัก → DB trigger ตั้งรูปปกให้เอง · ลบรูปหลัก → รูปถัดไปขึ้นแทน / ไม่เหลือรูป = ล้างปก

ใช้ที่: กล่องรูปในลิ้นชัก (`components/image-manager`) · ลากรูปลงการ์ด/แถวหน้าเลือกดู SKU (`components/sku-tag-browser`, เจ้าของขอ 2026-11-23)

หน้าเลือกดู SKU: ลากหลายรูปวางบนการ์ด/แถว (ต้องมีสิทธิ์ products.edit · ไม่ทำในโหมดเลือก) · ชี้แล้ว Ctrl+V · มือถือ = ปุ่มถ่ายรูป/เลือกรูป (usePhotoCapture) · ระหว่างอัป = UploadProgress บนการ์ด · เสร็จ = แจ้งผลพร้อม "ย้อนกลับ"

ห้ามใช้: ไฟล์แนบเอกสาร (ใช้ ProductDriveFiles / RecordFilesField) · รูปที่ไม่ผูกระเบียน (ใช้ uploadImagesWithDupCheck)
