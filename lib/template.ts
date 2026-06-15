/**
 * Template renderer กลาง — แทน {{token}} ในสตริง HTML
 *
 * Syntax:
 *   {{name}}                 — แทนค่า data.name แบบ escape HTML
 *   {{{name}}}               — แทนค่า data.name แบบ raw HTML (ใช้กับรูป/table ที่ระบบสร้างให้)
 *   {{user.email}}           — nested path
 *   {{#items}}{{x}}{{/items}}— loop array; ใน loop, scope = item
 *   {{#name}}value{{/name}}  — show ถ้า truthy (อาจเป็น scalar)
 *
 * ไม่ใช้ regex engine ภายนอก เพื่อความเรียบง่ายและปลอดภัย
 */

// ---- get value by path "a.b.c" ----
function getPath(obj: unknown, path: string): unknown {
  if (!path || path === ".") return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else { return undefined; }
  }
  return cur;
}

// ---- escape HTML (basic) ----
function esc(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
}

// ---- main render ----
// แทน {{#section}}...{{/section}} ก่อน แล้วค่อย {{token}}
export function renderTemplate(tpl: string, data: Record<string, unknown>): string {
  let out = tpl;

  // 1. Section loops {{#name}}...{{/name}}
  // จับเริ่มจากบล็อกในสุดก่อน (greedy ไม่ทำเพราะอาจมี nest ไม่กี่ชั้น)
  // วน loop จนไม่เจอ section
  let safety = 100;
  while (safety-- > 0) {
    const m = out.match(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/);
    if (!m) break;
    const [full, key, inner] = m;
    const val = getPath(data, key);
    let replaced: string;
    if (Array.isArray(val)) {
      replaced = val.map((item, idx) => {
        // scope ใน loop = ตัว item ผสม index + parent data (เผื่อ {{globalToken}})
        const scope = { ...data, ...(typeof item === "object" && item ? item as Record<string, unknown> : { value: item }), idx: idx + 1 };
        return renderTemplate(inner, scope);
      }).join("");
    } else if (val) {
      // truthy scalar/object — render inner ด้วย data ปกติ
      replaced = renderTemplate(inner, data);
    } else {
      replaced = "";
    }
    out = out.slice(0, m.index!) + replaced + out.slice(m.index! + full.length);
  }

  // 2. Raw HTML tokens {{{token}}}
  out = out.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, path) => String(getPath(data, path) ?? ""));

  // 3. Plain tokens {{token}}
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_, path) => esc(getPath(data, path)));

  return out;
}

// ---- full document builder ----
export type ReportTemplate = {
  paper_size:  "A4" | "A5" | "Letter";
  orientation: "portrait" | "landscape";
  header_html: string;
  body_html:   string;
  footer_html: string;
  custom_css:  string;
};

export type ReportImageGridItem = {
  src: string;
  alt?: string;
};

export function buildReportImageGridHtml(items: ReportImageGridItem[], options: { columns?: 1 | 2; maxHeightMm?: number } = {}): string {
  const images = items.filter((item) => item.src.trim());
  if (images.length === 0) return "";

  const columns = options.columns ?? 2;
  const maxHeightMm = options.maxHeightMm ?? 58;
  const cells = images.map((item) => `
    <figure class="report-image-grid__item">
      <img src="${esc(item.src)}" alt="${esc(item.alt ?? "report image")}" />
    </figure>
  `).join("");

  return `<div class="report-image-grid report-image-grid--cols-${columns}" style="--report-image-grid-cols:${columns};--report-image-grid-max-height:${maxHeightMm}mm;">${cells}</div>`;
}

const PAPER_DIMS: Record<string, { w: string; h: string }> = {
  A4:     { w: "210mm", h: "297mm" },
  A5:     { w: "148mm", h: "210mm" },
  Letter: { w: "215.9mm", h: "279.4mm" },
};

function reportCss(tpl: ReportTemplate): string {
  const dims = PAPER_DIMS[tpl.paper_size] ?? PAPER_DIMS.A4;
  const isLandscape = tpl.orientation === "landscape";
  const pageW = isLandscape ? dims.h : dims.w;
  const pageH = isLandscape ? dims.w : dims.h;

  return `
    *,*::before,*::after { box-sizing: border-box; }
    html, body { width: ${pageW}; min-height: 0; margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", "Sarabun", sans-serif; color: #0f172a; background: white; overflow-x: hidden; }
    .doc { width: ${pageW}; min-height: ${pageH}; padding: 20mm 16mm; margin: 0 auto; background: white; overflow: visible; break-after: auto; page-break-after: auto; }
    .doc table { page-break-inside: auto; }
    .doc tr { page-break-inside: avoid; break-inside: avoid; }
    .doc thead { display: table-header-group; }
    .doc tfoot { display: table-footer-group; }
    .doc header, .doc footer, .totals, .amount-text, .signatures { page-break-inside: avoid; break-inside: avoid; break-before: auto; break-after: auto; page-break-before: auto; page-break-after: auto; }
    .doc footer:empty { display: none; }
    .doc img, .doc svg, .doc canvas { max-width: 100%; page-break-inside: avoid; break-inside: avoid; }
    .report-image-grid { display: grid; grid-template-columns: repeat(var(--report-image-grid-cols, 2), minmax(0, 1fr)); gap: 4mm; align-items: start; margin: 2mm 0 3mm; }
    .report-image-grid__item { margin: 0; min-width: 0; page-break-inside: avoid; break-inside: avoid; }
    .report-image-grid__item img { display: block; width: 100%; height: auto; max-height: var(--report-image-grid-max-height, 58mm); object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px; background: #fff; }
    @media print {
      html, body { width: ${pageW}; height: auto !important; min-height: 0 !important; background: white; overflow: visible !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .doc { width: ${pageW}; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 14mm 12mm; box-shadow: none; overflow: visible; break-after: auto !important; page-break-after: auto !important; }
      .doc::after { content: none !important; display: none !important; }
      .doc > header, .doc > main, .doc > footer { break-before: auto !important; break-after: auto !important; page-break-before: auto !important; page-break-after: auto !important; }
      .doc > footer:empty { display: none !important; }
      .report-image-grid { gap: 3mm; margin: 1.5mm 0 2.5mm; }
    }
    @page { size: ${tpl.paper_size} ${tpl.orientation}; margin: 0; }
    ${tpl.custom_css}
  `;
}

function reportDocDiv(tpl: ReportTemplate, data: Record<string, unknown>): string {
  return `<div class="doc">
  <header>${renderTemplate(tpl.header_html, data)}</header>
  <main>${renderTemplate(tpl.body_html, data)}</main>
  <footer>${renderTemplate(tpl.footer_html, data)}</footer>
</div>`;
}

function wrapHtmlDoc(css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Print</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildReportHtml(tpl: ReportTemplate, data: Record<string, unknown>): string {
  return wrapHtmlDoc(reportCss(tpl), reportDocDiv(tpl, data));
}

/**
 * พิมพ์หลายเอกสารในไฟล์เดียว (เทมเพลตเดียวกัน) — แต่ละชุดข้อมูลขึ้นหน้าใหม่
 * ใช้กับ bulk print เช่น เลือกใบสั่งงานหลายใบแล้วพิมพ์ทีเดียว
 */
export function buildReportHtmlMulti(tpl: ReportTemplate, dataList: Record<string, unknown>[]): string {
  // ห่อแต่ละใบด้วย .doc-page แล้วบังคับแบ่งหน้า — ต้องใช้ !important เพราะ .doc มี break-after:auto!important ในโหมดพิมพ์
  const breakCss = `
    .doc-page { break-after: page; page-break-after: always; }
    .doc-page:last-child { break-after: auto; page-break-after: auto; }
    @media print {
      .doc-page { break-after: page !important; page-break-after: always !important; }
      .doc-page:last-child { break-after: auto !important; page-break-after: auto !important; }
    }
  `;
  const body = dataList.map((data) => `<div class="doc-page">${reportDocDiv(tpl, data)}</div>`).join("\n");
  return wrapHtmlDoc(reportCss(tpl) + breakCss, body);
}
