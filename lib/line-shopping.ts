// ============================================================
// ตัวเชื่อม LINE SHOPPING API (ของกลาง, ฝั่งเซิร์ฟเวอร์เท่านั้น — ใช้ api_key จาก platform_credentials)
// เอกสาร: https://medium.com/linedevth/line-shopping-api-public-open-2023-7e78d8b8d32e
// Base: https://developers-oaplus.line.biz/myshop/v1 · ยืนยันตัวตน header X-API-KEY
// สร้าง API Key: oaplus.line.biz → เลือก Channel → ตั้งค่า → API Keys → Generate
// ============================================================

export const LINE_SHOPPING_BASE = "https://developers-oaplus.line.biz/myshop/v1";

function headers(apiKey: string): Record<string, string> {
  return { "X-API-KEY": apiKey, "User-Agent": "ERP-Playground (LINE SHOPPING connector)", "Content-Type": "application/json" };
}

// แปล error ให้เป็นภาษาคน
function friendly(status: number, body: string): string {
  if (status === 401 || status === 403) return "API Key ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึง";
  if (status === 404) return "ไม่พบข้อมูล (endpoint หรือรายการไม่ถูกต้อง)";
  if (status === 429) return "เรียก API ถี่เกินไป ลองใหม่อีกครั้ง";
  if (status >= 500) return `ระบบ LINE ขัดข้อง (HTTP ${status})`;
  return `HTTP ${status}${body ? " · " + body.slice(0, 200) : ""}`;
}

// ทดสอบเชื่อมต่อ — เรียก GET /products แบบเบาสุด (perPage=1)
export async function linePing(apiKey: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const r = await fetch(`${LINE_SHOPPING_BASE}/products?page=1&perPage=1`, { headers: headers(apiKey) });
    if (r.ok) return { ok: true, status: r.status };
    const body = await r.text().catch(() => "");
    return { ok: false, status: r.status, error: friendly(r.status, body) };
  } catch (e) {
    return { ok: false, status: 0, error: `เชื่อมต่อไม่ได้: ${(e as Error).message}` };
  }
}

// รายการสินค้า (GET /products) — data[] + paging · แต่ละสินค้ามี variants[{variantId, sku, price, onHandAmount, ...}]
export async function lineListProducts(apiKey: string, params: { page?: number; perPage?: number } = {}): Promise<{ ok: boolean; status: number; rows?: Record<string, unknown>[]; totalPage?: number; totalRow?: number; error?: string }> {
  try {
    const q = new URLSearchParams({ page: String(params.page ?? 1), perPage: String(params.perPage ?? 100) });
    const r = await fetch(`${LINE_SHOPPING_BASE}/products?${q.toString()}`, { headers: headers(apiKey) });
    if (!r.ok) { const body = await r.text().catch(() => ""); return { ok: false, status: r.status, error: friendly(r.status, body) }; }
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    const rows = Array.isArray(j?.data) ? j!.data as Record<string, unknown>[] : (Array.isArray(j) ? j as Record<string, unknown>[] : []);
    return { ok: true, status: r.status, rows, totalPage: Number(j?.totalPage ?? 1), totalRow: Number(j?.totalRow ?? rows.length) };
  } catch (e) {
    return { ok: false, status: 0, error: `เชื่อมต่อไม่ได้: ${(e as Error).message}` };
  }
}

export type LineOrderListParams = {
  page?: number; perPage?: number;
  sortBy?: "ORDER_NO" | "CREATED_AT" | "UPDATED_AT" | "CHECKED_OUT_AT";
  orderBy?: "ASC" | "DESC";
  orderStatus?: string[];      // FINALIZED | COMPLETED | EXPIRED | CANCELED
  paymentStatus?: string[];    // NO_PAYMENT | PENDING | PAID | REFUND
  shipmentStatus?: string[];   // NO_SHIPMENT | SHIPPED_ALL | SHIPMENT_READY
  startAt?: string; endAt?: string;   // ISO 8601
};

function buildOrderQuery(p: LineOrderListParams): string {
  const q = new URLSearchParams();
  q.set("page", String(p.page ?? 1));
  q.set("perPage", String(p.perPage ?? 50));
  q.set("sortBy", p.sortBy ?? "CREATED_AT");
  q.set("orderBy", p.orderBy ?? "DESC");
  for (const s of p.orderStatus ?? []) q.append("orderStatus", s);
  for (const s of p.paymentStatus ?? []) q.append("paymentStatus", s);
  for (const s of p.shipmentStatus ?? []) q.append("shipmentStatus", s);
  if (p.startAt) q.set("startAt", p.startAt);
  if (p.endAt) q.set("endAt", p.endAt);
  return q.toString();
}

// รายการออเดอร์ (GET /orders) — คืน rows ดิบ + ข้อมูลหน้า
export async function lineListOrders(apiKey: string, params: LineOrderListParams = {}): Promise<{ ok: boolean; status: number; rows?: Record<string, unknown>[]; totalPage?: number; totalRow?: number; error?: string }> {
  try {
    const r = await fetch(`${LINE_SHOPPING_BASE}/orders?${buildOrderQuery(params)}`, { headers: headers(apiKey) });
    if (!r.ok) { const body = await r.text().catch(() => ""); return { ok: false, status: r.status, error: friendly(r.status, body) }; }
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    // รูปแบบผลลัพธ์อาจเป็น { data: [...], totalPage, totalRow } หรือ array ตรง ๆ — รองรับทั้งคู่
    const rows = Array.isArray(j) ? j as Record<string, unknown>[] : (Array.isArray(j?.data) ? j!.data as Record<string, unknown>[] : (Array.isArray(j?.orders) ? j!.orders as Record<string, unknown>[] : []));
    return { ok: true, status: r.status, rows, totalPage: Number(j?.totalPage ?? 1), totalRow: Number(j?.totalRow ?? rows.length) };
  } catch (e) {
    return { ok: false, status: 0, error: `เชื่อมต่อไม่ได้: ${(e as Error).message}` };
  }
}

// รายละเอียดออเดอร์ (GET /orders/{orderNo}) — มี orderItems
export async function lineGetOrder(apiKey: string, orderNo: string): Promise<{ ok: boolean; status: number; order?: Record<string, unknown>; error?: string }> {
  try {
    const r = await fetch(`${LINE_SHOPPING_BASE}/orders/${encodeURIComponent(orderNo)}`, { headers: headers(apiKey) });
    if (!r.ok) { const body = await r.text().catch(() => ""); return { ok: false, status: r.status, error: friendly(r.status, body) }; }
    const order = await r.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: true, status: r.status, order: order ?? {} };
  } catch (e) {
    return { ok: false, status: 0, error: `เชื่อมต่อไม่ได้: ${(e as Error).message}` };
  }
}
