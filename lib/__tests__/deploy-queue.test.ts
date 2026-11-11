import { describe, it, expect } from "vitest";
import {
  BUILD_SECONDS, buildStateText, DEPLOY_DONE_TALK_SECONDS, deployPetNews, deployPhase, formatCountdown, minutesToNextRound, queueFromCompare, ROUND_WAIT_SECONDS, statusFromGitHub, type DeployStatus,
} from "@/lib/deploy-queue";

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
  it("นาทีถึงรอบถัดไป (นับจากงานที่รอนานสุด)", () => {
    const now = new Date("2026-11-10T03:10:00Z");
    expect(minutesToNextRound("2026-11-10T03:07:00Z", now)).toBe(7);
    expect(minutesToNextRound("2026-11-10T02:50:00Z", now)).toBe(0);
    expect(minutesToNextRound(null, now)).toBe(10);
  });
  it("ข้อความสถานะ", () => {
    expect(buildStateText("success").tone).toBe("ok");
    expect(buildStateText("pending").tone).toBe("wait");
    expect(buildStateText("failure").tone).toBe("bad");
    expect(buildStateText(undefined).tone).toBe("none");
  });
});


const live = (state: string | null, since: string | null = null): DeployStatus["live"] => ({ sha: "p1", message: "งานล่าสุดบนเว็บ", date: null, state, stateSince: since });
const job = (sha: string, message: string) => ({ sha, message, author: "", date: null });

describe("statusFromGitHub — รวมผล GitHub เป็นสถานะเดียว", () => {
  const cmp = {
    status: "ahead", ahead_by: 1, behind_by: 0,
    base_commit: { sha: "p1", commit: { message: "งานบนเว็บ\n\nยาว", committer: { date: "2026-11-11T03:00:00Z" } } },
    commits: [{ sha: "w1", commit: { message: "งานรอ", committer: { date: "2026-11-11T03:49:00Z" } } }],
  };
  const st = { state: "pending", sha: "p1", statuses: [
    { state: "pending", context: "Vercel", created_at: "2026-11-11T03:47:50Z", updated_at: "2026-11-11T03:48:10Z" },
    { state: "success", context: "ci/other", created_at: "2026-11-11T03:40:00Z" },
  ] };

  it("เว็บจริง = base ของ compare · เวลาเริ่ม build = สถานะ Vercel ที่ตรงกับสถานะรวม", () => {
    const s = statusFromGitHub(cmp, st, { workflow_runs: [] }, { refreshSeconds: 15, now: new Date("2026-11-11T03:50:00Z") });
    expect(s.live).toEqual({ sha: "p1", message: "งานบนเว็บ", date: "2026-11-11T03:00:00Z", state: "pending", stateSince: "2026-11-11T03:47:50Z" });
    expect(s.waiting.map((c) => c.sha)).toEqual(["w1"]);
    expect(s.round).toBeNull();
    expect(s.refreshSeconds).toBe(15);
  });

  it("รอบที่กำลังรัน = เวลาเริ่ม · ตัวที่ต่อคิวไว้นับจากตอนรอบก่อนจบ (GitHub บอกเวลาเริ่ม = ตอน push)", () => {
    const running = { workflow_runs: [{ status: "in_progress", created_at: "2026-11-11T03:49:23Z", run_started_at: "2026-11-11T03:49:23Z" }, { status: "completed", updated_at: "2026-11-11T03:47:46Z" }] };
    expect(statusFromGitHub(cmp, st, running, { refreshSeconds: 15 }).round).toEqual({ startedAt: "2026-11-11T03:49:23Z" });
    const queuedThenRan = { workflow_runs: [{ status: "in_progress", run_started_at: "2026-11-11T03:53:57Z" }, { status: "completed", updated_at: "2026-11-11T03:58:32Z" }] };
    expect(statusFromGitHub(cmp, st, queuedThenRan, { refreshSeconds: 15 }).round).toEqual({ startedAt: "2026-11-11T03:58:32Z" });
    expect(statusFromGitHub(cmp, st, { workflow_runs: [{ status: "pending" }] }, { refreshSeconds: 15 }).round).toBeNull();
  });

  it("GitHub ตอบไม่ครบ = ไม่พัง", () => {
    const s = statusFromGitHub(null, null, null, { refreshSeconds: 120 });
    expect(s.waiting).toEqual([]);
    expect(s.live.state).toBeNull();
    expect(s.round).toBeNull();
  });
});

describe("deployPhase — ตอนนี้ขั้นไหน เหลือกี่วินาที", () => {
  const start = "2026-11-11T03:49:23Z";
  const at = (sec: number) => new Date(Date.parse(start) + sec * 1000);

  it("มีงานรอ + รอบเดินอยู่ = นับถอยหลังแม่น (ไม่ใช่ค่าประมาณ)", () => {
    const p = deployPhase({ waiting: [job("w2", "งานใหม่สุด"), job("w1", "งานแรก")], live: live("success"), round: { startedAt: start } }, at(60));
    expect(p.key).toBe("round");
    expect(p.secondsLeft).toBe(ROUND_WAIT_SECONDS - 60);
    expect(p.approx).toBe(false);
    expect(p.detail).toContain("รอ 2 งาน · งานใหม่สุด");
  });

  it("ครบเวลารอบแล้ว = กำลังส่งขึ้นเว็บ · มีงานแต่ไม่มีรอบ = รอรอบถัดไป", () => {
    expect(deployPhase({ waiting: [job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(ROUND_WAIT_SECONDS + 5)).key).toBe("promoting");
    expect(deployPhase({ waiting: [job("w1", "a")], live: live("success"), round: null }, at(0)).key).toBe("queued");
  });

  it("มีงานรอระหว่างเว็บกำลัง build รอบก่อน = ยังนับรอบใหม่ + บอกว่ากำลัง build", () => {
    const p = deployPhase({ waiting: [job("w1", "a")], live: live("pending", start), round: { startedAt: start } }, at(10));
    expect(p.key).toBe("round");
    expect(p.detail).toContain("กำลัง build");
  });

  it("ไม่มีงานรอ: กำลัง build = ค่าประมาณ · เลยเวลา = ใกล้เสร็จ · ล้ม · ล่าสุดแล้ว", () => {
    const b = deployPhase({ waiting: [], live: live("pending", start), round: null }, at(70));
    expect(b).toMatchObject({ key: "building", secondsLeft: BUILD_SECONDS - 70, approx: true });
    expect(deployPhase({ waiting: [], live: live("pending", start), round: null }, at(BUILD_SECONDS + 30))).toMatchObject({ key: "building", secondsLeft: null });
    expect(deployPhase({ waiting: [], live: live("failure"), round: null }, at(0)).key).toBe("failed");
    expect(deployPhase({ waiting: [], live: live("success"), round: { startedAt: start } }, at(0)).key).toBe("idle");
    expect(deployPhase({ waiting: [], live: live(null), round: null }, at(0)).key).toBe("idle");
  });
});

describe("formatCountdown", () => {
  it("นาที:วินาที · เกินชั่วโมง · ติดลบ = 0", () => {
    expect(formatCountdown(480)).toBe("8:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(3725)).toBe("1:02:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("deployPetNews — คำพูดของตัว Pet (ศูนย์แจ้งเตือน แท็บ ขึ้นเว็บ)", () => {
  const start = "2026-11-11T05:00:00Z";
  const at = (sec: number) => new Date(Date.parse(start) + sec * 1000);

  it("รอรอบ: บอกจำนวนงาน + อีกกี่นาที · รหัสเรื่องผูกกับรอบ", () => {
    const n = deployPetNews({ waiting: [job("w2", "b"), job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(60));
    expect(n).toEqual({ key: `round:${start}`, text: "มีงานรอขึ้นเว็บ 2 งาน · อีกราว 8 นาที", tone: "blue", sticky: true });
    const last = deployPetNews({ waiting: [job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(ROUND_WAIT_SECONDS - 30));
    expect(last?.text).toContain("อีกไม่ถึง 1 นาที");
  });

  it("ส่งขึ้นเว็บ → build (เรื่องใหม่ = รหัสใหม่ ตัว Pet เด้งใหม่)", () => {
    const p = deployPetNews({ waiting: [job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(ROUND_WAIT_SECONDS + 5));
    expect(p?.key).toBe(`promoting:${start}`);
    const b = deployPetNews({ waiting: [], live: live("pending", start), round: null }, at(60));
    expect(b).toMatchObject({ key: "building:p1", tone: "amber" });
    expect(b?.text).toBe(`กำลัง build เว็บจริง · อีกราว ${Math.ceil((BUILD_SECONDS - 60) / 60)} นาที`);
    expect(deployPetNews({ waiting: [], live: live("pending", start), round: null }, at(BUILD_SECONDS + 10))?.text).toBe("กำลัง build — ใกล้เสร็จแล้ว");
  });

  it("กำลังขึ้นเว็บ (รอรอบ / ส่ง / build) = พูดค้าง · ขึ้นแล้ว / ล้ม = ไม่ค้าง (พูดจนเปิดดู)", () => {
    expect(deployPetNews({ waiting: [job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(60))?.sticky).toBe(true);
    expect(deployPetNews({ waiting: [job("w1", "a")], live: live("success"), round: { startedAt: start } }, at(ROUND_WAIT_SECONDS + 5))?.sticky).toBe(true);
    expect(deployPetNews({ waiting: [], live: live("pending", start), round: null }, at(60))?.sticky).toBe(true);
    expect(deployPetNews({ waiting: [], live: live("pending", start), round: null }, at(BUILD_SECONDS + 10))?.sticky).toBe(true);
    expect(deployPetNews({ waiting: [], live: live("success", start), round: null }, at(30))?.sticky).toBe(false);
    expect(deployPetNews({ waiting: [], live: live("failure", start), round: null }, at(60))?.sticky).toBe(false);
  });

  it("ขึ้นเว็บแล้ว: พูดเฉพาะช่วงสั้น ๆ หลังเสร็จ แล้วเงียบ", () => {
    expect(deployPetNews({ waiting: [], live: live("success", start), round: null }, at(30))).toMatchObject({ key: "done:p1", tone: "green" });
    expect(deployPetNews({ waiting: [], live: live("success", start), round: null }, at(DEPLOY_DONE_TALK_SECONDS + 1))).toBeNull();
    expect(deployPetNews({ waiting: [], live: live("success", null), round: null }, at(0))).toBeNull();
    expect(deployPetNews({ waiting: [], live: live(null), round: null }, at(0))).toBeNull();
  });

  it("build ล้ม = พูดค้าง · มีงานแต่ไม่มีรอบเดิน = เงียบ", () => {
    expect(deployPetNews({ waiting: [], live: live("failure", start), round: null }, at(3600))).toMatchObject({ key: "failed:p1", tone: "red" });
    expect(deployPetNews({ waiting: [job("w1", "a")], live: live("success"), round: null }, at(0))).toBeNull();
  });
});
