/**
 * API สาธารณะ — Schema ของ Section/Block ที่ ERP รู้จัก : /api/public/storefront/schema
 *
 * เว็บร้านใช้เทียบว่า "ตัวแสดงผล" ของตัวเองครบทุกชนิดไหม (สคริปต์ check-schema ในเว็บร้าน)
 * ส่งเฉพาะโครง (ชนิด/ชื่อช่อง/ชนิดช่อง) ไม่มีข้อมูลร้าน · ไม่มี guardApi โดยเจตนา + CORS
 */
import { NextResponse } from "next/server";
import { SECTION_SCHEMAS, SECTION_TYPES } from "@/lib/website-schema";

export const dynamic = "force-static";
export const revalidate = 3600;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(): Promise<NextResponse> {
  const types = SECTION_TYPES.map((t) => {
    const s = SECTION_SCHEMAS[t];
    return {
      type: t,
      label: s.meta.label,
      icon: s.meta.icon,
      group: s.meta.group,
      fields: s.fields.map((f) => ({ key: f.key, type: f.type })),
      children: s.children ? { key: s.children.key, max: s.children.max, fields: s.children.fields.map((f) => ({ key: f.key, type: f.type })) } : null,
    };
  });
  return NextResponse.json({ version: 1, types }, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}
