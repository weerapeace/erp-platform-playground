/**
 * 📎 ไฟล์ Excel แนบรายงานอัตโนมัติ (ฝั่งเซิร์ฟเวอร์) — จาก BuiltReport.export (ทุกรายการ ไม่ตัดตาม max_rows)
 * ใช้ทั้งอีเมล (options.attach_excel) และ Discord (discord.attach_excel) · ตัวเลขเป็น number → เปิดแล้วรวม/กรองต่อได้
 * ใช้ไลบรารี xlsx ที่มีในโปรเจกต์อยู่แล้ว (ตัวเดียวกับปุ่มดาวน์โหลด Excel ทั่วระบบ)
 */
import type { ReportExport } from "@/lib/email-report/render";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type XlsxLib = typeof import("xlsx");

/** สร้างไฟล์ .xlsx แผ่นเดียว: แถวหัว + ทุกแถว · กว้างคอลัมน์ตามชนิด */
export async function reportExcel(exp: ReportExport): Promise<Buffer> {
  const mod = (await import("xlsx")) as XlsxLib & { default?: XlsxLib };
  const XLSX: XlsxLib = mod.default?.utils ? mod.default : mod;
  const aoa = [exp.columns.map((c) => c.header), ...exp.rows.map((r) => exp.columns.map((c) => r[c.key] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = exp.columns.map((c) => ({ wch: c.key === "name" ? 50 : c.key === "color" || c.key === "shop" ? 22 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, exp.sheet.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "รายงาน");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
