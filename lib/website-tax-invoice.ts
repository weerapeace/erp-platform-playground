/**
 * 🧾 ขอใบกำกับภาษีเต็มรูป (เว็บร้าน · ชุด 4) — กฎกลาง: ตรวจเลขผู้เสียภาษี · ล้างข้อมูลที่ลูกค้ากรอก · แยกยอด VAT
 *
 * ลูกค้าติ๊ก "ขอใบกำกับภาษีเต็มรูป" ตอนชำระเงิน (ร้านเปิดที่ ERP › ข้อมูลร้าน › 🧾) → เก็บที่ store_orders.tax_invoice
 * ร้านกดพิมพ์ใบกำกับภาษีจากรายละเอียดออเดอร์ใน ERP (หัวกระดาษบริษัทของร้าน · เลขที่เอกสารจากระบบเลขกลาง)
 * เว็บร้านตรวจรูปแบบซ้ำ (src/lib/tax-invoice.ts) — ตัวจริงตรวจที่นี่ตอนรับออเดอร์
 */

export interface TaxInvoiceRequest {
  /** person = บุคคลธรรมดา · company = นิติบุคคล */
  kind: "person" | "company";
  name: string;
  /** เลขประจำตัวผู้เสียภาษี 13 หลัก (บุคคล = เลขบัตรประชาชน) */
  taxId: string;
  /** นิติบุคคล: "00000" = สำนักงานใหญ่ · อื่น ๆ = สาขาที่ (5 หลัก) */
  branch: string;
  address: string;
  /** อีเมลรับใบกำกับ (ไม่ใส่ = อีเมลในออเดอร์) */
  email?: string;
}

/** เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก + หลักตรวจสอบถูกต้อง */
export function thaiTaxIdValid(v: unknown): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** ป้ายสาขา: "00000" = สำนักงานใหญ่ · "00012" = สาขาที่ 00012 · บุคคลธรรมดา = "" */
export function branchLabel(r: Pick<TaxInvoiceRequest, "kind" | "branch">): string {
  if (r.kind !== "company") return "";
  return r.branch === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${r.branch}`;
}

const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** ข้อมูลจากหน้าเว็บ → ใช้ได้ / ข้อความผิด (ไม่ขอ = ok + null) */
export function cleanTaxInvoice(raw: unknown): { ok: true; value: TaxInvoiceRequest | null } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: true, value: null };
  const o = raw as Record<string, unknown>;
  if (o.requested === false) return { ok: true, value: null };
  const kind = o.kind === "company" ? "company" : "person";
  const name = clean(o.name, 200);
  const taxId = String(o.taxId ?? "").replace(/\D/g, "");
  const branchRaw = String(o.branch ?? "").replace(/\D/g, "");
  const branch = kind === "company" ? (branchRaw ? branchRaw.padStart(5, "0").slice(-5) : "00000") : "";
  const address = String(o.address ?? "").replace(/\r/g, "").trim().slice(0, 500);
  const email = clean(o.email, 120);
  if (name.length < 2) return { ok: false, error: "ใบกำกับภาษี: กรอกชื่อ/ชื่อบริษัท" };
  if (!thaiTaxIdValid(taxId)) return { ok: false, error: "ใบกำกับภาษี: เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)" };
  if (address.length < 10) return { ok: false, error: "ใบกำกับภาษี: กรอกที่อยู่ตามใบทะเบียนให้ครบ" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "ใบกำกับภาษี: อีเมลไม่ถูกต้อง" };
  return { ok: true, value: { kind, name, taxId, branch, address, ...(email ? { email } : {}) } };
}

/** ยอดรวมที่รวม VAT แล้ว → มูลค่าก่อนภาษี + ภาษี (ปัด 2 ตำแหน่ง · base + vat = ยอดรวมเสมอ) */
export function vatSplit(totalIncl: number, ratePct = 7): { base: number; vat: number; total: number } {
  const total = Math.round((Number(totalIncl) || 0) * 100) / 100;
  const base = Math.round((total * 100) / (100 + ratePct) * 100) / 100;
  return { base, vat: Math.round((total - base) * 100) / 100, total };
}
