/**
 * /api/nesting-jobs/print-files — ไฟล์ PNG สำหรับพิมพ์ในคลังกลาง R2 (nesting-prints/<sha>.png · เก็บตามรหัสเนื้อไฟล์)
 *   POST { sha }                     → { exists, put_url }  ลิงก์ส่งขึ้นตรง (ไฟล์มีแล้ว = ไม่ต้องส่งซ้ำ) — nesting.run
 *   PUT  { sha, name, asset_id? }    → ยืนยันว่าขึ้นแล้ว + จำไว้กับลายในคลัง (assets.nest_print_file · แทนที่ของเดิม) — nesting.run · audit
 *   GET  ?sha=                        → { exists, get_url }  ลิงก์โหลดตรง (เครื่องที่ไม่มีไฟล์) — nesting.view
 * ไฟล์ใหญ่ไม่ผ่าน Vercel: ตัวช่วยในเครื่องส่ง/ดึงกับ R2 เองด้วยลิงก์ชั่วคราว (30 นาที)
 * ที่เก็บ = ของกลาง lib/print-store (ใช้ร่วมกับช่อง "ไฟล์พิมพ์" บนการ์ดลาย /api/assets/[id]/print-file)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { r2PresignGet, r2PresignPut } from "@/lib/r2";
import { PRINT_SHA, cleanPrintName, linkPrintToAsset, printKey, printSize, verifyPrint } from "@/lib/print-store";
import { cleanUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noR2 = () => NextResponse.json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (R2)" }, { status: 503 });
const r2Err = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "R2 error" }, { status: 500 });

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { return await request.json(); } catch { return null; }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  const b = await body(request);
  const sha = String(b?.sha ?? "");
  if (!PRINT_SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  try {
    if ((await printSize(sha)) != null) return NextResponse.json({ data: { exists: true, put_url: null }, error: null });
    const put_url = await r2PresignPut(printKey(sha), 1800);
    if (!put_url) return noR2();
    return NextResponse.json({ data: { exists: false, put_url }, error: null });
  } catch (e) { return r2Err(e); }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  const b = await body(request);
  const sha = String(b?.sha ?? "");
  if (!PRINT_SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  let v: Awaited<ReturnType<typeof verifyPrint>>;
  try { v = await verifyPrint(sha); } catch (e) { return r2Err(e); }
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: v.status });

  const assetId = cleanUuid(b?.asset_id);
  if (assetId) {
    try { await linkPrintToAsset(request, assetId, { sha, name: cleanPrintName(b?.name, sha), size: v.size }, "nesting"); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "save error" }, { status: 500 }); }
  }
  return NextResponse.json({ data: { saved: true, size: v.size }, error: null });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const sha = request.nextUrl.searchParams.get("sha") ?? "";
  if (!PRINT_SHA.test(sha)) return NextResponse.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  try {
    const size = await printSize(sha);
    if (size == null) return NextResponse.json({ data: { exists: false, get_url: null }, error: null });
    const get_url = await r2PresignGet(printKey(sha), 1800);
    if (!get_url) return noR2();
    return NextResponse.json({ data: { exists: true, get_url, size }, error: null });
  } catch (e) { return r2Err(e); }
}
