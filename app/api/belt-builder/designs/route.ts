/**
 * Belt Builder — แบบที่ลูกค้าออกแบบ (saved / in_cart / ordered)
 * GET /api/belt-builder/designs?shop_id=&status=   POST /api/belt-builder/designs
 * (หน้าเว็บลูกค้าในก้อน 3 จะมี public endpoint แยก — ตัวนี้ใช้ในหลังบ้าน)
 */
import { NextRequest, NextResponse } from "next/server";
import { listHandler, createHandler } from "../_shared";
import { DESIGNS } from "../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> { return listHandler(DESIGNS, request); }
export async function POST(request: NextRequest): Promise<NextResponse> { return createHandler(DESIGNS, request); }
