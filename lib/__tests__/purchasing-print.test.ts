import { describe, expect, it } from "vitest";
import { applyListPrintPreset, cleanListPrintSettings, resolveListColumns } from "@/lib/list-print";
import {
  buildPoPrint, poAgeDays, poItemsFromOrderable, poItemsFromReceivable, poPrintColumns, poPrintDefaults, poPrintOpts, poPrintPresets, poRowKey,
  type MoBrief, type PoPrintItem, type PoPrintMode,
} from "@/lib/purchasing-print";

const recvRows = poItemsFromReceivable([
  { id: "l1", po_no: "PO-2026-00253", seller_name: "Lynn", item_name: "[MN18#N] กระดุมแม่เหล็ก 18 mm.", code: "MN18#N", image_url: "/api/r2-image?key=a", uom: "ชิ้น", qty: 50, qty_received: 0, currency: "THB", order_date: "2026-10-21", source_mo_no: "MO-2026-00390" },
  { id: "l2", po_no: "PO-2026-00253", seller_name: "Lynn", item_name: "[MN18#N] กระดุมแม่เหล็ก 18 mm.", code: "MN18#N", image_url: null, uom: "ชิ้น", qty: 100, qty_received: 30, currency: "THB", order_date: "2026-10-21", source_mo_no: "MO-2026-00391" },
  { id: "l3", po_no: "PO-2026-00098", seller_name: "อี้หลง", item_name: "ห่วง D <ทอง>", code: "DR-20#G", image_url: null, uom: "ชิ้น", qty: 600, qty_received: 0, currency: "YUAN", order_date: "2026-08-18", source_mo_no: null },
]);
const MOS = new Map<string, MoBrief>([
  ["MO-2026-00390", { mo_no: "MO-2026-00390", product_sku: "CTL047-01", product_name: "กระเป๋าทรงถือ สีดำ", qty: 50, due_date: "2026-11-15", image_url: "/api/r2-image?key=m1" }],
  ["MO-2026-00391", { mo_no: "MO-2026-00391", product_sku: "CTL047-03", product_name: "กระเป๋าทรงถือ สีน้ำตาล", qty: 50, due_date: null, image_url: null }],
]);
const build = (mode: PoPrintMode, items: PoPrintItem[], patch: Record<string, unknown> = {}, notes: Record<string, string> = {}, scope = {}) => {
  const base = poPrintDefaults(mode);
  const s = cleanListPrintSettings({ ...base, ...patch, opts: { ...base.opts, ...((patch.opts as object) ?? {}) } }, poPrintColumns(mode), base);
  return buildPoPrint({ mode, items, mos: MOS, settings: s, scope: { shop: "", ageMin: 0, picks: null, ...scope }, noteOf: (k) => notes[k] ?? "", today: "2026-11-02", printedAt: "02/11/2569", origin: "https://x" });
};

describe("purchasing print", () => {
  it("maps api rows: strips [code] from names, flags Chinese shops, keeps received qty", () => {
    expect(recvRows[0].name).toBe("กระดุมแม่เหล็ก 18 mm.");
    expect(recvRows[1].got).toBe(30);
    expect(recvRows[2].cn).toBe(true);
    const o = poItemsFromOrderable([{ id: "p1", seller_name: "—", item_name: "x", qty: 2, price_est: 3, currency: "THB" }]);
    expect(o[0].shop).toBe("ไม่ระบุร้าน");
  });

  it("image, code and name are locked on: turning them off or 'no image' is ignored", () => {
    const cols = poPrintColumns("recv");
    const s = cleanListPrintSettings({ ...poPrintDefaults("recv"), image: "none", columns: cols.map((c) => ({ key: c.key, on: false })) }, cols, poPrintDefaults("recv"));
    expect(s.image).not.toBe("none");
    expect(resolveListColumns(s, cols).map((c) => c.key)).toEqual(["img", "code", "name"]);
  });

  it("merges the same item in one PO, sums what is left and lists every MO", () => {
    const r = build("recv", recvRows);
    expect(r.count).toBe(2);
    expect(r.html).toContain("<b>120</b>");   // 50 + (100-30)
    expect(r.html).toContain("MO-2026-00390");
    expect(r.html).toContain("MO-2026-00391");
    expect(r.html).toContain("ใช้ 100");
  });

  it("groups by shop then PO with sub-group rows and stacks code on the name", () => {
    const r = build("recv", recvRows);
    expect(r.html).toContain('class="grp-row"');
    expect(r.html).toContain('class="grp-row sub"');
    expect(r.html).toContain("PO-2026-00098");
    expect(r.html).toContain('class="mono code-top"');
    expect(r.html).not.toContain('data-col="code"');
    expect(r.html).toContain("ห่วง D &lt;ทอง&gt;");
  });

  it("MO buttons choose what shows in the MO cell", () => {
    const r = build("recv", recvRows, { opts: { mo: { no: false, img: false, sku: true, name: false, qty: false, use: false, due: true } } });
    expect(r.html).toContain("CTL047-01");
    expect(r.html).not.toContain("กระเป๋าทรงถือ สีดำ");
    expect(r.html).not.toContain("ใช้ ");
    expect(r.html).toContain("ส่ง ");
  });

  it("typed note columns carry their address and print the saved text", () => {
    const key = `${poRowKey("recv", recvRows[0])}|note`;
    const r = build("recv", recvRows, {}, { [key]: "โทรตามแล้ว <1 พ.ย.>" });
    expect(r.html).toContain(`data-note="${key.replace(/</g, "&lt;")}"`);
    expect(r.html).toContain("โทรตามแล้ว &lt;1 พ.ย.&gt;");
  });

  it("scope filters by shop, age and ticked lines", () => {
    expect(build("recv", recvRows, {}, {}, { shop: "อี้หลง" }).count).toBe(1);
    expect(build("recv", recvRows, {}, {}, { ageMin: 30 }).count).toBe(1);
    expect(build("recv", recvRows, { opts: { merge: false } }, {}, { picks: new Set(["l2"]) }).count).toBe(1);
    expect(poAgeDays("2026-10-21", "2026-11-02")).toBe(12);
  });

  it("order mode totals money per currency and presets keep the MO buttons", () => {
    const items = poItemsFromOrderable([
      { id: "a", seller_name: "ISG", item_name: "ซิป", code: "Z1", qty: 200, price_est: 4.5, currency: "THB", order_date: "2026-10-28" },
      { id: "b", seller_name: "ISG", item_name: "หัวซิป", code: "Z2", qty: 300, price_est: 1.2, currency: "THB", order_date: "2026-10-28" },
    ]);
    const r = build("order", items);
    expect(r.html).toContain("฿1,260");
    expect(r.html).toContain('class="grp-total"');
    const cur = { ...poPrintDefaults("order"), opts: { ...poPrintDefaults("order").opts, mo: { no: false, img: true, sku: false, name: false, qty: true, use: false, due: false } } };
    const next = applyListPrintPreset(cur, poPrintPresets("order")[1], poPrintColumns("order"));
    expect(poPrintOpts(next, "order").mo.no).toBe(false);
    expect(poPrintOpts(next, "order").shopTable).toBe(true);
  });
});
