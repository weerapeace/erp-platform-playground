"use client";

/**
 * usePrintNotes — ช่อง "พิมพ์เอง" ในหน้าพิมพ์ (ของกลาง · lib/print-notes) — ข้อความทั้งทีมเห็น จำไว้ครั้งหน้า
 *   โหลดข้อความทั้งรายงานครั้งเดียว · พิมพ์แล้วบันทึกเองเมื่อหยุดพิมพ์ ~1.2 วิ / ออกจากช่อง / ปิดหน้า
 *   ข้อความล่าสุดอยู่ใน ref (get) — หน้าอ่านตอนสร้าง html (ver เปลี่ยนเฉพาะตอนโหลดเสร็จ ไม่เปลี่ยนตอนพิมพ์ → พรีวิวไม่โหลดใหม่ระหว่างพิมพ์)
 *   ตารางยังไม่พร้อม (unavailable) = พิมพ์ได้ ใช้ได้เฉพาะครั้งนั้น ไม่บันทึก
 * ใช้คู่กับ ListPrintFrame onNote/onNoteDone + ListPrintPanel textNotes
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { splitNoteKey, type PrintNote, type PrintNoteReport } from "@/lib/print-notes";

export type PrintNotesStatus = "loading" | "ready" | "unavailable" | "error";

export interface PrintNotesState {
  /** ข้อความล่าสุดของช่อง (data-note key) */
  get: (key: string) => string;
  /** เปลี่ยนเมื่อโหลดข้อความจากเซิร์ฟเวอร์เสร็จ (ใช้เป็น dependency ตอนสร้าง html) */
  ver: number;
  status: PrintNotesStatus;
  /** กำลังบันทึกกี่ช่อง */
  saving: number;
  savedAt: number | null;
  error: string | null;
  set: (key: string, text: string) => void;
  /** บันทึกช่องนี้ทันที (ออกจากช่อง) */
  flush: (key: string) => void;
}

const DEBOUNCE_MS = 1200;

export function usePrintNotes(report: PrintNoteReport): PrintNotesState {
  const live = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const statusRef = useRef<PrintNotesStatus>("loading");
  const [ver, setVer] = useState(0);
  const [status, setStatusState] = useState<PrintNotesStatus>("loading");
  const [saving, setSaving] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setStatus = (s: PrintNotesStatus) => { statusRef.current = s; setStatusState(s); };

  useEffect(() => {
    let on = true;
    apiFetch(`/api/print-notes?report=${encodeURIComponent(report)}`)
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as { data?: PrintNote[]; unavailable?: boolean; error?: string } }))
      .then(({ ok, j }) => {
        if (!on) return;
        if (!ok) { setStatus("error"); setError(j.error ?? "โหลดหมายเหตุไม่สำเร็จ"); return; }
        // ข้อความที่พิมพ์ไปก่อนโหลดเสร็จ ชนะข้อความเดิม
        const m = new Map<string, string>((j.data ?? []).map((n) => [`${n.row_key}|${n.col_key}`, n.body] as const));
        for (const [k, v] of live.current) m.set(k, v);
        live.current = m;
        setStatus(j.unavailable ? "unavailable" : "ready");
        setVer((v) => v + 1);
      })
      .catch(() => { if (on) { setStatus("error"); setError("เชื่อมต่อไม่ได้ — หมายเหตุยังไม่ถูกบันทึก"); } });
    return () => { on = false; };
  }, [report]);

  const save = useCallback(async (key: string, keepalive = false) => {
    timers.current.delete(key);
    const parts = splitNoteKey(key);
    if (!parts || statusRef.current === "unavailable") return;
    setSaving((n) => n + 1);
    try {
      const r = await apiFetch("/api/print-notes", {
        method: "PUT", headers: { "Content-Type": "application/json" }, keepalive,
        body: JSON.stringify({ report, row_key: parts.row, col_key: parts.col, body: live.current.get(key) ?? "" }),
      });
      if (r.status === 503) { setStatus("unavailable"); return; }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setError(j.error ?? "บันทึกหมายเหตุไม่สำเร็จ"); return; }
      setError(null);
      setSavedAt(Date.now());
    } catch { setError("เชื่อมต่อไม่ได้ — หมายเหตุยังไม่ถูกบันทึก"); }
    finally { setSaving((n) => n - 1); }
  }, [report]);

  const set = useCallback((key: string, text: string) => {
    if (text) live.current.set(key, text); else live.current.delete(key);
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.set(key, setTimeout(() => void save(key), DEBOUNCE_MS));
  }, [save]);

  const flush = useCallback((key: string) => {
    const t = timers.current.get(key);
    if (!t) return;
    clearTimeout(t);
    void save(key);
  }, [save]);

  // ปิดหน้า/ออกจากหน้า = บันทึกช่องที่ค้างอยู่
  useEffect(() => {
    const flushAll = () => { for (const [k, t] of timers.current) { clearTimeout(t); void save(k, true); } };
    window.addEventListener("pagehide", flushAll);
    return () => { window.removeEventListener("pagehide", flushAll); flushAll(); };
  }, [save]);

  const get = useCallback((key: string) => live.current.get(key) ?? "", []);
  return { get, ver, status, saving, savedAt, error, set, flush };
}
