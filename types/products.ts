// Shared types สำหรับ Products API

export type ApiProduct = {
  // ── Core ────────────────────────────────
  id:                 string;
  sku:                string | null;
  name:               string;
  display_name:       string | null;
  barcode:            string | null;
  // ── Relations ───────────────────────────
  category_name:      string | null;
  brand_name:         string | null;
  collection_name:    string | null;
  parent_sku_name:    string | null;
  seller_name:        string | null;
  // ── Product attributes ──────────────────
  product_type:       string | null;
  color:              string | null;
  color_th_variation: string | null;
  uom_name:           string | null;
  purchase_uom_name:  string | null;
  moq:                number | null;
  // ── Pricing (public only — no cost/rmb) ─
  list_price:         number | null;
  fake_price:         number | null;
  // ── Status flags ────────────────────────
  active:             boolean | null;
  sale_ok:            boolean | null;
  purchase_ok:        boolean | null;
  ig_sell:            boolean | null;
  // ── System ──────────────────────────────
  sync_status:        string | null;
  created_at:         string;
  updated_at:         string | null;
  // ── Pagination helper ───────────────────
  total_count:        number;
};

export type ApiProductsResponse = {
  data:  ApiProduct[];
  total: number;
  page:  number;
  limit: number;
  error: string | null;
};
