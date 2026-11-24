import { describe, expect, it } from "vitest";
import { adsStatus, aggregateCampaigns, dailyTotals, losingCampaigns, readBreakeven, writeBreakeven, type AdsRow } from "../marketing-ads-calc";
import { parseCampaignDaily, parseCampaignIds, parseShopDaily, shopeeAdsDate, toShopeeAdsDate } from "../shopee-ads";
import { parseMetaInsights, pickAction } from "../meta-ads";

const row = (p: Partial<AdsRow>): AdsRow => ({ platform: "shopee", brand_id: "b1", account_id: "s1", level: "campaign", campaign_id: "c1", campaign_name: "ค้นหา", ad_type: "manual", date: "2026-11-20", impressions: 100, clicks: 10, orders: 1, sales: 0, spend: 0, ...p });

describe("จุดคุ้มทุน", () => {
  it("อ่านแบรนด์ก่อน ไม่มีใช้ค่าทุกแบรนด์", () => {
    const v = writeBreakeven(writeBreakeven({}, null, 3), "b1", 2.5);
    expect(readBreakeven(v, "b1")).toBe(2.5);
    expect(readBreakeven(v, "b2")).toBe(3);
    expect(readBreakeven(writeBreakeven(v, "b1", null), "b1")).toBe(3);
    expect(readBreakeven({}, "b1")).toBeNull();
  });
  it("สถานะ", () => {
    expect(adsStatus(4, 3)).toBe("profit");
    expect(adsStatus(3.2, 3)).toBe("near");
    expect(adsStatus(2, 3)).toBe("loss");
    expect(adsStatus(2, null)).toBe("unknown");
  });
});

describe("รวมแคมเปญ + ขาดทุนติดกัน", () => {
  const rows = [
    row({ date: "2026-11-18", spend: 100, sales: 500 }),
    row({ date: "2026-11-19", spend: 100, sales: 200 }),
    row({ date: "2026-11-20", spend: 100, sales: 150 }),
    row({ date: "2026-11-21", spend: 100, sales: 100 }),
    row({ campaign_id: "c2", campaign_name: "GMV", date: "2026-11-21", spend: 50, sales: 400 }),
  ];
  it("ROAS รวม + streak", () => {
    const a = aggregateCampaigns(rows, () => 3);
    const c1 = a.find((x) => x.campaign_id === "c1")!;
    expect(c1.spend).toBe(400);
    expect(c1.roas).toBeCloseTo(2.375);
    expect(c1.status).toBe("loss");
    expect(c1.lossStreak).toBe(3);
    expect(losingCampaigns(a).map((x) => x.campaign_id)).toEqual(["c1"]);
    expect(losingCampaigns(aggregateCampaigns(rows, () => null))).toEqual([]);
  });
  it("ยอดรายวันใช้ระดับร้านถ้ามี", () => {
    const d = dailyTotals([...rows, row({ level: "shop", campaign_id: "", date: "2026-11-21", spend: 999, sales: 1 }), row({ platform: "meta", account_id: "act_1", date: "2026-11-21", spend: 20, sales: 60 })]);
    const last = d.find((x) => x.date === "2026-11-21")!;
    expect(last.byPlatform).toEqual({ shopee: 999, meta: 20 });
    expect(d.find((x) => x.date === "2026-11-18")).toBeUndefined();
  });
});

describe("แปลงคำตอบ Shopee Ads", () => {
  it("วันที่", () => {
    expect(shopeeAdsDate("17-03-2021")).toBe("2021-03-17");
    expect(toShopeeAdsDate("2021-03-17")).toBe("17-03-2021");
  });
  it("ระดับร้าน + รหัสแคมเปญ + รายแคมเปญ", () => {
    expect(parseShopDaily({ response: [{ date: "17-03-2021", impression: 10, clicks: 2, broad_order: 1, broad_gmv: 300, expense: 50, direct_gmv: 200 }] })[0])
      .toMatchObject({ level: "shop", date: "2021-03-17", sales: 300, spend: 50, direct_sales: 200 });
    expect(parseCampaignIds({ response: { has_next_page: true, campaign_list: [{ campaign_id: 11 }, { campaign_id: 22 }] } })).toEqual({ ids: ["11", "22"], hasNext: true });
    const c = parseCampaignDaily({ response: [{ shop_id: 1, campaign_list: [{ campaign_id: 11, ad_type: "auto", campaign_placement: "search", ad_name: "เข็มขัด", metrics_list: [
      { date: "12-12-2023", impression: 5, clicks: 1, expense: 20, broad_gmv: 90, broad_order: 1, broad_order_amount: 2 },
      { date: "13-12-2023", impression: 0, clicks: 0, expense: 0, broad_gmv: 0 },
    ] }] }] });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ campaign_id: "11", campaign_name: "เข็มขัด", placement: "search", date: "2023-12-12", items: 2, spend: 20 });
  });
});

describe("แปลงคำตอบ Meta Ads", () => {
  it("เลือกยอดซื้อชนิดเดียว ไม่บวกซ้ำ + เก็บจำนวนแชต", () => {
    expect(pickAction([{ action_type: "purchase", value: "3" }, { action_type: "omni_purchase", value: "4" }], ["omni_purchase", "purchase"])).toBe(4);
    const [r] = parseMetaInsights([{ date_start: "2026-11-20", campaign_id: "9", campaign_name: "แชต", objective: "MESSAGES", impressions: "1000", clicks: "30", spend: "250.5",
      actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" }], action_values: [] }]);
    expect(r).toMatchObject({ campaign_id: "9", spend: 250.5, sales: 0, messages: 12, ad_type: "MESSAGES" });
  });
});
