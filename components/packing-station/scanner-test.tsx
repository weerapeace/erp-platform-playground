"use client";

/**
 * 🔫 ทดสอบเครื่องสแกน (ข้อเสนอ 1 รอบมือถือ · 2026-11-19) — ยิงอะไรก็ได้ 1 ครั้ง → บอกว่าอ่านได้อะไร ใช้กับสถานีได้ไหม + วิธีแก้
 *   ฟังปุ่มเองตอนการ์ดนี้เปิดอยู่ (หน้า "ตั้งค่าสถานี" — ตัวจับเครื่องยิงของสถานีปิดอยู่) · กติกา lib/packing-scan-test
 *   ลองค้นออเดอร์ให้ด้วย (GET อ่านอย่างเดียว ไม่เริ่มแพ็ค)
 */
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { typedChar } from "@/lib/shortcut-key";
import { parsePackCommand } from "@/lib/packing";
import { analyzeScan, type ScanKey, type ScanReport } from "@/lib/packing-scan-test";

const IDLE_MS = 400;   // เงียบเกินนี้ = ยิงจบ (กรณีไม่มี Enter)
const TONE = { ok: "bg-emerald-50 text-emerald-800", warn: "bg-amber-50 text-amber-800", error: "bg-red-50 text-red-700" } as const;

export function ScannerTest() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const buf = useRef<ScanKey[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const done = (enter: boolean) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      const keys = buf.current; buf.current = [];
      if (!keys.length) return;
      const r = analyzeScan(keys, enter);
      setReport(r); setCount((n) => n + 1); setFound(null);
      if (!r.text) return;
      const cmd = parsePackCommand(r.text);
      if (cmd) { setFound(`การ์ดคำสั่ง: ${r.text}`); return; }
      setFound("กำลังลองค้นออเดอร์…");
      apiFetch(`/api/packing?code=${encodeURIComponent(r.text)}`)
        .then(async (res) => { const j = await res.json().catch(() => ({})); setFound(res.ok ? `เจอออเดอร์ ${j.order?.order_no ?? ""}` : res.status === 404 ? "ไม่ใช่เลขออเดอร์/เลขพัสดุ (ถ้ายิงสินค้า ปกติ)" : "ค้นไม่ได้ตอนนี้"); })
        .catch(() => setFound("ค้นไม่ได้ (เน็ตหลุด)"));
    };
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "Enter") { e.preventDefault(); done(true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1) e.preventDefault();
      buf.current.push({ key: e.key, ch: typedChar(e), t: performance.now() });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => done(false), IDLE_MS);
    };
    window.addEventListener("keydown", h, true);
    return () => { window.removeEventListener("keydown", h, true); if (timer.current) window.clearTimeout(timer.current); };
  }, [open]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">ทดสอบเครื่องสแกน</p>
          <p className="text-xs text-slate-500">ต่อเครื่องสแกนกับมือถือ/คอมใหม่ หรือยิงแล้วไม่ติด — กดเริ่ม แล้วยิงอะไรก็ได้ 1 ครั้ง</p>
        </div>
        <button type="button" onClick={() => { setOpen((v) => !v); setReport(null); setFound(null); setCount(0); (document.activeElement as HTMLElement | null)?.blur(); }}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${open ? "border border-slate-300 text-slate-700" : "bg-slate-900 text-white"}`}>
          <Icon value="i:scan" /> {open ? "หยุดทดสอบ" : "เริ่มทดสอบ"}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-2">
          {!report ? (
            <div className="grid min-h-[90px] place-items-center rounded-lg border-2 border-dashed border-sky-300 bg-sky-50 p-4 text-center text-sm text-sky-800">
              <div><Icon value="i:scan" className="text-2xl" /><p className="mt-1">รอยิง… (ยิงใบปะหน้า การ์ดคำสั่ง หรือสติกเกอร์สินค้า)</p><p className="text-xs text-sky-700">ยิงแล้วไม่ขึ้นอะไรเลย = ยังไม่ได้จับคู่ หรือเครื่องอยู่โหมด SPP — ดูวิธีต่อด้านล่าง</p></div>
            </div>
          ) : (
            <>
              <div className={`rounded-lg border p-3 ${report.works ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <p className={`text-sm font-semibold ${report.works ? "text-emerald-800" : "text-red-700"}`}>{report.works ? "ใช้กับสถานีแพ็คได้" : "ยังใช้กับสถานีแพ็คไม่ได้ — ดูวิธีแก้ด้านล่าง"} <span className="text-xs font-normal text-slate-500">(ครั้งที่ {count})</span></p>
                <p className="mt-1 break-all font-mono text-base text-slate-900">{report.text || "—"}</p>
                {found && <p className="mt-1 text-xs text-slate-600">{found}</p>}
              </div>
              <ul className="grid gap-1">
                {report.issues.map((i) => (
                  <li key={i.text} className={`rounded-lg px-3 py-1.5 text-xs ${TONE[i.level]}`}>
                    <Icon name={i.level === "ok" ? "done" : "warning"} /> {i.text}{i.fix && <span className="block pl-5 opacity-90">วิธีแก้: {i.fix}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400">ยิงซ้ำได้เรื่อย ๆ เพื่อทดสอบใหม่</p>
            </>
          )}
          <details className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">วิธีต่อเครื่องสแกนกับมือถือ</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li><b>บลูทูธ:</b> ตั้งเครื่องเป็นโหมด Bluetooth HID (Keyboard) — ยิงบาร์โค้ดตั้งค่าในคู่มือ · ห้ามใช้ SPP / BLE Serial</li>
              <li>เปิดบลูทูธในมือถือ → จับคู่ (ขึ้นเป็น "คีย์บอร์ด")</li>
              <li>ในคู่มือเครื่อง ตั้ง <b>ส่ง Enter ท้าย</b> (Suffix CR) และ <b>ภาษาคีย์บอร์ด US</b></li>
              <li><b>สาย:</b> ใช้สาย OTG (USB-C ↔ USB-A) เสียบมือถือได้เลย</li>
              <li>iPhone: ต่อแล้วคีย์บอร์ดบนจอจะหาย — อยากพิมพ์เอง กดปุ่มเครื่องสแกน 2 ครั้ง (หลายยี่ห้อ) · Android: คีย์บอร์ดบนจอเด้งบัง → ตั้งค่า › ภาษาและการป้อนข้อมูล › แป้นพิมพ์จริง › ปิด "แสดงแป้นพิมพ์เสมือน"</li>
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}
