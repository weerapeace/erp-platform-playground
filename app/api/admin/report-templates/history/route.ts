/**
 * GET /api/admin/report-templates/history?id=<template id>
 * ประวัติแม่แบบ (สำเนาก่อนถูกแก้แต่ละครั้ง ล่าสุด 30 ครั้ง) · guard reports.view · อ่านอย่างเดียว
 * ย้อนเวอร์ชันทำที่หน้าออกแบบ: โหลดสำเนาเข้าเป็นงานที่ยังไม่บันทึก แล้วกดบันทึกตามปกติ (ต้องมี admin.reports)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listTemplateVersions } from "@/lib/report-template-history";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "reports.view");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ data: [], error: "id ไม่ถูกต้อง" }, { status: 400 });
  try {
    return NextResponse.json({ data: await listTemplateVersions(supabaseAdmin(), id), error: null });
  } catch {
    return NextResponse.json({ data: [], error: "โหลดประวัติไม่ได้" }, { status: 500 });
  }
}
