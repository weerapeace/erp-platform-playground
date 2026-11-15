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
