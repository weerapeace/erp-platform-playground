/**
 * ของกลาง — "ทะเบียนรหัสสแกน" (Scan Code Registry)
 *
 * ปัญหาที่แก้: ถ้าแต่ละงานทำหน้าสแกนของตัวเอง (สแกนรับของ / สแกนใบผลิต / สแกนสินค้า)
 * เราจะกลับไปเป็นระบบแบบ "แก้ทีละหน้า" อีก → ที่นี่คือที่เดียวที่รู้ว่า
 * "ข้อความที่สแกนได้ = เอกสารอะไร" และ "QR ที่พิมพ์ควรใส่ลิงก์อะไร"
 *
 * ใช้ร่วมกัน:
 *  - หน้ากลาง `/s/[code]` (สแกนแล้วเด้งไปหน้าที่ถูกต้อง)
 *  - API `/api/scan/resolve` (ค้นว่ารหัสนี้คือใบไหน)
 *  - หน้าพิมพ์ทุกใบ (สร้าง QR ด้วย scanQrHtml/scanUrl)
 *
 * ⚠️ กฎสำคัญ: QR ที่พิมพ์ต้องชี้ `/s/<รหัส>` เสมอ ห้ามชี้หน้าปลายทางตรง ๆ
 * เพราะป้าย/ใบที่พิมพ์ไปแล้วแก้ไม่ได้ — ถ้าวันหน้าอยากเปลี่ยนปลายทาง จะได้แก้ที่ไฟล์นี้ที่เดียว
 */

export type ScanKind = "po" | "mo" | "pr" | "sku" | "unknown";

export type ParsedScan = {
  kind: ScanKind;
  /** รหัสที่ใช้ค้นต่อ — เลขเอกสาร (PO-2026-00070) หรือรหัสสินค้า หรือ uuid */
  code: string;
  /** true = code เป็น uuid (มาจาก QR รุ่นเก่าที่ฝัง id ไว้) → ต้องค้นด้วย id ไม่ใช่เลขเอกสาร */
  byId: boolean;
  raw: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** รูปแบบเลขเอกสารจริงในระบบ (ตรวจกับข้อมูลใน DB แล้ว: PO-2026-00070 / MO-2026-00127 / PR-2026-00112) */
const DOC_RULES: { kind: ScanKind; re: RegExp }[] = [
  { kind: "po", re: /^PO-\d{4}-\d+$/i },
  { kind: "mo", re: /^MO-\d{4}-\d+$/i },
  { kind: "pr", re: /^PR-\d{4}-\d+$/i },
];

/**
 * ลิงก์รุ่นเก่าที่ QR ชี้ตรงเข้าหน้าใดหน้าหนึ่ง — ต้องอ่านออกด้วย
 * ไม่งั้นใบสั่งงานที่พิมพ์แจกไปแล้วทั้งหมดจะสแกนไม่รู้เรื่องตอนใช้หน้าสถานีสแกน
 */
const LEGACY_PATHS: { kind: ScanKind; re: RegExp }[] = [
  { kind: "mo", re: /\/print\/work-order\/([^/?#]+)/i },
  { kind: "po", re: /\/print\/purchase-order\/([^/?#]+)/i },
  { kind: "pr", re: /\/print\/purchase-request\/([^/?#]+)/i },
];

const safeDecode = (s: string): string => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/** แปลงข้อความที่สแกนได้ (QR / บาร์โค้ด / พิมพ์มือ) → รู้ว่าเป็นเอกสารอะไร */
export function parseScanned(raw: string): ParsedScan {
  const original = String(raw ?? "").trim();
  if (!original) return { kind: "unknown", code: "", byId: false, raw: original };

  let s = original;

  // มาเป็นลิงก์ (สแกนจากกล้องมือถือ / QR ที่เราพิมพ์)
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) {
    const viaShort = s.match(/\/s\/([^/?#]+)/i);
    if (viaShort) {
      s = safeDecode(viaShort[1]);
    } else {
      for (const rule of LEGACY_PATHS) {
        const m = s.match(rule.re);
        if (m) {
          const code = safeDecode(m[1]);
          return { kind: rule.kind, code, byId: UUID_RE.test(code), raw: original };
        }
      }
      // ลิงก์อื่นที่ไม่รู้จัก → ลองใช้ส่วนท้ายสุดของ path
      const last = s.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
      s = safeDecode(last);
    }
  }

  if (!s) return { kind: "unknown", code: "", byId: false, raw: original };
  if (UUID_RE.test(s)) return { kind: "unknown", code: s, byId: true, raw: original };

  const upper = s.toUpperCase();
  for (const rule of DOC_RULES) {
    if (rule.re.test(upper)) return { kind: rule.kind, code: upper, byId: false, raw: original };
  }

  // ไม่ใช่เลขเอกสาร → ถือเป็นรหัสสินค้า (ป้าย SKU ที่พิมพ์ไปแล้วเก็บรหัสเปล่า)
  return { kind: "sku", code: s, byId: false, raw: original };
}

/**
 * เส้นทางหน้ากลาง — encode ให้เสมอ
 * ⚠️ รหัสสินค้าจริงในระบบมี "#" ถึง 5,430 จาก 12,726 ตัว (43%) และบางตัวมีช่องว่าง
 *    ถ้าไม่ encode "#" จะกลายเป็น fragment → เปิดหน้าไม่เจอ
 */
export const scanPath = (code: string): string => `/s/${encodeURIComponent(String(code ?? "").trim())}`;

/** ลิงก์เต็มสำหรับฝังใน QR (กล้องมือถือธรรมดาสแกนแล้วเปิดเว็บได้เลย) */
export function scanUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${scanPath(code)}`;
}

/** สร้างรูป QR เป็น data-url (โหลดไลบรารีเฉพาะตอนใช้ — ไม่ถ่วงหน้าอื่น) */
export async function scanQrDataUrl(text: string, opts?: { width?: number; dark?: string }): Promise<string> {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text || " ", {
    margin: 0,
    width: opts?.width ?? 200,
    errorCorrectionLevel: "M",
    color: { dark: opts?.dark ?? "#000000", light: "#ffffff" },
  });
}

/** สร้าง <img> QR สำหรับแปะลงเทมเพลตใบพิมพ์ (คืน "" ถ้าสร้างไม่ได้ — ใบยังพิมพ์ได้ตามปกติ) */
export async function scanQrHtml(
  text: string,
  opts?: { width?: number; dark?: string; className?: string; alt?: string },
): Promise<string> {
  if (!text) return "";
  try {
    const dataUrl = await scanQrDataUrl(text, opts);
    const cls = opts?.className ?? "scan-qr";
    const alt = opts?.alt ?? "QR สำหรับสแกน";
    return `<img class="${cls}" src="${dataUrl}" alt="${alt}" />`;
  } catch {
    return "";
  }
}
