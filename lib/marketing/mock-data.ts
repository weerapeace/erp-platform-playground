// ⚠️ ไฟล์นี้เป็น "ข้อมูลตัวอย่าง (Mock)" สำหรับหน้าพรีวิว Marketing Dashboard
// ดึงตัวเลขจริงจากไฟล์ Shopee Shop Stats (louismontini_officialshop) วันที่ 30-06-2026
// ยังไม่ต่อฐานข้อมูล — ใช้เพื่อให้เจ้าของโปรเจกต์เห็นหน้าตา/flow ก่อน
// สร้างโดยสคริปต์ scratchpad/gen_ts.js — แก้ที่ต้นทางแล้ว re-generate

export type OrderStatusKey = "all" | "confirmed" | "paid";

export interface DailySummary {
  date: string;
  gross_sales: number;
  sales_excl_shopee_discount: number;
  orders: number;
  aov: number;
  clicks: number;
  visitors: number;
  conversion_rate: number;
  cancelled_orders: number;
  cancelled_sales: number;
  refund_orders: number;
  refund_sales: number;
  buyers: number;
  new_buyers: number;
  returning_buyers: number;
  potential_buyers: number;
  repeat_rate: number;
}

export interface HourlyPoint {
  hour: number;
  gross_sales: number;
  orders: number;
  clicks: number;
  visitors: number;
  conversion_rate: number;
}

export interface ProductRow {
  marketplace_item_id: string;
  product_name: string;
  product_status: string;
  sales_share: number;
  sales: number;
  impressions: number;
  clicks: number;
  orders: number;
  units: number;
  ctr: number;
  conversion_rate: number;
  aov: number;
  buyers: number;
  // ผูกกับ SKU ในระบบ (เติมโดย dashboard API จาก marketplace_sku_mappings + skus_v2)
  internal_sku?: string | null;
  erp_name?: string | null;
}

export interface TrafficBreakdown {
  total: number;
  product_page: number;
  live: number;
  video: number;
  partner: number;
  shopee_ads: number;
}

export interface StatusData {
  label: string;
  daily: DailySummary;
  hourly: HourlyPoint[];
  products: ProductRow[];
  traffic: TrafficBreakdown;
}

export interface ShopeeSalesMock {
  shop: string;
  platform: string;
  date: string;
  byStatus: Record<OrderStatusKey, StatusData>;
}

export const MOCK_SHOPEE_SALES: ShopeeSalesMock = {
  "shop": "louismontini_officialshop",
  "platform": "shopee",
  "date": "2026-06-30",
  "byStatus": {
    "all": {
      "label": "ทั้งหมด",
      "daily": {
        "date": "2026-06-30",
        "gross_sales": 81090,
        "sales_excl_shopee_discount": 55854,
        "orders": 169,
        "aov": 479.82,
        "clicks": 10886,
        "visitors": 20228,
        "conversion_rate": 1.55,
        "cancelled_orders": 31,
        "cancelled_sales": 15785,
        "refund_orders": 0,
        "refund_sales": 0,
        "buyers": 140,
        "new_buyers": 107,
        "returning_buyers": 33,
        "potential_buyers": 553,
        "repeat_rate": 10
      },
      "hourly": [
        {
          "hour": 0,
          "gross_sales": 6377,
          "orders": 14,
          "clicks": 558,
          "visitors": 1212,
          "conversion_rate": 2.51
        },
        {
          "hour": 1,
          "gross_sales": 3199,
          "orders": 2,
          "clicks": 376,
          "visitors": 1258,
          "conversion_rate": 0.53
        },
        {
          "hour": 2,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 284,
          "visitors": 1021,
          "conversion_rate": 0
        },
        {
          "hour": 3,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 236,
          "visitors": 1184,
          "conversion_rate": 0
        },
        {
          "hour": 4,
          "gross_sales": 971,
          "orders": 1,
          "clicks": 305,
          "visitors": 1959,
          "conversion_rate": 0.33
        },
        {
          "hour": 5,
          "gross_sales": 560,
          "orders": 1,
          "clicks": 363,
          "visitors": 3015,
          "conversion_rate": 0.28
        },
        {
          "hour": 6,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 751,
          "visitors": 5698,
          "conversion_rate": 0
        },
        {
          "hour": 7,
          "gross_sales": 4986,
          "orders": 6,
          "clicks": 513,
          "visitors": 1813,
          "conversion_rate": 1.17
        },
        {
          "hour": 8,
          "gross_sales": 6204,
          "orders": 8,
          "clicks": 299,
          "visitors": 222,
          "conversion_rate": 2.68
        },
        {
          "hour": 9,
          "gross_sales": 4319,
          "orders": 7,
          "clicks": 476,
          "visitors": 310,
          "conversion_rate": 1.47
        },
        {
          "hour": 10,
          "gross_sales": 5385,
          "orders": 7,
          "clicks": 550,
          "visitors": 388,
          "conversion_rate": 1.27
        },
        {
          "hour": 11,
          "gross_sales": 15586,
          "orders": 17,
          "clicks": 588,
          "visitors": 411,
          "conversion_rate": 2.89
        },
        {
          "hour": 12,
          "gross_sales": 1500,
          "orders": 6,
          "clicks": 556,
          "visitors": 316,
          "conversion_rate": 1.08
        },
        {
          "hour": 13,
          "gross_sales": 2051,
          "orders": 7,
          "clicks": 236,
          "visitors": 163,
          "conversion_rate": 2.97
        },
        {
          "hour": 14,
          "gross_sales": 868,
          "orders": 3,
          "clicks": 360,
          "visitors": 244,
          "conversion_rate": 0.83
        },
        {
          "hour": 15,
          "gross_sales": 1219,
          "orders": 3,
          "clicks": 341,
          "visitors": 258,
          "conversion_rate": 0.88
        },
        {
          "hour": 16,
          "gross_sales": 286,
          "orders": 4,
          "clicks": 369,
          "visitors": 227,
          "conversion_rate": 1.08
        },
        {
          "hour": 17,
          "gross_sales": 5655,
          "orders": 7,
          "clicks": 382,
          "visitors": 208,
          "conversion_rate": 1.83
        },
        {
          "hour": 18,
          "gross_sales": 8588,
          "orders": 8,
          "clicks": 463,
          "visitors": 275,
          "conversion_rate": 1.73
        },
        {
          "hour": 19,
          "gross_sales": 2668,
          "orders": 5,
          "clicks": 422,
          "visitors": 327,
          "conversion_rate": 1.18
        },
        {
          "hour": 20,
          "gross_sales": 5350,
          "orders": 15,
          "clicks": 717,
          "visitors": 401,
          "conversion_rate": 2.09
        },
        {
          "hour": 21,
          "gross_sales": 1620,
          "orders": 36,
          "clicks": 804,
          "visitors": 665,
          "conversion_rate": 4.48
        },
        {
          "hour": 22,
          "gross_sales": 1407,
          "orders": 7,
          "clicks": 572,
          "visitors": 348,
          "conversion_rate": 1.22
        },
        {
          "hour": 23,
          "gross_sales": 2291,
          "orders": 5,
          "clicks": 365,
          "visitors": 214,
          "conversion_rate": 1.37
        }
      ],
      "products": [
        {
          "marketplace_item_id": "4207107175",
          "product_name": "[ส่งด่วนฟรี] Louis Montini Automatic เข็มขัดหนังวัวแท้ หัวออโต้เมติค เข็มขัดหนังแท้ หนังเรียบ MGN369",
          "product_status": "ปกติ",
          "sales_share": 13,
          "sales": 7786,
          "impressions": 9301,
          "clicks": 156,
          "orders": 8,
          "units": 8,
          "ctr": 1.68,
          "conversion_rate": 5.13,
          "aov": 973.25,
          "buyers": 8
        },
        {
          "marketplace_item_id": "28221723369",
          "product_name": "Louis Montini (Pixie Dustie) กระเป๋าถือ รุ่น Pixie Heart Bag PIX10",
          "product_status": "ปกติ",
          "sales_share": 11.22,
          "sales": 6722,
          "impressions": 18272,
          "clicks": 287,
          "orders": 3,
          "units": 3,
          "ctr": 1.57,
          "conversion_rate": 1.05,
          "aov": 2240.67,
          "buyers": 2
        },
        {
          "marketplace_item_id": "7453060579",
          "product_name": "Louis Montini Back to basic เข็มขัดหนังวัวแท้ เข็มขัดหนังแท้ หัวกิ๊บหมุนได้  เข็มขัดผู้ชาย MGN244",
          "product_status": "ปกติ",
          "sales_share": 8.99,
          "sales": 5387,
          "impressions": 5836,
          "clicks": 136,
          "orders": 7,
          "units": 7,
          "ctr": 2.33,
          "conversion_rate": 5.15,
          "aov": 769.57,
          "buyers": 7
        },
        {
          "marketplace_item_id": "44261574595",
          "product_name": "Louis Montini (สลักชื่อฟรี) กระเป๋าสตางค์ผู้ชาย กระเป๋าสตางค์หนังวัวแท้ลายซาเฟียโน่ TTM130",
          "product_status": "ปกติ",
          "sales_share": 8.34,
          "sales": 4999,
          "impressions": 6941,
          "clicks": 183,
          "orders": 5.33,
          "units": 6,
          "ctr": 2.64,
          "conversion_rate": 2.91,
          "aov": 937.35,
          "buyers": 6
        },
        {
          "marketplace_item_id": "5053053714",
          "product_name": "[ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์หนังแท้ กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061",
          "product_status": "ปกติ",
          "sales_share": 7.67,
          "sales": 4595,
          "impressions": 12970,
          "clicks": 319,
          "orders": 6,
          "units": 6,
          "ctr": 2.46,
          "conversion_rate": 1.88,
          "aov": 765.83,
          "buyers": 6
        }
      ],
      "traffic": {
        "total": 81090,
        "product_page": 59908,
        "live": 8755,
        "video": 789,
        "partner": 11638,
        "shopee_ads": 58607
      }
    },
    "confirmed": {
      "label": "ยืนยันแล้ว",
      "daily": {
        "date": "2026-06-30",
        "gross_sales": 71307,
        "sales_excl_shopee_discount": 48662,
        "orders": 134,
        "aov": 532.14,
        "clicks": 10886,
        "visitors": 20228,
        "conversion_rate": 1.23,
        "cancelled_orders": 14,
        "cancelled_sales": 6740,
        "refund_orders": 0,
        "refund_sales": 0,
        "buyers": 113,
        "new_buyers": 95,
        "returning_buyers": 18,
        "potential_buyers": 580,
        "repeat_rate": 9.73
      },
      "hourly": [
        {
          "hour": 0,
          "gross_sales": 6299,
          "orders": 13,
          "clicks": 558,
          "visitors": 1212,
          "conversion_rate": 2.33
        },
        {
          "hour": 1,
          "gross_sales": 3199,
          "orders": 2,
          "clicks": 376,
          "visitors": 1258,
          "conversion_rate": 0.53
        },
        {
          "hour": 2,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 284,
          "visitors": 1021,
          "conversion_rate": 0
        },
        {
          "hour": 3,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 236,
          "visitors": 1184,
          "conversion_rate": 0
        },
        {
          "hour": 4,
          "gross_sales": 971,
          "orders": 1,
          "clicks": 305,
          "visitors": 1959,
          "conversion_rate": 0.33
        },
        {
          "hour": 5,
          "gross_sales": 560,
          "orders": 1,
          "clicks": 363,
          "visitors": 3015,
          "conversion_rate": 0.28
        },
        {
          "hour": 6,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 751,
          "visitors": 5698,
          "conversion_rate": 0
        },
        {
          "hour": 7,
          "gross_sales": 4231,
          "orders": 5,
          "clicks": 513,
          "visitors": 1813,
          "conversion_rate": 0.97
        },
        {
          "hour": 8,
          "gross_sales": 7076,
          "orders": 11,
          "clicks": 299,
          "visitors": 222,
          "conversion_rate": 3.68
        },
        {
          "hour": 9,
          "gross_sales": 4113,
          "orders": 7,
          "clicks": 476,
          "visitors": 310,
          "conversion_rate": 1.47
        },
        {
          "hour": 10,
          "gross_sales": 3945,
          "orders": 5,
          "clicks": 550,
          "visitors": 388,
          "conversion_rate": 0.91
        },
        {
          "hour": 11,
          "gross_sales": 13362,
          "orders": 14,
          "clicks": 588,
          "visitors": 411,
          "conversion_rate": 2.38
        },
        {
          "hour": 12,
          "gross_sales": 1627,
          "orders": 4,
          "clicks": 556,
          "visitors": 316,
          "conversion_rate": 0.72
        },
        {
          "hour": 13,
          "gross_sales": 1895,
          "orders": 4,
          "clicks": 236,
          "visitors": 163,
          "conversion_rate": 1.69
        },
        {
          "hour": 14,
          "gross_sales": 39,
          "orders": 1,
          "clicks": 360,
          "visitors": 244,
          "conversion_rate": 0.28
        },
        {
          "hour": 15,
          "gross_sales": 495,
          "orders": 2,
          "clicks": 341,
          "visitors": 258,
          "conversion_rate": 0.59
        },
        {
          "hour": 16,
          "gross_sales": 971,
          "orders": 4,
          "clicks": 369,
          "visitors": 227,
          "conversion_rate": 1.08
        },
        {
          "hour": 17,
          "gross_sales": 2686,
          "orders": 4,
          "clicks": 382,
          "visitors": 208,
          "conversion_rate": 1.05
        },
        {
          "hour": 18,
          "gross_sales": 7381,
          "orders": 7,
          "clicks": 463,
          "visitors": 275,
          "conversion_rate": 1.51
        },
        {
          "hour": 19,
          "gross_sales": 2824,
          "orders": 6,
          "clicks": 422,
          "visitors": 327,
          "conversion_rate": 1.42
        },
        {
          "hour": 20,
          "gross_sales": 5077,
          "orders": 9,
          "clicks": 717,
          "visitors": 401,
          "conversion_rate": 1.26
        },
        {
          "hour": 21,
          "gross_sales": 780,
          "orders": 20,
          "clicks": 804,
          "visitors": 665,
          "conversion_rate": 2.49
        },
        {
          "hour": 22,
          "gross_sales": 1485,
          "orders": 9,
          "clicks": 572,
          "visitors": 348,
          "conversion_rate": 1.57
        },
        {
          "hour": 23,
          "gross_sales": 2291,
          "orders": 5,
          "clicks": 365,
          "visitors": 214,
          "conversion_rate": 1.37
        }
      ],
      "products": [
        {
          "marketplace_item_id": "4207107175",
          "product_name": "[ส่งด่วนฟรี] Louis Montini Automatic เข็มขัดหนังวัวแท้ หัวออโต้เมติค เข็มขัดหนังแท้ หนังเรียบ MGN369",
          "product_status": "ปกติ",
          "sales_share": 15.13,
          "sales": 7786,
          "impressions": 9301,
          "clicks": 156,
          "orders": 8,
          "units": 8,
          "ctr": 1.68,
          "conversion_rate": 5.13,
          "aov": 973.25,
          "buyers": 8
        },
        {
          "marketplace_item_id": "7453060579",
          "product_name": "Louis Montini Back to basic เข็มขัดหนังวัวแท้ เข็มขัดหนังแท้ หัวกิ๊บหมุนได้  เข็มขัดผู้ชาย MGN244",
          "product_status": "ปกติ",
          "sales_share": 10.47,
          "sales": 5387,
          "impressions": 5836,
          "clicks": 136,
          "orders": 7,
          "units": 7,
          "ctr": 2.33,
          "conversion_rate": 5.15,
          "aov": 769.57,
          "buyers": 7
        },
        {
          "marketplace_item_id": "44261574595",
          "product_name": "Louis Montini (สลักชื่อฟรี) กระเป๋าสตางค์ผู้ชาย กระเป๋าสตางค์หนังวัวแท้ลายซาเฟียโน่ TTM130",
          "product_status": "ปกติ",
          "sales_share": 9.71,
          "sales": 4999,
          "impressions": 6941,
          "clicks": 183,
          "orders": 5.33,
          "units": 6,
          "ctr": 2.64,
          "conversion_rate": 2.91,
          "aov": 937.35,
          "buyers": 6
        },
        {
          "marketplace_item_id": "28221723369",
          "product_name": "Louis Montini (Pixie Dustie) กระเป๋าถือ รุ่น Pixie Heart Bag PIX10",
          "product_status": "ปกติ",
          "sales_share": 8.9,
          "sales": 4582,
          "impressions": 18272,
          "clicks": 287,
          "orders": 2,
          "units": 2,
          "ctr": 1.57,
          "conversion_rate": 0.7,
          "aov": 2291,
          "buyers": 1
        },
        {
          "marketplace_item_id": "5053053714",
          "product_name": "[ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์หนังแท้ กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061",
          "product_status": "ปกติ",
          "sales_share": 7.47,
          "sales": 3845,
          "impressions": 12970,
          "clicks": 319,
          "orders": 5,
          "units": 5,
          "ctr": 2.46,
          "conversion_rate": 1.57,
          "aov": 769,
          "buyers": 5
        }
      ],
      "traffic": {
        "total": 71307,
        "product_page": 51464,
        "live": 8206,
        "video": 789,
        "partner": 10848,
        "shopee_ads": 52074
      }
    },
    "paid": {
      "label": "ชำระเงินแล้ว",
      "daily": {
        "date": "2026-06-30",
        "gross_sales": 71074,
        "sales_excl_shopee_discount": 48862,
        "orders": 129,
        "aov": 550.96,
        "clicks": 10886,
        "visitors": 20228,
        "conversion_rate": 1.19,
        "cancelled_orders": 12,
        "cancelled_sales": 6545,
        "refund_orders": 0,
        "refund_sales": 0,
        "buyers": 110,
        "new_buyers": 91,
        "returning_buyers": 19,
        "potential_buyers": 583,
        "repeat_rate": 8.18
      },
      "hourly": [
        {
          "hour": 0,
          "gross_sales": 6299,
          "orders": 13,
          "clicks": 558,
          "visitors": 1212,
          "conversion_rate": 2.33
        },
        {
          "hour": 1,
          "gross_sales": 3199,
          "orders": 2,
          "clicks": 376,
          "visitors": 1258,
          "conversion_rate": 0.53
        },
        {
          "hour": 2,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 284,
          "visitors": 1021,
          "conversion_rate": 0
        },
        {
          "hour": 3,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 236,
          "visitors": 1184,
          "conversion_rate": 0
        },
        {
          "hour": 4,
          "gross_sales": 971,
          "orders": 1,
          "clicks": 305,
          "visitors": 1959,
          "conversion_rate": 0.33
        },
        {
          "hour": 5,
          "gross_sales": 560,
          "orders": 1,
          "clicks": 363,
          "visitors": 3015,
          "conversion_rate": 0.28
        },
        {
          "hour": 6,
          "gross_sales": 0,
          "orders": 0,
          "clicks": 751,
          "visitors": 5698,
          "conversion_rate": 0
        },
        {
          "hour": 7,
          "gross_sales": 4231,
          "orders": 5,
          "clicks": 513,
          "visitors": 1813,
          "conversion_rate": 0.97
        },
        {
          "hour": 8,
          "gross_sales": 6282,
          "orders": 9,
          "clicks": 299,
          "visitors": 222,
          "conversion_rate": 3.01
        },
        {
          "hour": 9,
          "gross_sales": 3244,
          "orders": 5,
          "clicks": 476,
          "visitors": 310,
          "conversion_rate": 1.05
        },
        {
          "hour": 10,
          "gross_sales": 3945,
          "orders": 5,
          "clicks": 550,
          "visitors": 388,
          "conversion_rate": 0.91
        },
        {
          "hour": 11,
          "gross_sales": 13068,
          "orders": 13,
          "clicks": 588,
          "visitors": 411,
          "conversion_rate": 2.21
        },
        {
          "hour": 12,
          "gross_sales": 1504,
          "orders": 4,
          "clicks": 556,
          "visitors": 316,
          "conversion_rate": 0.72
        },
        {
          "hour": 13,
          "gross_sales": 2338,
          "orders": 5,
          "clicks": 236,
          "visitors": 163,
          "conversion_rate": 2.12
        },
        {
          "hour": 14,
          "gross_sales": 404,
          "orders": 4,
          "clicks": 360,
          "visitors": 244,
          "conversion_rate": 1.11
        },
        {
          "hour": 15,
          "gross_sales": 1710,
          "orders": 4,
          "clicks": 341,
          "visitors": 258,
          "conversion_rate": 1.17
        },
        {
          "hour": 16,
          "gross_sales": 247,
          "orders": 3,
          "clicks": 369,
          "visitors": 227,
          "conversion_rate": 0.81
        },
        {
          "hour": 17,
          "gross_sales": 3624,
          "orders": 6,
          "clicks": 382,
          "visitors": 208,
          "conversion_rate": 1.57
        },
        {
          "hour": 18,
          "gross_sales": 7342,
          "orders": 6,
          "clicks": 463,
          "visitors": 275,
          "conversion_rate": 1.3
        },
        {
          "hour": 19,
          "gross_sales": 2668,
          "orders": 5,
          "clicks": 422,
          "visitors": 327,
          "conversion_rate": 1.18
        },
        {
          "hour": 20,
          "gross_sales": 5077,
          "orders": 9,
          "clicks": 717,
          "visitors": 401,
          "conversion_rate": 1.26
        },
        {
          "hour": 21,
          "gross_sales": 663,
          "orders": 17,
          "clicks": 804,
          "visitors": 665,
          "conversion_rate": 2.11
        },
        {
          "hour": 22,
          "gross_sales": 1407,
          "orders": 7,
          "clicks": 572,
          "visitors": 348,
          "conversion_rate": 1.22
        },
        {
          "hour": 23,
          "gross_sales": 2291,
          "orders": 5,
          "clicks": 365,
          "visitors": 214,
          "conversion_rate": 1.37
        }
      ],
      "products": [
        {
          "marketplace_item_id": "4207107175",
          "product_name": "[ส่งด่วนฟรี] Louis Montini Automatic เข็มขัดหนังวัวแท้ หัวออโต้เมติค เข็มขัดหนังแท้ หนังเรียบ MGN369",
          "product_status": "ปกติ",
          "sales_share": 13.62,
          "sales": 6936,
          "impressions": 9301,
          "clicks": 156,
          "orders": 7,
          "units": 7,
          "ctr": 1.68,
          "conversion_rate": 4.49,
          "aov": 990.86,
          "buyers": 7
        },
        {
          "marketplace_item_id": "44261574595",
          "product_name": "Louis Montini (สลักชื่อฟรี) กระเป๋าสตางค์ผู้ชาย กระเป๋าสตางค์หนังวัวแท้ลายซาเฟียโน่ TTM130",
          "product_status": "ปกติ",
          "sales_share": 9.82,
          "sales": 4999,
          "impressions": 6941,
          "clicks": 183,
          "orders": 5.33,
          "units": 6,
          "ctr": 2.64,
          "conversion_rate": 2.91,
          "aov": 937.35,
          "buyers": 6
        },
        {
          "marketplace_item_id": "7453060579",
          "product_name": "Louis Montini Back to basic เข็มขัดหนังวัวแท้ เข็มขัดหนังแท้ หัวกิ๊บหมุนได้  เข็มขัดผู้ชาย MGN244",
          "product_status": "ปกติ",
          "sales_share": 9.16,
          "sales": 4663,
          "impressions": 5836,
          "clicks": 136,
          "orders": 6,
          "units": 6,
          "ctr": 2.33,
          "conversion_rate": 4.41,
          "aov": 777.17,
          "buyers": 6
        },
        {
          "marketplace_item_id": "28221723369",
          "product_name": "Louis Montini (Pixie Dustie) กระเป๋าถือ รุ่น Pixie Heart Bag PIX10",
          "product_status": "ปกติ",
          "sales_share": 9,
          "sales": 4582,
          "impressions": 18272,
          "clicks": 287,
          "orders": 2,
          "units": 2,
          "ctr": 1.57,
          "conversion_rate": 0.7,
          "aov": 2291,
          "buyers": 1
        },
        {
          "marketplace_item_id": "5053053714",
          "product_name": "[ส่งด่วนฟรี] Louis Montini (NEVILLE) กระเป๋าสตางค์หนังแท้ กระเป๋าสตางค์ผู้ชาย Men's Wallet TTM061",
          "product_status": "ปกติ",
          "sales_share": 6.07,
          "sales": 3090,
          "impressions": 12970,
          "clicks": 319,
          "orders": 4,
          "units": 4,
          "ctr": 2.46,
          "conversion_rate": 1.25,
          "aov": 772.5,
          "buyers": 4
        }
      ],
      "traffic": {
        "total": 71074,
        "product_page": 50917,
        "live": 7912,
        "video": 789,
        "partner": 11456,
        "shopee_ads": 50142
      }
    }
  }
};
