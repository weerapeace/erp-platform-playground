/** Belt Builder — ชิ้นส่วนรายตัว: GET / PATCH / DELETE(?hard=1) */
import { NextRequest, NextResponse } from "next/server";
import { getHandler, patchHandler, deleteHandler } from "../../_shared";
import { PARTS } from "../../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return getHandler(PARTS, request, id); }
export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return patchHandler(PARTS, request, id); }
export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return deleteHandler(PARTS, request, id); }
