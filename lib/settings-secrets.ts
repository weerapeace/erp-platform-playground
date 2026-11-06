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
// ฟิลด์ซ้อนเขียนแบบ "bots.*.token" = ทุกตัวใต้ bots (ดอกจัน 1 ชั้น) — บอท LINE เสริมแต่ละตัวมีโทเคนของตัวเอง
const SECRET_TABLES: Record<string, { keyCol: string; valCol: string; secrets: Record<string, string[]> }> = {
  china_app_settings: { keyCol: "skey", valCol: "sval", secrets: {
    line_config: ["token", "channel_secret", "bots.*.token", "bots.*.channel_secret"],
    web_push: ["vapid_private"],
  } },
};

export const SECRET_MASK = "••••";

export function hasSecretFields(table: string): boolean { return table in SECRET_TABLES; }

function maskValue(v: unknown): unknown {
  if (typeof v !== "string" || !v) return v;
  return `${SECRET_MASK}${v.slice(-4)}`;
}

const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

/** แปลงรายการฟิลด์ (มี "*") เป็นทางเดินจริงในก้อนนี้ เช่น bots.*.token → [["bots","b1","token"], ...] */
function expandPaths(fields: string[], ...sources: Row[]): string[][] {
  const out: string[][] = [];
  for (const f of fields) {
    const parts = f.split(".");
    const star = parts.indexOf("*");
    if (star < 0) { out.push(parts); continue; }
    const keys = new Set<string>();
    for (const src of sources) {
      let node: unknown = src;
      for (const p of parts.slice(0, star)) node = isObj(node) ? node[p] : undefined;
      if (isObj(node)) for (const k of Object.keys(node)) keys.add(k);
    }
    for (const k of keys) out.push([...parts.slice(0, star), k, ...parts.slice(star + 1)]);
  }
  return out;
}

function getPath(obj: Row, path: string[]): unknown {
  let node: unknown = obj;
  for (const p of path) node = isObj(node) ? node[p] : undefined;
  return node;
}

/** เขียนค่าตามทางเดิน (copy ทุกชั้นที่แตะ ไม่แก้ของเดิม) · value undefined = ลบฟิลด์ */
function setPath(obj: Row, path: string[], value: unknown): Row {
  const [head, ...rest] = path;
  const next: Row = { ...obj };
  if (rest.length === 0) {
    if (value === undefined) delete next[head]; else next[head] = value;
    return next;
  }
  if (!isObj(next[head])) return next;   // ไม่มีชั้นนี้ = ไม่มีอะไรต้องทำ
  next[head] = setPath(next[head] as Row, rest, value);
  return next;
}

/** ปิดค่าความลับในแถวก่อนส่งไปหน้าเว็บ */
export function maskSecretRows<T extends Row>(table: string, rows: T[]): T[] {
  const cfg = SECRET_TABLES[table];
  if (!cfg) return rows;
  return rows.map((r) => {
    const fields = cfg.secrets[String(r?.[cfg.keyCol] ?? "")];
    const val = r?.[cfg.valCol];
    if (!fields || !isObj(val)) return r;
    let next: Row = { ...val };
    for (const path of expandPaths(fields, val)) {
      const v = getPath(next, path);
      if (v !== undefined) next = setPath(next, path, maskValue(v));
    }
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
  let next: Row = { ...(incoming as Row) };
  // ทางเดินจากทั้งค่าที่ส่งมา + ค่าเดิม (บอทที่มีใน DB แต่ส่งมาไม่ครบ → คืนความลับให้ถ้ายังมีบอทนั้นอยู่)
  for (const path of expandPaths(fields, next, existing)) {
    const v = getPath(next, path);
    const isMasked = v === undefined || v === null || v === "" || (typeof v === "string" && v.startsWith(SECRET_MASK));
    if (!isMasked) continue;
    const old = getPath(existing, path);
    next = setPath(next, path, old !== undefined ? old : undefined);
  }
  return { ...patch, [cfg.valCol]: next };
}
