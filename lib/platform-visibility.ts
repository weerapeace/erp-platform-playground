/**
 * กฎแบ่งแถวแพลตฟอร์มในแท็บ "แพลตฟอร์ม" ของ Parent SKU — โชว์ / ซ่อน (pure + เทสต์ lib/__tests__/platform-visibility.test.ts)
 *
 * เจ้าของขอ 2026-11-11: "ร้านไหนยังไม่เชื่อม ไม่ต้องโชว์ จะได้ไม่รก"
 *   โชว์ = แบรนด์ของสินค้านี้เชื่อมร้านนั้นแล้ว (platform_accounts.is_active) หรือ สินค้านี้อยู่บนร้านนั้นแล้ว (กันของที่ขายอยู่หายไป)
 *   ซ่อน = ที่เหลือ (UI พับเป็นบรรทัดเดียว กด "แสดง" ดูได้)
 *   ลำดับคงตามเดิม (ลำดับจากตั้งค่าแพลตฟอร์ม)
 * เจ้าของขอ 2026-11-15: "บางอันไม่มีร้านเช่น Instagram อยากให้ซ่อนได้" → ซ่อนเองต่อแบรนด์ (lib/listing-hidden-platforms)
 *   brandHidden = แบรนด์สั่งซ่อน (ทุกสินค้าของแบรนด์) · ยกเว้นสินค้าที่อยู่บนร้านนั้นแล้ว = ยังโชว์ (ของที่ขายอยู่ห้ามหาย)
 *   ร้านที่ซ่อน (ทั้ง 2 แบบ) ไม่อยู่ใน "ลงทุกร้าน"
 */
export function splitPlatformsByConnection<T>(
  platforms: T[],
  isConnected: (p: T) => boolean,
  isOnSale: (p: T) => boolean,
  isBrandHidden: (p: T) => boolean = () => false,
): { shown: T[]; hidden: T[]; brandHidden: T[] } {
  const shown: T[] = [];
  const hidden: T[] = [];
  const brandHidden: T[] = [];
  for (const p of platforms) {
    if (isOnSale(p)) shown.push(p);
    else if (isBrandHidden(p)) brandHidden.push(p);
    else (isConnected(p) ? shown : hidden).push(p);
  }
  return { shown, hidden, brandHidden };
}

/* ─────────── สถานะ "สินค้านี้ลงร้านไหนแล้ว" (ใช้ร่วม: แท็บแพลตฟอร์มของ Parent SKU + ผู้ช่วยเสียง) ─────────── */

type DraftLike = { status?: string | null; platform_product_id?: string | null; last_sync_status?: string | null } | undefined;

/** ลงขายบนร้านแล้ว = ร่างส่งขึ้นร้านสำเร็จ/มีรหัสบนร้าน หรือมีรายการบนร้านจับคู่อยู่ (นำเข้า/ดึงจากร้าน) */
export const isListingOnSale = (d: DraftLike, matched: unknown): boolean =>
  (!!d && (d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id)) || !!matched;

export type ShopStatusInput = {
  platforms: { id: string; code: string; name_th: string }[];
  drafts: Record<string, DraftLike>;
  accounts: Record<string, { is_active?: boolean } | undefined>;
  matchedListings: Record<string, { id?: string | null } | undefined>;
  hiddenPlatformCodes: string[];
};
export type ShopStatus = {
  /** ร้านที่ลงแล้ว (ชื่อ) */
  listed: { code: string; name: string; listingId: string | null }[];
  /** ร้านที่เชื่อมแล้วแต่ยังไม่ลง (ชื่อ) */
  notListed: { code: string; name: string }[];
};

/** สรุปจากคำตอบ GET /api/product-platforms?parent_sku_id= — กฎแบ่งแถวเดียวกับแท็บแพลตฟอร์ม (ร้านที่ไม่ได้เชื่อม/แบรนด์ซ่อน ไม่นับว่า "ยังไม่ลง") */
export function shopStatusOf(ctx: ShopStatusInput): ShopStatus {
  const onSale = (p: { id: string }) => isListingOnSale(ctx.drafts[p.id], ctx.matchedListings[p.id]);
  const { shown } = splitPlatformsByConnection(ctx.platforms, (p) => !!ctx.accounts[p.id]?.is_active, onSale, (p) => ctx.hiddenPlatformCodes.includes(p.code));
  return {
    listed: shown.filter(onSale).map((p) => ({ code: p.code, name: p.name_th, listingId: ctx.matchedListings[p.id]?.id ?? null })),
    notListed: shown.filter((p) => !onSale(p)).map((p) => ({ code: p.code, name: p.name_th })),
  };
}
