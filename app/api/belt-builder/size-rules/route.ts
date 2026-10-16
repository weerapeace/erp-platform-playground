/**
 * Belt Builder — กติกาไซซ์ (ช่วงเอวชาย/หญิง + สูตรตัดหนัง)
 * GET /api/belt-builder/size-rules?shop_id=   POST /api/belt-builder/size-rules
 */
import { NextRequest, NextResponse } from "next/server";
import { listHandler, createHandler } from "../_shared";
import { SIZE_RULES } from "../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> { return listHandler(SIZE_RULES, request); }
export async function POST(request: NextRequest): Promise<NextResponse> { return createHandler(SIZE_RULES, request); }
