/**
 * SKU Code Suggest — ตัวช่วยรหัส SKU สำหรับ Wizard (โหมดเดี่ยว)
 *
 * GET /api/skus/code-suggest                      → { tags: [{id,name,code_prefix,group_name}] }  (แท็กที่ตั้ง prefix ไว้)
 * GET /api/skus/code-suggest?family_tag_id=<id>   → คำแนะนำรหัสตามประเภทที่เลือก
 * GET /api/skus/code-suggest?prefix=LEA-SAF-      → คำแนะนำรหัสตาม prefix ที่พิมพ์เอง
 *
 * ผลลัพธ์: {
 *   prefix, this_latest, this_suggested,          // ของ "ประเภทนี้"
 *   group_latest, group_name                      // ล่าสุด "ทั้งหมวด" (กลุ่มเดียวกัน)
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// แยกรหัสเป็น prefix + เลขท้าย (เช่น LEA-SAF-027 → {prefix:'LEA-SAF-', num:27, digits:3})
function splitCode(code: string): { prefix: string; num: number | null; digits: number } {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: code, num: null, digits: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length };
}
// รหัสที่ "สะอาด" = prefix + ตัวเลขล้วนท้ายเท่านั้น (กันรหัสแปลก เช่น LEA-SAF-01S)
const isClean = (code: string, prefix: string) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+$`).test(code);

type SkuRow = { code: string; created_at: string };

// หาตัวล่าสุด (ตาม created_at) ในกลุ่มรหัสที่ match prefix แบบสะอาด
function latestOf(rows: SkuRow[], prefix: string): SkuRow | null {
  const clean = rows.filter((r) => isClean(r.code, prefix));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => (b.created_at > a.created_at ? b : a));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get("family_tag_id");
  let prefix = (searchParams.get("prefix") ?? "").trim();

  // ---- ไม่มีพารามิเตอร์ → คืนรายการแท็กที่ตั้ง prefix ไว้ (ไว้ทำ dropdown) ----
  if (!tagId && !prefix) {
    const { data } = await admin.from("product_families")
      .select("id, name, code_prefix, group_id, product_family_groups ( name )")
      .not("code_prefix", "is", null).eq("is_active", true).order("name");
    const tags = (data ?? []).map((t) => ({
      id: t.id as string, name: t.name as string, code_prefix: t.code_prefix as string,
      group_name: (t.product_family_groups as { name?: string } | null)?.name ?? null,
    }));
    return NextResponse.json({ tags, error: null });
  }

  // ---- ระบุแท็ก → ดึง prefix + กลุ่มของแท็กนั้น ----
  let groupId: string | null = null;
  let groupName: string | null = null;
  let groupPrefixes: string[] = [];
  if (tagId) {
    const { data: tag } = await admin.from("product_families")
      .select("code_prefix, group_id, product_family_groups ( name )").eq("id", tagId).maybeSingle();
    if (!tag) return NextResponse.json({ error: "ไม่พบประเภทที่เลือก" }, { status: 404 });
    if (!prefix) prefix = (tag.code_prefix as string | null)?.trim() ?? "";
    groupId = tag.group_id as string | null;
    groupName = (tag.product_family_groups as { name?: string } | null)?.name ?? null;
    if (groupId) {
      const { data: sibs } = await admin.from("product_families")
        .select("code_prefix").eq("group_id", groupId).not("code_prefix", "is", null);
      groupPrefixes = Array.from(new Set((sibs ?? []).map((s) => (s.code_prefix as string).trim()).filter(Boolean)));
    }
  }

  if (!prefix) {
    return NextResponse.json({ error: "ประเภทนี้ยังไม่ได้ตั้งรหัสนำหน้า (prefix) — ตั้งที่หน้าจัดการแท็กก่อน", prefix: "", this_latest: null, this_suggested: null, group_latest: null, group_name: groupName }, { status: 200 });
  }
  if (groupPrefixes.length === 0) groupPrefixes = [prefix];

  // ---- ดึง SKU ที่ขึ้นต้นด้วย prefix ทั้งหมดในกลุ่ม (คำสั่งเดียว) ----
  const orFilter = groupPrefixes.map((p) => `code.ilike.${p.replace(/[%,]/g, "")}%`).join(",");
  const { data: rows } = await admin.from("skus_v2")
    .select("code, created_at").or(orFilter).order("created_at", { ascending: false }).limit(500);
  const all = (rows ?? []) as SkuRow[];

  // ล่าสุด + เสนอถัดไป ของ "ประเภทนี้"
  const thisLatest = latestOf(all, prefix);
  let thisSuggested: string | null = null;
  if (thisLatest) {
    const sc = splitCode(thisLatest.code);
    if (sc.num != null) thisSuggested = sc.prefix + String(sc.num + 1).padStart(sc.digits, "0");
  } else {
    thisSuggested = prefix + "001";   // ยังไม่เคยมี → เริ่มที่ 001
  }

  // ล่าสุด "ทั้งหมวด" (ทุก prefix ในกลุ่ม)
  let groupLatest: SkuRow | null = null;
  for (const p of groupPrefixes) {
    const l = latestOf(all, p);
    if (l && (!groupLatest || l.created_at > groupLatest.created_at)) groupLatest = l;
  }

  return NextResponse.json({
    prefix,
    this_latest: thisLatest?.code ?? null,
    this_suggested: thisSuggested,
    group_latest: groupLatest?.code ?? null,
    group_name: groupName,
    error: null,
  });
}
