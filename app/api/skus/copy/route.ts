/**
 * POST /api/skus/copy
 * คัดลอก SKU — ก๊อปทุกฟิลด์ไปเป็นตัวใหม่ + เติม "(copy)" ท้ายชื่อ + รหัสใหม่ที่ไม่ซ้ำ + ก๊อปแท็กด้วย
 *
 * body: { id: string }   (id ของ SKU ต้นฉบับ)
 * → { id, code, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// คอลัมน์ที่ไม่ก๊อป (ระบบสร้างเอง)
const SKIP = new Set(["id", "created_at", "updated_at"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: src, error: srcErr } = await admin.from("skus_v2").select("*").eq("id", body.id).maybeSingle();
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  if (!src) return NextResponse.json({ error: "ไม่พบ SKU ต้นฉบับ" }, { status: 404 });

  const origCode = String((src as Record<string, unknown>).code ?? "").trim() || "SKU";

  // หา code ใหม่ที่ไม่ซ้ำ: <code>-copy, -copy2, -copy3 ...
  let newCode = `${origCode}-copy`;
  for (let n = 2; n < 200; n++) {
    const { data: hit } = await admin.from("skus_v2").select("id").eq("code", newCode).maybeSingle();
    if (!hit) break;
    newCode = `${origCode}-copy${n}`;
  }

  // ก๊อปทุกฟิลด์ (ยกเว้นระบบ) + override code/name/barcode
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) if (!SKIP.has(k)) payload[k] = v;
  payload.code = newCode;
  payload.barcode = newCode;   // คงธรรมเนียม barcode = code
  const origName = String((src as Record<string, unknown>).name_th ?? "").trim();
  payload.name_th = origName ? `${origName} (copy)` : `${newCode} (copy)`;

  const { data: inserted, error } = await admin.from("skus_v2").insert(payload).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // ก๊อปแท็ก (m2m) จากต้นฉบับ
  const { data: tags } = await admin.from("skus_v2_product_family_m2m").select("tgt_id").eq("src_id", body.id);
  if (tags && tags.length > 0) {
    await admin.from("skus_v2_product_family_m2m").insert(tags.map((t) => ({ src_id: inserted.id, tgt_id: t.tgt_id })));
  }

  await writeAudit(admin, {
    action: "copy", entityType: "skus_v2", entityId: inserted.id as string,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { from_id: body.id, from_code: origCode, new_code: newCode },
  });

  return NextResponse.json({ id: inserted.id, code: inserted.code, error: null });
}
