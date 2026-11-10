/**
 * กัน build บน Vercel memory หมด — ดู next.config.ts (BROWSER_ONLY_LIBS) + docs/build-memory.md
 *
 * ไลบรารีใน BROWSER_ONLY_LIBS ถูกแทนด้วย "โมดูลว่าง" ตอน build ฝั่งเซิร์ฟเวอร์
 * → ถ้ามีใคร import ตรง ๆ (หน้าที่ render บนเซิร์ฟเวอร์จะพัง) หรือเรียกใช้ในโค้ดฝั่งเซิร์ฟเวอร์ (API จะได้ของว่าง)
 *   เทสต์นี้ต้องล้มให้เห็นก่อนขึ้นเว็บจริง
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import nextConfig, { BROWSER_ONLY_LIBS } from "@/next.config";

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

type Hit = { file: string; lib: string; kind: string };

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const src = readFileSync(file, "utf8");
      if (!BROWSER_ONLY_LIBS.some((lib) => src.includes(lib))) continue;
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const isClient = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
      for (const lib of BROWSER_ONLY_LIBS) {
        // ตัดเฉพาะชื่อหลักตรง ๆ (alias "lib$") — ไฟล์ย่อย เช่น ".../index.css" ไม่ถูกตัด จึงไม่ต้องตรวจ
        const q = `["']${escapeRe(lib)}["']`;
        // import X from "lib" / import { X } from "lib" / export … from "lib" (ยกเว้น import type / export type)
        const staticRe = new RegExp(`^\\s*(?:import|export)\\s+(?!type\\b)[^;]*?\\bfrom\\s*${q}|^\\s*import\\s*${q}`, "m");
        if (staticRe.test(src)) hits.push({ file: rel, lib, kind: "import ตรง (ต้องใช้ import() ในเบราว์เซอร์แทน)" });
        if (new RegExp(`\\brequire\\(\\s*${q}`).test(src)) hits.push({ file: rel, lib, kind: "require()" });
        if (!isClient && new RegExp(`\\bimport\\(\\s*${q}`).test(src)) {
          hits.push({ file: rel, lib, kind: 'import() ในไฟล์ที่ไม่ใช่ "use client" (ฝั่งเซิร์ฟเวอร์จะได้โมดูลว่าง)' });
        }
      }
    }
  }
  return hits;
}

describe("BROWSER_ONLY_LIBS — ไลบรารีที่ใช้เฉพาะในเบราว์เซอร์", () => {
  it("ไม่มีไฟล์ไหน import ตรง ๆ หรือใช้ฝั่งเซิร์ฟเวอร์", () => {
    const hits = scan();
    const msg = hits.map((h) => `${h.file} → ${h.lib}: ${h.kind}`).join("\n");
    expect(hits, `ถ้าจำเป็นต้องใช้ฝั่งเซิร์ฟเวอร์จริง ให้เอาชื่อออกจาก BROWSER_ONLY_LIBS ใน next.config.ts\n${msg}`).toEqual([]);
  });

  it("ยังมีคนใช้ทุกตัวในรายการ (ไม่มีชื่อค้างที่ไม่มีใครใช้แล้ว)", () => {
    const all = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((f) => readFileSync(f, "utf8")).join("\n");
    const unused = BROWSER_ONLY_LIBS.filter((lib) => !all.includes(`"${lib}"`) && !all.includes(`'${lib}'`));
    expect(unused).toEqual([]);
  });
});

describe("next.config webpack — ตั้งค่ากัน memory หมด", () => {
  const run = (opts: { dev: boolean; isServer: boolean }) => {
    const config: any = { resolve: { alias: { existing: "keep" } }, cache: { type: "filesystem" } };
    return (nextConfig.webpack as any)(config, opts);
  };

  it("เปิด build worker (ถ้ามี webpack() แต่ไม่เปิด Next จะคอมไพล์ทุกอย่างในโปรเซสเดียว)", () => {
    expect(nextConfig.experimental?.webpackBuildWorker).toBe(true);
  });

  it("build ฝั่งเซิร์ฟเวอร์: ไลบรารีเบราว์เซอร์กลายเป็นโมดูลว่าง + ไม่ใช้แคชบนดิสก์", () => {
    const c = run({ dev: false, isServer: true });
    for (const lib of BROWSER_ONLY_LIBS) expect(c.resolve.alias[`${lib}$`]).toBe(false);
    expect(c.resolve.alias.existing).toBe("keep");
    expect(Object.keys(c.resolve.alias).some((k) => k.endsWith(".css"))).toBe(false);
    expect(c.cache).toEqual({ type: "memory" });
  });

  it("build ฝั่งเบราว์เซอร์: ยังได้ไลบรารีจริง (ไม่ถูกตัด)", () => {
    const c = run({ dev: false, isServer: false });
    for (const lib of BROWSER_ONLY_LIBS) expect(c.resolve.alias[`${lib}$`]).toBeUndefined();
  });

  it("โหมด dev ไม่แตะแคช", () => {
    expect(run({ dev: true, isServer: false }).cache).toEqual({ type: "filesystem" });
  });
});
