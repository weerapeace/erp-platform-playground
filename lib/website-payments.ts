/**
 * 💳 ของกลาง (pure · ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ) — สลิปโอนของออเดอร์เว็บร้าน
 *
 * เจ้าของเลือก 2026-10-20 "A+B": ลูกค้าโอนพร้อมเพย์ (QR ใส่ยอดให้แล้ว) → แนบสลิปบนเว็บ → ระบบตรวจสลิปอัตโนมัติ (EasySlip)
 *   ผ่านครบ = ออเดอร์ "ชำระแล้ว" ทันที · ไม่ผ่าน/ตรวจไม่ได้ = เข้าคิว "รอตรวจเงิน" ให้พนักงานกดยืนยันเอง
 *   ⚠️ ระบบไม่ปฏิเสธสลิปเองเด็ดขาด (กันลูกค้าจ่ายจริงแต่โดนตีกลับเพราะบริการตรวจล่ม) — ปฏิเสธได้เฉพาะพนักงาน
 *
 * ฝั่งเซิร์ฟเวอร์ (อัปโหลด/เรียก EasySlip/เปลี่ยนสถานะ) = lib/website-payments-server.ts
 * ใช้ที่: /api/public/storefront/orders/slip (ลูกค้าแนบ) · /api/website/orders (พนักงานดู/ยืนยัน) · components/website-orders-panel
 */

export const SLIP_BUCKET = "payment-slips";
/** EasySlip รับไม่เกิน 4MB · เว็บร้านย่อรูปก่อนส่งอยู่แล้ว */
export const SLIP_MAX_BYTES = 4 * 1024 * 1024;
/** กันส่งรัว ๆ — ต่อออเดอร์ */
export const SLIP_MAX_PER_ORDER = 5;

export type SlipStatus = "pending" | "verified" | "rejected";
export type AutoResult = "passed" | "duplicate" | "amount_mismatch" | "account_mismatch" | "not_slip" | "error" | "off";

export const SLIP_STATUS: Record<SlipStatus, { label: string; tone: string }> = {
  pending: { label: "รอตรวจ", tone: "bg-amber-100 text-amber-800" },
  verified: { label: "ยืนยันรับเงินแล้ว", tone: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "สลิปไม่ถูกต้อง", tone: "bg-rose-100 text-rose-700" },
};

/** ผลตรวจอัตโนมัติ — th = พนักงานเห็น · customer = ลูกค้าเห็น (ภาษาคน ไม่บอกรายละเอียดเกินจำเป็น) */
export const AUTO_RESULT: Record<AutoResult, { th: string; tone: string; customer: { th: string; en: string } }> = {
  passed: {
    th: "✓ ระบบตรวจผ่าน (ยอดตรง · เข้าบัญชีร้าน · ไม่ซ้ำ)",
    tone: "bg-emerald-50 text-emerald-700",
    customer: { th: "ได้รับชำระเงินแล้ว ขอบคุณค่ะ", en: "Payment received — thank you!" },
  },
  duplicate: {
    th: "⚠ สลิปนี้เคยใช้แล้ว",
    tone: "bg-rose-50 text-rose-700",
    customer: { th: "สลิปนี้เคยถูกใช้แล้ว ร้านจะตรวจสอบและติดต่อกลับ", en: "This slip has been used before. The shop will check and contact you." },
  },
  amount_mismatch: {
    th: "⚠ ยอดในสลิปไม่ตรงกับยอดออเดอร์",
    tone: "bg-rose-50 text-rose-700",
    customer: { th: "ยอดในสลิปไม่ตรงกับยอดคำสั่งซื้อ ร้านจะตรวจสอบและติดต่อกลับ", en: "The slip amount doesn't match your order total. The shop will check and contact you." },
  },
  account_mismatch: {
    th: "⚠ บัญชีผู้รับไม่ตรงกับบัญชีร้าน",
    tone: "bg-rose-50 text-rose-700",
    customer: { th: "ได้รับสลิปแล้ว ร้านกำลังตรวจสอบ", en: "Slip received — the shop is checking it." },
  },
  not_slip: {
    th: "⚠ ระบบอ่าน QR ในสลิปไม่ได้ (รูปไม่ชัด/ไม่ใช่สลิป)",
    tone: "bg-amber-50 text-amber-800",
    customer: { th: "ได้รับรูปแล้ว แต่ระบบอ่านสลิปไม่ได้ ร้านจะตรวจให้ (หรือแนบรูปที่ชัดกว่าเดิมได้)", en: "Image received, but we couldn't read the slip. The shop will check it (or upload a clearer one)." },
  },
  error: {
    th: "ระบบตรวจอัตโนมัติไม่ตอบ — ตรวจเองได้เลย",
    tone: "bg-slate-100 text-slate-600",
    customer: { th: "ได้รับสลิปแล้ว ร้านกำลังตรวจสอบ", en: "Slip received — the shop is checking it." },
  },
  off: {
    th: "ไม่ได้เปิดตรวจอัตโนมัติ — ตรวจเอง",
    tone: "bg-slate-100 text-slate-600",
    customer: { th: "ได้รับสลิปแล้ว ร้านกำลังตรวจสอบ", en: "Slip received — the shop is checking it." },
  },
};

/** เหตุผลที่พนักงานเลือกตอนกด "สลิปไม่ถูกต้อง" (ลูกค้าเห็นข้อความนี้ในหน้าติดตามออเดอร์) */
export const SLIP_REJECT_REASONS: { key: string; th: string; en: string }[] = [
  { key: "amount", th: "ยอดเงินไม่ครบ/ไม่ตรง", en: "The amount is incorrect" },
  { key: "not_found", th: "ยังไม่พบเงินเข้าบัญชีร้าน", en: "We couldn't find this transfer in our account" },
  { key: "unclear", th: "รูปสลิปไม่ชัด", en: "The slip image is unclear" },
  { key: "wrong_account", th: "โอนผิดบัญชี", en: "Transferred to the wrong account" },
  { key: "duplicate", th: "สลิปนี้เคยใช้แล้ว", en: "This slip was already used" },
];
export const rejectReasonText = (key: string | null | undefined, lang: "th" | "en"): string => {
  if (!key) return "";
  const r = SLIP_REJECT_REASONS.find((x) => x.key === key);
  return r ? (lang === "en" ? r.en : r.th) : key;
};

/** ดูหัวไฟล์จริง (ไม่เชื่อนามสกุล/ชนิดที่เบราว์เซอร์บอก) */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** ผลอ่านสลิปจากบริการตรวจ (รูปแบบกลาง ไม่ผูกกับเจ้าใดเจ้าหนึ่ง) */
export type SlipCheck = {
  /** เรียกบริการได้และบริการตอบว่าอ่านสลิปสำเร็จ */
  ok: boolean;
  /** not_slip = บริการบอกว่าไม่ใช่สลิป/ไม่มี QR · error = เรียกไม่ได้/ตอบแปลก · off = ไม่ได้เปิด */
  failure?: "not_slip" | "error" | "off";
  code?: string | null;
  message?: string | null;
  transRef?: string | null;
  amount?: number | null;
  date?: string | null;
  sender?: string | null;
  receiver?: string | null;
  /** บริการบอกว่าสลิปซ้ำ */
  isDuplicate?: boolean;
  /** บริการเทียบยอดให้ (null = ไม่ได้บอก) */
  amountMatched?: boolean | null;
  /** บัญชีผู้รับตรงกับบัญชีที่ลงทะเบียนไว้กับบริการ (null = ไม่ได้บอก) */
  accountMatched?: boolean | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * แปลงคำตอบ EasySlip v2 (POST https://api.easyslip.com/v2/verify/bank) เป็นรูปแบบกลาง
 * อ้างอิง docs: data.isDuplicate · data.rawSlip.{transRef,date,amount.amount,sender,receiver} · data.matchedAccount · data.isAmountMatched · data.amountInSlip
 * ตอบแปลก/ไม่ครบ = failure "error" (ไม่มีทางกลายเป็น "ผ่าน" โดยบังเอิญ)
 */
export function parseEasySlip(httpStatus: number, body: unknown): SlipCheck {
  const j = obj(body);
  const err = obj(j.error);
  const code = str(err.code) ?? str(j.code) ?? null;
  const message = str(err.message) ?? str(j.message) ?? null;
  if (j.success !== true) {
    if (httpStatus === 404 || code === "SLIP_NOT_FOUND" || code === "INVALID_IMAGE_FORMAT") return { ok: false, failure: "not_slip", code, message };
    return { ok: false, failure: "error", code: code ?? `HTTP_${httpStatus}`, message };
  }
  const d = obj(j.data);
  const raw = obj(d.rawSlip);
  const amountObj = obj(raw.amount);
  const name = (side: unknown) => {
    const acc = obj(obj(side).account);
    const n = obj(acc.name);
    return str(n.th) ?? str(n.en) ?? null;
  };
  const amount = numOrNull(amountObj.amount) ?? numOrNull(raw.amount) ?? numOrNull(d.amountInSlip);
  return {
    ok: true,
    code,
    message,
    transRef: str(raw.transRef),
    amount,
    date: str(raw.date),
    sender: name(raw.sender),
    receiver: name(raw.receiver),
    isDuplicate: d.isDuplicate === true,
    amountMatched: typeof d.isAmountMatched === "boolean" ? d.isAmountMatched : null,
    accountMatched: "matchedAccount" in d ? !!d.matchedAccount : null,
  };
}

/**
 * ตัดสินผลตรวจ — ผ่าน (passed) ได้ทางเดียว: อ่านสลิปได้ + ไม่ซ้ำ + ยอดตรง (±1 สตางค์) + บัญชีผู้รับตรงกับบัญชีร้าน
 * usedElsewhere = เลขอ้างอิงสลิปนี้เคยถูกใช้กับ "ออเดอร์อื่น" ในระบบเราแล้ว
 * seenOnThisOrder = ออเดอร์นี้เคยส่งสลิปใบเดียวกันมาแล้ว (ลูกค้ากดส่งซ้ำ) → บริการจะบอกว่าซ้ำ แต่ไม่ใช่การโกง ไม่นับ
 */
export function decideSlip(
  check: SlipCheck,
  grandTotal: number,
  dup: { usedElsewhere: boolean; seenOnThisOrder: boolean },
): { result: AutoResult; note: string } {
  if (!check.ok) {
    const f = check.failure ?? "error";
    return { result: f, note: [check.code, check.message].filter(Boolean).join(" · ") };
  }
  if (dup.usedElsewhere) return { result: "duplicate", note: "เลขอ้างอิงสลิปนี้ใช้กับออเดอร์อื่นแล้ว" };
  if (check.isDuplicate && !dup.seenOnThisOrder) return { result: "duplicate", note: "บริการตรวจแจ้งว่าสลิปนี้เคยตรวจแล้ว" };
  const amountOk = check.amount != null ? Math.abs(check.amount - grandTotal) <= 0.01 : check.amountMatched === true;
  if (!amountOk) return { result: "amount_mismatch", note: `ยอดในสลิป ${check.amount ?? "?"} · ยอดออเดอร์ ${grandTotal}` };
  if (check.accountMatched !== true) return { result: "account_mismatch", note: check.receiver ? `ผู้รับในสลิป: ${check.receiver}` : "บริการไม่ยืนยันบัญชีผู้รับ" };
  return { result: "passed", note: "" };
}
