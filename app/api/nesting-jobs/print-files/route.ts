/**
 * /api/nesting-jobs/print-files — ไฟล์ PNG สำหรับพิมพ์ในคลังกลาง R2 (nesting-prints/<sha>.png · เก็บตามรหัสเนื้อไฟล์)
 *   POST { sha }                     → { exists, put_url }  ลิงก์ส่งขึ้นตรง (ไฟล์มีแล้ว = ไม่ต้องส่งซ้ำ) — nesting.run
 *   PUT  { sha, name, asset_id? }    → ยืนยันว่าขึ้นแล้ว + จำไว้กับลายในคลัง (assets.nest_print_file · แทนที่ของเดิม) — nesting.run · audit
 *   GET  ?sha=                        → { exists, get_url }  ลิงก์โหลดตรง (เครื่องที่ไม่มีไฟล์) — nesting.view
 * ไฟล์ใหญ่ไม่ผ่าน Vercel: ตัวช่วยในเครื่องส่ง/ดึงกับ R2 เองด้วยลิงก์ชั่วคราว (30 นาที)
 * เก็บเฉพาะ PNG ลายต้นฉบับ — ยืนยันแล้วไม่ใช่ PNG จริง = ลบทิ้ง (ไฟล์งานพิมพ์ PDF/EPS อยู่ Drive เท่านั้น · lib/print-file-policy)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2DeleteObject, r2GetRange, r2HeadSize, r2PresignGet, r2PresignPut } from "@/lib/r2";
import { PRINT_SOURCE_PNG_ONLY, isPngBytes } from "@/lib/print-file-policy";
import { cleanUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHA = /^[0-9a-f]{16}$/;
const keyOf = (sha: string) => `nesting-prints/${sha}.png`;
const noR2 = () => NextResponse.json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)" }, { status: 503 });

/** ขนาด + ไบต์แรก ๆ ของไฟล์ในคลัง (ไม่พบ = null) — ไว้ตรวจว่าเป็น PNG จริง */
async function headOf(key: string): Promise<{ size: number; bytes: Uint8Array } | null> {
  const r = await r2GetRange(key, 0, 15);
  if (!r) return null;
  if (r.status === "unsatisfiable") return { size: r.total, bytes: new Uint8Array() };
  return { size: r.total, bytes: new Uint8Array(await new Response(r.body).arrayBuffer()).subarray(0, 16) };
}

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { return await request.json(); } catch { return null; }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  const b = await body(request);
  const sha = String(b?.sha ?? "");
  if (!SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  try {
    const size = await r2HeadSize(keyOf(sha));
    if (size != null) return NextResponse.json({ data: { exists: true, put_url: null }, error: null });
    const put_url = await r2PresignPut(keyOf(sha), 1800);
    if (!put_url) return noR2();
    return NextResponse.json({ data: { exists: false, put_url }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "R2 error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  const b = await body(request);
  const sha = String(b?.sha ?? "");
  if (!SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  const name = String(b?.name ?? "").replace(/[\\/]/g, " ").trim().slice(0, 200) || `${sha}.png`;
  let head: { size: number; bytes: Uint8Array } | null;
  try { head = await headOf(keyOf(sha)); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "R2 error" }, { status: 500 }); }
  if (head == null) return NextResponse.json({ error: "ยังไม่พบไฟล์ในคลัง — ส่งไฟล์ขึ้นไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 409 });
  if (!isPngBytes(head.bytes)) {
    try { await r2DeleteObject(keyOf(sha)); } catch { /* ลบไม่ทัน = ค้างใน R2 แต่ไม่ถูกผูกกับลาย */ }
    return NextResponse.json({ error: PRINT_SOURCE_PNG_ONLY.th }, { status: 400 });
  }
  const size = head.size;

  const assetId = cleanUuid(b?.asset_id);
  if (assetId) {
    const admin = supabaseAdmin();
    const print = { sha, name, size, saved_at: new Date().toISOString() };
    const { data, error } = await admin.from("assets").update({ nest_print_file: print }).eq("id", assetId).select("id, title").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) await writeAuditFor(request, admin, { action: "update", entityType: "asset", entityId: assetId,
      metadata: { field: "nest_print_file", title: data.title, sha, name, size } });
  }
  return NextResponse.json({ data: { saved: true, size }, error: null });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const sha = request.nextUrl.searchParams.get("sha") ?? "";
  if (!SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  try {
    const size = await r2HeadSize(keyOf(sha));
    if (size == null) return NextResponse.json({ data: { exists: false, get_url: null }, error: null });
    const get_url = await r2PresignGet(keyOf(sha), 1800);
    if (!get_url) return noR2();
    return NextResponse.json({ data: { exists: true, get_url, size }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "R2 error" }, { status: 500 });
  }
}
