/**
 * /api/assets/canvas-orphans — รูปกระดาน (โฟลเดอร์ R2 `canvassketch/`) ที่ไม่มีกระดานไหนใช้แล้ว
 *
 *   GET  → วิเคราะห์อย่างเดียว (ไม่แตะไฟล์): ทั้งหมด / ยังใช้อยู่ / ไม่ได้ใช้ / ที่ล้างได้ (เก่ากว่า min_age_days)
 *   POST { min_age_days?: number } → ย้ายไฟล์ที่ล้างได้เข้าถังขยะ trash/ (นโยบายกลาง r2MoveToTrash — กู้คืนได้ 30 วัน)
 *          + แถวในคลังกลาง (assets) ที่ชี้ไฟล์นั้นและไม่มีใครใช้ → status=trashed + r2_key ชี้ไปที่ใหม่ในถัง
 *          + audit_logs 1 แถว (action=canvas_images_cleanup)
 *
 * เหตุผล: รูปที่แปะบนกระดาน Excalidraw ถูกย้ายขึ้น R2 ตอนบันทึก แต่ตอนลบรูปออกจากกระดาน
 *         กระดานแค่เลิกอ้างถึง (Excalidraw กรอง files ที่ไม่มี element ใช้ออกตอน serialize) — ไฟล์จริงยังอยู่ → ขยะสะสม
 *
 * "ยังใช้อยู่" นับจาก: (1) ข้อความ scene ของกระดานทุกชนิด (erp_canvas_sketches) ทั้งรูปใน files และ customData
 *                      (2) ใบนำเสนอ (design_sheets.presentation) ที่หยิบรูปจากกระดาน
 *                      (3) ตารางที่อ้าง r2_key ทั้งระบบ (ของกลาง r2KeysReferencedBatch) — ยกเว้นแถวคลังกลางที่ "ไม่มีที่ใช้" (asset_usages=0)
 *                          ซึ่งเกิดจากการแปะรูปบนกระดานแล้วถูกลงคลังอัตโนมัติ → ถือว่าล้างได้พร้อมไฟล์
 * สิทธิ์: assets.manage (เท่ากับจัดการคลัง) · POST ทำทีละไม่เกิน 400 ไฟล์ (กัน timeout) กดซ้ำได้จนหมด
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getR2Binding, r2ListObjects, r2MoveToTrash } from "@/lib/r2";
import { r2KeysReferencedBatch } from "@/lib/r2-refs";
import { writeAudit } from "@/lib/audit";
import { actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const PREFIX = "canvassketch/";
const DEFAULT_MIN_AGE_DAYS = 7;
const MAX_MOVE_PER_RUN = 400;

export type CanvasOrphan = { key: string; size: number; uploaded_at: string | null; age_days: number | null; in_library: boolean };
export type CanvasOrphanReport = {
  prefix: string;
  min_age_days: number;
  total: number; total_bytes: number;
  referenced: number; referenced_bytes: number;
  orphans: number; orphan_bytes: number;
  eligible: number; eligible_bytes: number;      // orphan + เก่ากว่า min_age_days
  too_new: number;                                 // orphan แต่ยังใหม่ (รอ)
  in_library: number;                              // ใน eligible มีแถวคลังกลางด้วยกี่ไฟล์
  sample: CanvasOrphan[];                          // ตัวอย่าง eligible (เก่าสุดก่อน) สูงสุด 40
  truncated: boolean;
  computed_at: string;
};

/** วันที่อัปโหลดจากชื่อไฟล์ `canvassketch/<user>/<timestamp>-<rand>.<ext>` (ของกลาง /api/admin/upload ตั้งชื่อแบบนี้) */
function uploadedFromKey(key: string): Date | null {
  const m = /\/(\d{13})-\d+\.[a-z0-9]+$/i.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ดึงคีย์ R2 ในโฟลเดอร์กระดานทุกตัวที่ปรากฏในข้อความ (ทั้งแบบตรง และแบบ encode ใน ?key=) */
function extractKeys(text: string, out: Set<string>) {
  if (!text) return;
  const plain = /canvassketch\/[A-Za-z0-9_\-./]+/g;
  let m: RegExpExecArray | null;
  while ((m = plain.exec(text))) out.add(m[0]);
  const enc = /key=([A-Za-z0-9%_\-.]+)/g;
  while ((m = enc.exec(text))) {
    try { const k = decodeURIComponent(m[1]); if (k.startsWith(PREFIX)) out.add(k); } catch { /* ข้าม */ }
  }
}

async function analyze(minAgeDays: number): Promise<{ report: CanvasOrphanReport; eligibleKeys: CanvasOrphan[] } | { error: string; status: number }> {
  const admin = supabaseAdmin();
  const bucket = await getR2Binding();
  if (!bucket) return { error: "R2 ยังไม่พร้อม (ไม่มี binding/ตั้งค่า S3)", status: 503 };

  // 1) ไฟล์ทั้งหมดในโฟลเดอร์กระดาน
  const objects: { key: string; size: number }[] = [];
  let cursor: string | undefined; let pages = 0; let truncated = false;
  for (;;) {
    const page = await r2ListObjects(bucket, { prefix: PREFIX, cursor, limit: 1000 });
    if (!page) return { error: "R2 binding นี้ไม่รองรับการไล่รายการไฟล์", status: 501 };
    objects.push(...page.objects.filter((o) => !o.key.endsWith("/")));
    pages++;
    if (!page.cursor) break;
    if (pages >= 100) { truncated = true; break; }
    cursor = page.cursor;
  }

  // 2) คีย์ที่ยังถูกใช้ — scene ทุกกระดาน + ใบนำเสนอ
  const used = new Set<string>();
  const { data: sketches } = await admin.from("erp_canvas_sketches").select("scene, preview_r2_key");
  for (const row of (sketches ?? []) as { scene: unknown; preview_r2_key: string | null }[]) {
    try { extractKeys(JSON.stringify(row.scene ?? {}), used); } catch { /* ข้าม */ }
    if (row.preview_r2_key?.startsWith(PREFIX)) used.add(row.preview_r2_key);
  }
  const { data: sheets } = await admin.from("design_sheets").select("presentation").not("presentation", "is", null);
  for (const row of (sheets ?? []) as { presentation: unknown }[]) {
    try { extractKeys(JSON.stringify(row.presentation ?? {}), used); } catch { /* ข้าม */ }
  }

  // 3) ตารางอื่นทั้งระบบที่อ้าง r2_key (ของกลาง) — ไม่นับคลังกลาง (ตรวจแยกด้านล่าง)
  const candidates = objects.filter((o) => !used.has(o.key)).map((o) => o.key);
  const refElsewhere = await r2KeysReferencedBatch(admin, candidates, { skipTables: ["assets"] });
  // คลังกลาง: แถว active ที่ "มีคนใช้" (asset_usages>0) = ยังใช้อยู่ · ที่ไม่มีใครใช้ = ล้างได้พร้อมไฟล์
  const libRows = new Map<string, { id: string; used: boolean }>();
  for (let i = 0; i < candidates.length; i += 150) {
    const chunk = candidates.slice(i, i + 150);
    const { data: rows } = await admin.from("assets").select("id, r2_key, status").in("r2_key", chunk);
    const active = ((rows ?? []) as { id: string; r2_key: string; status: string | null }[]).filter((r) => r.status !== "trashed");
    if (!active.length) continue;
    const { data: us } = await admin.from("asset_usages").select("asset_id").in("asset_id", active.map((r) => r.id));
    const usedIds = new Set(((us ?? []) as { asset_id: string }[]).map((u) => u.asset_id));
    for (const r of active) libRows.set(r.r2_key, { id: r.id, used: usedIds.has(r.id) });
  }

  const now = Date.now();
  const orphans: CanvasOrphan[] = [];
  let referenced = 0, referencedBytes = 0;
  for (const o of objects) {
    const lib = libRows.get(o.key);
    if (used.has(o.key) || refElsewhere.has(o.key) || (lib && lib.used)) { referenced++; referencedBytes += o.size; continue; }
    const up = uploadedFromKey(o.key);
    orphans.push({ key: o.key, size: o.size, uploaded_at: up ? up.toISOString() : null, age_days: up ? Math.floor((now - up.getTime()) / 86400000) : null, in_library: !!lib });
  }
  // ไม่รู้วันอัปโหลด (ชื่อไฟล์ไม่ตรงแบบ) = ถือว่าเก่าพอ (ไฟล์รุ่นก่อนตั้งชื่อแบบนี้)
  const eligible = orphans.filter((o) => o.age_days == null || o.age_days >= minAgeDays).sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? ""));
  const sum = (arr: { size: number }[]) => arr.reduce((s, x) => s + x.size, 0);
  const report: CanvasOrphanReport = {
    prefix: PREFIX, min_age_days: minAgeDays,
    total: objects.length, total_bytes: sum(objects),
    referenced, referenced_bytes: referencedBytes,
    orphans: orphans.length, orphan_bytes: sum(orphans),
    eligible: eligible.length, eligible_bytes: sum(eligible),
    too_new: orphans.length - eligible.length,
    in_library: eligible.filter((o) => o.in_library).length,
    sample: eligible.slice(0, 40), truncated, computed_at: new Date().toISOString(),
  };
  return { report, eligibleKeys: eligible };
}

function minAgeFrom(v: unknown): number {
  const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(365, Math.floor(n)) : DEFAULT_MIN_AGE_DAYS;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const minAge = minAgeFrom(new URL(request.url).searchParams.get("min_age_days"));
  const r = await analyze(minAge);
  if ("error" in r) return NextResponse.json({ data: null, error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.report, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { min_age_days?: unknown };
  const minAge = minAgeFrom(body.min_age_days);
  const r = await analyze(minAge);   // คำนวณใหม่ฝั่ง server เสมอ — ไม่เชื่อรายการจากหน้าจอ
  if ("error" in r) return NextResponse.json({ data: null, error: r.error }, { status: r.status });
  const admin = supabaseAdmin();
  const batch = r.eligibleKeys.slice(0, MAX_MOVE_PER_RUN);
  let moved = 0, movedBytes = 0, libTrashed = 0; const failed: string[] = [];
  for (const o of batch) {
    try {
      const trashKey = await r2MoveToTrash(o.key);
      if (!trashKey) continue;   // ไฟล์หายไปแล้ว (ใครลบไปก่อน)
      moved++; movedBytes += o.size;
      if (o.in_library) {
        // แถวคลังกลางที่ชี้ไฟล์นี้ → เข้าถังของคลังด้วย และชี้ r2_key ไปตำแหน่งใหม่ (ยังเปิดดูได้ภายใน 30 วัน)
        const { error } = await admin.from("assets").update({ status: "trashed", trashed_at: new Date().toISOString(), r2_key: trashKey, updated_at: new Date().toISOString() }).eq("r2_key", o.key).neq("status", "trashed");
        if (!error) libTrashed++;
      }
    } catch (e) { failed.push(`${o.key}: ${(e as Error).message}`); }
  }
  await writeAudit(admin, {
    action: "canvas_images_cleanup", entityType: "r2_canvassketch", actorId: await actorId(request),
    metadata: { min_age_days: minAge, moved, moved_bytes: movedBytes, library_rows_trashed: libTrashed, failed: failed.length, remaining: Math.max(0, r.eligibleKeys.length - batch.length), sample_keys: batch.slice(0, 20).map((o) => o.key) },
  });
  return NextResponse.json({ data: { moved, moved_bytes: movedBytes, library_rows_trashed: libTrashed, failed, remaining: Math.max(0, r.eligibleKeys.length - batch.length), min_age_days: minAge }, error: null });
}
