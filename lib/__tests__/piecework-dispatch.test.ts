import { describe, expect, it } from "vitest";
import { pwDonePlan, pwDupLines, pwEarned, pwJobStates, pwPersonTotals, pwRestLine, pwValidate, type PwExisting, type PwLine } from "../piecework-dispatch";
import { pwGroupByPerson, renderPieceworkSlipsHtml } from "../piecework-print";

const line = (p: Partial<PwLine>): PwLine => ({ key: p.key ?? Math.random().toString(36), mo_no: "MO-1", job_id: "j1", job_name: "ยัดนุ่น", rate: 0.25, qty_per: 1, qty: 10, assignee_id: "e1", assignee_name: "ป้าแดง", ...p });
const ex = (p: Partial<PwExisting>): PwExisting => ({ id: "x1", mo_no: "MO-1", job_id: "j1", job_name: "ยัดนุ่น", total_qty: 10, assignee_name: "สมศรี", status: "pending", ...p });

describe("pwJobStates — ต้องจ่าย / จ่ายแล้ว / เหลือ", () => {
  it("งานเดียวแบ่ง 2 คน ครบพอดี", () => {
    const [s] = pwJobStates(30, [line({ qty: 20 }), line({ qty: 10, assignee_name: "สมศรี", assignee_id: "e2" })], []);
    expect(s).toMatchObject({ need: 30, before: 0, now: 30, left: 0 });
  });
  it("นับที่จ่ายไปแล้ว (กันจ่ายซ้ำ) · ชิ้นต่อใบ ×2", () => {
    const [s] = pwJobStates(30, [line({ qty: 40, qty_per: 2 })], [ex({ total_qty: 20 })]);
    expect(s).toMatchObject({ need: 60, before: 20, now: 40, left: 0 });
    expect(s.beforeWho).toEqual([{ name: "สมศรี", qty: 20 }]);
  });
  it("รับคืนไม่ครบแล้ว = นับเท่าที่ทำจริง · เกินจำนวน = ติดลบ", () => {
    const [s] = pwJobStates(10, [line({ qty: 8 })], [ex({ status: "done", total_qty: 10, done_qty: 4 })]);
    expect(s).toMatchObject({ before: 4, now: 8, left: -2 });
  });
  it("แยกงานตามรหัสงาน · งานไม่มีรหัสใช้ชื่อ", () => {
    const st = pwJobStates(10, [line({}), line({ job_id: null, job_name: "ติดดาว" })], [ex({ job_id: null, job_name: "ติดดาว ", total_qty: 3 })]);
    expect(st.map((s) => [s.job_name, s.left])).toEqual([["ยัดนุ่น", 0], ["ติดดาว", -3]]);
  });
});

describe("ตรวจก่อนบันทึก", () => {
  it("ไม่เลือกคน / ไม่ใส่จำนวน / ไม่เลือกงาน", () => {
    expect(pwValidate([line({ assignee_name: "" }), line({ qty: 0 }), line({ job_name: " " })]).map((i) => i.msg)).toEqual([
      "ยัดนุ่น: เลือกคนรับก่อน", "ยัดนุ่น (ป้าแดง): ใส่จำนวนชิ้น", "เลือกงานเหมาก่อน",
    ]);
  });
  it("แถวซ้ำ = งานเดียวกัน ใบเดียวกัน คนเดียวกัน", () => {
    expect(pwDupLines([line({ key: "a" }), line({ key: "b" }), line({ key: "c", mo_no: "MO-2" }), line({ key: "d", assignee_id: "e2", assignee_name: "สมศรี" })])).toEqual(["b"]);
  });
});

describe("เงินต่อคน / แถวที่เหลือ / รับคืน", () => {
  it("รวมเงินต่อคน (มากไปน้อย) · ไม่นับแถวที่ยังไม่เลือกคน", () => {
    expect(pwPersonTotals([line({ qty: 20 }), line({ qty: 30, job_name: "พับชั้น", rate: 3 }), line({ assignee_name: "", qty: 99 })]))
      .toEqual([{ name: "ป้าแดง", qty: 50, money: 95, rows: 2 }]);
  });
  it("+ คนอื่น = แถวใหม่จำนวนที่เหลือ คนว่าง", () => {
    expect(pwRestLine(line({ qty: 20 }), 10, "n")).toMatchObject({ key: "n", qty: 10, assignee_id: null, assignee_name: "", job_name: "ยัดนุ่น" });
  });
  it("รับคืนไม่ครบ: keep = ที่เหลือแยกแถวใหม่ · drop = ไม่ทำ · เกินไม่ได้", () => {
    expect(pwDonePlan({ total_qty: 30 }, { id: "a", qty: 20, rest: "keep" })).toEqual({ done_qty: 20, rest_qty: 10 });
    expect(pwDonePlan({ total_qty: 30 }, { id: "a", qty: 20, rest: "drop" })).toEqual({ done_qty: 20, rest_qty: 0 });
    expect(pwDonePlan({ total_qty: 30 }, { id: "a", qty: 50, rest: "keep" })).toEqual({ done_qty: 30, rest_qty: 0 });
  });
  it("ค่าเหมาที่ได้จริง = ราคา × ชิ้นที่รับคืน (ไม่ใส่ = เท่าที่จ่าย)", () => {
    expect(pwEarned({ rate: 0.25, total_qty: 30, done_qty: 20 })).toBe(5);
    expect(pwEarned({ rate: 3, total_qty: 10, done_qty: null })).toBe(30);
  });
});

describe("ใบจ่ายงานเหมา (พิมพ์)", () => {
  const rows = [
    { id: "1", mo_no: "MO-1", job_name: "ยัดนุ่น", rate: 0.25, total_qty: 20, status: "pending", done_qty: null, assignee_name: "สมศรี", dispatched_at: "2026-11-01", created_at: "2026-11-01T03:00:00Z", product_sku: "CTL098-03-M" },
    { id: "2", mo_no: "MO-1", job_name: "ติดดาว", rate: 0.25, total_qty: 30, status: "pending", done_qty: null, assignee_name: "ป้าแดง", dispatched_at: "2026-11-01", created_at: "2026-11-01T03:00:00Z", product_sku: "CTL098-03-M" },
    { id: "3", mo_no: "MO-2", job_name: "ยัดนุ่น", rate: 0.25, total_qty: 10, status: "pending", done_qty: null, assignee_name: "ป้าแดง", dispatched_at: "2026-11-01", created_at: "2026-11-01T03:00:00Z", product_sku: "<b>X</b>" },
  ];
  it("1 คน = 1 แผ่น · รวมเงินต่อคน", () => {
    expect(pwGroupByPerson(rows).map((g) => [g.name, g.rows.length, g.money])).toEqual([["ป้าแดง", 2, 10], ["สมศรี", 1, 5]]);
    const html = renderPieceworkSlipsHtml(rows, { title: "ใบจ่ายงานเหมา" });
    expect(html.match(/class="pg"/g)?.length).toBe(2);
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");   // กันข้อความแปลก ๆ ทำหน้าพัง
  });
});
