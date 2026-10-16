/** Belt Builder — รายชื่อร้าน (เลือกร้านบนหัวหน้า /admin/belt-builder) · GET /api/belt-builder/shops */
import { NextRequest, NextResponse } from "next/server";
import { listShops } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> { return listShops(request); }
