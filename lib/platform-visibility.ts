/**
 * กฎแบ่งแถวแพลตฟอร์มในแท็บ "แพลตฟอร์ม" ของ Parent SKU — โชว์ / ซ่อน (pure + เทสต์ lib/__tests__/platform-visibility.test.ts)
 *
 * เจ้าของขอ 2026-11-11: "ร้านไหนยังไม่เชื่อม ไม่ต้องโชว์ จะได้ไม่รก"
 *   โชว์ = แบรนด์ของสินค้านี้เชื่อมร้านนั้นแล้ว (platform_accounts.is_active) หรือ สินค้านี้อยู่บนร้านนั้นแล้ว (กันของที่ขายอยู่หายไป)
 *   ซ่อน = ที่เหลือ (UI พับเป็นบรรทัดเดียว กด "แสดง" ดูได้)
 *   ลำดับคงตามเดิม (ลำดับจากตั้งค่าแพลตฟอร์ม)
 */
export function splitPlatformsByConnection<T>(
  platforms: T[],
  isConnected: (p: T) => boolean,
  isOnSale: (p: T) => boolean,
): { shown: T[]; hidden: T[] } {
  const shown: T[] = [];
  const hidden: T[] = [];
  for (const p of platforms) (isConnected(p) || isOnSale(p) ? shown : hidden).push(p);
  return { shown, hidden };
}
