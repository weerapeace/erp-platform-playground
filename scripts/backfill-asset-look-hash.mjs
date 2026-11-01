// 👁️ เติมลายนิ้วมือหน้าตารูป (assets.phash / phash_color) + กว้าง×สูงที่ยังว่าง ให้รูปในคลังที่ยังไม่มี
//    รูปใหม่ได้เองตอนอัป (/api/admin/upload) + cron รายวัน (/api/cron/asset-look-hash · 7 วันล่าสุด) — สคริปต์นี้ไว้เติมรูปเก่าทั้งก้อน
//
//   node scripts/backfill-asset-look-hash.mjs            เติมจริง (ข้ามรูปที่มีแล้ว → รันซ้ำได้)
//   node scripts/backfill-asset-look-hash.mjs --dry      นับอย่างเดียว ไม่เขียน
//
// ต้องมี .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
// ขั้นย่อรูปต้องตรงกับ lib/image-hash-server.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { AwsClient } from "aws4fetch";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { LOOK_SIZE, lookHashFromPixels } = await import(pathToFileURL(path.join(ROOT, "lib/image-hash.ts")).href);
const DRY = process.argv.includes("--dry");

const env = { ...process.env };
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/^﻿/, "").trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bucket = env.R2_BUCKET || env.R2_BUCKET_NAME || "odoo-product-images";
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, region: "auto", service: "s3" });
const r2Url = (key) => `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("assets").select("id, r2_key, width, height")
    .eq("status", "active").eq("asset_type", "image").is("phash", null).not("r2_key", "is", null).order("id").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`รูปที่ยังไม่มีลายนิ้วมือ ${rows.length} รูป${DRY ? " (--dry ไม่เขียน)" : ""}`);
if (DRY) process.exit(0);

let n = 0, filled = 0, skipped = 0, i = 0;
async function one(r) {
  try {
    const res = await r2.fetch(r2Url(r.r2_key));
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new Error(`R2 ${res.status}`);
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const { data, info } = await sharp(buf, { failOn: "none" }).rotate().flatten({ background: "#ffffff" })
      .resize(LOOK_SIZE, LOOK_SIZE, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const look = lookHashFromPixels(data, info.width, info.height, info.channels);
    if (!look) { skipped++; return; }
    const swap = (meta.orientation ?? 1) >= 5;
    const { error } = await sb.from("assets").update({
      phash: look.phash, phash_color: look.color,
      width: r.width ?? (swap ? meta.height : meta.width) ?? null, height: r.height ?? (swap ? meta.width : meta.height) ?? null,
    }).eq("id", r.id);
    if (error) throw error;
    filled++;
  } catch { skipped++; }
  finally { if (++n % 500 === 0) console.log(`${n}/${rows.length} · เติม ${filled} · ข้าม ${skipped}`); }
}
await Promise.all(Array.from({ length: 10 }, async () => { while (i < rows.length) await one(rows[i++]); }));
console.log(`เสร็จ · เติม ${filled} · ข้าม ${skipped} (อ่านไม่ได้/รูปเรียบ)`);
