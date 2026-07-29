/**
 * GET  /api/admin/missing-images — สแกนหา "รูปที่ทะเบียนบอกว่ามี แต่ไฟล์จริงหายจากที่เก็บ"
 *   วิธี: ไล่อ่านรายชื่อไฟล์จริงใน R2 ครั้งเดียว (ทีละ 1,000) แล้วเทียบกับ path ใน DB
 *         เร็วกว่ายิงเช็คทีละรูปมาก (2 หมื่นกว่าไฟล์ใช้เวลาไม่กี่วินาที)
 *   → { checked, missing: [{ kind, code, id, missing_attachments, total_attachments, cover_missing }] }
 *
 * POST /api/admin/missing-images — ล้าง "รายการผี" (ลบเฉพาะทะเบียนรูปที่ไฟล์หายแล้ว)
 *   body { ids: string[] }  (id ของ erp_playground_attachments) → ลบทิ้งเพื่อให้อัปใหม่ได้สะอาด
 *   ไม่แตะไฟล์จริง ไม่แตะรูปที่ยังใช้ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getR2Binding, r2ListObjects } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = Record<string, unknown>;

async function fetchAll(table: string, cols: string): Promise<Row[]> {
  const db = supabaseAdmin();
  const out: Row[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;

  const bucket = await getR2Binding();
  if (!bucket) return NextResponse.json({ error: "ต่อที่เก็บไฟล์ (R2) ไม่ได้" }, { status: 503 });

  // 1) รายชื่อไฟล์จริงทั้งหมด
  const have = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const p = await r2ListObjects(bucket, { cursor, limit: 1000 });
    if (!p) break;
    for (const o of p.objects) have.add(o.key);
    cursor = p.cursor ?? undefined;
    if (!cursor) break;
  }

  // 2) ทะเบียนใน DB
  const [att, skus, pars] = await Promise.all([
    fetchAll("erp_playground_attachments", "id, entity_type, entity_id, file_path"),
    fetchAll("skus_v2", "id, code, cover_image_r2_key, is_active"),
    fetchAll("parent_skus_v2", "id, code, cover_image_r2_key, is_active"),
  ]);

  const info = new Map<string, { code: string; kind: string; active: boolean }>();
  for (const s of skus) info.set(String(s.id), { code: String(s.code ?? ""), kind: "SKU", active: s.is_active !== false });
  for (const p of pars) info.set(String(p.id), { code: String(p.code ?? ""), kind: "Parent SKU", active: p.is_active !== false });

  type Hit = { id: string; kind: string; code: string; active: boolean; missing_attachments: number; total_attachments: number; cover_missing: boolean; attachment_ids: string[] };
  const hits = new Map<string, Hit>();
  const touch = (id: string): Hit | null => {
    const n = info.get(id); if (!n) return null;
    if (!hits.has(id)) hits.set(id, { id, kind: n.kind, code: n.code, active: n.active, missing_attachments: 0, total_attachments: 0, cover_missing: false, attachment_ids: [] });
    return hits.get(id)!;
  };

  for (const a of att) {
    const h = touch(String(a.entity_id)); if (!h) continue;
    h.total_attachments++;
    const fp = a.file_path ? String(a.file_path) : "";
    if (fp && !have.has(fp)) { h.missing_attachments++; h.attachment_ids.push(String(a.id)); }
  }
  for (const r of [...skus, ...pars]) {
    const k = r.cover_image_r2_key ? String(r.cover_image_r2_key) : "";
    if (k && !have.has(k)) { const h = touch(String(r.id)); if (h) h.cover_missing = true; }
  }

  const missing = [...hits.values()]
    .filter((h) => h.missing_attachments > 0 || h.cover_missing)
    .sort((a, b) => b.missing_attachments - a.missing_attachments);

  return NextResponse.json({
    checked: { files_in_storage: have.size, attachments: att.length, skus: skus.length, parents: pars.length },
    missing, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 2000);
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการที่จะล้าง" }, { status: 400 });

  const { error, count } = await supabaseAdmin()
    .from("erp_playground_attachments").delete({ count: "exact" }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: count ?? 0, error: null });
}
