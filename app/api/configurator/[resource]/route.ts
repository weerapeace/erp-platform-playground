/**
 * ตัวประกอบสินค้า — รายการ/สร้าง ของ 7 ทรัพยากร
 * GET  /api/configurator/<models|slots|options|layers|images|rules|designs>?model_id=&shop_id=&include_inactive=true
 * POST /api/configurator/<resource>
 * สิทธิ์ configurator.view / .edit · audit ทุกการเขียน · นิยามคอลัมน์/กฎตรวจ ../_resources.ts
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
