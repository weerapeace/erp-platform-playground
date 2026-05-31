# ERP Platform — Playground

Next.js 15 ERP playground เชื่อม Supabase + Cloudflare R2
Deploy บน **Cloudflare Workers** ผ่าน GitHub Actions

## 🚀 Deploy Setup (One-time)

### 1. Push code ขึ้น GitHub
```powershell
cd "G:\My Drive\Codex\erp-platform\apps\playground"
git remote add origin https://github.com/USERNAME/erp-platform-playground.git
git push -u origin main
```

### 2. สร้าง Cloudflare API Token

1. ไป https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → ใช้ template **"Edit Cloudflare Workers"**
3. Account Resources: include account ของคุณ
4. Zone Resources: All zones (หรือเฉพาะที่ใช้)
5. คลิก Create → copy token (เห็นครั้งเดียว!)

### 3. หา Cloudflare Account ID

CF dashboard → Workers & Pages (sidebar) → ขวาบนจะมี Account ID

### 4. ตั้ง GitHub Secrets

ไป GitHub repo → Settings → Secrets and variables → Actions → New repository secret

ตั้ง 7 secrets ตามนี้ (copy ค่าจาก `C:\erp-local\playground\.env.local`):

| Secret Name | ค่า |
|---|---|
| `CLOUDFLARE_API_TOKEN` | จาก step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | จาก step 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | จาก `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | จาก `.env.local` |
| `R2_ACCOUNT_ID` | จาก `.env.local` |
| `R2_ACCESS_KEY_ID` | จาก `.env.local` |
| `R2_SECRET_ACCESS_KEY` | จาก `.env.local` |

### 5. Trigger deploy

Push commit ใหม่ใด ๆ → GitHub Actions รัน build + deploy auto

หรือ manual trigger: GitHub repo → Actions → "Deploy to Cloudflare Workers" → Run workflow

หลัง deploy สำเร็จ จะได้ URL: `https://erp-platform-playground.<ACCOUNT_SUBDOMAIN>.workers.dev`

### 6. Cloudflare Access (optional — จำกัด email)

1. CF dashboard → **Zero Trust** → **Access** → **Applications**
2. **Add Application** → **Self-hosted**
3. Application domain: ใส่ URL ของ Worker
4. Policy: **Allow** → Include → **Emails** → ใส่ email ที่อนุญาต

## 🛠️ Local Dev

```bash
# work จาก C:\erp-local\playground (ไม่ใช่จาก Drive — slow)
npm run dev          # localhost:3001
```

## 📁 Project Layout

```
app/
  apps/              — App Launcher (Odoo-style home)
  master/parent-skus — Master Data v2: Parent SKUs
  api/master-v2/     — APIs for v2 tables
  api/...            — Other module APIs (44 routes, all edge runtime)
components/
  data-table/        — Universal DataTable (TanStack)
  modal, form, ...   — Shared UI components
lib/
  supabase*.ts       — Supabase clients (auth/admin/browser)
  r2.ts              — Cloudflare R2 helper (signed URLs)
```

## 🔑 Important Notes

- **Bundle size:** Workers free = 3MB compressed, paid = 10MB. ถ้า bundle เกิน 3MB → ต้องอัป Workers Paid ($5/mo)
- **Edge runtime:** ทุก API route ใส่ `export const runtime = "edge"` ไว้แล้ว (44 ไฟล์)
- **nodejs_compat:** เปิดใน `wrangler.jsonc` แล้ว
- **R2:** ใช้ bucket `odoo-product-images` ของ admin app
- **Supabase:** project `cyivhkecxeoonlowcvaz` (shared กับ admin app + payroll)
