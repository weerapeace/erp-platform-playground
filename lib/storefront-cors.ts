/**
 * หัว CORS ของ API สาธารณะเว็บร้าน (/api/public/storefront/*) — ของกลาง
 * เว็บร้านอยู่คนละโดเมนกับ ERP → ทุก route ต้องตอบ preflight + แนบหัวเดียวกัน (เดิมก๊อปกันไปมา 19 route)
 *
 *   const CORS = storefrontCors("GET, POST");
 *   export async function OPTIONS(): Promise<NextResponse> { return corsPreflight(CORS); }
 *   const json = corsJson(CORS);            // json(body, status?, cacheControl = "no-store")
 *
 * ⚠️ route.ts export ได้แค่ handler — จึงให้แต่ละ route ประกาศ OPTIONS เอง 1 บรรทัด (memory route_page_export_rule)
 */
import { NextResponse } from "next/server";

export type CorsHeaders = Record<string, string>;

/** methods = เมธอดที่ route รับ (ไม่ต้องใส่ OPTIONS) เช่น "GET" · "POST" · "GET, POST" */
export function storefrontCors(methods: string): CorsHeaders {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** ตอบ preflight (OPTIONS) */
export function corsPreflight(cors: CorsHeaders): NextResponse {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** ตัวตอบ JSON ของ route — แนบ CORS + Cache-Control (ค่าเริ่มต้นไม่ให้แคช) */
export function corsJson(cors: CorsHeaders): (body: unknown, status?: number, cacheControl?: string) => NextResponse {
  return (body, status = 200, cacheControl = "no-store") => NextResponse.json(body, { status, headers: { ...cors, "Cache-Control": cacheControl } });
}
