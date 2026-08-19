/**
 * POST /api/skus/lookup   body: { codes: string[] }
 * ของกลาง — จับคู่ "รหัสสินค้าหลายตัวพร้อมกัน" กับ SKU จริง (นำเข้ารายการจากตาราง/Excel, ป๊อปใส่ราคาต้นทุน ฯลฯ)
 *
 * ทำไมเป็น POST: รหัสสินค้าจริง 43% มีตัว "#" และบางตัวมีช่องว่าง —
 * ส่งผ่าน query string จะโดน apiFetch แปลง %23 → %20 แล้วรหัสเพี้ยน (บทเรียนจากระบบสแกน)
 *
 * 🐛🐛 บั๊กที่แก้ (2026-08-12): เดิม "ดึง skus_v2 มาทั้งตาราง" แล้วจับคู่ใน JS (`.limit(20000)`)
 *     แต่ PostgREST ตัดผลลัพธ์ที่ 1,000 แถวเงียบ ๆ (limit ที่ใหญ่กว่าถูกลดลงมา) — ตอนนี้ SKU มี 12,829 ตัว
 *     → รหัสที่อยู่หลังแถวที่ 1,000 หา "ไม่เจอ" ทั้งที่มีอยู่จริง (เจอกับ MN15/15MM ซึ่งอยู่แถวที่ ~4,270)
 *     วิธีใหม่: ยิงถามเฉพาะรหัสที่ต้องการด้วย .in() (ผลลัพธ์ไม่มีทางเกินจำนวนรหัสที่ถาม) → ไม่โดนตัด + เร็วกว่าเดิม
 *
 * ลำดับการจับคู่: code เป๊ะ → barcode เป๊ะ → ไม่สนตัวพิมพ์ใหญ่เล็ก/ช่องว่างหัวท้าย (เฉพาะตัวที่ยังไม่เจอ)
 * ⚠️ ไม่หยิบ SKU ที่อยู่ "ถังขยะ" (is_active=false) — รหัสซ้ำกับของจริงได้ ถ้าหยิบมาจะเพิ่มของผิดตัว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SkuLookupHit = {
  id: string;
  code: string;
  name: string;
  uom: string | null;
  price: number | null;
  image_key: string | null;   // คีย์รูปปก (เอาไปโชว์รูปในตารางที่วางจาก Excel ได้)
};

type Row = Record<string, unknown>;
const SELECT = "id, code, barcode, name_th, name_en, list_price, uom_id, cover_image_r2_key";
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
/** ทำ pattern ilike ให้ตรงตัวจริง — % และ _ เป็นตัวแทนอักขระใน ilike ต้อง escape ก่อน */
const likeSafe = (s: string) => s.replace(/([%_\\])/g, "\\$1");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { codes?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ data: {}, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const codes = Array.isArray(body.codes)
    ? [...new Set(body.codes.map((c) => String(c ?? "").trim()).filter(Boolean))].slice(0, 2000)
    : [];
  if (codes.length === 0) return NextResponse.json({ data: {}, error: null });

  const admin = supabaseAdmin();

  // ── 1) ถามเฉพาะรหัสที่ต้องการ (code + barcode) เป็นชุด ๆ ──
  const byKey = new Map<string, Row>();          // norm(รหัส) → แถว
  const addRow = (r: Row, keyField: "code" | "barcode") => {
    const k = norm(r[keyField]);
    if (!k) return;
    // code ชนะ barcode ถ้าชนกัน
    if (keyField === "code" || !byKey.has(k)) byKey.set(k, r);
  };

  const groups = chunk(codes, 200);
  const results = await Promise.all(groups.flatMap((g) => [
    admin.from("skus_v2").select(SELECT).eq("is_active", true).in("code", g),
    admin.from("skus_v2").select(SELECT).eq("is_active", true).in("barcode", g),
  ]));
  // เติม barcode ก่อน แล้วค่อย code (code ทับได้)
  results.forEach((res, i) => { if (i % 2 === 1) for (const r of ((res.data ?? []) as Row[])) addRow(r, "barcode"); });
  results.forEach((res, i) => { if (i % 2 === 0) for (const r of ((res.data ?? []) as Row[])) addRow(r, "code"); });

  // ── 2) ตัวที่ยังไม่เจอ (พิมพ์เล็ก-ใหญ่ไม่ตรง / มีช่องว่างเกินใน DB) → ค้นแบบไม่สนตัวพิมพ์ ──
  //     ปกติเหลือไม่กี่ตัว จึงยิงทีละตัวได้ (จำกัดไว้ 200 ตัว กันหลุดเป็นพันคำสั่ง)
  const missing = codes.filter((c) => !byKey.has(norm(c))).slice(0, 200);
  if (missing.length > 0) {
    for (const g of chunk(missing, 10)) {   // ทีละ 10 คำสั่งพร้อมกัน กันยิงถล่ม DB
      const found = await Promise.all(g.map((c) =>
        admin.from("skus_v2").select(SELECT).eq("is_active", true).ilike("code", likeSafe(c)).limit(1)));
      found.forEach((res, i) => {
        const r = ((res.data ?? []) as Row[])[0];
        // ยืนยันอีกชั้นด้วยการเทียบแบบ normalize (กัน ilike จับผิดตัว)
        if (r && norm(r.code) === norm(g[i])) byKey.set(norm(g[i]), r);
      });
    }
  }

  // ── 3) ชื่อหน่วยนับ (ถามเฉพาะที่ใช้จริง) ──
  const uomIds = [...new Set([...byKey.values()].map((r) => (r.uom_id ? String(r.uom_id) : "")).filter(Boolean))];
  const uomName = new Map<string, string>();
  if (uomIds.length > 0) {
    const uomRes = await Promise.all(chunk(uomIds, 200).map((g) => admin.from("uoms").select("id, name").in("id", g)));
    for (const res of uomRes) for (const u of ((res.data ?? []) as Row[])) uomName.set(String(u.id), String(u.name ?? ""));
  }

  const out: Record<string, SkuLookupHit | null> = {};
  for (const c of codes) {
    const hit = byKey.get(norm(c));
    out[c] = hit
      ? {
          id: String(hit.id),
          code: String(hit.code ?? ""),
          name: String(hit.name_th ?? hit.name_en ?? hit.code ?? ""),
          uom: hit.uom_id ? (uomName.get(String(hit.uom_id)) ?? null) : null,
          price: hit.list_price == null ? null : Number(hit.list_price),
          image_key: hit.cover_image_r2_key ? String(hit.cover_image_r2_key) : null,
        }
      : null;
  }
  return NextResponse.json({ data: out, error: null });
}
