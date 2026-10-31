# คู่มือสร้าง LINE OA "ฝ่ายบุคคล" (สำหรับส่งสลิปเงินเดือน)

เจ้าของระบบทำเองครั้งเดียว ประมาณ 15 นาที — ระบบทำแทนไม่ได้เพราะต้องล็อกอินบัญชี LINE ของบริษัท

> สำคัญที่สุด: OA ต้องอยู่ใต้ **Provider "ISG"** ตัวเดียวกับ LINE Login "ISG ERP Login" (Channel ID 2010621559)
> ถ้าอยู่คนละ Provider ระบบจะส่งสลิปหาพนักงานที่ผูกไว้ไม่ได้ (LINE ให้รหัสผู้ใช้คนละชุดต่อ Provider)

## 1. สร้างบัญชี OA

1. เข้า https://manager.line.biz → "สร้างบัญชี LINE Official Account"
2. ชื่อบัญชี: `ฝ่ายบุคคล` (หรือ `ฝ่ายบุคคล ISG`) · หมวด: บริษัท/องค์กร
3. แพ็กเกจเริ่มต้น = ฟรี (300 ข้อความ/เดือน พอสำหรับสลิปปลายเดือน + แจ้งยอดกลางเดือน ~120 ข้อความ)

## 2. เปิด Messaging API (ให้ ERP ส่งข้อความได้)

1. ใน LINE OA Manager ของบัญชีใหม่ → ตั้งค่า → **Messaging API** → "ใช้ Messaging API"
2. เลือก Provider = **ISG** (ห้ามสร้าง Provider ใหม่)
3. ไปที่ https://developers.line.biz → Provider ISG → จะเห็น channel ใหม่ชนิด Messaging API ของ "ฝ่ายบุคคล"
4. แท็บ Messaging API → ออก **Channel access token (long-lived)** — เก็บไว้ก่อน จะใช้ตอนเฟส C
   ใส่ในหน้าตั้งค่าส่งสลิปของ ERP เอง **ห้ามส่งให้ใครทางแชต**

## 3. ผูก LINE Login กับ OA (ให้หน้าสแกนบัตรชวน "เพิ่มเพื่อน" อัตโนมัติ)

1. developers.line.biz → Provider ISG → channel **ISG ERP Login** (2010621559)
2. แท็บ Basic settings → **Linked LINE Official Account** → เลือก "ฝ่ายบุคคล"
3. แท็บ LIFF → แอป LIFF ของ ERP → **Add friend option** = `On (Aggressive)`
   พนักงานที่สแกนบัตรจะเห็นช่อง "เพิ่มเพื่อน ฝ่ายบุคคล" ให้ติ๊กตอนยืนยัน LINE ครั้งแรก

## 4. ตรวจว่าใช้ได้

- พิมพ์บัตร QR ให้ตัวเองหนึ่งใบ (หน้า Payroll › LINE พนักงาน) → สแกนด้วย LINE → กดยืนยัน
- หน้า LINE พนักงานต้องขึ้น "ผูกแล้ว" พร้อมรูปและชื่อ LINE
- ใน LINE ต้องเห็น "ฝ่ายบุคคล" อยู่ในรายชื่อเพื่อน
