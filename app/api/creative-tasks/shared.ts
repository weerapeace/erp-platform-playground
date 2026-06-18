/** ของใช้ร่วมของ creative-tasks API (แยกจาก route.ts — route ต้อง export แค่ handler) */

export const SELECT = `id, task_no, title, description, task_type, brand_id, campaign_id, sku_id, parent_sku_id,
  product_name, priority, status, progress_percent, assignee_id, reviewer_id, approver_id,
  start_date, due_date, completed_at, approval_status, asset_status, platforms,
  drive_folder_url, final_asset_url, published_url, blocker_status, blocker_reason,
  is_active, created_by, created_at, updated_at,
  brand:brands!brand_id(name, color),
  campaign:erp_creative_campaigns!campaign_id(name),
  sku:skus_v2!sku_id(code, name_th, color, color_th, list_price, standard_price, cover_image_r2_key),
  parent:parent_skus_v2!parent_sku_id(code, name_th)`;

/** map แถวดิบ + join → flat object พร้อม label (ของกลางใน module นี้) */
export function flattenTask(r: Record<string, unknown>, empMap: Map<string, string>): Record<string, unknown> {
  const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
  const c = (Array.isArray(r.campaign) ? r.campaign[0] : r.campaign) as { name?: string } | null;
  const s = (Array.isArray(r.sku) ? r.sku[0] : r.sku) as Record<string, unknown> | null;
  const par = (Array.isArray(r.parent) ? r.parent[0] : r.parent) as { code?: string; name_th?: string } | null;
  const out: Record<string, unknown> = { ...r };
  delete out.brand; delete out.campaign; delete out.sku; delete out.parent;
  out.parent_sku_code = par?.code ?? null;
  out.parent_sku_name = par?.name_th ?? null;
  out.brand_label = b?.name ?? null;
  out.brand_color = b?.color ?? null;
  out.campaign_label = c?.name ?? null;
  out.sku_code = s?.code ?? null;
  out.sku_name = s?.name_th ?? null;
  out.sku_color = (s?.color_th as string) ?? (s?.color as string) ?? null;
  out.sku_price = (s?.list_price as number) ?? (s?.standard_price as number) ?? null;
  out.sku_image_key = (s?.cover_image_r2_key as string) ?? null;
  out.assignee_label = r.assignee_id ? empMap.get(String(r.assignee_id)) ?? null : null;
  out.reviewer_label = r.reviewer_id ? empMap.get(String(r.reviewer_id)) ?? null : null;
  out.approver_label = r.approver_id ? empMap.get(String(r.approver_id)) ?? null : null;
  return out;
}
