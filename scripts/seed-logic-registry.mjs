// LR2: Parse docs/LOGIC_MEMORY_SIMPLE.md → upsert erp_logic_registry
//
// รันด้วย:  node scripts/seed-logic-registry.mjs
// ต้องมีไฟล์ .env.local ที่มี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//
// ใช้ตอน docs/LOGIC_MEMORY_SIMPLE.md เปลี่ยน → sync เข้า DB ใหม่
// upsert แบบ merge-duplicates + omit impl_status/logic_status → ไม่ทับสถานะที่ผู้ใช้ติ๊กไว้
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// docs อยู่นอก app (../../docs) — แต่ถ้า repo เป็น playground เดี่ยว ให้ override ด้วย LOGIC_MD env
const MD_PATH = process.env.LOGIC_MD || resolve(ROOT, "../../docs/LOGIC_MEMORY_SIMPLE.md");
const ENV_PATH = resolve(ROOT, ".env.local");

// ---- โหลด env (strip BOM) ----
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("missing supabase env"); process.exit(1); }

// ---- parse markdown ----
const md = readFileSync(MD_PATH, "utf8").replace(/^﻿/, "");
const lines = md.split(/\r?\n/);

const FIELD_MAP = {
  "ภาษาคน": "plain_language",
  "เกิดเมื่อ": "trigger_when",
  "ระบบต้องทำ": "system_action",
  "กันปัญหา": "prevents",
  "เกี่ยวกับ": "related_modules",
};

let curCat = null, curCatName = null;
let order = 0;
const rules = [];
let cur = null;
const pushCur = () => { if (cur) { rules.push(cur); cur = null; } };

for (const raw of lines) {
  const line = raw.trimEnd();
  const cat = line.match(/^#\s+([A-O])\.\s+(.+)$/);     // # D. BOM Logic
  if (cat) { pushCur(); curCat = cat[1]; curCatName = cat[2].trim(); continue; }

  const head = line.match(/^##\s+(LOG-[A-Z0-9-]+)\s+[—-]\s+(.+)$/);  // ## LOG-BOM-0001 — ชื่อ
  if (head) {
    pushCur();
    order += 10;
    cur = {
      logic_id: head[1].trim(), category: curCat, category_name: curCatName,
      short_name: head[2].trim(),
      plain_language: null, trigger_when: null, system_action: null,
      prevents: null, related_modules: null, display_order: order,
    };
    continue;
  }

  const fld = line.match(/^\*\*([^:*]+):\*\*\s*(.+)$/);  // **ภาษาคน:** value
  if (fld && cur) {
    const key = FIELD_MAP[fld[1].trim()];
    if (key) cur[key] = fld[2].trim();
  }
}
pushCur();

console.log(`parsed ${rules.length} rules`);
if (rules.length === 0) process.exit(1);

const res = await fetch(`${URL}/rest/v1/erp_logic_registry?on_conflict=logic_id`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": KEY, "Authorization": `Bearer ${KEY}`,
    "Prefer": "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rules),
});
if (!res.ok) { console.error("upsert failed", res.status, await res.text()); process.exit(1); }
console.log(`upserted OK (${rules.length} rows)`);

const byCat = {};
for (const r of rules) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log("by category:", JSON.stringify(byCat));
