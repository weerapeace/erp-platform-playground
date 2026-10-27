/**
 * POST /api/nesting-jobs/asset-sizes { asset_id, size: { label, w, h, unit } } — เพิ่มไซส์เข้าลายในคลัง (assets.sizes)
 *   ไซส์เดิมที่ขนาดเท่ากันอยู่แล้ว = ไม่เพิ่มซ้ำ · คืนรายการไซส์ล่าสุด — nesting.run · audit
 * ใช้จากหน้าจัดเรียงงานพิมพ์ (ปุ่ม "บันทึกเป็นไซส์ในคลัง") — แก้ไซส์อื่น ๆ ที่หน้าคลังไฟล์ตามเดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeSizes, type AssetSize } from "@/app/api/assets/shared";
import { cleanUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const same = (a: AssetSize, b: AssetSize) =>
  a.unit === b.unit && Math.abs((a.w ?? -1) - (b.w ?? -1)) < 0.005 && Math.abs((a.h ?? -1) - (b.h ?? -1)) < 0.005;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = cleanUuid(b.asset_id);
  if (!id) return NextResponse.json({ error: "ไม่พบลายนี้ในคลัง" }, { status: 404 });
  const [size] = normalizeSizes([b.size]);
  if (!size || (size.w == null && size.h == null)) return NextResponse.json({ error: "ขนาดไม่ถูกต้อง" }, { status: 400 });
  size.label = size.label.trim().slice(0, 40);

  const admin = supabaseAdmin();
  const { data: cur, error: e1 } = await admin.from("assets").select("id, title, sizes").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "ไม่พบลายนี้ในคลัง" }, { status: 404 });
  const sizes = normalizeSizes(cur.sizes);
  if (sizes.some((s) => same(s, size))) return NextResponse.json({ data: { sizes, added: false }, error: null });
  const next = [...sizes, size];
  const { error } = await admin.from("assets").update({ sizes: next }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditFor(request, admin, { action: "update", entityType: "asset", entityId: id,
    metadata: { field: "sizes", title: cur.title, added: size, from: "nesting" } });
  return NextResponse.json({ data: { sizes: next, added: true }, error: null });
}
