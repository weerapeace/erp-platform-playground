/**
 * 🧾 หน้าตาใบกำกับภาษีเต็มรูปของออเดอร์เว็บ (A4) — สร้าง HTML ให้ PrintFrame/พิมพ์/บันทึก PDF (app/print/web-tax-invoice)
 * หัวกระดาษ = บริษัทที่ร้านเลือก (lib/doc-parties companyHeader) · ราคาบนเว็บรวม VAT แล้ว → แยกมูลค่าก่อนภาษี/ภาษี (vatSplit)
 * บริษัทไม่ได้จด VAT = "ใบเสร็จรับเงิน" ไม่แยกภาษี · ต้นฉบับ + สำเนา (2 แผ่น)
 */
import { thaiBahtText } from "@/lib/quotation-print";
import { branchLabel, vatSplit, type TaxInvoiceRequest } from "@/lib/website-tax-invoice";

export interface TaxInvoiceDoc {
  no: string;
  /** วันที่ออกใบ (ISO) */
  issuedAt: string;
  orderNo: string;
  company: { name: string; nameEn: string; address: string; phone: string; taxId: string; vatRegistered: boolean };
  customer: TaxInvoiceRequest;
  lines: { name: string; variant: string | null; qty: number; unitPrice: number; lineTotal: number }[];
  /** ค่าส่ง/ค่าธรรมเนียม/ห่อของขวัญ ฯลฯ (บวก) */
  extras: { label: string; amount: number }[];
  /** ส่วนลดรวม (บวก = ลด) */
  discount: number;
  /** ยอดรวมทั้งสิ้น (รวม VAT · = grand_total ของออเดอร์) */
  total: number;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });
const fmtTaxId = (d: string) => (d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : d);

function page(d: TaxInvoiceDoc, copy: boolean): string {
  const vat = d.company.vatRegistered;
  const title = vat ? "ใบกำกับภาษี / ใบเสร็จรับเงิน" : "ใบเสร็จรับเงิน";
  const split = vatSplit(d.total);
  const branch = branchLabel(d.customer);
  const rows = d.lines
    .map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.name)}${l.variant ? `<div class="sub">${esc(l.variant)}</div>` : ""}</td><td class="r">${l.qty}</td><td class="r">${money(l.unitPrice)}</td><td class="r">${money(l.lineTotal)}</td></tr>`)
    .join("");
  const extras = d.extras.filter((x) => x.amount).map((x) => `<tr><td></td><td>${esc(x.label)}</td><td></td><td></td><td class="r">${money(x.amount)}</td></tr>`).join("");
  const disc = d.discount > 0 ? `<tr><td></td><td>ส่วนลด</td><td></td><td></td><td class="r">-${money(d.discount)}</td></tr>` : "";
  return `<section class="pg">
  <div class="head">
    <div><div class="co">${esc(d.company.name)}</div>${d.company.nameEn ? `<div class="sub">${esc(d.company.nameEn)}</div>` : ""}
      <div class="sub">${esc(d.company.address)}</div>
      <div class="sub">${d.company.phone ? `โทร ${esc(d.company.phone)} · ` : ""}เลขประจำตัวผู้เสียภาษี ${esc(d.company.taxId)}</div></div>
    <div class="ttl"><div class="t1">${title}</div><div class="t2">${copy ? "สำเนา" : "ต้นฉบับ"}</div></div>
  </div>
  <div class="meta">
    <div class="box"><div class="lb">ลูกค้า</div><div class="b">${esc(d.customer.name)}${branch ? ` (${esc(branch)})` : ""}</div>
      <div>${esc(d.customer.address)}</div><div>เลขประจำตัวผู้เสียภาษี ${esc(fmtTaxId(d.customer.taxId))}</div></div>
    <div class="box"><div><span class="lb">เลขที่</span> <b>${esc(d.no)}</b></div><div><span class="lb">วันที่</span> ${thDate(d.issuedAt)}</div><div><span class="lb">อ้างอิงออเดอร์</span> ${esc(d.orderNo)}</div></div>
  </div>
  <table class="lines"><thead><tr><th class="c">#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/หน่วย</th><th class="r">จำนวนเงิน</th></tr></thead>
  <tbody>${rows}${extras}${disc}</tbody></table>
  <div class="sum">
    <div class="words">(${esc(thaiBahtText(d.total))})</div>
    <table>${vat ? `<tr><td>มูลค่าก่อนภาษี</td><td class="r">${money(split.base)}</td></tr><tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${money(split.vat)}</td></tr>` : ""}<tr class="tot"><td>ยอดรวมทั้งสิ้น</td><td class="r">${money(d.total)}</td></tr></table>
  </div>
  <div class="sign"><div><div class="line"></div>ผู้รับเงิน</div><div><div class="line"></div>วันที่</div></div>
  ${vat ? `<div class="note">ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว</div>` : ""}
</section>`;
}

/** HTML ทั้งเอกสาร (ต้นฉบับ + สำเนา) */
export function taxInvoiceHtml(d: TaxInvoiceDoc): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(d.no)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap">
<style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:13px;color:#111;margin:0}
.pg{page-break-after:always;padding:4mm 2mm}.pg:last-child{page-break-after:auto}
.head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:8px}
.co{font-size:18px;font-weight:700}.sub{color:#444;font-size:12px}.ttl{text-align:right}.t1{font-size:18px;font-weight:700}.t2{font-size:12px;border:1px solid #111;display:inline-block;padding:1px 10px;margin-top:4px}
.meta{display:grid;grid-template-columns:1.6fr 1fr;gap:10px;margin:10px 0}.box{border:1px solid #bbb;border-radius:6px;padding:8px;line-height:1.55}.lb{color:#666}.b{font-weight:600}
table.lines{width:100%;border-collapse:collapse}table.lines th,table.lines td{border-bottom:1px solid #ddd;padding:5px 6px;vertical-align:top}table.lines th{background:#f3f4f6;font-weight:600;border-top:1px solid #bbb}
.c{text-align:center;width:28px}.r{text-align:right;white-space:nowrap}
.sum{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:10px}.words{font-weight:600;padding-top:4px}.sum table{min-width:240px;border-collapse:collapse}.sum td{padding:3px 6px}.tot td{font-weight:700;border-top:2px solid #111;font-size:15px}
.sign{display:flex;justify-content:flex-end;gap:40px;margin-top:40px;text-align:center}.sign .line{border-bottom:1px dotted #333;width:180px;height:26px;margin-bottom:4px}.note{margin-top:10px;font-size:11px;color:#666}
</style></head><body>${page(d, false)}${page(d, true)}</body></html>`;
}
