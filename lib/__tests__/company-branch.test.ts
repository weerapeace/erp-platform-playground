import { describe, it, expect } from "vitest";
import { splitCompanyBranch, cleanBranch, compareBranch, groupByCompany } from "../company-branch";

describe("splitCompanyBranch — แยกบริษัท/สาขาจากชื่อคู่ค้า (รูปแบบจริงในทะเบียน)", () => {
  it("วงเล็บมีช่องว่าง + เลขสาขาซ้ำท้าย", () => {
    expect(splitCompanyBranch("บริษัท ตัวอย่าง จำกัด ( สาขา 1 ) สาขาที่ 00001")).toEqual({ company: "บริษัท ตัวอย่าง จำกัด", branch: "สาขา 1" });
  });
  it("วงเล็บไม่มีช่องว่าง / ไม่มีเลขสาขาท้าย", () => {
    expect(splitCompanyBranch("บริษัท ตัวอย่าง จำกัด (สาขา 18) สาขาที่ 00018")).toEqual({ company: "บริษัท ตัวอย่าง จำกัด", branch: "สาขา 18" });
    expect(splitCompanyBranch("บริษัท ตัวอย่าง จำกัด (สาขา 24)")).toEqual({ company: "บริษัท ตัวอย่าง จำกัด", branch: "สาขา 24" });
  });
  it("สำนักงานใหญ่ (มี/ไม่มี เลขสาขาในวงเล็บ) และชื่อที่ไม่มีคำว่าบริษัท", () => {
    expect(splitCompanyBranch("บริษัท ตัวอย่าง จำกัด สำนักงานใหญ่")).toEqual({ company: "บริษัท ตัวอย่าง จำกัด", branch: "สำนักงานใหญ่" });
    expect(splitCompanyBranch("บริษัท ก ข จำกัด สำนักงานใหญ่ (สาขาที่ 00000)")).toEqual({ company: "บริษัท ก ข จำกัด", branch: "สำนักงานใหญ่" });
    expect(splitCompanyBranch("ตัวอย่าง ดี.โอ. สำนักงานใหญ่")).toEqual({ company: "ตัวอย่าง ดี.โอ.", branch: "สำนักงานใหญ่" });
  });
  it("สาขาเป็นชื่อสถานที่", () => {
    expect(splitCompanyBranch("บริษัท ก ข จำกัด สาขาเซ็นทรัลเวิลด์ (สาขาที่ 00001)")).toEqual({ company: "บริษัท ก ข จำกัด", branch: "สาขาเซ็นทรัลเวิลด์" });
  });
  it("ไม่มีสาขา / ว่าง / ชื่อขึ้นต้นด้วยคำว่าสาขา = ทั้งชื่อเป็นบริษัท", () => {
    expect(splitCompanyBranch("ร้านตัวอย่าง")).toEqual({ company: "ร้านตัวอย่าง", branch: "" });
    expect(splitCompanyBranch(null)).toEqual({ company: "", branch: "" });
    expect(splitCompanyBranch("สาขาหนึ่ง")).toEqual({ company: "สาขาหนึ่ง", branch: "" });
  });
  it("มีแค่เลขสาขา = เก็บเลขไว้", () => {
    expect(cleanBranch("(สาขาที่ 00005)")).toBe("สาขาที่ 00005");
  });
});

describe("compareBranch / groupByCompany", () => {
  it("สำนักงานใหญ่ก่อน แล้วเลขสาขาน้อยไปมาก (ไม่ใช่เรียงแบบตัวอักษร 1,10,2)", () => {
    const list = ["สาขา 10", "สาขา 2", "สำนักงานใหญ่", "สาขาเซ็นทรัล", "สาขา 1"];
    expect([...list].sort(compareBranch)).toEqual(["สำนักงานใหญ่", "สาขา 1", "สาขา 2", "สาขา 10", "สาขาเซ็นทรัล"]);
  });
  it("กลุ่มเรียงตามที่เจอก่อน · ในกลุ่มเรียงตามสาขา", () => {
    const names = [
      "บริษัท เอ จำกัด ( สาขา 10 ) สาขาที่ 00010",
      "บริษัท บี จำกัด สำนักงานใหญ่",
      "บริษัท เอ จำกัด ( สาขา 2 ) สาขาที่ 00002",
      "บริษัท เอ จำกัด สำนักงานใหญ่",
    ];
    const g = groupByCompany(names, (n) => n);
    expect(g.map((x) => x.company)).toEqual(["บริษัท เอ จำกัด", "บริษัท บี จำกัด"]);
    expect(g[0].items.map((x) => x.branch)).toEqual(["สำนักงานใหญ่", "สาขา 2", "สาขา 10"]);
    expect(g[0].items[0].item).toBe("บริษัท เอ จำกัด สำนักงานใหญ่");
  });
});
