/**
 * 🔄 โหมดอัปเดตงาน — ตัวช่วยของ "แถวจ่าย / รอบส่งคืน / ค่าแรง" ที่ป๊อปทีละใบ (catch-up-modal) และตารางเป็นชุด (catch-up-batch) ใช้ร่วมกัน
 * ไม่มี React · กติกาการบันทึกจริงอยู่ ./catch-up.ts (cuBuildSteps / cuRun) — ไฟล์นี้แค่ช่วยเตรียมข้อมูลเข้าไป
 */
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import type { CuDispLine, CuRetLine } from "./catch-up";

/** แถวจ่ายงานบนจอ = แถวตามกติกา + คนรับ · rateSet = พิมพ์ค่าแรงเองแล้ว (ไม่เปลี่ยนตามช่าง) */
export type CuDispRow = CuDispLine & { crewIds: string[]; rateSet?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");

/** ค่าแรง/ชิ้นราคากลางในสูตร (BOM) */
export const cuCentralRate = (snap: CatchUpSnapshot | null | undefined) => snap?.rates.find((x) => !x.craftsman_id)?.rate ?? null;
/** ค่าแรง/ชิ้นจากสูตร: เลือกช่างคนเดียวที่มีเรตเฉพาะ → เรตคนนั้น · ไม่งั้นราคากลาง (กติกาเดียวกับป๊อปจ่ายงานปกติ) */
export const cuRateFor = (snap: CatchUpSnapshot | null | undefined, crewIds: string[]) =>
  (crewIds.length === 1 ? snap?.rates.find((x) => x.craftsman_id === crewIds[0])?.rate : undefined) ?? cuCentralRate(snap);

/** ที่มาของรอบส่งคืน 1 ตัว: ใบจ่ายเดิมที่ยังค้างช่าง หรือแถวจ่ายใหม่ในรอบนี้ (ref "new:<key>") · rate = ค่าแรง/ชิ้นตามใบจ่าย */
export type CuRetSource = { ref: string; cap: number; rate: number | null; short: string; label: string };

/**
 * ส่งคืนจากใคร — เรียกด้วยชื่อเล่นช่าง (ไม่ใช่เลขใบ)
 * nickOf = ชื่อเต็มในใบเดิม ("ก, ข") → ชื่อเล่น · newWho = ชื่อคนรับของแถวจ่ายใหม่ · deskName = ชื่อโต๊ะของแถวจ่ายใหม่
 */
export function cuRetSources(snap: CatchUpSnapshot | null | undefined, disp: CuDispRow[], dispOn: boolean, h: {
  nickOf: (full: string | null | undefined) => string; newWho: (r: CuDispRow) => string; deskName: (r: CuDispRow) => string | null;
}): CuRetSource[] {
  return [
    ...(snap?.wos ?? []).filter((w) => w.status !== "done" && w.qty - w.received_qty > 0.0001).map((w) => {
      const who = h.nickOf(w.assignee_name) || w.department_name || "—", cap = r2(w.qty - w.received_qty);
      // ค่าแรง/ชิ้นของใบเดิม = ค่าแรงรวมของใบ ÷ จำนวนจ่าย (ไม่มีค่าแรง = ให้พิมพ์เอง)
      const rate = (w.labor_cost ?? 0) > 0 && w.qty > 0 ? r2(w.labor_cost / w.qty) : null;
      return { ref: w.id, cap, rate, short: `${who} · ${w.wo_no}`, label: `${who} · ${w.wo_no} (ค้าง ${fmt(cap)})` };
    }),
    ...(dispOn ? disp.filter((r) => r.qty > 0).map((r) => {
      const who = h.newWho(r) || "ทั้งโต๊ะ", desk = h.deskName(r) ?? "โต๊ะ";
      return { ref: `new:${r.key}`, cap: r2(r.qty), rate: r.rate != null && r.rate > 0 ? r.rate : null, short: `${who} · ${desk}`, label: `${who} · ${desk} (จ่ายรอบนี้ ${fmt(r.qty)})` };
    }) : []),
  ];
}

/** ค่าแรง/ชิ้นตามใบจ่ายของที่มานั้น · "แบ่งอัตโนมัติ" = ใช้ได้เมื่อทุกที่มาราคาเดียวกัน */
export function cuRateOfRef(sources: CuRetSource[], ref: string): number | null {
  if (ref !== "auto") return sources.find((o) => o.ref === ref)?.rate ?? null;
  const rs = [...new Set(sources.map((o) => o.rate))];
  return rs.length === 1 ? rs[0] : null;
}

/** รอบส่งคืนที่จะส่งเข้ากติกา: ยังไม่เลือกที่มา = ช่างที่จ่ายตามลำดับรอบ · ค่าแรงที่พิมพ์เองมาก่อน ไม่ได้พิมพ์ = ตามใบจ่าย */
export function cuRetEffective(ret: CuRetLine[], sources: CuRetSource[]): CuRetLine[] {
  return ret.map((r, i) => {
    const ref = r.ref || (sources.length ? sources[Math.min(i, sources.length - 1)].ref : "auto");
    return { ...r, ref, wage: r.wage != null ? r.wage : cuRateOfRef(sources, ref) };
  });
}

/** ส่งคืนตามยอดจ่ายอัตโนมัติ: 1 รอบต่อ 1 ที่มา (ยอดเท่าที่ค้าง) · เก็บวันที่/ค่าแรงที่ใส่ไว้แล้วของที่มาเดิม · ไม่เปลี่ยน = คืนตัวเดิม */
export function cuAutoReturns(sources: CuRetSource[], prev: CuRetLine[]): CuRetLine[] {
  const next = sources.map((s) => { const old = prev.find((r) => r.ref === s.ref); return { key: old?.key ?? `r-${s.ref}`, ref: s.ref, qty: s.cap, date: old?.date ?? null, wage: old?.wage ?? null }; });
  return next.length === prev.length && next.every((n, i) => prev[i].ref === n.ref && prev[i].qty === n.qty) ? prev : next;
}

/** ค่าแรง/ชิ้นที่พิมพ์เอง (แถวจ่ายที่แก้ค่าแรงเอง → รอบส่งคืนที่ใส่ค่าแรง) — ต่างจากราคากลาง = เสนอบันทึกกลับเข้า BOM */
export function cuBomCandidate(disp: CuDispRow[], dispOn: boolean, ret: CuRetLine[], retOn: boolean): number | null {
  return (dispOn ? disp.find((r) => r.rateSet && r.rate != null && r.rate > 0)?.rate : undefined)
    ?? (retOn ? ret.find((r) => r.wage != null && r.wage > 0)?.wage : undefined) ?? null;
}

/** จำโต๊ะ/คนรับ/ชั้น QC ล่าสุดไว้ให้ใบถัดไป (ต่อเครื่อง — ไม่จำวันที่ กันวันผิดติดไปเงียบ ๆ) — ป๊อปทีละใบกับตารางเป็นชุดใช้ที่เดียวกัน */
const LAST_KEY = "wb-catchup-last";
export type CuLast = { deptId?: string; crewIds?: string[]; shelfId?: string };
export const cuReadLast = (): CuLast => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as CuLast; } catch { return {}; } };
export const cuWriteLast = (v: CuLast) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* ไม่มี storage ก็ข้าม */ } };
