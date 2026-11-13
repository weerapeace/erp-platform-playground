/**
 * 📚 Design Library — รายการ/สร้าง ของ 4 ทรัพยากร
 * GET  /api/design-library/<templates|recipes|choices|renders>?template_id=&recipe_id=&list_key=&include_inactive=true
 * POST /api/design-library/<resource>
 * สิทธิ์ design_library.view / .edit / .manage · audit ทุกการเขียน · นิยามคอลัมน์/กฎตรวจ ../_resources.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { listHandler, createHandler } from "@/lib/crud-resource-api";
import { RESOURCES } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ resource: string }> };
const notFound = () => NextResponse.json({ data: null, error: "ไม่รู้จักข้อมูลชนิดนี้" }, { status: 404 });

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const res = RESOURCES[(await ctx.params).resource];
  return res ? listHandler(res, request) : notFound();
}
export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const res = RESOURCES[(await ctx.params).resource];
  return res ? createHandler(res, request) : notFound();
}
