import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({ driveEnsureFolder: vi.fn(), driveGetFolder: vi.fn() }));

import { dateFolderOf, jobFolderName, safeName } from "../publish-shared";
import { todayFolder } from "@/app/tasks/nesting/data";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

describe("ปลายทางไฟล์ส่งร้านพิมพ์", () => {
  it("โฟลเดอร์งาน = <ประเภท> - <ชื่อ> (เจ้าของเลือกข้อ 6)", () => {
    expect(jobFolderName("UV", "Bow ดำ & The 1")).toBe("UV - Bow ดำ & The 1");
    expect(jobFolderName("", "Bow")).toBe("Bow");
    expect(jobFolderName("DTF", "  ")).toBe("DTF - งานพิมพ์");
  });

  it("ชื่อโฟลเดอร์ตัดตัวอักษรที่ Windows ห้ามใช้ (Drive ในเครื่องได้ชื่อเดียวกัน)", () => {
    expect(jobFolderName("UV", "a/b:c*?")).toBe("UV - a b c");
    expect(safeName("..ชื่อ.")).toBe("ชื่อ");
  });

  it("วันที่โฟลเดอร์: รับ YYYY-MM-DD จากเครื่อง · ผิดรูปแบบ = วันนี้ตามเวลาไทย", () => {
    expect(dateFolderOf("2026-11-16")).toBe("2026-11-16");
    // 2026-11-15 18:30 UTC = 2026-11-16 01:30 เวลาไทย
    expect(dateFolderOf("16/11/2026", new Date(Date.UTC(2026, 10, 15, 18, 30)))).toBe("2026-11-16");
    expect(dateFolderOf("../x", new Date(Date.UTC(2026, 0, 1, 3)))).toBe("2026-01-01");
  });

  it("วันที่ของเครื่องผู้ใช้ (ไม่ร่นวันแบบ toISOString)", () => {
    expect(todayFolder(new Date(2026, 10, 16, 0, 5))).toBe("2026-11-16");
    expect(todayFolder(new Date(2026, 0, 3, 23, 59))).toBe("2026-01-03");
  });
});
