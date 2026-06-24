/**
 * จับคู่ "ค่าที่เลือกในสเปกเข็มขัด" → รูปจริงจากตารางหลัก (belt_tails/belt_hole/belt_logo)
 * GET /api/mo/belt-component-images?tail=<ชื่อปลายหาง>&hole=<ชื่อรู>&frontLogo=<ชื่อโลโก้หน้า>&backLogo=<ชื่อโลโก้หลัง>
 *   → { strap, hole, frontLogo, backLogo }  เป็น URL /api/r2-image (หรือ null ถ้าไม่เจอ)
 * จับแบบยืดหยุ่น (ชื่อในสเปกกับในตารางอาจไม่ตรงเป๊ะ เช่น จั้ม/จิ้ม/ปากเป็ด-ปากเปิด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { name: string; image: string | null };
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// เลือกรูปที่ "ชื่อใกล้ที่สุด": ตรงเป๊ะ → มีคำซ้อนกัน → token ตรงมากสุด
function pickImage(rows: Row[], q: string): string | null {
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
  return m?.image ? `/api/r2-image?key=${encodeURIComponent(m.image)}` : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();

  const [tails, holes, logos] = await Promise.all([
    admin.from("belt_tails").select("name, image"),
    admin.from("belt_hole").select("name, image"),
    admin.from("belt_logo").select("name, image"),
  ]);
  const tailRows = (tails.data ?? []) as Row[];
  const holeRows = (holes.data ?? []) as Row[];
  const logoRows = (logos.data ?? []) as Row[];

  return NextResponse.json({
    strap:     pickImage(tailRows, sp.get("tail") ?? ""),
    hole:      pickImage(holeRows, sp.get("hole") ?? ""),
    frontLogo: pickImage(logoRows, sp.get("frontLogo") ?? ""),
    backLogo:  pickImage(logoRows, sp.get("backLogo") ?? ""),
    error: null,
  });
}
