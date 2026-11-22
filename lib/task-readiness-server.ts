/**
 * ความพร้อมสินค้าของงาน — ฝั่ง server (ตัวคำนวณจริง = lib/task-readiness ตัวเดียวกับหน้าเว็บ)
 *  • loadReadinessParents  = ข้อมูล Parent/SKU ของงาน (ใช้ร่วมกับปุ่ม "ตรวจเร็ว" /api/creative-tasks/[id]/quick-check)
 *  • computeTaskReadiness  = ผ่านกี่ข้อ/ทั้งหมด ตามข้อเช็กของประเภทงาน — ไม่นับข้อ "ลงครบทุก Platform" (ต้องดึงสถานะร้าน)
 *    ลิ้นชักงานนับข้อลงร้านด้วยแล้วบันทึกทับเองตอนเปิดงาน (POST /api/creative-tasks/[id]/readiness)
 *  • fillMissingReadiness  = เติมผลให้งานที่ยังไม่เคยเช็ก ทีละไม่กี่งาน (เรียกเบื้องหลังจากรายการงาน)
 * ผลเก็บที่ erp_creative_tasks.readiness_done / readiness_total / readiness_at → แถบบนการ์ดบอร์ดงาน (เจ้าของเลือก 2026-11-22)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { loadTaskImages } from "@/lib/task-images-server";
import { plainColor } from "@/lib/product-listing-checks";
import { cleanReadinessRules, readinessKeysFor, readinessSummary, taskReadiness, READINESS_RULES_KEY, type ReadinessParent } from "@/lib/task-readiness";

type Db = ReturnType<typeof supabaseAdmin>;
const num = (v: unknown): number | null => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : n; };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export type ReadinessParentsLoad = { ok: true; parents: ReadinessParent[] } | { ok: false; status: number; error: string };

export async function loadReadinessParents(admin: Db, taskId: string): Promise<ReadinessParentsLoad> {
  const r = await loadTaskImages(admin, taskId, {
    parentCols: ", introduction, description, english_description, size_length_cm, size_height_cm, size_thickness_cm, warranty, weight_g, category_id",
    skuCols: ", color_platform_th, color_platform_en, list_price, fake_price",
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  const pRow = new Map(r.parentRows.map((x) => [String(x.id), x]));
  const sRow = new Map(r.skuRows.map((x) => [String(x.id), x]));
  const parents: ReadinessParent[] = r.data.parents.map((p) => {
    const row = pRow.get(p.id) ?? {};
    const l = num(row.size_length_cm), h = num(row.size_height_cm), t = num(row.size_thickness_cm);
    return {
      id: p.id, code: p.code, name: p.name,
      introduction: str(row.introduction), description: str(row.description), english_description: str(row.english_description),
      size: l || h || t ? { length: l, height: h, thickness: t } : null,
      warranty: str(row.warranty), weight_g: num(row.weight_g), category_id: row.category_id != null ? String(row.category_id) : null,
      parent_images: p.images.length, description_images: p.description.length, thumbs: p.images.slice(0, 6).map((x) => x.key),
      skus: p.skus.map((s) => {
        const sr = sRow.get(s.id) ?? {};
        return {
          code: s.code,
          color_th: str(sr.color_th) ?? (plainColor(str(sr.color_platform_th)) || null),
          color_en: str(sr.color_platform_en),
          list_price: num(sr.list_price), fake_price: num(sr.fake_price),
          images: s.images.length,
        };
      }),
    };
  });
  return { ok: true, parents };
}

async function loadRules(admin: Db) {
  const { data } = await admin.from("ui_config").select("value").eq("key", READINESS_RULES_KEY).maybeSingle();
  return cleanReadinessRules((data as { value?: unknown } | null)?.value ?? null);
}

/** ผ่าน/ทั้งหมด (ไม่นับข้อลงร้าน) · งานยังไม่ผูกสินค้า = null */
export async function computeTaskReadiness(admin: Db, task: { id: string; task_type: string | null }, rules?: Awaited<ReturnType<typeof loadRules>>): Promise<{ done: number; total: number } | null> {
  const r = await loadReadinessParents(admin, task.id);
  if (!r.ok || !r.parents.length) return null;
  const keys = readinessKeysFor(rules ?? await loadRules(admin), task.task_type).filter((k) => k !== "platform");
  const s = readinessSummary(taskReadiness(r.parents, keys, {}));
  return { done: s.done, total: s.total };
}

export async function saveTaskReadiness(admin: Db, taskId: string, v: { done: number; total: number } | null): Promise<void> {
  await admin.from("erp_creative_tasks").update({ readiness_done: v?.done ?? null, readiness_total: v?.total ?? null, readiness_at: new Date().toISOString() }).eq("id", taskId);
}

/** เติมผลให้งานที่ยังไม่ปิดและยังไม่เคยเช็ก (ทีละ limit งาน) — คืนจำนวนที่ทำ */
export async function fillMissingReadiness(admin: Db, limit = 8): Promise<number> {
  const { data: term } = await admin.from("erp_creative_statuses").select("key").eq("is_terminal", true);
  const closed = ((term ?? []) as { key: string }[]).map((x) => x.key);
  const q = admin.from("erp_creative_tasks").select("id, task_type, status").eq("is_active", true).is("readiness_at", null).order("updated_at", { ascending: false }).limit(limit * 3);
  const { data } = await q;
  const rows = ((data ?? []) as { id: string; task_type: string | null; status: string }[]).filter((x) => !closed.includes(x.status)).slice(0, limit);
  if (!rows.length) return 0;
  const rules = await loadRules(admin);
  for (const row of rows) {
    try { await saveTaskReadiness(admin, row.id, await computeTaskReadiness(admin, row, rules)); } catch { /* ข้ามงานที่โหลดไม่ได้ รอบหน้าค่อยลองใหม่ */ }
  }
  return rows.length;
}
