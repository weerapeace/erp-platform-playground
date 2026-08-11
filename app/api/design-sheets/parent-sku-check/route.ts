/**
 * Design Sheets — ตัวเช็ครหัส Parent SKU (เฟส 5)
 *
 * GET /api/design-sheets/parent-sku-check?code=CTL085
 * → { exists, latest, suggested, skipped, max_code, parent, children, child_next }
 *   exists    = รหัสนี้มีใน parent_skus_v2 แล้ว (ห้ามบันทึก — กรอบแดง)
 *   latest    = รหัสที่ "ตั้งล่าสุด" (ตามวันที่สร้าง เฉพาะรูปแบบ prefix+เลข) — ฐานคิดเลขถัดไป
 *               (ไม่ใช้เลขสูงสุด เพราะมีรหัสโดดเช่น CTL999 ที่เป็นรหัสพิเศษ/ทดสอบ)
 *   suggested = รหัสถัดไป (เลขของ latest + 1 คงจำนวนหลัก)
 *   skipped   = ตั้งข้ามเลข (เกิน latest+1) → เตือนแต่ตั้งได้
 *   max_code  = เลขสูงสุดของ prefix (ข้อมูลเสริม โชว์เมื่อต่างจาก latest)
 *
 *   ── ใช้ Parent เดิม (เพิ่มสีเข้าสินค้าที่มีอยู่แล้ว) ──
 *   parent     = ข้อมูล Parent ตัวจริง (ชื่อ/แบรนด์/หมวด/รูปปก) เมื่อ exists=true — เอาไปเติมในฟอร์มได้เลย
 *   children   = SKU ลูกที่มีอยู่แล้วใต้ Parent นี้ (เรียงตามรหัส) — "SKU ถึงไหนแล้ว"
 *   child_next = รหัส SKU ลูกถัดไปที่แนะนำ (เลขท้ายสูงสุด + 1 คงจำนวนหลัก เช่น WL36-17 → WL36-18)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Parent ตัวจริงที่เจอ (เมื่อ exists=true) — ข้อมูลพอสำหรับเติมฟอร์ม Wizard */
export type ParentSkuInfo = {
  id: string; code: string; name_th: string | null; name_en: string | null;
  product_family: string | null; brand_id: string | null; cover_image_r2_key: string | null;
};
/** SKU ลูกที่มีอยู่แล้วใต้ Parent (โชว์ว่า "ถึงไหนแล้ว") */
export type ParentSkuChild = {
  code: string; name_th: string | null; color: string | null;
  standard_price: number | null; image_key: string | null; is_active: boolean;
};

export type ParentSkuCheck = {
  exists: boolean; latest: string | null; suggested: string | null; skipped: boolean; max_code: string | null;
  matches: string[];   // รหัสที่มีอยู่แล้วในกลุ่ม prefix เดียวกัน (เรียงเลขมาก→น้อย ≤20) — โชว์เป็นลิสต์แนะนำ
  parent: ParentSkuInfo | null;
  children: ParentSkuChild[];
  child_next: string | null;
};

/** แยกรหัสเป็น prefix + เลขท้าย เช่น CTL084 → { prefix: "CTL", num: 84, digits: 3 } */
function splitCode(code: string): { prefix: string; num: number | null; digits: number } {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: code, num: null, digits: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length };
}

/**
 * รหัส SKU ลูกถัดไป จากรหัสลูกที่มีอยู่ เช่น [WL36-01 … WL36-17] → WL36-18
 * - ดูเฉพาะรหัสที่ขึ้นต้นด้วยรหัส Parent แล้วตามด้วยตัวคั่น + เลขท้าย (ข้ามรหัสแปลก ๆ เช่น _DUP_/_NOSKU_)
 * - ยังไม่มีลูกเลย (หรือรูปแบบไม่เข้าพวก) → เริ่มที่ <parent>-01
 */
function nextChildCode(parentCode: string, childCodes: string[]): string {
  const pc = parentCode.toUpperCase();
  let sep = "-", digits = 2, maxNum = 0, found = false;
  for (const raw of childCodes) {
    const c = (raw ?? "").toUpperCase();
    if (!c.startsWith(pc)) continue;
    const m = c.slice(pc.length).match(/^(\D*)(\d+)$/);   // ตัวคั่น (เช่น "-") + เลขล้วนปิดท้าย (รหัสเพี้ยนอย่าง _DUP_123 จะไม่เข้า)
    if (!m) continue;
    const n = parseInt(m[2], 10);
    if (!found || n > maxNum) { sep = m[1] || "-"; digits = m[2].length; maxNum = n; found = true; }
  }
  return `${parentCode}${sep}${String(maxNum + 1).padStart(digits, "0")}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ data: null, error: "ต้องส่ง code" }, { status: 400 });

  const admin = supabaseAdmin();
  const { prefix, num } = splitCode(code);

  const { data, error } = await admin.from("parent_skus_v2").select("code, created_at")
    .ilike("code", `${prefix.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  let exists = false;
  let existCode: string | null = null;    // รหัสตามที่เก็บจริงใน DB (ตัวพิมพ์อาจไม่ตรงกับที่ผู้ใช้พิมพ์)
  let latestCode: string | null = null;   // ตัวแรกที่เจอ (เรียงตามวันที่สร้างใหม่→เก่า) ในรูปแบบ prefix+เลขล้วน
  let maxNum = -1; let maxCode: string | null = null;
  const matchList: { code: string; num: number }[] = [];
  for (const r of (data ?? []) as Array<{ code: string }>) {
    const c = (r.code ?? "").toUpperCase();
    if (c === code) { exists = true; existCode = r.code; }
    const s = splitCode(c);
    if (s.prefix !== prefix || s.num == null) continue;   // ตัดรหัสพิเศษ เช่น CTL095_DUP_x / CTL098-01S
    if (latestCode == null) latestCode = r.code;
    if (s.num > maxNum) { maxNum = s.num; maxCode = r.code; }
    matchList.push({ code: r.code, num: s.num });
  }
  const matches = matchList.sort((a, b) => b.num - a.num).map((m) => m.code)
    .filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 20);

  const base = latestCode ? splitCode(latestCode.toUpperCase()) : null;
  const suggested = base && base.num != null ? `${prefix}${String(base.num + 1).padStart(base.digits, "0")}` : null;
  const skipped = num != null && base?.num != null && num > base.num + 1;

  // ── รหัสนี้มี Parent อยู่แล้ว → ดึงข้อมูล Parent + SKU ลูกที่มีแล้ว (โหมด "เพิ่มสีเข้าของเดิม") ──
  let parent: ParentSkuInfo | null = null;
  let children: ParentSkuChild[] = [];
  let childNext: string | null = null;
  if (exists && existCode) {
    const { data: pRow } = await admin.from("parent_skus_v2")
      .select("id, code, name_th, name_en, product_family, brand_id, cover_image_r2_key")
      .eq("code", existCode).maybeSingle();
    if (pRow) {
      parent = pRow as ParentSkuInfo;
      const { data: kids } = await admin.from("skus_v2")
        .select("code, name_th, color, standard_price, cover_image_r2_key, is_active")
        .eq("parent_sku_id", parent.id).order("code", { ascending: true }).limit(300);
      children = ((kids ?? []) as Array<{ code: string | null; name_th: string | null; color: string | null; standard_price: number | null; cover_image_r2_key: string | null; is_active: boolean | null }>)
        .filter((k) => (k.code ?? "").trim())
        .map((k) => ({
          code: k.code as string, name_th: k.name_th, color: k.color,
          standard_price: k.standard_price == null ? null : Number(k.standard_price),
          image_key: k.cover_image_r2_key, is_active: k.is_active !== false,
        }));
      childNext = nextChildCode(parent.code, children.map((c) => c.code));
    }
  }

  return NextResponse.json({
    data: {
      exists, latest: latestCode, suggested, skipped,
      max_code: maxCode && maxCode !== latestCode ? maxCode : null,
      matches,
      parent, children, child_next: childNext,
    } satisfies ParentSkuCheck,
    error: null,
  });
}
