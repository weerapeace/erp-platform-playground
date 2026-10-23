# ตัวดึงข้อมูลร้านกลาง (lib/website-data)

**ใช้ทำอะไร:** ดึงข้อมูลร้านที่หลายแผงในหลังบ้านเว็บใช้ร่วมกัน จากที่เดียว: รู้ URL รู้วิธีระบุร้าน และเก็บแคชต่อร้าน
เดิมแต่ละไฟล์ fetch เอง แคชกันคนละชุด และระบุร้านไม่เหมือนกัน (`?shop=` / `?shopId=`)

| ฟังก์ชัน | API | ผู้ใช้ตอนนี้ |
|---|---|---|
| `loadWebListings(slug, fresh)` | `GET /api/website/listings` | หน้าเว็บไซต์ (manager-client) · แท็บหมวดหมู่ · ตรวจก่อนเผยแพร่ · โปรโมชัน · ตัวเลือกสินค้า |
| `loadWebSettings(slug, fresh)` | `GET /api/website/settings` | ข้อมูลร้าน · ปุ่มเปิด/ปิดเว็บ · ลิงก์โซเชียล · ศูนย์แปลภาษา |
| `loadWebNewDrops(slug, fresh)` | `GET /api/website/new-drops` | แท็บชุดมาใหม่ · รูปแทรกของชุด · ตัวเลือกลิงก์ |
| `loadStorefrontProducts(slug, fresh)` | `GET /api/public/storefront/products` | ตัวเลือก SKU · ตัวเลือกรูปจากสินค้า · บอร์ดรูป PNG ฉาก |

## กฎ
- ระบุร้านด้วย **slug** (`?shop=`) เสมอ
- `fresh = true` = โหลดสดเสมอ → **ใช้กับฟอร์มที่จะเอาค่าไปแก้** (กันเห็นค่าเก่าแล้วบันทึกทับ)
- `fresh = false` = มีของในแคชแล้วคืนทันที คำขอที่กำลังโหลดอยู่ใช้ร่วมกัน → ใช้กับตัวเลือก/ป๊อปเลือก
- โหลดสดเสร็จแล้ว แคชจะเป็นค่าล่าสุดให้ตัวอื่นใช้ต่อ คำขอเก่าที่เสร็จทีหลังจะไม่เขียนทับค่าที่ใหม่กว่า
- คืน JSON ดิบของ API ให้ผู้เรียกแปลงเป็นรูปของตัวเอง ผลที่มี `error` จะไม่ถูกเก็บแคช
- แคชอยู่ใน useSWRLite กลาง (key `website:<ชนิด>:<slug>`) ล้างได้ด้วย `invalidateSWR("website:")`

## ห้ามใช้เมื่อไหร่
- การบันทึก (POST/PUT/PATCH/DELETE) ยังยิงตรงจากแต่ละแผงเหมือนเดิม ตัวนี้ทำแค่การอ่าน

## ยังไม่ย้าย
- `website-theme-panel` (products + site) และ `website-image-sets-panel` (site): มีเซสชันอื่นกำลังแก้อยู่ ค่อยย้ายทีหลัง
- `belt-builder/studio-data` อ่าน settings ผ่าน `readJson` ของตัวเอง (ข้อความ error ตามรหัส HTTP) จึงคงไว้

ทดสอบ: `lib/__tests__/website-data.test.ts`
