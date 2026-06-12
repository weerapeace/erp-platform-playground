/**
 * SKU Tag Codes — รหัส SKU "จริง" ทุกตระกูลที่ใช้กับแท็ก/ประเภทหนึ่ง (สำหรับ tooltip ใน Wizard)
 *
 * GET /api/skus/tag-codes?family_tag_id=<id>
 *   → { prefixes: [{ prefix, latest_code, suggested, count }], total_skus }
 *
 * แท็กเดียวมีได้หลายตระกูลรหัส (เช่น หนัง → LEA-SAF-xxx, LEA-CCO-xxx)
 * ดึงจาก SKU ที่ผูกแท็กนี้ (m2m) → จัดกลุ่มตามส่วนหน้าตัวเลขท้าย → หาเลขล่าสุด/ถัดไปต่อกลุ่ม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function splitCode(code: string): { prefix: string; num: number | null; digits: number } {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: code, num: null, digits: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length };
}

const MAX_SKUS = 6000;   // เพดานดึง (กัน URL/หน่วยความจำบาน) — แท็กใหญ่จะสุ่มเท่านี้

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const tagId = new URL(request.url).searchParams.get("family_tag_id");
  if (!tagId) return NextResponse.json({ error: "ต้องระบุ family_tag_id" }, { status: 400 });

  const admin = supabaseAdmin();
  // SKU ที่ผูกแท็กนี้
  const { data: links } = await admin.from("skus_v2_product_family_m2m")
    .select("src_id").eq("tgt_id", tagId).limit(MAX_SKUS);
  const ids = (links ?? []).map((l) => l.src_id as string);
  if (ids.length === 0) return NextResponse.json({ prefixes: [], total_skus: 0, error: null });

  // ดึงรหัส + วันที่สร้าง (chunk กัน URL ยาว)
  const rows: { code: string; created_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await admin.from("skus_v2").select("code, created_at").in("id", ids.slice(i, i + 1000));
    for (const r of (data ?? [])) if (r.code) rows.push({ code: r.code as string, created_at: r.created_at as string });
  }

  // จัดกลุ่มตามตระกูลรหัส (เฉพาะรหัสที่ลงท้ายด้วยตัวเลข)
  type Grp = { prefix: string; count: number; latest_code: string; latest_at: string; num: number; digits: number };
  const map = new Map<string, Grp>();
  for (const r of rows) {
    const sc = splitCode(r.code);
    if (sc.num == null) continue;             // ไม่ลงท้ายด้วยเลข = ข้าม
    const g = map.get(sc.prefix);
    if (!g) { map.set(sc.prefix, { prefix: sc.prefix, count: 1, latest_code: r.code, latest_at: r.created_at, num: sc.num, digits: sc.digits }); }
    else {
      g.count++;
      if (r.created_at > g.latest_at) { g.latest_at = r.created_at; g.latest_code = r.code; g.num = sc.num; g.digits = sc.digits; }
    }
  }

  const prefixes = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((g) => ({
      prefix: g.prefix,
      latest_code: g.latest_code,
      suggested: g.prefix + String(g.num + 1).padStart(g.digits, "0"),
      count: g.count,
    }));

  return NextResponse.json({ prefixes, total_skus: rows.length, error: null });
}
