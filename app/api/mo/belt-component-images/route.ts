/**
 * จับคู่ "ค่าที่เลือกในสเปกเข็มขัด" → รูปจริงจากตารางหลัก (belt_tails/belt_hole/belt_logo)
 * GET /api/mo/belt-component-images?tail=&hole=&frontLogo=&backLogo=
 *   → { strap, hole, holeBackOnly, frontLogo, backLogo }  (รูป=URL /api/r2-image หรือ null)
 *   holeBackOnly = true แปลว่าลาย/รูนี้อยู่ "ด้านหลังอย่างเดียว" (เช่น พิมพ์บันได) · false = ทั้งหน้า-หลัง (เจาะรูจริง)
 * จับแบบยืดหยุ่น (ชื่ออาจไม่ตรงเป๊ะ เช่น จั้ม/จิ้ม/ปากเป็ด-ปากเปิด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { name: string; image: string | null; back_only?: boolean };
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// เลือกแถวที่ "ชื่อใกล้ที่สุด": ตรงเป๊ะ → มีคำซ้อนกัน → token ตรงมากสุด
function pickRow(rows: Row[], q: string): Row | null {
  const query = (q ?? "").trim();
  if (!query) return null;
  const withImg = rows.filter((r) => r.image);
  const nq = norm(query);
  let m = withImg.find((r) => norm(r.name) === nq);
  if (!m) m = withImg.find((r) => norm(r.name).includes(nq) || nq.includes(norm(r.name)));
  if (!m) {
    const qt = query.split(/[\s/]+/).filter((t) => t.length > 1);
    let best: Row | undefined; let bestScore = 0;
    for (const r of withImg) {
      const score = qt.filter((t) => r.name.includes(t)).length;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (bestScore > 0) m = best;
  }
  return m ?? null;
}
const urlOf = (r: Row | null) => (r?.image ? `/api/r2-image?key=${encodeURIComponent(r.image)}` : null);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();

  const [tails, holes, logos] = await Promise.all([
    admin.from("belt_tails").select("name, image"),
    admin.from("belt_hole").select("name, image, back_only"),
    admin.from("belt_logo").select("name, image"),
  ]);
  const tailRows = (tails.data ?? []) as Row[];
  const holeRows = (holes.data ?? []) as Row[];
  const logoRows = (logos.data ?? []) as Row[];

  // โหมดตัวอย่าง (หน้าเทมเพลตวางรูป) — คืนรูปแรกที่มีของแต่ละชนิด ไว้ลากวาง
  if (sp.get("sample")) {
    const first = (rows: Row[]) => urlOf(rows.find((r) => r.image) ?? null);
    return NextResponse.json({ strap: first(tailRows), hole: first(holeRows), holeBackOnly: false, frontLogo: first(logoRows), backLogo: first(logoRows), error: null });
  }

  const holeRow = pickRow(holeRows, sp.get("hole") ?? "");

  return NextResponse.json({
    strap:        urlOf(pickRow(tailRows, sp.get("tail") ?? "")),
    hole:         urlOf(holeRow),
    holeBackOnly: !!holeRow?.back_only,
    frontLogo:    urlOf(pickRow(logoRows, sp.get("frontLogo") ?? "")),
    backLogo:     urlOf(pickRow(logoRows, sp.get("backLogo") ?? "")),
    error: null,
  });
}
