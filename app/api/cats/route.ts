/**
 * 🐾 ทะเบียนแมว — โหลดข้อมูลทั้งชุดในครั้งเดียว (ข้อมูลในบ้านมีไม่มาก หน้าเว็บคำนวณ "ใกล้ถึงกำหนด" เองจาก lib/cats)
 * GET /api/cats            → { data: { cats, clinics, vaccinations, treatments, weights } } (เฉพาะที่ยังใช้งาน)
 * GET /api/cats?trash=1    → ชุดเดียวกัน แต่เป็นของในถังขยะ (+ แมวทุกตัวไว้โชว์ชื่อ)
 * สิทธิ์ cats.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { CAT_KINDS, CATS_VIEW, type CatKind } from "@/lib/cats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KINDS = Object.keys(CAT_KINDS) as CatKind[];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_VIEW); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const admin = supabaseAdmin();
  const results = await Promise.all(KINDS.map((k) => {
    let q = admin.from(CAT_KINDS[k].table).select("*").limit(5000);
    // ถังขยะ: ต้องรู้ชื่อแมวทุกตัว (รวมที่ยังใช้งาน) ไว้บอกว่ารายการที่ลบเป็นของแมวตัวไหน
    if (!(trash && k === "cats")) q = q.eq("is_active", !trash);
    return q.order(CAT_KINDS[k].order, { ascending: true });
  }));
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ data: null, error: friendlyDbError(failed.error.message) }, { status: 500 });
  const data = Object.fromEntries(KINDS.map((k, i) => [k, results[i].data ?? []]));
  return NextResponse.json({ data, error: null });
}
