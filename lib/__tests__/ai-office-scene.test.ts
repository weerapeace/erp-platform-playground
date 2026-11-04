/**
 * เทสต์ค่าตกแต่งฉากออฟฟิศพิกเซล (lib/ai-office-scene.ts)
 */
import { describe, it, expect } from "vitest";
import { OFFICE_WORKERS, CRON_SECRET_FIX, WORKER_BY_ID, type WorkerLive } from "../ai-office";
import { SCENE_DESKS, NICK_MAX, defaultScene, cleanScene, swapDesks, workerPose, sceneChanges, displayName } from "../ai-office-scene";

const live = (status: WorkerLive["status"], fix?: string): WorkerLive => ({ status, headline: "", lastAt: null, stats: [], ...(fix ? { fix } : {}) });

describe("ค่าเริ่มต้น", () => {
  it("โต๊ะพอสำหรับผู้ช่วยทุกตัว", () => expect(SCENE_DESKS).toBeGreaterThanOrEqual(OFFICE_WORKERS.length));
  it("ผู้ช่วยทุกตัวมีโต๊ะ 1 ตัวพอดีและมีหน้าตา", () => {
    const s = defaultScene();
    for (const w of OFFICE_WORKERS) {
      expect(s.desks.filter((d) => d === w.id).length, w.id).toBe(1);
      expect(s.looks[w.id], w.id).toBeTruthy();
    }
  });
});

describe("cleanScene", () => {
  it("ค่าขยะ = ค่าเริ่มต้น", () => {
    expect(cleanScene(null)).toEqual(defaultScene());
    expect(cleanScene("x")).toEqual(defaultScene());
  });
  it("ตัดรหัสแปลก/ซ้ำ แล้วเติมผู้ช่วยที่หายลงโต๊ะว่าง", () => {
    const id = OFFICE_WORKERS[0].id;
    const s = cleanScene({ desks: [id, id, "ghost", ""], theme: "night" });
    expect(s.theme).toBe("night");
    expect(s.desks).toHaveLength(SCENE_DESKS);
    for (const w of OFFICE_WORKERS) expect(s.desks.filter((d) => d === w.id).length, w.id).toBe(1);
    expect(s.desks.includes("ghost")).toBe(false);
  });
  it("สีต้องเป็น #RRGGBB ชื่อเล่นตัดความยาว ชนิดแปลก = ค่าเริ่มต้น", () => {
    const id = OFFICE_WORKERS[0].id;
    const d = defaultScene().looks[id];
    const s = cleanScene({ looks: { [id]: { species: "dragon", fur: "red", shirt: "#abcdef", nick: "  ก".repeat(30) } } });
    expect(s.looks[id].species).toBe(d.species);
    expect(s.looks[id].fur).toBe(d.fur);
    expect(s.looks[id].shirt).toBe("#ABCDEF");
    expect(s.looks[id].nick.length).toBeLessThanOrEqual(NICK_MAX);
  });
  it("ธีมแปลก = กลางวัน", () => expect(cleanScene({ theme: "neon" }).theme).toBe("day"));
});

describe("สลับโต๊ะ + ชื่อที่โชว์", () => {
  it("สลับแล้วทุกคนยังมีโต๊ะ 1 ตัว", () => {
    const s = swapDesks(defaultScene(), 0, SCENE_DESKS - 1);
    expect(s.desks[SCENE_DESKS - 1]).toBe(OFFICE_WORKERS[0].id);
    expect(cleanScene(s)).toEqual(s);
  });
  it("ไม่มีชื่อเล่น = ชื่อตำแหน่ง", () => {
    const s = defaultScene(), w = OFFICE_WORKERS[0];
    expect(displayName(s, w)).toBe(w.title);
    s.looks[w.id].nick = "เหมียว";
    expect(displayName(s, w)).toBe("เหมียว");
  });
});

describe("ท่าทางตามสถานะ", () => {
  const cronW = OFFICE_WORKERS.find((w) => w.cron)!;
  it("งานตั้งเวลาที่ติดแค่รหัสลับ = หลับที่โต๊ะ", () => expect(workerPose(cronW, live("error", CRON_SECRET_FIX))).toBe("sleep"));
  it("ติดปัญหาเรื่องอื่น = ห้องซ่อม", () => expect(workerPose(cronW, live("error", `ร้านหมดอายุ · ${CRON_SECRET_FIX}`))).toBe("repair"));
  it("ผู้ปลุกงานเอง (ไม่ใช่ cron) ติดปัญหา = ห้องซ่อม", () => expect(workerPose(WORKER_BY_ID.scheduler, live("error", CRON_SECRET_FIX))).toBe("repair"));
  it("ต้องดู = เคาน์เตอร์ · ว่าง = มุมพัก · ปกติ = โต๊ะ · ไม่มีบันทึก = จอดับ", () => {
    const w = OFFICE_WORKERS[1];
    expect(workerPose(w, live("warn"))).toBe("counter");
    expect(workerPose(w, live("idle"))).toBe("lounge");
    expect(workerPose(w, live("ok"))).toBe("work");
    expect(workerPose(w, live("unknown"))).toBe("away");
    expect(workerPose(w, undefined)).toBe("away");
  });
});

describe("สรุปสิ่งที่เปลี่ยน (audit)", () => {
  it("บอกธีม โต๊ะที่ย้าย และหน้าตาที่เปลี่ยน", () => {
    const a = defaultScene();
    let b = swapDesks(a, 0, 1);
    b = { ...b, theme: "night", looks: { ...b.looks, [OFFICE_WORKERS[2].id]: { ...b.looks[OFFICE_WORKERS[2].id], nick: "เมล" } } };
    const c = sceneChanges(a, b);
    expect(c.some((x) => x.startsWith("theme:day→night"))).toBe(true);
    expect(c.some((x) => x.startsWith("desks:"))).toBe(true);
    expect(c.some((x) => x.startsWith(`look:${OFFICE_WORKERS[2].id}(nick)`))).toBe(true);
  });
  it("ไม่เปลี่ยนอะไร = ว่าง", () => expect(sceneChanges(defaultScene(), defaultScene())).toEqual([]));
});
