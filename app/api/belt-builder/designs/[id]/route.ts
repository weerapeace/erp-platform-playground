/** Belt Builder — แบบของลูกค้ารายตัว: GET / PATCH / DELETE (ลบจริง — ไม่มี soft) */
import { NextRequest, NextResponse } from "next/server";
import { getHandler, patchHandler, deleteHandler } from "../../_shared";
import { DESIGNS } from "../../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return getHandler(DESIGNS, request, id); }
export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return patchHandler(DESIGNS, request, id); }
export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return deleteHandler(DESIGNS, request, id); }
