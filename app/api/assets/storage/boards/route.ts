/**
 * /api/assets/storage/boards — รูปกระดาน (โฟลเดอร์ R2 `canvassketch/`) กินพื้นที่เท่าไหร่ "แยกตามกระดาน"
 *   GET            → ผลที่นับไว้ล่าสุด (ui_config key='r2_board_usage') · เร็ว
 *   GET ?refresh=1 → ไล่ขนาดไฟล์จริงจาก R2 + จับคู่กับ scene ทุกกระดาน แล้วเก็บผล (สิทธิ์ assets.manage)
 *
 * ขนาด = ขนาดไฟล์จริงบน R2 (ไม่ใช้ assets.size_bytes — คลังกลางกันซ้ำด้วย checksum ทำให้บางไฟล์ไม่มีแถว)
 * รูปเดียวกันถูกใช้หลายกระดาน = นับในทุกกระดานที่ใช้ (ยอดรวมรายกระดานจึงอาจมากกว่ายอดโฟลเดอร์เล็กน้อย)
 * ไฟล์ที่ไม่มีกระดานไหนอ้างถึง = unused (ดูคร่าว ๆ · วิเคราะห์ละเอียด/ล้าง = /api/assets/canvas-orphans)
 * เจ้าของขอ 2026-11-21 (การ์ดพื้นที่ R2 ในคลังไฟล์ → canvassketch "แยกตามกระดาน")
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getR2Binding, r2ListObjects } from "@/lib/r2";
import { extractKeys } from "@/lib/canvas-r2-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const CFG_KEY = "r2_board_usage";
const PREFIX = "canvassketch/";

/** ชนิดกระดานที่ย่อรูปเหลือ 600px webp ก่อนเก็บ (CanvasSketch imageMaxPx) — ตรงกับ TASK_BOARD_IMAGE_MAX ใน app/tasks/task-reference-board.tsx */
const SMALL_IMAGE_TYPES = new Set(["creative_task_brief", "creative_task_ref"]);

export type BoardUsageRow = { entity_type: string; entity_id: string; label: string; href: string | null; files: number; bytes: number; small: boolean };
export type BoardUsage = {
  boards: BoardUsageRow[];
  total_bytes: number; total_files: number;   // ไฟล์ทั้งหมดในโฟลเดอร์กระดาน
  unused_bytes: number; unused_files: number; // ไม่มีกระดานไหนอ้างถึง
  computed_at: string; truncated: boolean;
};

const TYPE_HREF: Record<string, (id: string) => string> = {
  creative_campaign: (id) => `/tasks/campaigns/${id}`,
  creative_trend: (id) => `/tasks/trends/${id}`,
  creative_task_brief: (id) => `/tasks/reference/${id}?board=brief`,
  creative_task_ref: (id) => `/tasks/reference/${id}`,
  creative_board: (id) => `/tasks?task=${id}`,
  work_board: () => `/master/work-board`,
  team_plan_board: () => `/tasks/plan`,
};

async function labels(admin: ReturnType<typeof supabaseAdmin>, rows: { entity_type: string; entity_id: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const idsOf = (types: string[]) => [...new Set(rows.filter((r) => types.includes(r.entity_type)).map((r) => r.entity_id))];
  const pick = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await admin.from(table).select(`id, ${col}`).in("id", ids.slice(i, i + 150));
      for (const r of (data ?? []) as unknown as Record<string, string>[]) if (r[col]) out.set(String(r.id), String(r[col]));
    }
  };
  const uuid = (ids: string[]) => ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  await Promise.all([
    pick("erp_creative_campaigns", "name", uuid(idsOf(["creative_campaign"]))),
    pick("erp_creative_trends", "title", uuid(idsOf(["creative_trend"]))),
    pick("erp_creative_tasks", "title", uuid(idsOf(["creative_task_brief", "creative_task_ref", "creative_board"]))),
    pick("design_sheets", "name", uuid(idsOf(["design_sheet"]))),
  ]);
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  if (new URL(request.url).searchParams.get("refresh") !== "1") {
    const { data } = await admin.from("ui_config").select("value").eq("key", CFG_KEY).maybeSingle();
    return NextResponse.json({ data: (data?.value as BoardUsage | undefined) ?? null, error: null });
  }
  const deniedManage = await guardApi(request, "assets.manage"); if (deniedManage) return deniedManage;

  const bucket = await getR2Binding();
  if (!bucket) return NextResponse.json({ data: null, error: "R2 ยังไม่พร้อม (ไม่มี binding/ตั้งค่า S3)" }, { status: 503 });

  try {
    // 1) ขนาดไฟล์จริงในโฟลเดอร์กระดาน
    const size = new Map<string, number>();
    let cursor: string | undefined; let pages = 0; let truncated = false;
    for (;;) {
      const page = await r2ListObjects(bucket, { prefix: PREFIX, cursor, limit: 1000 });
      if (!page) return NextResponse.json({ data: null, error: "runtime นี้ยังไล่รายชื่อไฟล์ใน R2 ไม่ได้" }, { status: 501 });
      for (const o of page.objects) if (!o.key.endsWith("/")) size.set(o.key, o.size);
      pages++;
      if (!page.cursor) break;
      if (pages >= 100) { truncated = true; break; }
      cursor = page.cursor;
    }

    // 2) จับคู่ไฟล์ ↔ กระดาน
    const { data: sketches, error } = await admin.from("erp_canvas_sketches").select("entity_type, entity_id, scene");
    if (error) throw new Error(error.message);
    const used = new Set<string>();
    const raw: { entity_type: string; entity_id: string; files: number; bytes: number }[] = [];
    for (const s of (sketches ?? []) as { entity_type: string; entity_id: string; scene: unknown }[]) {
      const keys = new Set<string>();
      try { extractKeys(JSON.stringify(s.scene ?? {}), keys); } catch { /* ข้าม */ }
      let files = 0, bytes = 0;
      for (const k of keys) { const sz = size.get(k); if (sz === undefined) continue; files++; bytes += sz; used.add(k); }
      if (files) raw.push({ entity_type: s.entity_type, entity_id: s.entity_id, files, bytes });
    }
    const names = await labels(admin, raw);

    let totalBytes = 0, unusedBytes = 0, unusedFiles = 0;
    for (const [k, sz] of size) { totalBytes += sz; if (!used.has(k)) { unusedBytes += sz; unusedFiles++; } }

    const usage: BoardUsage = {
      boards: raw.map((r) => ({
        ...r,
        label: names.get(r.entity_id) ?? r.entity_id.slice(0, 8),
        href: TYPE_HREF[r.entity_type]?.(encodeURIComponent(r.entity_id)) ?? null,
        small: SMALL_IMAGE_TYPES.has(r.entity_type),
      })).sort((a, b) => b.bytes - a.bytes),
      total_bytes: totalBytes, total_files: size.size,
      unused_bytes: unusedBytes, unused_files: unusedFiles,
      computed_at: new Date().toISOString(), truncated,
    };
    await admin.from("ui_config").upsert({ key: CFG_KEY, value: usage, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return NextResponse.json({ data: usage, error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: `นับพื้นที่รายกระดานไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
