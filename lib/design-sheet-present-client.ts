"use client";

/**
 * โหลดข้อมูลที่ใบนำเสนอ A4 ต้องใช้ (ฝั่ง client) — ใช้ร่วมกันระหว่างแผงจัดใบและหน้าพิมพ์
 * ยิงเป็น 2 ชุด (หลัก → รอง) ไม่ยิง 6 เส้นพร้อมกัน · ไม่ดึงข้อมูลต้นทุนเลย (cost-lines ไม่ถูกเรียก)
 */
import { apiFetch } from "@/lib/api";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { Presentation, PresentContext, PresentImage } from "@/lib/design-sheet-present";
import { defaultPresentation } from "@/lib/design-sheet-present";

export type PresentSheet = {
  id: string; code: string; name: string; status: string;
  brand_id: string | null; brand: { name: string; color: string | null } | null;
  order_date: string | null; deadline: string | null;
  parent_sku_refs: { code: string; id: string }[];
  linked_skus: { code: string; color: string | null; from_sheet: boolean }[];
};
export type PresentBundle = { sheet: PresentSheet; images: DesignSheetImage[]; presentation: Presentation; ctx: PresentContext; isNew: boolean };

const thaiDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(t);
};
const money = (n: number | null | undefined) => (n == null ? null : Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 }));

async function j<T>(r: Response): Promise<T> { return r.json() as Promise<T>; }

export async function loadPresentBundle(sheetId: string): Promise<PresentBundle> {
  const id = encodeURIComponent(sheetId);
  const [s, im, pr] = await Promise.all([
    apiFetch(`/api/design-sheets/${id}`).then((r) => j<{ data: PresentSheet | null; error: string | null }>(r)),
    apiFetch(`/api/design-sheets/${id}/images`).then((r) => j<{ data: DesignSheetImage[] }>(r)).catch(() => ({ data: [] as DesignSheetImage[] })),
    apiFetch(`/api/design-sheets/${id}/presentation`).then((r) => j<{ data: Presentation | null }>(r)).catch(() => ({ data: null })),
  ]);
  if (!s.data) throw new Error(s.error || "ไม่พบใบงาน");
  const sheet = s.data;
  const [qt, br] = await Promise.all([
    apiFetch(`/api/design-sheets/${id}/quotes`).then((r) => j<{ data: DesignSheetQuote[] }>(r)).catch(() => ({ data: [] as DesignSheetQuote[] })),
    sheet.brand_id ? apiFetch("/api/brands").then((r) => j<{ data: { id: string; logo_url?: string | null }[] }>(r)).catch(() => ({ data: [] })) : Promise.resolve({ data: [] as { id: string; logo_url?: string | null }[] }),
  ]);
  const images = Array.isArray(im.data) ? im.data : [];
  const quotes = Array.isArray(qt.data) ? qt.data : [];
  // ราคาเสนอ = รอบที่ "ผ่าน" ล่าสุด ไม่มีก็รอบล่าสุด (เฉพาะราคาที่เสนอลูกค้า — ไม่ใช่ price ต้นทุน)
  const passed = [...quotes].reverse().find((q) => q.status === "passed" && q.offered_price != null);
  const latest = [...quotes].reverse().find((q) => q.offered_price != null);
  const offered = (passed ?? latest)?.offered_price ?? null;
  const logoKey = sheet.brand_id ? (br.data ?? []).find((b) => b.id === sheet.brand_id)?.logo_url ?? null : null;
  const colors = [...new Set(sheet.linked_skus.filter((k) => k.from_sheet).map((k) => (k.color ?? "").trim()).filter(Boolean))];
  const ctx: PresentContext = {
    code: sheet.code, name: sheet.name, brand_name: sheet.brand?.name ?? "",
    brand_logo_url: logoKey ? `/api/r2-image?key=${encodeURIComponent(logoKey)}` : null,
    order_date_th: thaiDate(sheet.order_date), deadline_th: thaiDate(sheet.deadline),
    offered_price: money(offered), colors, sizes: sheet.parent_sku_refs.map((p) => p.code),
    origin: typeof window !== "undefined" ? window.location.origin : "",
  };
  const cover: PresentImage | null = images[0] ? { key: images[0].key, url: images[0].url } : null;
  const presentation = pr.data && Array.isArray(pr.data.pages) && pr.data.pages.length ? pr.data : defaultPresentation(cover, sheet.name);
  return { sheet, images, presentation, ctx, isNew: !(pr.data && pr.data.pages?.length) };
}
