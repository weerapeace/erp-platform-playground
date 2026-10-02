/**
 * รูปทั้งหมดบนกระดานแคมเปญ (Canvas) — ไว้ให้หน้าอื่นหยิบไปใช้ต่อ เช่น ใบนำเสนอ A4 ของใบงานออกแบบ
 *
 * GET /api/creative-campaigns/[id]/canvas-images → { data: [{ key, url, w, h }] }
 *
 * - อ่าน scene จาก erp_canvas_sketches (entity_type=creative_campaign) — รูปทุกรูปบนกระดานถูกย้ายขึ้น R2 แล้ว
 *   (dataURL = /api/r2-image?key=...) จึงคืนเป็น key/url ใช้ต่อได้ทันที ไม่ต้องดาวน์โหลดใหม่
 * - ข้ามรูป base64 ที่ยังไม่ขึ้น R2 (เพิ่งแปะ ยังไม่เซฟ) และรูปที่ถูกลบแล้ว (isDeleted)
 * - ตัดซ้ำตาม key · เรียงตามตำแหน่งบนกระดาน (บน→ล่าง, ซ้าย→ขวา)
 * สิทธิ์: tasks.view (เท่ากับดูกระดาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CanvasImage = { key: string; url: string; w: number; h: number };

type SceneEl = { type?: string; fileId?: string; isDeleted?: boolean; x?: number; y?: number; width?: number; height?: number };
type SceneFile = { dataURL?: string; mimeType?: string };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_canvas_sketches").select("scene")
    .eq("entity_type", "creative_campaign").eq("entity_id", id).maybeSingle();
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const scene = (data?.scene ?? null) as { elements?: SceneEl[]; files?: Record<string, SceneFile> } | null;
  if (!scene) return NextResponse.json({ data: [], error: null });

  const files = scene.files ?? {};
  const seen = new Set<string>();
  const out: CanvasImage[] = [];
  const els = (Array.isArray(scene.elements) ? scene.elements : [])
    .filter((e) => e && e.type === "image" && !e.isDeleted && e.fileId)
    .sort((a, b) => ((a.y ?? 0) - (b.y ?? 0)) || ((a.x ?? 0) - (b.x ?? 0)));
  for (const el of els) {
    const f = files[String(el.fileId)];
    const url = String(f?.dataURL ?? "");
    const m = url.match(/^\/api\/r2-image\?key=([^&]+)/);
    if (!m) continue;   // base64 ที่ยังไม่ขึ้น R2 → ข้าม
    const key = decodeURIComponent(m[1]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, url: `/api/r2-image?key=${encodeURIComponent(key)}`, w: Math.round(el.width ?? 0), h: Math.round(el.height ?? 0) });
  }
  return NextResponse.json({ data: out, error: null });
}
