/**
 * ของกลาง (ฝั่ง server) — เขียน "ช่องคำนวณ" ของ Parent SKU ลงคอลัมน์ให้ตรงกับที่ป๊อป Parent SKU โชว์
 *
 * เจ้าของสั่ง "แก้ที่ต้นทาง" 2026-11-21 — ทำไม/กติกา ดู lib/parent-computed-sync (ส่วนคิด) · คู่มือ docs/parent-computed-sync.md
 * เรียกจาก 3 ที่:
 *   1. บันทึก Parent SKU (app/api/master-v2/[entity]/[id] + bulk-update → after()) — ทีละรุ่น
 *   2. รอบทุกคืน /api/cron/parent-computed-sync — ทุกรุ่น (เก็บตกตอนแก้ตารางเชื่อม/ตั้งบล็อก ⚙/แก้ทางอื่นที่ไม่ผ่านป๊อป)
 *   3. คนกดเอง (POST /api/cron/parent-computed-sync) — เติมย้อนหลังครั้งแรก · GET = ลองดูก่อน ไม่เขียน
 * ย้อนได้: ค่าเดิมของ Platform Description เก็บในประวัติเวอร์ชัน (entity_field_history · source "computed_sync")
 * ไม่ทำให้ลำดับ "แก้ล่าสุด" สลับ: ทริกเกอร์ parent_skus_v2_touch_updated_at คง updated_at เมื่อแก้แค่ช่องคำนวณ
 */
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadParentComputedColumns, parentComputedCatalog } from "@/lib/spec-export-server";
import { SYNCED_PARENT_COMPUTES, planParentComputedSync, previewText, type ComputedSyncChange } from "@/lib/parent-computed-sync";
import { VERSIONED_TEXT_FIELDS, captureFieldVersions } from "@/lib/record-versions";
import { writeAudit } from "@/lib/audit";

type Admin = ReturnType<typeof supabaseAdmin>;

export type ParentComputedSyncSource = "save" | "cron" | "manual";
export type ParentComputedSyncResult = {
  dryRun: boolean;
  checked: number;
  changed: number;
  failed: number;
  keptBlank: number;
  byField: Record<string, number>;
  columns: string[];
  samples: { code: string; column: string; old: string | null; new: string | null }[];
  ms: number;
};

/** แก้หลายรายการเกินนี้ → ไม่ทำตามหลังทันที ปล่อยรอบทุกคืนเก็บ (กันงานยาวเกินเวลาของคำขอ) */
const AFTER_SAVE_MAX = 300;
const CHUNK = 150;          // .in() ทีละ 150 id (URL ไม่ยาวเกิน)
const CONCURRENCY = 6;      // เขียนพร้อมกันกี่รุ่น

async function allParentIds(admin: Admin): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("parent_skus_v2").select("id").order("id").range(from, from + 999);
    if (error) throw new Error(`โหลดรายการ Parent SKU ไม่สำเร็จ: ${error.message}`);
    const rows = (data ?? []) as { id: string }[];
    out.push(...rows.map((r) => r.id));
    if (rows.length < 1000) break;
  }
  return out;
}

/** เขียนทีละรุ่น (คอลัมน์ที่เปลี่ยน) + จดค่าเดิมลงประวัติเวอร์ชัน · คืนจำนวนที่พลาด */
async function applyChanges(admin: Admin, changes: ComputedSyncChange[], actor: { actorId: string | null; actorName: string | null }): Promise<number> {
  const versioned = new Set(VERSIONED_TEXT_FIELDS.parent_skus_v2 ?? []);
  let failed = 0, i = 0;
  const worker = async () => {
    while (i < changes.length) {
      const c = changes[i++];
      const patch = Object.fromEntries(c.fields.map((f) => [f.column, f.new]));
      const { error } = await admin.from("parent_skus_v2").update(patch).eq("id", c.id);
      if (error) { failed++; console.warn("[parent-computed-sync] update", c.code, error.message); continue; }
      const vers = c.fields.filter((f) => versioned.has(f.column))
        .map((f) => ({ kind: "field" as const, field_key: f.column, old_value: f.old, new_value: f.new }));
      if (vers.length) await captureFieldVersions(admin, { table: "parent_skus_v2", id: c.id, changes: vers, source: "computed_sync", ...actor });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, changes.length) }, worker));
  return failed;
}

/**
 * หลังบันทึกข้อมูล master (ป๊อป Parent SKU / แก้หลายรายการ) → ถ้าเป็น Parent SKU เขียนช่องคำนวณตามหลัง
 * ทำหลังส่งคำตอบแล้ว (next/server after) → ไม่ทำให้ปุ่มบันทึกช้าลง · พลาด = รอบทุกคืนเก็บตก
 */
export function syncComputedAfterSave(table: string, ids: string[], actor: { actorId?: string | null; actorName?: string | null }): void {
  if (table !== "parent_skus_v2" || !ids.length || ids.length > AFTER_SAVE_MAX) return;
  after(() => syncParentComputedTexts(supabaseAdmin(), { ids, source: "save", actorId: actor.actorId ?? null, actorName: actor.actorName ?? null })
    .then(() => undefined, (e) => console.warn("[parent-computed-sync] after save", (e as Error).message)));
}

/**
 * คิดค่าช่องคำนวณของ Parent (ids ไม่ส่ง = ทุกรุ่น) เทียบกับคอลัมน์ แล้วเขียนตัวที่ต่าง
 * dryRun = ลองดูอย่างเดียว (คืนตัวเลข + ตัวอย่าง) ไม่เขียนอะไร
 */
export async function syncParentComputedTexts(
  admin: Admin,
  opts: { ids?: string[]; dryRun?: boolean; source: ParentComputedSyncSource; actorId?: string | null; actorName?: string | null; sampleLimit?: number },
): Promise<ParentComputedSyncResult> {
  const t0 = Date.now();
  const dryRun = !!opts.dryRun;
  const catalog = await parentComputedCatalog(admin);
  const columns = catalog
    .filter((f) => f.level === "parent" && f.kind === "computed" && !!f.compute && (SYNCED_PARENT_COMPUTES as readonly string[]).includes(f.compute.name))
    .map((f) => f.column)
    .filter((c) => /^[a-z0-9_]+$/.test(c));
  const res: ParentComputedSyncResult = { dryRun, checked: 0, changed: 0, failed: 0, keptBlank: 0, byField: {}, columns, samples: [], ms: 0 };
  if (!columns.length) { res.ms = Date.now() - t0; return res; }

  const ids = opts.ids ? [...new Set(opts.ids.filter(Boolean))] : await allParentIds(admin);
  const sampleLimit = opts.sampleLimit ?? 12;
  const allChanges: ComputedSyncChange[] = [];
  for (let k = 0; k < ids.length; k += CHUNK) {
    const part = ids.slice(k, k + CHUNK);
    const [computed, storedRes] = await Promise.all([
      loadParentComputedColumns(admin, part, SYNCED_PARENT_COMPUTES, catalog),
      admin.from("parent_skus_v2").select(`id, code, ${columns.join(", ")}`).in("id", part),
    ]);
    if (storedRes.error) throw new Error(`อ่านคอลัมน์เดิมไม่สำเร็จ: ${storedRes.error.message}`);
    const plan = planParentComputedSync((storedRes.data ?? []) as unknown as (Record<string, unknown> & { id: string })[], computed, columns);
    res.checked += plan.checked;
    res.keptBlank += plan.keptBlank;
    for (const [c, n] of Object.entries(plan.byField)) res.byField[c] = (res.byField[c] ?? 0) + n;
    allChanges.push(...plan.changes);
  }
  res.changed = allChanges.length;
  for (const c of allChanges) {
    for (const f of c.fields) {
      if (res.samples.length >= sampleLimit) break;
      res.samples.push({ code: c.code, column: f.column, old: previewText(f.old), new: previewText(f.new) });
    }
    if (res.samples.length >= sampleLimit) break;
  }

  if (!dryRun && allChanges.length) {
    const actor = { actorId: opts.actorId ?? null, actorName: opts.actorName ?? (opts.source === "cron" ? "ระบบ (รอบทุกคืน)" : null) };
    res.failed = await applyChanges(admin, allChanges, actor);
    const single = ids.length === 1 ? allChanges[0] : null;
    await writeAudit(admin, {
      action: "parent_computed:sync", entityType: "parent_skus_v2", entityId: single?.id ?? null,
      actorId: actor.actorId, actorName: actor.actorName,
      metadata: {
        source: opts.source, checked: res.checked, changed: res.changed, failed: res.failed, by_field: res.byField, kept_blank: res.keptBlank,
        changed_codes: allChanges.slice(0, 500).map((c) => c.code),
        ...(single ? { record_label: single.code, changes: single.fields.map((f) => ({ field: f.column, old: previewText(f.old, 300), new: previewText(f.new, 300) })) } : {}),
      },
    });
  }
  res.ms = Date.now() - t0;
  return res;
}
