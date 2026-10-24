/**
 * 📦 ของกลาง (pure) — แพ็กและส่งของออเดอร์เว็บร้าน (ระบบขนส่งเฟส 1 ก้อน 3)
 *
 *   - isReadyToPack  : ออเดอร์ที่ "พร้อมแพ็ก" = รอดำเนินการ/กำลังเตรียมของ + (จ่ายแล้ว หรือ เก็บปลายทาง)
 *   - parseTrackingPaste : วางเลขพัสดุหลายบรรทัด (จากไฟล์ขนส่ง/Excel) → จับคู่กับเลขออเดอร์
 *   - fulfillmentPrintHtml : ใบปะหน้า (ผู้ส่ง/ผู้รับ/COD/วิธีส่ง/กล่อง) + ใบแพ็ก (รายการสินค้า) พร้อมพิมพ์
 * ใช้ที่: components/website-orders-panel (ตัวกรอง 📦 พร้อมแพ็ก · ใส่เลขพัสดุหลายใบ) · app/print/web-orders
 *   - ใบแพ็ก: รายการที่ปั๊มชื่อ = รูปรอยปั๊ม ณ ตอนสั่ง (pzPreviewHtml) ให้ฝ่ายผลิตเห็นภาพเดียวกับลูกค้า
 */
import { personalizeTextPlacement, type OrderPersonalize } from "@/lib/website-personalize";

export type PackOrder = {
  id: string;
  orderNo: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  ship: { addressLine: string; subdistrict: string; district: string; province: string; postal: string };
  items: { name: string; variantLabel: string | null; qty: number; lineTotal: number; personalize?: OrderPersonalize | null }[];
  skuCodes?: string[];
  grandTotal: number;
  note?: string;
  createdAt: string;
  shippingMethod?: { label: string; box: string | null } | null;
  tracking?: { number: string } | null;
  giftWrap?: boolean;
  giftHidePrice?: boolean;
  giftMessage?: string;
};

export type Sender = { name: string; phone: string; address: string };

/** พร้อมแพ็ก = ยังไม่ส่ง ไม่ยกเลิก และเงินพร้อม (จ่ายแล้ว / เก็บปลายทาง) */
export function isReadyToPack(o: Pick<PackOrder, "status" | "paymentMethod" | "paymentStatus">): boolean {
  if (o.status !== "pending" && o.status !== "preparing") return false;
  return o.paymentStatus === "paid" || (o.paymentMethod === "cod" && o.paymentStatus !== "refunded");
}

export type TrackingPasteRow =
  | { ok: true; line: number; orderNo: string; orderId: string; trackingNo: string; replaces: string | null }
  | { ok: false; line: number; text: string; reason: string };

const cleanNo = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

/**
 * อ่านที่วางมา: 1 บรรทัด = 1 ออเดอร์ · คั่นด้วย tab / comma / เว้นวรรค (ลำดับคอลัมน์ไหนก็ได้)
 * หาเลขออเดอร์ที่ "ตรงกับออเดอร์ของร้าน" ในบรรทัด แล้วถือคำที่เหลือ (ตัวอักษร/ตัวเลข ≥ 8 ตัว) เป็นเลขพัสดุ
 */
export function parseTrackingPaste(text: string, orders: Pick<PackOrder, "id" | "orderNo" | "tracking">[]): TrackingPasteRow[] {
  const byNo = new Map(orders.map((o) => [o.orderNo.toUpperCase(), o]));
  const out: TrackingPasteRow[] = [];
  const seen = new Set<string>();
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const tokens = line.split(/[\t,;\s]+/).map(cleanNo).filter(Boolean);
      const noTok = tokens.find((tk) => byNo.has(tk));
      if (!noTok) return void out.push({ ok: false, line: i + 1, text: line, reason: "ไม่พบเลขออเดอร์ของร้านในบรรทัดนี้" });
      const track = tokens.find((tk) => tk !== noTok && /^[A-Z0-9]{8,30}$/.test(tk.replace(/-/g, "")) && /\d/.test(tk));
      if (!track) return void out.push({ ok: false, line: i + 1, text: line, reason: "ไม่พบเลขพัสดุ (ตัวอักษร/ตัวเลข 8 ตัวขึ้นไป)" });
      if (seen.has(noTok)) return void out.push({ ok: false, line: i + 1, text: line, reason: "เลขออเดอร์ซ้ำกับบรรทัดก่อนหน้า" });
      seen.add(noTok);
      const o = byNo.get(noTok)!;
      const prev = o.tracking?.number ?? null;
      out.push({ ok: true, line: i + 1, orderNo: o.orderNo, orderId: o.id, trackingNo: track.replace(/-/g, ""), replaces: prev && prev !== track ? prev : null });
    });
  return out;
}

/** 📸 รูปรอยปั๊ม ณ ตอนสั่ง (ใบแพ็ก) — ข้อความ HTML ทับรูป ขนาดตามกรอบ (cqw) · สีทึบ (เงิน/ทอง = สีกลางของไล่สี) */
function pzPreviewHtml(pz: OrderPersonalize): string {
  const sn = pz.preview;
  if (!sn) return "";
  const pl = personalizeTextPlacement(sn.pos);
  const foil = sn.foilFx;
  // ไล่สี → สีกลางค่อนเข้ม (เรียงตามความสว่าง) อ่านออกบนกระดาษ
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16) || 0;
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const byLum = foil ? [...foil.stops].sort((a, b) => lum(a.color) - lum(b.color)) : [];
  const color = !foil ? "rgba(0,0,0,.6)" : foil.mode === "solid" ? foil.solid : byLum[Math.floor((byLum.length - 1) / 2)]?.color ?? "#a68a3a";
  const css = `position:absolute;left:${pl.left};top:${pl.top};transform:${pl.transform};transform-origin:${pl.transformOrigin};white-space:nowrap;line-height:1;font-family:'Times New Roman',Times,serif;font-size:${sn.pos.size}cqw;letter-spacing:${sn.letterSpacing}em;color:${color}`;
  return `<div class="pzp"><img src="/api/r2-image?key=${encodeURIComponent(sn.imageKey)}&w=600" alt=""><div style="${esc(css)}">${esc(pz.text)}</div></div>`;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const addr = (s: PackOrder["ship"]) => [s.addressLine, s.subdistrict, s.district, s.province].filter(Boolean).join(" ");

export type PrintKind = "both" | "labels";

/**
 * HTML พร้อมพิมพ์ (A4)
 *   both   = 1 ออเดอร์ / แผ่น: ใบปะหน้าครึ่งบน (ตัดแปะกล่อง) + ใบแพ็กครึ่งล่าง (ใส่ในกล่อง/ใช้หยิบของ)
 *   labels = ใบปะหน้าอย่างเดียว 4 ใบ / แผ่น (มีเส้นตัด)
 * barcodes = SVG บาร์โค้ดเลขออเดอร์ (หน้าเว็บสร้างด้วย jsbarcode แล้วส่งมา) — ไม่มี = โชว์ตัวเลขอย่างเดียว
 */
export function fulfillmentPrintHtml(orders: PackOrder[], sender: Sender, kind: PrintKind, barcodes: Record<string, string> = {}, title = "ใบปะหน้า"): string {
  const label = (o: PackOrder) => {
    const cod = o.paymentMethod === "cod" && o.paymentStatus !== "paid";
    return `<div class="label">
      <div class="from"><b>ผู้ส่ง</b> ${esc(sender.name)}${sender.phone ? ` · โทร ${esc(sender.phone)}` : ""}${sender.address ? `<br>${esc(sender.address)}` : ""}</div>
      <div class="to">
        <div class="tt">ผู้รับ</div>
        <div class="name">${esc(o.customerName)}</div>
        <div class="phone">โทร ${esc(o.customerPhone)}</div>
        <div class="addr">${esc(addr(o.ship))}</div>
        <div class="postal">${esc(o.ship.postal)}</div>
      </div>
      <div class="meta">
        <div>${barcodes[o.orderNo] ?? ""}<div class="no">${esc(o.orderNo)}</div></div>
        <div class="right">
          ${o.shippingMethod ? `<div>${esc(o.shippingMethod.label)}${o.shippingMethod.box ? ` · กล่อง <b>${esc(o.shippingMethod.box)}</b>` : ""}</div>` : ""}
          ${cod ? `<div class="cod">เก็บเงินปลายทาง ${money(o.grandTotal)}</div>` : `<div class="paid">ชำระแล้ว</div>`}
        </div>
      </div>
    </div>`;
  };
  const packing = (o: PackOrder) => `<div class="pack">
      <div class="ph"><b>ใบแพ็กสินค้า</b> ${esc(o.orderNo)} · ${esc(new Date(o.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }))}${o.shippingMethod?.box ? ` · ใช้กล่อง <b>${esc(o.shippingMethod.box)}</b>` : ""}</div>
      <table><thead><tr><th style="width:2.2em">✓</th><th>สินค้า</th><th style="width:4em;text-align:right">จำนวน</th></tr></thead><tbody>
      ${o.items.map((i) => `<tr><td><span class="box"></span></td><td>${esc(i.name)}${i.variantLabel ? ` <span class="v">(${esc(i.variantLabel)})</span>` : ""}${i.personalize?.preview ? pzPreviewHtml(i.personalize) : ""}</td><td style="text-align:right"><b>${i.qty}</b></td></tr>`).join("")}
      </tbody></table>
      <div class="sum">รวม ${o.items.reduce((a, i) => a + i.qty, 0)} ชิ้น${o.skuCodes?.length ? ` · ${esc(o.skuCodes.join(", "))}` : ""}</div>
      ${o.giftWrap ? `<div class="warn">🎀 ห่อของขวัญ${o.giftHidePrice ? " · ห้ามใส่ใบเสร็จ/ป้ายราคาในกล่อง" : ""}${o.giftMessage ? `<br>การ์ด: “${esc(o.giftMessage)}”` : ""}</div>` : ""}
      ${o.note ? `<div class="note">หมายเหตุ: ${esc(o.note)}</div>` : ""}
    </div>`;
  const css = `@page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#111;font-size:12pt}
.pzp{position:relative;width:42mm;margin:1mm 0;border:1px solid #ccc;border-radius:2mm;overflow:hidden;container-type:inline-size}.pzp img{display:block;width:100%}
.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}
.label{border:2px solid #111;border-radius:6px;padding:4mm;display:flex;flex-direction:column;gap:3mm;height:136mm}
.from{font-size:10pt;color:#333;border-bottom:1px dashed #999;padding-bottom:2mm}
.to{flex:1}.to .tt{font-size:10pt;color:#555}.to .name{font-size:18pt;font-weight:700}.to .phone{font-size:14pt}.to .addr{font-size:14pt;margin-top:1mm;line-height:1.35}.to .postal{font-size:26pt;font-weight:800;letter-spacing:2px;margin-top:1mm}
.meta{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px dashed #999;padding-top:2mm;gap:3mm}.meta svg{height:12mm;max-width:62mm}.no{font-family:monospace;font-size:11pt}
.right{text-align:right;font-size:11pt}.cod{font-size:15pt;font-weight:800;border:2px solid #111;padding:1mm 3mm;margin-top:1mm}.paid{font-size:12pt;font-weight:700}
.pack{margin-top:6mm;border-top:2px dashed #555;padding-top:5mm}.ph{font-size:12pt;margin-bottom:2mm}
table{width:100%;border-collapse:collapse;font-size:11.5pt}th,td{border-bottom:1px solid #ccc;padding:1.5mm 1mm;text-align:left;vertical-align:top}th{font-size:10pt;color:#555}
.box{display:inline-block;width:4mm;height:4mm;border:1.5px solid #333}.v{color:#555}.sum{margin-top:2mm;font-size:10pt;color:#444}
.warn{margin-top:3mm;border:1.5px solid #be185d;color:#9d174d;padding:2mm;border-radius:4px}.note{margin-top:2mm;font-size:10.5pt}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.grid .label{height:132mm;border-style:dashed}`;
  let body: string;
  if (kind === "labels") {
    const pages: string[] = [];
    for (let i = 0; i < orders.length; i += 4) pages.push(`<div class="page grid">${orders.slice(i, i + 4).map(label).join("")}</div>`);
    body = pages.join("");
  } else {
    body = orders.map((o) => `<div class="page">${label(o)}${packing(o)}</div>`).join("");
  }
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}
