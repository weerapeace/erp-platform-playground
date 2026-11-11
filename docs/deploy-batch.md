# ขึ้นเว็บเป็นรอบ (ทุก ~10 นาที) + ปุ่มขึ้นทันที

> เริ่มใช้ 2026-11-11 — เจ้าของเลือก "10 นาที แต่มีปุ่มขึ้นทันทีด้วย" เพื่อลดค่า build ของ Vercel
> (เดิม build ทุกครั้งที่ push ~43 ครั้ง/วัน ≈ ครึ่งบิล · จำลองจากข้อมูลจริง: รอบละ 10 นาที ลด build ~46%)

## ทำงานยังไง

```txt
session ทุกตัว ──push──▶ feat/host-portable   (Vercel ไม่ build สาขานี้แล้ว — vercel.json git.deploymentEnabled)
                              │
        ทุก push → GitHub Actions deploy-round.yml (บน feat/host-portable)
        ยังไม่ขึ้นเว็บ → รอรวมงาน ~10 นาที → เลื่อนสาขา prod ไปงานล่าสุด
                              ▼
                            prod  ──Vercel build──▶ เว็บจริง (erp-platform-playground.vercel.app)
```

- Vercel ตั้ง **Production Branch = `prod`** (เจ้าของเปลี่ยนเองใน dashboard 2026-11-11)
- รอบเริ่มนับตอนงานแรกที่ยังไม่ขึ้นเว็บถูก push · งานที่ตามมาระหว่างรอ = เข้ารอบเดียวกัน (concurrency รันทีละตัว + รอคิว 1 ตัว)
- ⚠️ **ไม่ใช้ตัวตั้งเวลา (schedule) ของ GitHub — และห้ามใส่กลับ** — 2026-11-11 เปิดแล้วไม่ยิงสักครั้ง (สงสัยว่าเพราะไฟล์ลง main ด้วย `[skip ci]` ทุกครั้ง · ไฟล์ `warmer.yml` ที่ลงด้วย commit ปกติเคยยิงได้) · เจ้าของเลือกเอา schedule ออกจาก deploy-batch.yml แล้ว (commit main `8b205dfb`) — ถ้าค้างไว้ วันที่ main ได้ commit ปกติ (เช่น merge feat/host-portable→main) มันอาจตื่นมายิงซ้อนรอบ → build ถี่ขึ้นเปล่า ๆ
- push ที่ใส่ `[skip ci]` ลง feat/host-portable **จะไม่เริ่มรอบ** (GitHub ข้าม on: push) → งานนั้นขึ้นเว็บพร้อม push ปกติครั้งถัดไป · ใช้ได้กับงานที่ไม่ต้องขึ้นเว็บ (เช่นแก้แค่ docs) เพื่อประหยัด build
- ค่าใช้จ่าย: รอบละ ~9 นาทีบนเครื่อง GitHub = **ฟรีเพราะ repo เป็นสาธารณะ** · ถ้าวันไหนเปลี่ยนเป็น private จะกินโควต้า Actions (~20+ รอบ/วัน ≈ 6,000+ นาที/เดือน > ฟรี 2,000) → ตอนนั้นย้ายตัวจับเวลาไป Cloudflare Worker cron (ฟรี) แทน
- ไม่มีงานใหม่ = ไม่ build

## นับถอยหลัง + หน้าต่างลอยมุมจอ (2026-11-11)

- หน้า **`/admin/deploy`** โชว์ขั้นปัจจุบัน: **รอรวมงาน** (นับแม่นถึงวินาที — เวลาเริ่มรอบจาก deploy-round.yml + `ROUND_WAIT_SECONDS` 540) → **กำลังส่งขึ้นเว็บ** → **กำลัง build** (≈ ค่าประมาณ `BUILD_SECONDS` 320 — วัดจริง ~5.3 นาทีหลังแก้ build memory 2026-11-10) → **ขึ้นเว็บแล้ว** · มีงานแต่ไม่มีรอบเดิน (push ที่มี `[skip ci]`) = "รอรอบถัดไป"
- **ศูนย์แจ้งเตือน (ตัว Pet) → แท็บ "ขึ้นเว็บ"** (ผู้ดูแลระบบ · 2026-11-11) = การ์ดนับถอยหลัง + งานที่รอ + ปุ่มขึ้นทันที/ลอยมุมจอ · **ตัว Pet พูด (ฟองคำพูด) เมื่อมีเรื่องใหม่**: มีงานรอรอบ (อีกกี่นาที) → กำลังส่งขึ้นเว็บ → กำลัง build (อีกกี่นาที) → ขึ้นเว็บแล้ว (พูดจนเปิดดู หรือครบ 4 นาทีหลังเสร็จ) / build ล้ม (พูดค้างจนเปิดดู) · เปิดแท็บดู = เลิกกระโดด แต่**ระหว่างกำลังขึ้นเว็บ (รอรอบ / ส่ง / build) ตัว Pet พูดค้างจนเสร็จ** (ลอยเบา ๆ ไม่กระโดด · `sticky` ใน deployPetNews · เจ้าของขอ 2026-11-11) · ขึ้นแล้ว/ล้ม = พูดจนเปิดดู · ปิดได้ในตั้งค่าการแจ้งเตือน (เรื่อง "ขึ้นเว็บ (สถานะ build)") · คำพูด = `deployPetNews()` ใน lib/deploy-queue · ถามสถานะตามรอบเดิม (ไม่มีกุญแจ GitHub = ช้าสุด ~2 นาที)
- **เมนูโปรไฟล์ (คลิกชื่อมุมขวาบน) → "นับถอยหลังขึ้นเว็บ (ลอยมุมจอ)"** (ผู้ดูแลระบบ) = เปิดหน้าต่างลอยได้จากทุกหน้า และ**ลอยค้างแม้เปลี่ยนหน้า** (ปิดเมื่อปิดแท็บ/รีเฟรช) · ปุ่ม "หน้าเต็ม" = ไปหน้า /admin/deploy · เบราว์เซอร์ไม่รองรับ = ไปหน้าเต็มแทน
- ปุ่ม **"ลอยไว้มุมจอ"** = หน้าต่างจิ๋วลอยทับทุกโปรแกรม (Chrome/Edge บนคอม · ของกลาง `components/pip-window` · docs/pip-window.md) — เปิดหน้า /admin/deploy ทิ้งไว้ ไปทำงานแท็บอื่นได้ · ปิดหน้า = หน้าต่างลอยปิดตาม
- ข้อมูล: `GET /api/admin/deploy` (server ถาม GitHub 3 ครั้งต่อรอบแคช + แคชกลาง Vercel — `lib/deploy-status.ts`) · เดิมเบราว์เซอร์ถาม GitHub เอง ~480 ครั้ง/ชม. เกินโควต้าไม่มีกุญแจ 60 ครั้ง/ชม. → เปิดค้างแล้วโดนบล็อก
  - ไม่มี `GITHUB_DEPLOY_TOKEN`: แคช 120 วิ (ตัวเลขยังเดินทุกวินาที แต่เปลี่ยนขั้นช้าได้ ~2 นาที · IP ของ Vercel ใช้ร่วมกับเว็บอื่น อาจโดนจำกัดบ้าง → โชว์ข้อมูลล่าสุด + "ข้อมูลอาจไม่อัปเดต")
  - มีกุญแจ: แคช 15 วิ (5,000 ครั้ง/ชม.)
- ⚠️ ถ้าแก้ `WAIT_SECONDS` ใน deploy-round.yml ต้องแก้ `ROUND_WAIT_SECONDS` ใน `lib/deploy-queue.ts` ด้วย (ไม่งั้นนับผิด)

## ขึ้นทันที (ไม่รอรอบ)

- หน้า **`/admin/deploy`** ปุ่ม "ขึ้นเว็บทันที" (สิทธิ์ admin.users) — มีในหน้าต่างลอยด้วย (โชว์เมื่อมีงานรอ)
  - ถ้ายังไม่ตั้ง env `GITHUB_DEPLOY_TOKEN` ใน Vercel → ปุ่มเปิดหน้า GitHub ให้กด "Run workflow" เอง
  - ตั้งแล้ว (fine-grained token เฉพาะ repo นี้ สิทธิ์ Actions: Read and write) → กดครั้งเดียวจบ + ลง audit `deploy_now` + ตัวนับถอยหลังอัปเดตถี่ขึ้น
- session (Claude): `gh workflow run deploy-batch.yml --repo weerapeace/erp-platform-playground` — **ใช้เมื่อเจ้าของขอ/งานด่วนเท่านั้น** (กดทุกงาน = กลับไปเสียค่า build เท่าเดิม)

## ตรวจหลัง deploy (CLAUDE.md §46 Step 7) — เปลี่ยนจากเดิม

1. **งานเข้าเว็บจริงหรือยัง**: `gh api repos/weerapeace/erp-platform-playground/compare/<sha>...prod --jq .status` → `ahead`/`identical` = prod มีงานนี้แล้ว · `behind` = ยังรอรอบ
2. **build ผ่านไหม**: `gh api repos/weerapeace/erp-platform-playground/commits/prod/status --jq .state` → `success`
   (commit ระหว่างรอบจะไม่มีสถานะ Vercel ของตัวเอง — ดูที่ prod)
3. ชั้นอื่นเหมือนเดิม (chunk / curl / DB) · `npm run perf-check -- --changed` รอให้งานเข้า prod เอง (สูงสุด 15 นาที)

## ไฟล์ที่เกี่ยวข้อง

- `.github/workflows/deploy-round.yml` — รอบอัตโนมัติ (เด้งเมื่อ push feat/host-portable)
- `.github/workflows/deploy-batch.yml` (ชื่อใน Actions: "Deploy Now (ขึ้นเว็บทันที)") — ปุ่มขึ้นทันทีอย่างเดียว ไม่มี schedule · **อยู่บนสาขา main** (workflow_dispatch ทำงานจากสาขา default เท่านั้น) · แก้ผ่าน GitHub API ใส่ `[skip ci]` (กัน deploy สำรอง CF) — main ตั้ง `deploymentEnabled: false` แล้ว Vercel จึงไม่ build
- `vercel.json` → `git.deploymentEnabled: { "feat/host-portable": false, "main": false }`
- `lib/deploy-queue.ts` (กติกา pure + เทสต์ · นับถอยหลัง `deployPhase`) · `lib/deploy-status.ts` (server ถาม GitHub + แคช) · `app/admin/deploy/page.tsx` · `app/api/admin/deploy/route.ts` (GET สถานะ · POST ขึ้นทันที)
- `components/deploy-countdown` (การ์ดนับถอยหลัง + ตัวดึงสถานะ) · `components/pip-window` (หน้าต่างลอย — ของกลาง)
- `scripts/perf-check.mjs` — `PROD_BRANCH = "prod"` + รองานเข้า prod

## ย้อนกลับ (กลับไป build ทุก push)

1. Vercel → Settings → Environments → Production → Branch = `feat/host-portable`
2. ลบ `git.deploymentEnabled` ออกจาก `vercel.json` (ทั้ง feat/host-portable และ main) · ปิด workflow: `gh workflow disable deploy-round.yml` + `deploy-batch.yml`
3. `scripts/perf-check.mjs` PROD_BRANCH กลับเป็น `feat/host-portable`
