import { beforeEach, describe, expect, it, vi } from "vitest";

/** คำขอที่ยิงจริง (ผ่าน apiFetch = ต้องล็อกอิน · fetch = API สาธารณะ) — ตอบตามคิวที่ตั้งไว้ */
type Call = { via: "apiFetch" | "fetch"; url: string; init?: RequestInit; resolve: (body: unknown) => void };
const calls: Call[] = [];
function pending(via: Call["via"], url: string, init?: RequestInit): Promise<Response> {
  return new Promise((res) => {
    calls.push({ via, url, init, resolve: (body) => res({ json: async () => body } as Response) });
  });
}

vi.mock("@/lib/api", () => ({ apiFetch: (url: string, init?: RequestInit) => pending("apiFetch", url, init) }));
vi.stubGlobal("fetch", (url: string, init?: RequestInit) => pending("fetch", url, init));

import { loadStorefrontProducts, loadWebListings, loadWebNewDrops } from "@/lib/website-data";
import { invalidateSWR } from "@/lib/swr-lite";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  invalidateSWR();
});

describe("lib/website-data — ตัวดึงข้อมูลร้านกลาง", () => {
  it("ระบุร้านด้วย ?shop=<slug> เสมอ (รวมชุดมาใหม่ที่เดิมบางที่ใช้ ?shopId=)", async () => {
    void loadWebNewDrops("louis montini", true);
    expect(calls[0]).toMatchObject({ via: "apiFetch", url: "/api/website/new-drops?shop=louis%20montini" });
  });

  it("API สาธารณะยิงด้วย fetch ธรรมดา ไม่ใช้แคชเบราว์เซอร์", async () => {
    void loadStorefrontProducts("pixie");
    expect(calls[0].via).toBe("fetch");
    expect(calls[0].url).toBe("/api/public/storefront/products?shop=pixie");
    expect(calls[0].init).toMatchObject({ cache: "no-store" });
  });

  it("ไม่ fresh: คำขอพร้อมกันยิงจริงครั้งเดียว · ครั้งถัดไปใช้ของในแคช", async () => {
    const a = loadWebListings("s1");
    const b = loadWebListings("s1");
    expect(calls).toHaveLength(1);
    calls[0].resolve({ listings: [1, 2] });
    expect(await a).toEqual({ listings: [1, 2] });
    expect(await b).toEqual({ listings: [1, 2] });
    expect(await loadWebListings("s1")).toEqual({ listings: [1, 2] });
    expect(calls).toHaveLength(1);
  });

  it("fresh: ยิงใหม่เสมอ แม้มีของในแคชหรือคำขอเก่ากำลังบินอยู่ · ผลใหม่ให้ตัวอื่นใช้ต่อ", async () => {
    void loadWebListings("s2");
    const f = loadWebListings("s2", true);
    expect(calls).toHaveLength(2);
    calls[1].resolve({ listings: ["new"] });
    expect(await f).toEqual({ listings: ["new"] });
    expect(await loadWebListings("s2")).toEqual({ listings: ["new"] });
  });

  it("คำขอเก่าที่เสร็จทีหลัง ไม่เขียนทับค่าที่ใหม่กว่าในแคช", async () => {
    const older = loadWebListings("s3", true);
    const newer = loadWebListings("s3", true);
    calls[1].resolve({ listings: ["newer"] });
    await newer;
    calls[0].resolve({ listings: ["older"] });
    expect(await older).toEqual({ listings: ["older"] }); // ผู้เรียกเดิมยังได้ผลของตัวเอง
    expect(await loadWebListings("s3")).toEqual({ listings: ["newer"] });
    expect(calls).toHaveLength(2);
  });

  it("ผลที่มี error ไม่ถูกเก็บแคช → ครั้งถัดไปโหลดใหม่", async () => {
    const a = loadWebListings("s4");
    calls[0].resolve({ error: "ต้องเข้าสู่ระบบ" });
    expect(await a).toEqual({ error: "ต้องเข้าสู่ระบบ" });
    void loadWebListings("s4");
    await flush();
    expect(calls).toHaveLength(2);
  });

  it("แคชแยกต่อร้าน + แยกต่อชนิดข้อมูล", async () => {
    void loadWebListings("a");
    void loadWebListings("b");
    void loadStorefrontProducts("a");
    expect(calls.map((c) => c.url)).toEqual([
      "/api/website/listings?shop=a",
      "/api/website/listings?shop=b",
      "/api/public/storefront/products?shop=a",
    ]);
  });
});
