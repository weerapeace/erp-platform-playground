/** ตัวประกอบสินค้า — รายชื่อร้าน (ตัวเลือกร้านบนหัวหน้า /admin/product-configurator) · GET /api/configurator/shops */
import { NextRequest, NextResponse } from "next/server";
import { listShops } from "@/lib/crud-resource-api";
import { VIEW_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> { return listShops(request, VIEW_PERM); }
