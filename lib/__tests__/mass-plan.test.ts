import { describe, it, expect } from "vitest";
import { parseTableText } from "@/lib/paste-table";
import {
  buildMassPlanPrompt, specialDaysBetween, countForRange, freqFromMonthly, monthlyFromFreq, productionRange, monthRange, parseMassPlanText, matchPlatform, matchPillar,
  normTime, normalizeHashtagText, groupMassPlan, postLevel, briefFromCaptions, validateCreatePost, type MassPlatform,
} from "@/lib/marketing/mass-plan";

const PLATS: MassPlatform[] = [
  { code: "facebook", label: "Facebook", useCaption: true, useHashtags: true },
  { code: "instagram", label: "Instagram", useCaption: true, useHashtags: true },
  { code: "tiktok", label: "TikTok", useCaption: true, useHashtags: true },
  { code: "shopee", label: "Shopee", useCaption: false, useHashtags: false, note: "16:9 1 รูป" },
  { code: "line_oa", label: "LINE OA", useCaption: true, useHashtags: true },
  { code: "line_shopping", label: "LINE SHOPPING", useCaption: true, useHashtags: true },
  { code: "x", label: "X", useCaption: true, useHashtags: true },
];
const PILLARS = [{ id: "p1", name: "โชว์สินค้า" }, { id: "p2", name: "โปรโมชั่น" }, { id: "p3", name: "รีวิว/UGC" }];
const ctx = { platforms: PLATS, pillars: PILLARS, todayKey: "2026-11-01", existing: [] };

describe("parseTableText (ของกลาง paste-table)", () => {
  it("ตาราง Markdown ของ ChatGPT: ตัดเส้นคั่น · \\| ในเนื้อหาไม่แยกช่อง · <br> = ขึ้นบรรทัด", () => {
    const g = parseTableText("| วันที่ | หัวข้อ |\n|---|:---:|\n| 3/11/2569 | ลด 1\\|2 <br> ต่อ |\n");
    expect(g).toEqual([["วันที่", "หัวข้อ"], ["3/11/2569", "ลด 1|2 \n ต่อ"]]);
  });
  it("TSV ที่ช่องมีหลายบรรทัด (Excel ครอบด้วย \"...\") ไม่ทำให้แถวเพี้ยน", () => {
    const g = parseTableText('a\t"บรรทัด1\nบรรทัด2, มีจุลภาค"\tc\nd\te\tf');
    expect(g).toEqual([["a", "บรรทัด1\nบรรทัด2, มีจุลภาค", "c"], ["d", "e", "f"]]);
  });
  it("CSV + เครื่องหมายคำพูดซ้อน \"\"", () => {
    expect(parseTableText('x,"เขาว่า ""ดี""",y')).toEqual([["x", 'เขาว่า "ดี"', "y"]]);
  });
});

describe("mass-plan: prompt + วันสำคัญ", () => {
  it("วันสำคัญ พ.ย. 2569: 11.11 · เงินเดือนออก 25 · Black Friday 27", () => {
    const { start, end } = monthRange("2026-11");
    expect(end).toBe("2026-11-30");
    expect(specialDaysBetween(start, end)).toEqual([
      { date: "2026-11-11", label: "11.11" },
      { date: "2026-11-25", label: "เงินเดือนออก" },
      { date: "2026-11-27", label: "Black Friday" },
    ]);
    expect(specialDaysBetween("2026-12-01", "2026-12-31").map((d) => d.label)).toEqual(["วันพ่อ", "12.12", "คริสต์มาส · เงินเดือนออก", "ส่งท้ายปีเก่า"]);
  });
  it("จำนวนโพสต์ต่อแพลตฟอร์ม: ต่อสัปดาห์ / ต่อเดือน", () => {
    expect(countForRange({ n: 3, unit: "week" }, "2026-11-01", "2026-11-30")).toBe(13);
    expect(countForRange({ n: 2, unit: "month" }, "2026-11-01", "2026-11-30")).toBe(2);
    expect(countForRange({ n: 2, unit: "month" }, "2026-11-01", "2026-11-07")).toBe(1);   // อย่างน้อย 1
  });
  it("เป้ารายเดือน ↔ ความถี่ ไปกลับแล้วได้ค่าเดิม", () => {
    for (const n of [1, 3, 5, 7, 14, 21]) expect(freqFromMonthly(monthlyFromFreq({ n, unit: "week" }))).toEqual({ n, unit: "week" });
    for (const n of [1, 2, 3, 10]) expect(freqFromMonthly(monthlyFromFreq({ n, unit: "month" }))).toEqual({ n, unit: "month" });
    expect(monthlyFromFreq({ n: 3, unit: "week" })).toBe(13);
  });
  it("งานผลิตจริง: ลงเรื่องเดียวกันหลายที่ = อย่างน้อยเท่าช่องที่ลงบ่อยสุด", () => {
    expect(productionRange([13, 21, 2], true)).toEqual({ min: 21, max: 36 });
    expect(productionRange([13, 21, 2], false)).toEqual({ min: 36, max: 36 });
    expect(productionRange([5], true)).toEqual({ min: 5, max: 5 });
  });
  it("prompt มีกติกาแยกแพลตฟอร์ม + โน้ตรูป + คอลัมน์ที่ระบบอ่านได้", () => {
    const p = buildMassPlanPrompt({ brandName: "Louis Montini", start: "2026-11-01", end: "2026-11-30", freq: { tiktok: { n: 5, unit: "week" }, line_oa: { n: 2, unit: "month" } }, platforms: PLATS.slice(0, 4), pillars: ["โชว์สินค้า"], campaign: "11.11 ลด 11%", specialDays: specialDaysBetween("2026-11-01", "2026-11-30") });
    expect(p).toContain("Louis Montini");
    expect(p).toContain("Shopee: ไม่ต้องเขียนแคปชั่น");
    expect(p).toContain("16:9 1 รูป");
    expect(p).toContain("วันที่ | เวลา | แพลตฟอร์ม | แนว | หัวข้อ | แคปชั่น | แฮชแท็ก | ไอเดียรูป/คลิป");
    expect(p).toContain("11 พ.ย. 2569 11.11");
    expect(p).toContain("ใช้ \"หัวข้อ\" เดียวกันเป๊ะ");
    expect(p).toContain("- TikTok: 5 ครั้ง/สัปดาห์ (≈ 21 โพสต์ในช่วงนี้)");
    expect(p).toContain("- Facebook: 3 ครั้ง/สัปดาห์ (≈ 13 โพสต์ในช่วงนี้)");   // ไม่ได้ระบุ = ค่าตั้งต้นของแพลตฟอร์ม
    const own = buildMassPlanPrompt({ brandName: "B", start: "2026-11-01", end: "2026-11-30", freq: {}, share: false, platforms: PLATS.slice(0, 3), pillars: [], campaign: "", specialDays: [] });
    expect(own).toContain("ห้ามใช้หัวข้อหรือไอเดียรูปซ้ำข้ามแพลตฟอร์ม");
    expect(own).not.toContain("หัวข้อ\" เดียวกันเป๊ะ");
    expect(buildMassPlanPrompt({ brandName: "B", start: "2026-11-01", end: "2026-11-14", freq: {}, platforms: PLATS, pillars: [], campaign: "", specialDays: [] }, [PLATS[0]])).not.toContain("หัวข้อ\" เดียวกันเป๊ะ");
  });
});

describe("mass-plan: อ่านคำตอบ", () => {
  it("หัวตารางสลับคอลัมน์ได้ · ตัวหนา ** · \" // \" = ขึ้นบรรทัด (ลิงก์ https:// ไม่โดน)", () => {
    const rows = parseMassPlanText("| **หัวข้อ** | วันที่ | แพลตฟอร์ม | แคปชั่น |\n|---|---|---|---|\n| ของใหม่ | 3/11/2569 | IG | บรรทัดแรก // บรรทัดสอง https://x.co |");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "ของใหม่", date: "3/11/2569", platform: "IG", caption: "บรรทัดแรก\nบรรทัดสอง https://x.co", line: 2 });
  });
  it("ไม่มีหัวตาราง = ใช้ลำดับมาตรฐาน", () => {
    const rows = parseMassPlanText("3/11/2569\t19:00\tFacebook\tโปรโมชั่น\tลด\tข้อความ\t#a b\tแบนเนอร์");
    expect(rows[0]).toMatchObject({ date: "3/11/2569", time: "19:00", platform: "Facebook", pillar: "โปรโมชั่น", title: "ลด", hashtags: "#a b", idea: "แบนเนอร์", line: 1 });
  });
  it("จับชื่อแพลตฟอร์ม/แนว/เวลา/แฮชแท็ก", () => {
    expect(matchPlatform("IG", PLATS)).toBe("instagram");
    expect(matchPlatform("Line", PLATS)).toBe("line_oa");
    expect(matchPlatform("LINE SHOPPING", PLATS)).toBe("line_shopping");
    expect(matchPlatform("Twitter", PLATS)).toBe("x");
    expect(matchPlatform("Threads", PLATS)).toBeNull();
    expect(matchPillar("รีวิว", PILLARS)).toBe("p3");
    expect(matchPillar("โปรโมชัน ลดราคา", PILLARS)).toBeNull();
    expect(normTime("19.00 น.")).toBe("19:00");
    expect(normTime("9:5")).toBe("09:05");
    expect(normTime("25:00")).toBe("");
    expect(normalizeHashtagText("#A a, b", "#louis")).toBe("#A #b #louis");
  });
});

describe("mass-plan: รวมโพสต์ + ตรวจ", () => {
  const text = [
    "วันที่\tเวลา\tแพลตฟอร์ม\tแนว\tหัวข้อ\tแคปชั่น\tแฮชแท็ก\tไอเดียรูป/คลิป",
    "31/10/2569\t19:00\tFacebook\tโชว์สินค้า\tทีเซอร์\tเร็ว ๆ นี้\t#a\t",
    "3/11/2569\t19:00\tFacebook\tโชว์สินค้า\tกระเป๋าใหม่\tหนังแท้\t#a\tรูปโต๊ะไม้",
    "3/11/2569\t19:00\tIG\tโชว์สินค้า\tกระเป๋าใหม่\tทรงสวย\t#a #b\tCarousel",
    "3/11/2569\t19:00\tInstagram\tโชว์สินค้า\tกระเป๋าใหม่\tซ้ำ\t\t",
    "7/11/2569\t\tTikTok\tเทรนด์\tลุคศุกร์\t\t\t",
    "11/11/2569\t10:00\tShopee\tโปรโมชั่น\t11.11\t\t\tแบนเนอร์",
    "11/11/2569\t10:00\tThreads\tโปรโมชั่น\t11.11\tลด\t\t",
    "12/11/2569\t10:00\tX\tโปรโมชั่น\tยาว\t" + "ก".repeat(300) + "\t\t",
    "xx\t10:00\tX\tโปรโมชั่น\tวันผิด\tก\t\t",
  ].join("\n");

  it("รวมเรื่องเดียวกันเป็น 1 โพสต์ หลายแพลตฟอร์ม · เตือนซ้ำ/ไม่มีแคปชั่น/แพลตฟอร์มแปลก/เกินความยาว · วันผ่าน = ไม่ลง", () => {
    const { posts, errors } = groupMassPlan(parseMassPlanText(text), { ...ctx, defaultTime: (d) => (d === "2026-11-07" ? "20:00" : null) });
    expect(errors.map((e) => e.text)).toEqual(['บรรทัด 10: อ่านวันที่ "xx" ไม่ออก — ข้ามแถวนี้']);
    expect(posts.map((p) => `${p.date} ${p.time} ${p.title}`)).toEqual([
      "2026-10-31 19:00 ทีเซอร์", "2026-11-03 19:00 กระเป๋าใหม่", "2026-11-07 20:00 ลุคศุกร์", "2026-11-11 10:00 11.11", "2026-11-12 10:00 ยาว",
    ]);
    const [past, bag, look, sale, long] = posts;
    expect(past).toMatchObject({ blocked: true, include: false });
    expect(postLevel(past)).toBe("error");
    expect(bag.captions.map((c) => c.platform)).toEqual(["facebook", "instagram"]);
    expect(bag.pillarId).toBe("p1");
    expect(bag.issues.map((i) => i.text)).toContain("Instagram ซ้ำในชุด — ใช้แถวแรก");
    expect(look.issues.map((i) => i.text)).toEqual(["ไม่มีเวลา — ใช้ 20:00", 'ไม่รู้จักแนว "เทรนด์" — ลงแบบไม่ระบุแนว', "TikTok ยังไม่มีแคปชั่น — ลงเป็นร่างได้ เติมทีหลัง"]);
    expect(sale.captions.map((c) => c.platform)).toEqual(["shopee"]);   // Shopee ไม่ใช้แคปชั่น → ไม่เตือน
    expect(sale.issues.map((i) => i.text)).toEqual(['ไม่มีแพลตฟอร์ม "Threads" ในระบบ — ตัดออก']);
    expect(postLevel(sale)).toBe("warn");
    expect(long.issues[0].text).toBe("X ยาวเกิน 20 ตัวอักษร (ได้สูงสุด 280)");
  });

  it("ของเดิม: หัวข้อ+วันเดียวกัน = ไม่ติ๊กให้ · แค่แพลตฟอร์มชน = เตือน ลงเพิ่ม", () => {
    const { posts } = groupMassPlan(parseMassPlanText(text), {
      ...ctx,
      existing: [{ date: "2026-11-03", title: "กระเป๋าใหม่", platforms: ["facebook"] }, { date: "2026-11-11", title: "Flash sale", platforms: ["shopee"] }],
    });
    const bag = posts.find((p) => p.title === "กระเป๋าใหม่")!;
    expect(bag.include).toBe(false);
    expect(bag.blocked).toBe(false);
    const sale = posts.find((p) => p.title === "11.11")!;
    expect(sale.include).toBe(true);
    expect(sale.issues.map((i) => i.text)).toContain("วันนี้ Shopee มีโพสต์เดิมแล้ว — ลงเพิ่ม ไม่ทับ");
  });

  it("บรีฟจากไอเดีย: เหมือนกัน = บรรทัดเดียว · ต่างกัน = แยกตามแพลตฟอร์ม", () => {
    const lab = (c: string) => c.toUpperCase();
    expect(briefFromCaptions([{ platform: "facebook", caption: "", hashtags: "", idea: "แบนเนอร์" }, { platform: "x", caption: "", hashtags: "", idea: "แบนเนอร์" }], lab)).toBe("แบนเนอร์");
    expect(briefFromCaptions([{ platform: "facebook", caption: "", hashtags: "", idea: "รูป" }, { platform: "x", caption: "", hashtags: "", idea: "คลิป" }], lab)).toBe("FACEBOOK: รูป\nX: คลิป");
    expect(briefFromCaptions([{ platform: "facebook", caption: "", hashtags: "", idea: " " }], lab)).toBeNull();
  });

  it("ตรวจฝั่งเซิร์ฟเวอร์", () => {
    const ok = new Set(["facebook"]);
    const good = { date: "2026-11-03", time: "19:00", title: "x", pillar_id: null, brief: null, captions: [{ platform: "facebook", caption: "", hashtags: "" }] };
    expect(validateCreatePost(good, "2026-11-01", ok)).toBeNull();
    expect(validateCreatePost({ ...good, date: "2026-10-31" }, "2026-11-01", ok)).toBe("วันที่ผ่านไปแล้ว");
    expect(validateCreatePost({ ...good, date: "2026-02-31" }, "2026-01-01", ok)).toBe("วันที่ไม่ถูกต้อง");
    expect(validateCreatePost({ ...good, time: "x" }, "2026-11-01", ok)).toBe("เวลาไม่ถูกต้อง");
    expect(validateCreatePost({ ...good, captions: [{ platform: "threads", caption: "", hashtags: "" }] }, "2026-11-01", ok)).toBe("แพลตฟอร์มไม่ถูกต้อง");
  });
});
