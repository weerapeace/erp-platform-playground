// ============================================================
// ความลับที่เก็บอยู่ในตารางตั้งค่า (ของกลาง) — เช่น โทเคนบอท LINE ใน china_app_settings (skey=line_config → sval.token)
// กติกา: ห้ามส่งค่าจริงไปหน้าเว็บ ส่งแค่ "••••" + 4 ตัวท้าย ให้รู้ว่าตั้งไว้แล้ว
//        ตอนบันทึก ถ้าค่าที่ส่งกลับมาเป็นค่าที่ปิดไว้ (หรือว่าง) = คงค่าเดิมใน DB (ไม่เขียนทับด้วย ••••)
// ฝั่ง server ที่ต้องใช้ค่าจริง (ส่ง LINE ฯลฯ) อ่านตรงจาก DB ด้วย supabaseAdmin ตามเดิม
// ตารางในนี้ต้องอ่านผ่าน server เท่านั้น (master-v2 ใช้ supabaseAdmin แทน JWT ผู้ใช้) — เพื่อปิดสิทธิ์อ่านตรงจาก DB ได้
// ============================================================
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

// ตาราง → คอลัมน์ชื่อคีย์ / คอลัมน์ค่า (jsonb) / คีย์ไหนมีความลับอะไรบ้าง
const SECRET_TABLES: Record<string, { keyCol: string; valCol: string; secrets: Record<string, string[]> }> = {
  china_app_settings: { keyCol: "skey", valCol: "sval", secrets: { line_config: ["token", "channel_secret"], web_push: ["vapid_private"] } },
};

export const SECRET_MASK = "••••";

export function hasSecretFields(table: string): boolean { return table in SECRET_TABLES; }

function maskValue(v: unknown): unknown {
  if (typeof v !== "string" || !v) return v;
  return `${SECRET_MASK}${v.slice(-4)}`;
}

/** ปิดค่าความลับในแถวก่อนส่งไปหน้าเว็บ */
export function maskSecretRows<T extends Row>(table: string, rows: T[]): T[] {
  const cfg = SECRET_TABLES[table];
  if (!cfg) return rows;
  return rows.map((r) => {
    const fields = cfg.secrets[String(r?.[cfg.keyCol] ?? "")];
    const val = r?.[cfg.valCol];
    if (!fields || !val || typeof val !== "object" || Array.isArray(val)) return r;
    const next: Row = { ...(val as Row) };
    for (const f of fields) if (f in next) next[f] = maskValue(next[f]);
    return { ...r, [cfg.valCol]: next };
  });
}

/**
 * ก่อนบันทึก: ค่าความลับที่ส่งมาเป็น "ค่าที่ปิดไว้" หรือว่าง → ใช้ค่าเดิมใน DB แทน (id = null คือสร้างใหม่ → ตัดค่าที่ปิดไว้ทิ้ง)
 * คืน patch ใหม่ (ไม่แก้ของเดิม)
 */
export async function keepSecretsOnWrite(admin: Admin, table: string, id: string | null, patch: Row): Promise<Row> {
  const cfg = SECRET_TABLES[table];
  const incoming = patch[cfg?.valCol ?? ""];
  if (!cfg || !incoming || typeof incoming !== "object" || Array.isArray(incoming)) return patch;
  let key = typeof patch[cfg.keyCol] === "string" ? String(patch[cfg.keyCol]) : "";
  let existing: Row = {};
  if (id) {
    const { data } = await admin.from(table).select(`${cfg.keyCol}, ${cfg.valCol}`).eq("id", id).maybeSingle();
    const cur = (data ?? {}) as Row;
    if (!key) key = String(cur[cfg.keyCol] ?? "");
    existing = (cur[cfg.valCol] && typeof cur[cfg.valCol] === "object" ? cur[cfg.valCol] : {}) as Row;
  }
  const fields = cfg.secrets[key];
  if (!fields) return patch;
  const next: Row = { ...(incoming as Row) };
  for (const f of fields) {
    const v = next[f];
    const isMasked = v === undefined || v === null || v === "" || (typeof v === "string" && v.startsWith(SECRET_MASK));
    if (!isMasked) continue;
    if (existing[f] !== undefined) next[f] = existing[f]; else delete next[f];
  }
  return { ...patch, [cfg.valCol]: next };
}
