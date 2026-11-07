/**
 * ใบงานออกแบบ ↔ ใบเสนอราคา — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น · ใช้ supabaseAdmin หลังผ่านด่านสิทธิ์)
 * กติกา pure + ชนิดข้อมูล: lib/design-sheet-quotations.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { isQuoteOpen, type SheetQuotation } from "@/lib/design-sheet-quotations";

type Admin = ReturnType<typeof supabaseAdmin>;

const QUOTE_COLS = "id, quote_number, status, customer_id, customer_name, customer_code, grand_total, quote_date, valid_until, reject_reason, created_at";

type QuoteRow = {
  id: string; quote_number: string | null; status: string; customer_id: string | null; customer_name: string | null; customer_code: string | null;
  grand_total: number | string | null; quote_date: string | null; valid_until: string | null; reject_reason: string | null; created_at: string | null;
};
type LinkRow = {
  quotation_id: string; replaces_quotation_id: string | null; source: string; created_at: string; created_by_name: string | null;
  q: QuoteRow | QuoteRow[] | null;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** ใบเสนอราคาทุกใบ (ทุกเวอร์ชัน) ที่ผูกกับใบงานนี้ */
export async function loadSheetQuotations(admin: Admin, sheetId: string): Promise<SheetQuotation[]> {
  const { data, error } = await admin.from("design_sheet_quotations")
    .select(`quotation_id, replaces_quotation_id, source, created_at, created_by_name, q:erp_playground_quotations!design_sheet_quotations_quotation_id_fkey(${QUOTE_COLS})`)
    .eq("design_sheet_id", sheetId);
  if (error) throw new Error(error.message);
  const links = ((data ?? []) as unknown as LinkRow[]).filter((l) => one(l.q));
  if (links.length === 0) return [];

  const qids = links.map((l) => l.quotation_id);
  const replIds = [...new Set(links.map((l) => l.replaces_quotation_id).filter((x): x is string => !!x))];
  const [others, repl] = await Promise.all([
    admin.from("design_sheet_quotations").select("quotation_id, ds:design_sheets(id, code, name)").in("quotation_id", qids).neq("design_sheet_id", sheetId),
    replIds.length ? admin.from("erp_playground_quotations").select("id, quote_number").in("id", replIds) : Promise.resolve({ data: [] as { id: string; quote_number: string | null }[] }),
  ]);
  const otherMap = new Map<string, SheetQuotation["other_sheets"]>();
  for (const r of (others.data ?? []) as unknown as { quotation_id: string; ds: { id: string; code: string | null; name: string | null } | { id: string; code: string | null; name: string | null }[] | null }[]) {
    const ds = one(r.ds); if (!ds) continue;
    (otherMap.get(r.quotation_id) ?? otherMap.set(r.quotation_id, []).get(r.quotation_id)!).push({ id: ds.id, code: ds.code, name: ds.name });
  }
  const replNo = new Map(((repl.data ?? []) as { id: string; quote_number: string | null }[]).map((r) => [r.id, r.quote_number]));
  const numberOf = new Map(links.map((l) => [l.quotation_id, one(l.q)!.quote_number]));

  return links.map((l) => {
    const q = one(l.q)!;
    const replacedBy = links.find((x) => x.replaces_quotation_id === l.quotation_id);
    return {
      quotation_id: l.quotation_id,
      quote_number: q.quote_number,
      status: q.status,
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      customer_code: q.customer_code,
      grand_total: Number(q.grand_total ?? 0),
      quote_date: q.quote_date,
      valid_until: q.valid_until,
      reject_reason: q.reject_reason,
      created_at: q.created_at,
      replaces_quotation_id: l.replaces_quotation_id,
      replaces_quote_number: l.replaces_quotation_id ? (numberOf.get(l.replaces_quotation_id) ?? replNo.get(l.replaces_quotation_id) ?? null) : null,
      replaced_by_quote_number: replacedBy ? (one(replacedBy.q)?.quote_number ?? null) : null,
      source: l.source,
      linked_at: l.created_at,
      linked_by_name: l.created_by_name,
      other_sheets: otherMap.get(l.quotation_id) ?? [],
    };
  });
}

/** ผูกใบเสนอราคากับใบงาน (ซ้ำ = ข้าม) — คืน error ข้อความ หรือ null */
export async function linkSheetQuotations(admin: Admin, rows: {
  design_sheet_id: string; quotation_id: string; replaces_quotation_id?: string | null; source: "send" | "revise";
  created_by?: string | null; created_by_name?: string | null;
}[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await admin.from("design_sheet_quotations")
    .upsert(rows.map((r) => ({ replaces_quotation_id: null, created_by: null, created_by_name: null, ...r })), { onConflict: "design_sheet_id,quotation_id", ignoreDuplicates: true });
  if (error) { console.error("[design-sheet-quotations] ผูกไม่สำเร็จ:", error.message); return error.message; }
  return null;
}

export type SheetQuoteBadge = { open: number; draft: number; sent: number; latest: string | null };

/** ป้ายบนการ์ด Design Dashboard: ต่อใบงาน มีใบเสนอราคาที่ยังเปิดกี่ใบ (ร่าง / ส่งแล้ว-ตอบรับ) */
export async function sheetQuoteBadges(admin: Admin, sheetIds: string[]): Promise<Map<string, SheetQuoteBadge>> {
  const out = new Map<string, SheetQuoteBadge>();
  if (sheetIds.length === 0) return out;
  const { data, error } = await admin.from("design_sheet_quotations")
    .select("design_sheet_id, q:erp_playground_quotations!design_sheet_quotations_quotation_id_fkey(quote_number, status, created_at)")
    .in("design_sheet_id", sheetIds);
  if (error) { console.error("[design-sheet-quotations] โหลดป้ายไม่สำเร็จ:", error.message); return out; }
  type Row = { design_sheet_id: string; q: { quote_number: string | null; status: string; created_at: string | null } | { quote_number: string | null; status: string; created_at: string | null }[] | null };
  const latestAt = new Map<string, string>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const q = one(r.q); if (!q || !isQuoteOpen(q.status)) continue;
    const b = out.get(r.design_sheet_id) ?? { open: 0, draft: 0, sent: 0, latest: null };
    b.open += 1;
    if (q.status === "draft") b.draft += 1; else b.sent += 1;
    const at = q.created_at ?? "";
    if (!b.latest || at > (latestAt.get(r.design_sheet_id) ?? "")) { b.latest = q.quote_number; latestAt.set(r.design_sheet_id, at); }
    out.set(r.design_sheet_id, b);
  }
  return out;
}
