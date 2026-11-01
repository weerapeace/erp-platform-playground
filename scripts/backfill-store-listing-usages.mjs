// 🌐 เติม "ใช้อยู่ที่เว็บ" (asset_usages module store_listing) ให้รูปที่ลงหน้าขายบนเว็บไว้ก่อนมีระบบนี้
//    ของใหม่บันทึกเองตอนกดบันทึกหน้าขายบนเว็บ (lib/store-listing-usage) — สคริปต์นี้ไว้เติมของเก่าทั้งก้อน · รันซ้ำได้ (ล้างแล้วใส่ใหม่ต่อร้าน+รุ่น)
//
//   node scripts/backfill-store-listing-usages.mjs                  ดูตัวเลขอย่างเดียว ไม่เขียน
//   node scripts/backfill-store-listing-usages.mjs --apply          เขียนจริง
//   node scripts/backfill-store-listing-usages.mjs --album TTM114   ดูโฟลเดอร์ 🌐 รูปบนเว็บ ของรุ่นนี้ (อ่านอย่างเดียว · ตัวเดียวกับคลังไฟล์)
//
// ต้องมี .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createRequire(import.meta.url)("jiti")(fileURLToPath(import.meta.url), { alias: { "@": ROOT } });
const { planStoreListingUsages, applyStoreListingUsages } = jiti(path.join(ROOT, "lib/store-listing-usage.ts"));
const { webAlbumForParent } = jiti(path.join(ROOT, "lib/brand-album-web.ts"));
const APPLY = process.argv.includes("--apply");
const album = process.argv.includes("--album") ? process.argv[process.argv.indexOf("--album") + 1] : null;

const env = { ...process.env };
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/^﻿/, "").trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

if (album) {
  const { data: p } = await sb.from("parent_skus_v2").select("id, code").eq("code", album).maybeSingle();
  if (!p) throw new Error(`ไม่พบรุ่น ${album}`);
  for (const shop of await webAlbumForParent(sb, p.id)) {
    console.log(`ร้าน ${shop.shop_name}`);
    for (const f of shop.folders) console.log(`  📂 ${f.label} — ${f.images.length} รูป · ${f.images.slice(0, 3).map((i) => i.title).join(", ")}${f.images.length > 3 ? " …" : ""}`);
  }
  process.exit(0);
}

const pairs = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("store_listings").select("shop_id, parent_sku_id").order("id").range(from, from + 999);
  if (error) throw error;
  pairs.push(...data.map((r) => ({ shopId: r.shop_id, parentId: r.parent_sku_id })));
  if (data.length < 1000) break;
}
const plan = await planStoreListingUsages(sb, pairs);
const { count: before } = await sb.from("asset_usages").select("id", { count: "exact", head: true }).eq("module", "store_listing");
console.log(`หน้าขายบนเว็บ ${pairs.length} แถว · รุ่นที่มีรูปเว็บ ${new Set(plan.rows.map((r) => r.record_id)).size} รุ่น`);
console.log(`จะบันทึก "ใช้อยู่ที่เว็บ" ${plan.rows.length} แถว (รูปในคลัง ${new Set(plan.rows.map((r) => r.asset_id)).size} ไฟล์) · ตอนนี้มีอยู่ ${before ?? 0} แถว`);
console.log(`รูปบนเว็บที่ไม่อยู่ในคลัง (บันทึกไม่ได้ ข้าม) ${plan.missingKeys.length} ไฟล์`);
console.log(`ตัวอย่างป้าย: ${[...new Set(plan.rows.map((r) => r.record_label))].slice(0, 4).join(" | ")}`);
if (!APPLY) {
  console.log("(ดูตัวเลขอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)");
  process.exit(0);
}
await applyStoreListingUsages(sb, plan);
const { count: after } = await sb.from("asset_usages").select("id", { count: "exact", head: true }).eq("module", "store_listing");
console.log(`เขียนแล้ว · ตอนนี้มี "ใช้อยู่ที่เว็บ" ${after} แถว`);
