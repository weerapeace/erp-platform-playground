/**
 * Web App Manifest ของ "แอปหน้าเดียว" — /api/page-manifest/<path ของหน้า>
 *   เช่น /api/page-manifest/design/pattern-tickets → ติดตั้งได้เป็นแอป "ตั๋วงานช่าง Pattern" เปิด /solo/design/pattern-tickets
 *   id/scope = /solo<path> → แต่ละหน้าเป็นคนละแอป ติดตั้งหลายหน้าบนเครื่องเดียวได้ และไม่ดึงลิงก์ส่วนอื่นของเว็บไปเปิด
 * สาธารณะ (เครื่อง/เบราว์เซอร์ต้องดึงได้ตอนติดตั้ง) — มีแค่ชื่อเมนู/ไอคอน ไม่มีข้อมูลลับ · กติกา lib/solo-page.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pagePathFromSegments, soloAppId } from "@/lib/solo-page";
import { loadSoloPageInfo } from "@/lib/solo-page-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await params;
  const pagePath = pagePathFromSegments(path);
  if (!pagePath) return NextResponse.json({ error: "invalid page" }, { status: 400 });

  const info = await loadSoloPageInfo(supabaseAdmin(), pagePath);
  const iconBase = `/api/page-icon${pagePath}`;
  const id = soloAppId(pagePath);
  const manifest = {
    id,
    name: info.label,
    short_name: info.label.length > 14 ? info.label.slice(0, 14) : info.label,
    description: `${info.label} — ERP (แอปหน้าเดียว)`,
    start_url: id,
    scope: id,
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: info.theme,
    icons: [
      { src: `${iconBase}?s=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${iconBase}?s=512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${iconBase}?s=512&m=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}
