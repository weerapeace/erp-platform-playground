/** ของใช้ร่วมของ creative-content API (แยกจาก route.ts — route ต้อง export แค่ handler) */

export const SELECT = `id, content_no, title, task_id, campaign_id, brand_id, sku_id, parent_sku_id, product_name, post_type,
  platforms, status, approval_status, scheduled_at, published_at, published_url, product_links, note,
  discount_value, discount_is_percent,
  is_template, is_active, created_at, updated_at, assignee_id,
  brand:brands!brand_id(name, color, shop_channels),
  campaign:erp_creative_campaigns!campaign_id(name),
  sku:skus_v2!sku_id(code, name_th, color, color_th, list_price),
  parent:parent_skus_v2!parent_sku_id(code, name_th),
  assignee:user_profiles!assignee_id(display_name, username, email)`;

export function flattenContent(r: Record<string, unknown>): Record<string, unknown> {
  const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null; shop_channels?: { label: string; value: string }[] } | null;
  const c = (Array.isArray(r.campaign) ? r.campaign[0] : r.campaign) as { name?: string } | null;
  const s = (Array.isArray(r.sku) ? r.sku[0] : r.sku) as { code?: string; name_th?: string; color?: string | null; color_th?: string | null; list_price?: number | null } | null;
  const par = (Array.isArray(r.parent) ? r.parent[0] : r.parent) as { code?: string; name_th?: string } | null;
  const asg = (Array.isArray(r.assignee) ? r.assignee[0] : r.assignee) as { display_name?: string | null; username?: string | null; email?: string | null } | null;
  const out: Record<string, unknown> = { ...r };
  delete out.brand; delete out.campaign; delete out.sku; delete out.parent; delete out.assignee;
  out.assignee_label = asg ? (asg.display_name || asg.username || asg.email || "").trim() || null : null;
  out.brand_label = b?.name ?? null;
  out.brand_color = b?.color ?? null;
  out.brand_shop_channels = b?.shop_channels ?? [];
  out.parent_sku_code = par?.code ?? null;
  out.parent_sku_name = par?.name_th ?? null;
  out.campaign_label = c?.name ?? null;
  out.sku_code = s?.code ?? null;
  out.sku_name = s?.name_th ?? null;
  out.sku_color = (s?.color_th as string) ?? (s?.color as string) ?? null;
  out.sku_price = s?.list_price ?? null;
  return out;
}
