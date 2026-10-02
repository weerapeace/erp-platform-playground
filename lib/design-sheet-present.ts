/**
 * ใบนำเสนอ A4 ของใบงานออกแบบ (Design Sheet Presentation) — ส่วนที่เป็น "ตรรกะล้วน" ใช้ร่วมกัน
 * ทั้งแผงจัดใบ (components/design-sheet-present), หน้าพิมพ์ (/print/design-sheet-present) และ API
 *
 * หลักการ (ตกลงกับเจ้าของ 2026-10-02): แบบ A = "เลือกรูป + แม่แบบสำเร็จ"
 * - 1-2 หน้า · แต่ละหน้าเลือกรูปแบบจัดวาง (LAYOUTS) + รูป + ข้อความ · หน้า 2 เลือกได้ต่อใบ
 * - หัวกระดาษ = โลโก้แบรนด์ของใบงาน
 * - ห้ามหลุด: ต้นทุน/ราคาตีราคา → ข้อมูลที่ส่งเข้าเทมเพลตไม่มีฟิลด์ต้นทุนเลย (ใส่ไม่ได้แม้แก้เทมเพลต)
 * - หน้าตาใบแก้ได้ที่ /admin/report-templates entity "ds_present" (Mustache) · ไม่มีใน DB = ใช้ DEFAULT ด้านล่าง
 */

export type PresentLayout = "hero" | "grid4" | "trio" | "spec";
export type PresentImage = { key: string; url: string };
export type PresentPage = {
  layout: PresentLayout;
  images: PresentImage[];
  heading?: string;     // หัวข้อหน้า (ค่าเริ่มต้น = ชื่องาน)
  text?: string;        // ข้อความอธิบาย (หลายบรรทัด)
  bullets?: string[];   // จุดขาย (bullet)
  show_price?: boolean; // โชว์ราคาเสนอ (เฉพาะราคาที่เสนอลูกค้า ไม่ใช่ต้นทุน)
};
export type Presentation = { pages: PresentPage[]; updated_at?: string };

export const LAYOUTS: Record<PresentLayout, { label: string; hint: string; slots: number; icon: string }> = {
  hero:  { label: "รูปใหญ่ 1 รูป", hint: "รูปเต็มหน้า + หัวข้อ + จุดขาย — เหมาะกับหน้าแรก", slots: 1, icon: "▣" },
  grid4: { label: "รูป 4 รูป",    hint: "ตาราง 2×2 — มุมอื่น/สีอื่น/รายละเอียด", slots: 4, icon: "▦" },
  trio:  { label: "รูป 3 + ข้อความ", hint: "รูป 3 รูปเรียงบน + ข้อความด้านล่าง", slots: 3, icon: "▤" },
  spec:  { label: "รูป + สเปก/ราคา", hint: "รูปซ้าย + ตารางสเปก + ราคาเสนอขวา", slots: 1, icon: "▥" },
};
export const MAX_PAGES = 2;
export const MAX_IMAGES_PER_PAGE = 4;

/** ตรวจ/ทำความสะอาดข้อมูลที่รับจาก client ก่อนบันทึก (ของกลาง — API ใช้) */
export function sanitizePresentation(raw: unknown): Presentation {
  const r = (raw && typeof raw === "object" ? raw : {}) as { pages?: unknown };
  const pagesIn = Array.isArray(r.pages) ? r.pages.slice(0, MAX_PAGES) : [];
  const pages: PresentPage[] = pagesIn.map((p) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const layout = (typeof o.layout === "string" && o.layout in LAYOUTS ? o.layout : "hero") as PresentLayout;
    const images = (Array.isArray(o.images) ? o.images : []).slice(0, MAX_IMAGES_PER_PAGE)
      .map((im) => { const x = (im && typeof im === "object" ? im : {}) as Record<string, unknown>; return { key: String(x.key ?? ""), url: String(x.url ?? "") }; })
      .filter((im) => im.key && im.url.startsWith("/api/r2-image?"));   // รับเฉพาะรูปในคลังของเรา (กัน url ข้างนอก)
    const bullets = (Array.isArray(o.bullets) ? o.bullets : []).map((b) => String(b ?? "").trim()).filter(Boolean).slice(0, 8);
    return {
      layout, images,
      heading: typeof o.heading === "string" ? o.heading.slice(0, 200) : undefined,
      text: typeof o.text === "string" ? o.text.slice(0, 2000) : undefined,
      bullets, show_price: !!o.show_price,
    };
  });
  return { pages: pages.length ? pages : [{ layout: "hero", images: [], bullets: [] }], updated_at: new Date().toISOString() };
}

/** ค่าเริ่มต้นตอนยังไม่เคยจัดใบ: หน้า 1 = รูปปก + ชื่องาน */
export function defaultPresentation(cover: PresentImage | null, heading: string): Presentation {
  return { pages: [{ layout: "hero", images: cover ? [cover] : [], heading, bullets: [] }] };
}

// ---------- สร้างข้อมูลเข้าเทมเพลต ----------
export type PresentContext = {
  code: string; name: string; brand_name: string; brand_logo_url: string | null;
  order_date_th: string; deadline_th: string;
  offered_price: string | null;   // ราคาเสนอล่าสุด (format แล้ว) — ไม่ใช่ต้นทุน
  colors: string[];               // สี/แบบจาก SKU ที่เชื่อม
  sizes: string[];                // ไซส์ = รหัส Parent ที่ตั้ง (ถ้ามี)
  origin: string;                 // ทำ url รูปให้เป็น absolute ตอนพิมพ์
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const abs = (u: string, origin: string) => (/^(https?:|data:|blob:)/i.test(u) ? u : `${origin}${u.startsWith("/") ? u : `/${u}`}`);
const imgUrl = (im: PresentImage, origin: string, w: number) => {
  const u = im.url.includes("w=") ? im.url : `${im.url}&w=${w}`;
  return abs(u, origin);
};

function imagesHtml(page: PresentPage, origin: string): string {
  const imgs = page.images.slice(0, LAYOUTS[page.layout].slots);
  if (!imgs.length) return `<div class="ph">ยังไม่ได้เลือกรูป</div>`;
  const tag = (im: PresentImage, w: number) => `<figure class="pic"><img src="${esc(imgUrl(im, origin, w))}" alt="" /></figure>`;
  if (page.layout === "hero" || page.layout === "spec") return `<div class="pics pics-1">${tag(imgs[0], 1400)}</div>`;
  if (page.layout === "trio") return `<div class="pics pics-3">${imgs.map((im) => tag(im, 800)).join("")}</div>`;
  return `<div class="pics pics-4">${imgs.map((im) => tag(im, 800)).join("")}</div>`;
}

export function buildPresentData(pres: Presentation, ctx: PresentContext): Record<string, unknown> {
  const pages = pres.pages.slice(0, MAX_PAGES).map((p, i) => ({
    page_no: i + 1,
    layout: p.layout,
    layout_cls: `layout-${p.layout}`,
    is_hero: p.layout === "hero", is_grid4: p.layout === "grid4", is_trio: p.layout === "trio", is_spec: p.layout === "spec",
    heading: (p.heading ?? "").trim() || ctx.name,
    text: (p.text ?? "").trim(),
    text_html: esc((p.text ?? "").trim()).replace(/\n/g, "<br/>"),
    bullets: (p.bullets ?? []).filter(Boolean).map((text) => ({ text })),   // loop ในเทมเพลต: {{#bullets}}<li>{{text}}</li>{{/bullets}}
    has_bullets: (p.bullets ?? []).filter(Boolean).length > 0,
    images_html: imagesHtml(p, ctx.origin),
    show_price: !!p.show_price && !!ctx.offered_price,
    offered_price: ctx.offered_price ?? "",
    colors_text: ctx.colors.join(" · "),
    sizes_text: ctx.sizes.join(" · "),
    has_colors: ctx.colors.length > 0, has_sizes: ctx.sizes.length > 0,
  }));
  return {
    code: ctx.code, name: ctx.name, brand_name: ctx.brand_name,
    brand_logo_html: ctx.brand_logo_url ? `<img class="brand-logo" src="${esc(abs(`${ctx.brand_logo_url}${ctx.brand_logo_url.includes("w=") ? "" : "&w=300"}`, ctx.origin))}" alt="" />` : "",
    order_date_th: ctx.order_date_th, deadline_th: ctx.deadline_th,
    offered_price: ctx.offered_price ?? "",
    pages, page_count: pages.length,
  };
}

// ---------- เทมเพลตเริ่มต้น (แก้เองได้ที่ /admin/report-templates entity ds_present) ----------
export const DEFAULT_DS_PRESENT_TEMPLATE = {
  header_html: ``,
  body_html: `{{#pages}}
<section class="page {{layout_cls}}">
  <div class="page-head">
    <div class="brand">{{{brand_logo_html}}}<span class="brand-name">{{brand_name}}</span></div>
    <div class="page-meta">{{code}} · หน้า {{page_no}}/{{page_count}}</div>
  </div>
  {{#is_hero}}
    <h1 class="title">{{heading}}</h1>
    {{{images_html}}}
    {{#has_bullets}}<ul class="bullets">{{#bullets}}<li>{{text}}</li>{{/bullets}}</ul>{{/has_bullets}}
    {{#text}}<p class="text">{{{text_html}}}</p>{{/text}}
    {{#show_price}}<div class="price">ราคาเสนอ <b>{{offered_price}}</b> บาท</div>{{/show_price}}
  {{/is_hero}}
  {{#is_grid4}}
    <h2 class="title sm">{{heading}}</h2>
    {{{images_html}}}
    {{#text}}<p class="text">{{{text_html}}}</p>{{/text}}
    {{#show_price}}<div class="price">ราคาเสนอ <b>{{offered_price}}</b> บาท</div>{{/show_price}}
  {{/is_grid4}}
  {{#is_trio}}
    <h2 class="title sm">{{heading}}</h2>
    {{{images_html}}}
    {{#has_bullets}}<ul class="bullets">{{#bullets}}<li>{{text}}</li>{{/bullets}}</ul>{{/has_bullets}}
    {{#text}}<p class="text">{{{text_html}}}</p>{{/text}}
    {{#show_price}}<div class="price">ราคาเสนอ <b>{{offered_price}}</b> บาท</div>{{/show_price}}
  {{/is_trio}}
  {{#is_spec}}
    <h2 class="title sm">{{heading}}</h2>
    <div class="spec-row">
      <div class="spec-pic">{{{images_html}}}</div>
      <div class="spec-box">
        <table class="spec">
          <tr><th>แบรนด์</th><td>{{brand_name}}</td></tr>
          {{#has_sizes}}<tr><th>ไซส์ / รุ่น</th><td>{{sizes_text}}</td></tr>{{/has_sizes}}
          {{#has_colors}}<tr><th>สี / แบบ</th><td>{{colors_text}}</td></tr>{{/has_colors}}
          {{#show_price}}<tr><th>ราคาเสนอ</th><td><b>{{offered_price}}</b> บาท</td></tr>{{/show_price}}
        </table>
        {{#has_bullets}}<ul class="bullets">{{#bullets}}<li>{{text}}</li>{{/bullets}}</ul>{{/has_bullets}}
        {{#text}}<p class="text">{{{text_html}}}</p>{{/text}}
      </div>
    </div>
  {{/is_spec}}
</section>
{{/pages}}`,
  footer_html: ``,
  custom_css: `
.doc { padding: 12mm 14mm; }
.page { min-height: 265mm; display: flex; flex-direction: column; break-inside: avoid; }
.page + .page { break-before: page; page-break-before: always; margin-top: 0; }
@media screen { .page + .page { border-top: 2px dashed #cbd5e1; padding-top: 10mm; margin-top: 10mm; } }
.page-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 3mm; margin-bottom: 5mm; }
.brand { display: flex; align-items: center; gap: 3mm; }
.brand-logo { height: 12mm; width: auto; max-width: 40mm; object-fit: contain; }
.brand-name { font-size: 12pt; font-weight: 600; color: #334155; }
.page-meta { font-size: 9pt; color: #94a3b8; }
.title { font-size: 20pt; font-weight: 700; margin: 0 0 4mm; color: #0f172a; }
.title.sm { font-size: 15pt; }
.pics { display: grid; gap: 4mm; margin: 0 0 4mm; }
.pics-1 { grid-template-columns: 1fr; }
.pics-3 { grid-template-columns: repeat(3, 1fr); }
.pics-4 { grid-template-columns: repeat(2, 1fr); }
.pic { margin: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.pics-1 .pic { height: 150mm; }
.pics-3 .pic { height: 70mm; }
.pics-4 .pic { height: 92mm; }
.layout-spec .pics-1 .pic { height: 120mm; }
.pic img { max-width: 100%; max-height: 100%; object-fit: contain; }
.ph { height: 60mm; display: flex; align-items: center; justify-content: center; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 3mm; margin-bottom: 4mm; }
.bullets { margin: 2mm 0 3mm; padding-left: 6mm; font-size: 12pt; line-height: 1.6; }
.text { font-size: 11pt; line-height: 1.6; color: #334155; white-space: normal; margin: 0 0 3mm; }
.price { margin-top: auto; align-self: flex-end; font-size: 13pt; color: #0f172a; background: #fef3c7; border: 1px solid #fde68a; border-radius: 2mm; padding: 2mm 5mm; }
.spec-row { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; }
.spec { width: 100%; border-collapse: collapse; font-size: 11pt; margin-bottom: 4mm; }
.spec th, .spec td { border-bottom: 1px solid #e2e8f0; padding: 2mm 1mm; text-align: left; vertical-align: top; }
.spec th { width: 32mm; color: #64748b; font-weight: 500; }
`,
};

/** ข้อมูลตัวอย่างสำหรับหน้าแก้เทมเพลต (/admin/report-templates) */
export const DS_PRESENT_SAMPLE_DATA: Record<string, unknown> = buildPresentData(
  { pages: [
    { layout: "hero", images: [], heading: "กระเป๋าผ้าแคนวาส รุ่นใหม่", bullets: ["ผ้าแคนวาสหนา 12 oz", "พิมพ์ลายได้ 2 ด้าน"], text: "ตัวอย่างข้อความอธิบาย", show_price: true },
    { layout: "spec", images: [], heading: "สเปก", bullets: [], show_price: true },
  ] },
  { code: "DS-2026-0001", name: "กระเป๋าผ้าแคนวาส รุ่นใหม่", brand_name: "Good Goods", brand_logo_url: null, order_date_th: "1 ต.ค. 2569", deadline_th: "15 ต.ค. 2569", offered_price: "255", colors: ["แดง", "ส้ม"], sizes: ["S", "M"], origin: "" },
);
