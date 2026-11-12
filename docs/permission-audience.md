# ปุ่ม "👁 ใครเห็น" (PermissionAudienceButton)

ของกลาง `components/permission-audience` — ตั้งว่าใครได้สิทธิ์ 1 ตัว ตรงหน้าที่ใช้ ไม่ต้องไปหาหน้าสิทธิ์

```tsx
<PermissionAudienceButton permissionKey="products.cost.view" label="ดูต้นทุน / กำไร" note="มีผลที่ไหนบ้าง" />
```

- **ตามตำแหน่ง**: ติ๊ก = บันทึกทันที (`PATCH /api/admin/roles` kind toggle → RPC `erp_role_permission_toggle` มีประวัติ) · ผู้ดูแลระบบเห็นเสมอ (ติ๊กออกไม่ได้)
- **ยกเว้นรายคน**: `UserPermOverrideButton` (grant/revoke ต่อคน — ชนะตำแหน่ง)
- ผลจริงเช็กที่ `erp_can` → เปลี่ยนที่ปุ่มนี้ = เปลี่ยนทุกที่ที่ใช้สิทธิ์นั้น
- ปุ่มโผล่เฉพาะคนมีสิทธิ์ `admin.roles` · จำนวนคนต่อตำแหน่งโชว์เมื่อมี `admin.users`
- ไม่สร้างสิทธิ์/ตารางใหม่ · ตั้งหลายสิทธิ์พร้อมกัน → `/admin/role-board` หรือ `MenuPermissionMatrix`

ใช้ที่: แท็บราคา Parent SKU (หัว "ต้นทุน / กำไร") — เจ้าของขอ 2026-11-12

หมายเหตุ (พบตอนทำ): `products.cost.view` คุม ตีราคาใบออกแบบ · ราคาซื้อจากร้าน · ใบสำคัญจ่าย · ประวัติซื้อขาย · แท็บราคา — แต่ **เครื่องคิดต้นทุน (/api/product-costings) และแท็บต้นทุนใบสั่งผลิต (/api/mo/[id]/cost) ยังไม่เช็กสิทธิ์นี้** (ใครดูสินค้าได้ก็เห็น)
