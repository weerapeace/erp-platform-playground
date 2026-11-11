# ขึ้นเว็บเป็นรอบ (ทุก ~10 นาที) + ปุ่มขึ้นทันที

> เริ่มใช้ 2026-11-11 — เจ้าของเลือก "10 นาที แต่มีปุ่มขึ้นทันทีด้วย" เพื่อลดค่า build ของ Vercel
> (เดิม build ทุกครั้งที่ push ~43 ครั้ง/วัน ≈ ครึ่งบิล · จำลองจากข้อมูลจริง: รอบละ 10 นาที ลด build ~46%)

## ทำงานยังไง

```txt
session ทุกตัว ──push──▶ feat/host-portable   (Vercel ไม่ build สาขานี้แล้ว — vercel.json git.deploymentEnabled)
                              │
        ทุก ~10 นาที (GitHub Actions deploy-batch.yml บนสาขา main)
        ถ้ามีงานใหม่ → เลื่อนสาขา prod มาที่เดียวกัน
                              ▼
                            prod  ──Vercel build──▶ เว็บจริง (erp-platform-playground.vercel.app)
```

- Vercel ตั้ง **Production Branch = `prod`** (เจ้าของเปลี่ยนเองใน dashboard 2026-11-11)
- ไม่มีงานใหม่ = ไม่ build · GitHub ตั้งเวลาอาจช้ากว่า 10 นาทีได้บ้าง (ปกติไม่กี่นาที)

## ขึ้นทันที (ไม่รอรอบ)

- หน้า **`/admin/deploy`** ปุ่ม "ขึ้นเว็บทันที" (สิทธิ์ admin.users) — เห็นจำนวนงานที่รอ + เว็บจริงตอนนี้เป็นงานไหน/build เสร็จไหม
  - ถ้ายังไม่ตั้ง env `GITHUB_DEPLOY_TOKEN` ใน Vercel → ปุ่มเปิดหน้า GitHub ให้กด "Run workflow" เอง
  - ตั้งแล้ว (fine-grained token เฉพาะ repo นี้ สิทธิ์ Actions: Read and write) → กดครั้งเดียวจบ + ลง audit `deploy_now`
- session (Claude): `gh workflow run deploy-batch.yml --repo weerapeace/erp-platform-playground` — **ใช้เมื่อเจ้าของขอ/งานด่วนเท่านั้น** (กดทุกงาน = กลับไปเสียค่า build เท่าเดิม)

## ตรวจหลัง deploy (CLAUDE.md §46 Step 7) — เปลี่ยนจากเดิม

1. **งานเข้าเว็บจริงหรือยัง**: `gh api repos/weerapeace/erp-platform-playground/compare/<sha>...prod --jq .status` → `ahead`/`identical` = prod มีงานนี้แล้ว · `behind` = ยังรอรอบ
2. **build ผ่านไหม**: `gh api repos/weerapeace/erp-platform-playground/commits/prod/status --jq .state` → `success`
   (commit ระหว่างรอบจะไม่มีสถานะ Vercel ของตัวเอง — ดูที่ prod)
3. ชั้นอื่นเหมือนเดิม (chunk / curl / DB) · `npm run perf-check -- --changed` รอให้งานเข้า prod เอง (สูงสุด 15 นาที)

## ไฟล์ที่เกี่ยวข้อง

- `.github/workflows/deploy-batch.yml` — **อยู่บนสาขา main** (schedule/workflow_dispatch ทำงานจากสาขา default เท่านั้น) · แก้ผ่าน GitHub API ใส่ `[skip ci]` (กัน deploy สำรอง CF) — main ตั้ง `deploymentEnabled: false` แล้ว Vercel จึงไม่ build
- `vercel.json` → `git.deploymentEnabled: { "feat/host-portable": false, "main": false }`
- `lib/deploy-queue.ts` (กติกา pure + เทสต์) · `app/admin/deploy/page.tsx` · `app/api/admin/deploy/route.ts`
- `scripts/perf-check.mjs` — `PROD_BRANCH = "prod"` + รองานเข้า prod

## ย้อนกลับ (กลับไป build ทุก push)

1. Vercel → Settings → Environments → Production → Branch = `feat/host-portable`
2. ลบ `git.deploymentEnabled` ออกจาก `vercel.json` · ปิด workflow: `gh workflow disable deploy-batch.yml`
3. `scripts/perf-check.mjs` PROD_BRANCH กลับเป็น `feat/host-portable`
