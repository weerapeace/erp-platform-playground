/**
 * ลำดับไฟล์ในอัลบั้ม Contents (pure · ใช้ทั้งเซิร์ฟเวอร์และหน้าจอ)
 *   order = content_albums.file_order (ลากเรียงเอง) · ว่าง = คงลำดับเดิม (เวลาที่เพิ่ม ใหม่ก่อน)
 *   ไฟล์ที่อยู่ในรายการ = ตามรายการ · ไฟล์ที่ไม่อยู่ (อัปทีหลัง) = ต่อท้ายตามลำดับเดิม · id ในรายการที่ไม่มีไฟล์แล้ว = ข้าม
 */
export function applyFileOrder<T extends { id: string }>(files: T[], order: readonly string[] | null | undefined): T[] {
  if (!order?.length) return files;
  const rank = new Map<string, number>();
  order.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const inList = files.filter((f) => rank.has(f.id)).sort((a, b) => (rank.get(a.id) as number) - (rank.get(b.id) as number));
  const rest = files.filter((f) => !rank.has(f.id));
  return [...inList, ...rest];
}
