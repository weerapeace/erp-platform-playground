/** 🐾 ทะเบียนแมว — ของใช้ร่วมของ API /api/cats/<kind> (ตรวจชนิด · ตอบผิดพลาด) */
import { NextResponse } from "next/server";
import { CAT_KINDS, isCatKind, type CatKind } from "@/lib/cats";

export const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ชนิดจาก URL → ตารางจริง (ไม่รู้จัก = null) */
export function kindOf(raw: string): { kind: CatKind; table: string } | null {
  if (!isCatKind(raw)) return null;
  return { kind: raw, table: CAT_KINDS[raw].table };
}
