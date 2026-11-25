-- เมนู ซ่อม / คืนสินค้า → "รอของ & ซ่อม/เปลี่ยนคืน" (เจ้าของสั่ง 2026-11-25 · แท็บรอของย้ายมาจากหน้าคำสั่งพิเศษ)
update public.erp_menu_items set label = 'รอของ & ซ่อม/เปลี่ยนคืน' where href = '/order-ops/after-sales' and label = 'ซ่อม / คืนสินค้า';
