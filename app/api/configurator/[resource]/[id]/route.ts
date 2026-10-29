/**
 * ตัวประกอบสินค้า — อ่าน/แก้/ลบ ทีละแถว
 * GET / PATCH (ส่งเฉพาะช่องที่แก้) / DELETE (?hard=1 = ลบจริง · ปกติ = ปิดไว้/ลบแบบกู้คืนได้ตามชนิด)
 * สิทธิ์ configurator.view / .edit · audit เก็บค่าก่อน/หลังของช่องที่แก้
 */
import { NextRequest, NextResponse } from "next/server";
import { getHandler, patchHandler, deleteHandler } from "@/lib/crud-resource-api";
import { RESOURCES } from "../../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ resource: string; id: string }> };
const notFound = () => NextResponse.json({ data: null, error: "ไม่รู้จักข้อมูลชนิดนี้" }, { status: 404 });

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { resource, id } = await ctx.params;
  const res = RESOURCES[resource];
  return res ? getHandler(res, request, id) : notFound();
}
export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { resource, id } = await ctx.params;
  const res = RESOURCES[resource];
  return res ? patchHandler(res, request, id) : notFound();
}
export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { resource, id } = await ctx.params;
  const res = RESOURCES[resource];
  return res ? deleteHandler(res, request, id) : notFound();
}
