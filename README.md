# ERP Platform — Playground

Next.js 15 ERP playground เชื่อม Supabase + Cloudflare R2

## 🚀 Deploy: Cloudflare Pages (GitHub Connect)

### Build Settings ใน Cloudflare Pages dashboard

| Setting | Value |
|---|---|
| Framework preset | **Next.js** |
| Build command | `npx @cloudflare/next-on-pages@1` |
| Build output directory | `.vercel/output/static` |
| Root directory | (ว่าง — หรือ `apps/playground` ถ้าใช้ monorepo) |
| Node version | `22` |

### Environment Variables (set in CF Pages dashboard)

**Production:**
```
NEXT_PUBLIC_SUPABASE_URL          = https://cyivhkecxeoonlowcvaz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = <copy from local .env.local>
SUPABASE_SERVICE_ROLE_KEY         = <copy from local .env.local>
R2_ACCOUNT_ID                     = <copy from admin app .env>
R2_ACCESS_KEY_ID                  = <copy from admin app .env>
R2_SECRET_ACCESS_KEY              = <copy from admin app .env>
R2_BUCKET                         = odoo-product-images
```

**Note:** `SUPABASE_SERVICE_ROLE_KEY` + `R2_SECRET_ACCESS_KEY` ต้องตั้งเป็น **Secret** (encrypted) ใน CF Pages

### Compatibility Flags (ตั้งใน CF Pages → Settings → Functions)

- `nodejs_compat` — ใส่ทั้ง Production + Preview

### Cloudflare Access (จำกัด email)

หลัง deploy ครั้งแรก:
1. Cloudflare dashboard → Zero Trust → Access → Applications
2. Add Application → Self-hosted
3. Application domain: `<your-pages-domain>.pages.dev`
4. Policy: Allow → Include → Email → ใส่ email ที่อนุญาต

## 🛠️ Local Dev

```bash
# จาก C:\erp-local\playground (ไม่ใช่จาก Drive โดยตรง — slow)
npm run dev
```

เปิด http://localhost:3001
