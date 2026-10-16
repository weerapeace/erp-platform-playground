/** Belt Builder — กติกาไซซ์รายตัว: GET / PATCH / DELETE(?hard=1) */
import { NextRequest, NextResponse } from "next/server";
import { getHandler, patchHandler, deleteHandler } from "../../_shared";
import { SIZE_RULES } from "../../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return getHandler(SIZE_RULES, request, id); }
export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return patchHandler(SIZE_RULES, request, id); }
export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> { const { id } = await ctx.params; return deleteHandler(SIZE_RULES, request, id); }
