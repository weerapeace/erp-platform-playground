/**
 * 📊 สรุปผลงานจากใบจด (เฟส 2b) — กติกาคำนวณกลาง (ไม่มี I/O · ใช้ทั้งหน้าเว็บและเทสต์)
 *   หน่วยหลัก = ชิ้นต่อชั่วโมง (คนเดียวทำหลายงานในวันเดียว จึงเทียบรายวันไม่ได้) → คูณชั่วโมงทำงานเป็น "ควรได้ต่อวัน"
 *   ค่ามาตรฐานของขั้นตอน = ค่ากลาง (median) ของ 20 บรรทัดล่าสุด จากทุกคน · ต้องมี ≥ 5 บรรทัดถึงเชื่อได้
 *     (ค่ากลางไม่โดนดึงเพี้ยนจากวันที่จักรเสีย/จดผิด เหมือนค่าเฉลี่ย)
 *   ผลงานรายคนต่อขั้นตอน = ชิ้นรวม ÷ ชั่วโมงรวม (ช่วงที่เลือก) → เทียบ % กับค่ามาตรฐาน
 *     ≥ 115% = เร็ว · < 85% = ช้า · ระหว่างนั้น = ปกติ · คนที่มี < 5 บรรทัด = "ข้อมูลน้อย" (ยังไม่ตัดสิน)
 *   ของเสียแยกตัวชี้วัด (เสีย ÷ (ทำได้ + เสีย)) ไม่หักจากความเร็ว
 *   ข้อมูล: work_log_entries ผ่าน GET /api/work-logs/stats
 */

export type StatEntry = {
  id: string;
  step_id: string | null;
  step_name: string;
  product_sku: string | null;
  product_name: string | null;
  employee_id: string | null;
  employee_name: string;
  work_date: string | null;
  minutes: number | null;
  qty_done: number | null;
  qty_waste: number | null;
};

export const STANDARD_SAMPLE = 20;   // ใช้กี่บรรทัดล่าสุดคิดค่ามาตรฐาน
export const MIN_SAMPLES = 5;        // ต่ำกว่านี้ = ยังไม่พอเชื่อ
export const MIN_MINUTES = 10;       // บรรทัดสั้นกว่านี้ไม่นับ (จดเวลาคลาดนิดเดียวก็เพี้ยนมาก)
export const FAST_AT = 1.15;
export const SLOW_AT = 0.85;

export type StepGroupMode = "step" | "name";   // step = ขั้นตอนของสินค้านั้น ๆ · name = รวมชื่อขั้นตอนเดียวกันทุกสินค้า

export const normStepName = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function stepKeyOf(e: StatEntry, mode: StepGroupMode): string {
  if (mode === "name") return `n:${normStepName(e.step_name)}`;
  return e.step_id ? `s:${e.step_id}` : `p:${e.product_sku ?? "-"}:${normStepName(e.step_name)}`;
}

/** บรรทัดที่ใช้คิดความเร็วได้ */
export const usable = (e: StatEntry) => (e.minutes ?? 0) >= MIN_MINUTES && (e.qty_done ?? 0) > 0;
export const rateOf = (e: StatEntry) => ((e.qty_done ?? 0) / (e.minutes ?? 1)) * 60;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Verdict = "fast" | "normal" | "slow" | "few";
export const VERDICT_LABEL: Record<Verdict, string> = { fast: "เร็ว", normal: "ปกติ", slow: "ช้า", few: "ข้อมูลน้อย" };
export function verdictOf(ratio: number | null, samples: number): Verdict {
  if (ratio === null || samples < MIN_SAMPLES) return "few";
  return ratio >= FAST_AT ? "fast" : ratio < SLOW_AT ? "slow" : "normal";
}

export type PersonOnStep = {
  employee_id: string | null; employee_name: string;
  samples: number; qty: number; waste: number; minutes: number;
  rate: number | null;            // ชิ้น/ชม. (รวมช่วงที่เลือก)
  ratio: number | null;           // เทียบค่ามาตรฐาน (1 = เท่ามาตรฐาน)
  verdict: Verdict;
};
export type StepStat = {
  key: string; step_name: string; product_label: string | null;
  standard: number | null;        // ชิ้น/ชม.
  standardSamples: number;        // บรรทัดที่ใช้คิดมาตรฐาน (≤ 20)
  reliable: boolean;              // ≥ 5 บรรทัด
  samples: number; qty: number; waste: number; minutes: number;
  wasteRate: number | null;
  people: PersonOnStep[];
};

const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** สรุปตามขั้นตอน — เรียงตามจำนวนบรรทัดมากสุดก่อน */
export function stepStats(entries: StatEntry[], mode: StepGroupMode): StepStat[] {
  const groups = new Map<string, StatEntry[]>();
  for (const e of entries) { const k = stepKeyOf(e, mode); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const out: StepStat[] = [];
  for (const [key, list] of groups) {
    const ok = list.filter(usable).sort((a, b) => String(b.work_date ?? "").localeCompare(String(a.work_date ?? "")));
    const recent = ok.slice(0, STANDARD_SAMPLE);
    const standard = median(recent.map(rateOf));
    const byPerson = new Map<string, StatEntry[]>();
    for (const e of list) { const k = e.employee_id ?? `?${e.employee_name}`; byPerson.set(k, [...(byPerson.get(k) ?? []), e]); }
    const people: PersonOnStep[] = [...byPerson.values()].map((pl) => {
      const u = pl.filter(usable);
      const qty = u.reduce((a, e) => a + (e.qty_done ?? 0), 0);
      const minutes = u.reduce((a, e) => a + (e.minutes ?? 0), 0);
      const rate = minutes > 0 ? (qty / minutes) * 60 : null;
      const ratio = rate !== null && standard ? rate / standard : null;
      return {
        employee_id: pl[0].employee_id, employee_name: pl[0].employee_name,
        samples: u.length, qty: pl.reduce((a, e) => a + (e.qty_done ?? 0), 0), waste: pl.reduce((a, e) => a + (e.qty_waste ?? 0), 0), minutes,
        rate: r1(rate), ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
        verdict: verdictOf(ratio, recent.length >= MIN_SAMPLES ? u.length : 0),
      };
    }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
    const qty = list.reduce((a, e) => a + (e.qty_done ?? 0), 0);
    const waste = list.reduce((a, e) => a + (e.qty_waste ?? 0), 0);
    const products = [...new Set(list.map((e) => e.product_sku).filter(Boolean))];
    out.push({
      key, step_name: list[0].step_name,
      product_label: mode === "name" ? (products.length > 1 ? `${products.length} สินค้า` : products[0] ?? null) : [list[0].product_sku, list[0].product_name].filter(Boolean).join(" ") || null,
      standard: r1(standard), standardSamples: recent.length, reliable: recent.length >= MIN_SAMPLES,
      samples: list.length, qty, waste, minutes: list.reduce((a, e) => a + (e.minutes ?? 0), 0),
      wasteRate: qty + waste > 0 ? Math.round((waste / (qty + waste)) * 1000) / 10 : null,
      people,
    });
  }
  return out.sort((a, b) => b.samples - a.samples);
}

export type PersonStat = {
  employee_id: string | null; employee_name: string;
  samples: number; qty: number; waste: number; minutes: number; steps: number;
  /** % เทียบมาตรฐาน เฉลี่ยถ่วงตามชั่วโมง (เฉพาะขั้นตอนที่มาตรฐานเชื่อได้ + คนนั้นมี ≥ 5 บรรทัด) */
  ratio: number | null;
  verdict: Verdict;
  wasteRate: number | null;
  days: number;
};

/** สรุปตามคน (ใช้ผลจาก stepStats เพื่อให้ % ตรงกับหน้าขั้นตอน) */
export function personStats(entries: StatEntry[], steps: StepStat[]): PersonStat[] {
  const byPerson = new Map<string, StatEntry[]>();
  for (const e of entries) { const k = e.employee_id ?? `?${e.employee_name}`; byPerson.set(k, [...(byPerson.get(k) ?? []), e]); }
  return [...byPerson.entries()].map(([k, list]) => {
    let wSum = 0, wRatio = 0, judged = 0;
    for (const s of steps) {
      const p = s.people.find((x) => (x.employee_id ?? `?${x.employee_name}`) === k);
      if (!p || !s.reliable || p.ratio === null || p.samples < MIN_SAMPLES) continue;
      wSum += p.minutes; wRatio += p.ratio * p.minutes; judged += p.samples;
    }
    const ratio = wSum > 0 ? Math.round((wRatio / wSum) * 100) / 100 : null;
    const qty = list.reduce((a, e) => a + (e.qty_done ?? 0), 0);
    const waste = list.reduce((a, e) => a + (e.qty_waste ?? 0), 0);
    return {
      employee_id: list[0].employee_id, employee_name: list[0].employee_name,
      samples: list.length, qty, waste, minutes: list.reduce((a, e) => a + (e.minutes ?? 0), 0),
      steps: new Set(list.map((e) => normStepName(e.step_name))).size,
      ratio, verdict: verdictOf(ratio, judged), wasteRate: qty + waste > 0 ? Math.round((waste / (qty + waste)) * 1000) / 10 : null,
      days: new Set(list.map((e) => e.work_date).filter(Boolean)).size,
    };
  }).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
}

/** "จ่าย N ชิ้น เสร็จใน …" ตามค่ามาตรฐาน */
export function durationLabel(qty: number, perHour: number | null, hoursPerDay: number): string {
  if (!perHour || perHour <= 0) return "—";
  const h = qty / perHour;
  if (h < hoursPerDay) return `${Math.round(h * 10) / 10} ชม.`;
  return `${Math.round((h / hoursPerDay) * 10) / 10} วัน`;
}

export const fmtHours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} ชม.`;

/** ข้อมูลจำลองสำหรับดูหน้าตาก่อนมีข้อมูลจริง (ป้าย "ตัวอย่าง" บนหน้าเสมอ) */
export function demoStatEntries(today: string): StatEntry[] {
  const people = [["d1", "น้อย", 24], ["d2", "ส้ม", 19], ["d3", "ดาว", 15], ["d4", "แก้ว", 21], ["d5", "มด", 11]] as const;
  const steps = [["demo-a", "เย็บขอบ · สายสะพาย", "BAG-MINI", "กระเป๋า Mini", 1], ["demo-b", "ประกอบ · ตัวกระเป๋า", "TOTE-L", "Tote L", 0.35], ["demo-c", "ตัด · ผ้าซับใน", "BAG-MINI", "กระเป๋า Mini", 2]] as const;
  const out: StatEntry[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  steps.forEach(([sid, sname, sku, pname, factor]) => {
    people.forEach(([eid, ename, base], pi) => {
      const n = pi === 4 ? 3 : 6 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - i * 2);
        const minutes = 120 + Math.floor(rnd() * 120);
        const qty = Math.max(1, Math.round((base * factor * (0.8 + rnd() * 0.4) * minutes) / 60));
        out.push({ id: `${sid}-${eid}-${i}`, step_id: sid, step_name: sname, product_sku: sku, product_name: pname, employee_id: eid, employee_name: ename,
          work_date: d.toISOString().slice(0, 10), minutes, qty_done: qty, qty_waste: rnd() < 0.3 ? Math.ceil(rnd() * 3) : 0 });
      }
    });
  });
  return out;
}
