import { describe, it, expect } from "vitest";
import { buildStateText, minutesToNextRound, queueFromCompare } from "@/lib/deploy-queue";

describe("queueFromCompare", () => {
  it("งานรอขึ้นเว็บ ใหม่สุดก่อน · ข้อความบรรทัดแรก", () => {
    const q = queueFromCompare({
      status: "ahead", ahead_by: 2, behind_by: 0,
      commits: [
        { sha: "a1", commit: { message: "feat: แรก\n\nรายละเอียด", author: { name: "Gogo", date: "2026-11-10T01:00:00Z" } } },
        { sha: "b2", commit: { message: "fix: สอง", author: { name: "Gogo", date: "2026-11-10T02:00:00Z" } } },
      ],
    });
    expect(q.waiting.map((c) => c.sha)).toEqual(["b2", "a1"]);
    expect(q.waiting[1].message).toBe("feat: แรก");
    expect(q.diverged).toBe(false);
  });
  it("เท่ากัน = ไม่มีงานรอ · แยกทาง = เตือน", () => {
    expect(queueFromCompare({ status: "identical", commits: [] }).waiting).toEqual([]);
    expect(queueFromCompare({ status: "diverged", behind_by: 1, commits: [] }).diverged).toBe(true);
    expect(queueFromCompare(null).waiting).toEqual([]);
  });
});

describe("รอบถัดไป / สถานะ build", () => {
  it("นาทีถึงรอบถัดไป (ทุก 10 นาที)", () => {
    expect(minutesToNextRound(new Date("2026-11-10T03:07:30Z"))).toBe(3);
    expect(minutesToNextRound(new Date("2026-11-10T03:10:00Z"))).toBe(0);
    expect(minutesToNextRound(new Date("2026-11-10T03:10:20Z"))).toBe(10);
  });
  it("ข้อความสถานะ", () => {
    expect(buildStateText("success").tone).toBe("ok");
    expect(buildStateText("pending").tone).toBe("wait");
    expect(buildStateText("failure").tone).toBe("bad");
    expect(buildStateText(undefined).tone).toBe("none");
  });
});
