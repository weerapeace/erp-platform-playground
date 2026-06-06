# Job Consumer Worker (Cloudflare Queue)

Worker แยกที่หยิบงานจากคิว `erp-jobs` แล้วสั่งแอปหลักประมวลผลผ่าน `/api/jobs/run`
แยกจาก worker หลัก (OpenNext) เพื่อไม่ให้กระทบแอปที่ใช้งานจริง

## สถาปัตยกรรม
```
ผู้ใช้กดปุ่ม → แอปหลัก /api/payroll/calc-enqueue
   → สร้าง job (erp_jobs) + ส่งเข้าคิว erp-jobs (binding JOB_QUEUE)
   → เด้งกลับ job_id ทันที
คิว erp-jobs → consumer worker นี้ → POST /api/jobs/run (แอปหลัก) → runJob() คำนวณ → อัปเดต erp_jobs
หน้าจอ poll /api/jobs/{id} → progress → ผลลัพธ์
```

## ขั้นตอนเปิดใช้งาน (ทำครั้งเดียว)

### 1. สร้างคิว
```
npx wrangler queues create erp-jobs
```
หรือใน Cloudflare Dashboard → Workers & Pages → Queues → Create Queue → ชื่อ `erp-jobs`

### 2. ตั้ง secret (สุ่มสตริงยาว ๆ — ต้องตรงกันทั้ง 2 ฝั่ง)
- ฝั่งแอปหลัก: เพิ่ม GitHub Secret `JOB_RUNNER_SECRET` (Settings → Secrets → Actions) + เพิ่มในรายการ secrets ของ deploy.yml
- ฝั่ง consumer นี้:
```
cd workers/job-consumer
npx wrangler secret put JOB_RUNNER_SECRET
```

### 3. ตั้ง APP_URL ใน wrangler.jsonc
แทน `https://REPLACE-WITH-APP-URL` ด้วยโดเมนแอปหลักจริง

### 4. เพิ่ม producer binding ที่แอปหลัก (apps/playground/wrangler.jsonc)
```jsonc
"queues": { "producers": [ { "binding": "JOB_QUEUE", "queue": "erp-jobs" } ] }
```
⚠️ เพิ่มได้ **หลังสร้างคิวแล้วเท่านั้น** (ไม่งั้น deploy แอปหลัก fail)

### 5. Deploy
```
cd workers/job-consumer && npx wrangler deploy   # consumer
# แอปหลัก deploy ผ่าน GitHub Actions ปกติ (push main)
```

> ก่อนเปิดใช้คิว: ระบบทำงานได้อยู่แล้วผ่าน `ctx.waitUntil` (ไม่ต้องมีคิวก็คำนวณเบื้องหลังได้)
> การเปิดคิวเพิ่ม "ความทนทาน" (retry อัตโนมัติถ้า worker ตายกลางคัน)
