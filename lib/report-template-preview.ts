"use client";
/**
 * 👁️ พรีวิวแม่แบบ (ที่ยังไม่บันทึก) บน "หน้าพิมพ์จริง + เอกสารจริง"
 *
 * หน้าออกแบบ /admin/report-templates เปิดหน้าพิมพ์จริงใน iframe (same-origin) แล้วตั้งค่าแม่แบบที่กำลังแก้ไว้ที่ window ของตัวเอง
 * apiFetch ในหน้าพิมพ์ (ลูก) → ตอนดึง /api/admin/report-templates เจอว่าแม่ฝากแม่แบบไว้ → สลับเนื้อหาให้ (เฉพาะในเบราว์เซอร์นี้ ไม่แตะ DB)
 * จึงไม่ต้องแก้หน้าพิมพ์ทีละหน้า · ทำงานเฉพาะตอนอยู่ใน iframe ที่แม่ตั้งค่าไว้เท่านั้น (เปิดหน้าพิมพ์ตามปกติ = ไม่มีผล)
 */
const KEY = "__reportTemplatePreview";
const PATH = "/api/admin/report-templates";

export type TemplatePreviewOverride = {
  id: string | null;
  /** ใบต้นทาง (ถ้าเป็นร่างที่คัดลอกมา) — หน้าพิมพ์ที่หยิบใบต้นทางจะเห็นร่างนี้แทน */
  base_id: string | null;
  entity_type: string;
  template_key: string;
  label: string;
  paper_size: string;
  orientation: string;
  header_html: string;
  body_html: string;
  footer_html: string;
  custom_css: string;
};

type Row = Record<string, unknown> & { id?: string; entity_type?: string; is_default?: boolean; active?: boolean };

export function setTemplatePreview(o: TemplatePreviewOverride | null): void {
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>)[KEY] = o ?? undefined;
}

function readOverride(): TemplatePreviewOverride | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  try {
    return ((window.parent as unknown as Record<string, unknown>)[KEY] as TemplatePreviewOverride | undefined) ?? null;
  } catch {
    return null;   // แม่คนละโดเมน
  }
}

/** เรียกจาก apiFetch หลังได้ response — ไม่ใช่รายการแม่แบบ / ไม่มีค่าฝาก = คืน response เดิม */
export async function applyTemplatePreview(input: string, method: string, res: Response): Promise<Response> {
  if (method !== "GET" || !res.ok) return res;
  const ov = readOverride();
  if (!ov) return res;
  let url: URL;
  try { url = new URL(input, window.location.origin); } catch { return res; }
  if (url.pathname !== PATH) return res;
  const ent = url.searchParams.get("entity_type");
  if (ent && ent !== ov.entity_type) return res;

  try {
    const json = (await res.clone().json()) as { data?: Row[]; error?: string | null };
    const rows = json.data ?? [];
    const content = {
      label: ov.label, paper_size: ov.paper_size, orientation: ov.orientation,
      header_html: ov.header_html, body_html: ov.body_html, footer_html: ov.footer_html, custom_css: ov.custom_css,
    };
    const targets = new Set([ov.id, ov.base_id].filter(Boolean) as string[]);
    let hit = false;
    const next = rows.map(r => {
      if (r.entity_type !== ov.entity_type) return r;
      if (r.id && targets.has(r.id)) { hit = true; return { ...r, ...content, active: true, is_default: true }; }
      return { ...r, is_default: false };
    });
    if (!hit) next.unshift({ id: ov.id ?? "preview", entity_type: ov.entity_type, template_key: ov.template_key, ...content, active: true, is_default: true });
    return new Response(JSON.stringify({ ...json, data: next }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch {
    return res;
  }
}
