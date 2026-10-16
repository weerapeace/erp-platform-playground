/**
 * Belt Builder — ชิ้นส่วน (สายหนัง / หัว / หู)
 * GET  /api/belt-builder/parts?shop_id=&part_type=&include_inactive=true   POST /api/belt-builder/parts
 * สิทธิ์ belt_builder.view / .edit · audit ทุกการเขียน · กฎตรวจ lib/belt-builder.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { listHandler, createHandler } from "../_shared";
import { PARTS } from "../resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> { return listHandler(PARTS, request); }
export async function POST(request: NextRequest): Promise<NextResponse> { return createHandler(PARTS, request); }
