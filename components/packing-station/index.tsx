"use client";

/**
 * 📦 สถานีแพ็คสินค้า (ช่วงทดลอง) — docs/packing-station.md
 *
 * ยิงใบปะหน้า/เลขออเดอร์ → เปิดออเดอร์ + กล้องเริ่มอัด (≤ 60 วิ) → ยิงสินค้าเช็กของ → จบ
 * วิธีจบ (เจ้าของเลือก F1/F2/F3/F5): ยิงใบปะหน้าใบถัดไป · การ์ดบาร์โค้ด *PK-DONE · แป้นเหยียบ (Space/F9) · ปุ่มใหญ่
 * กติกา = lib/packing · API = /api/packing · คลิปเก็บในเครื่องนี้ (clip-store) จนกว่าจะเชื่อม NAS
 * ⚠️ ไม่ตัดสต๊อก ไม่ส่งสถานะไปร้านค้า
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useScanGun } from "@/components/scan-input/use-scan-gun";
import { ScrollTabs } from "@/components/scroll-tabs";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { usePageOwnsBottomBar } from "@/lib/app-shell-bar";
import {
  applyItemScan, allChecked, boxSizeText, checkProgress, itemCount, parsePackCommand, CLIP_MAX_SEC, MANUAL_REASONS, PACK_PROBLEMS,
  type CheckItem, type FinishMethod, type PackFinishStatus, type PackGate, type BoxSize,
} from "@/lib/packing";
import { useClipRecorder, type RecordedClip } from "./use-clip-recorder";
import { saveClip, sha256Hex, pruneClips, requestPersist } from "./clip-store";
import { playPackSound, type PackSound } from "./sounds";
import { LocalClipsPanel } from "./local-clips";
import { StationSettings, loadSettings, saveSettings, type StationSettingsValue } from "./settings";

// ── ข้อมูลจาก /api/packing ──
type ApiItem = { id: string; name: string; shop_code: string | null; sku_code: string | null; color: string | null; qty: number; image_key: string | null; matched: boolean; level: "sku" | "parent" | "none"; box: string | null; codes: string[] };
type ApiOrder = { id: string; order_no: string | null; platform: string | null; platform_code: string | null; customer_name: string | null; status: string; platform_status: string | null; ship_by_at: string | null; tracking_no: string | null; package_no: string | null; carrier: string | null; cod_amount: number; packed_at: string | null; packed_by_name: string | null; buyer_note: string | null };
type Lookup = { order: ApiOrder; items: ApiItem[]; box: BoxSize | null; missing_box: boolean; notes: { text: string; flags: string[]; parent: string }[]; gate: PackGate; scanned_code: string };

type Line = CheckItem & { info: ApiItem; reason: string | null };
type Active = {
  sessionId: string | null;
  data: Lookup;
  lines: Line[];
  boxUsed: string | null;
  wrongScans: string[];
  overScans: number;
  checkedAt: string | null;
};
type Flash = { tone: "ok" | "error" | "warn" | "info"; text: string; at: number };
type Recent = { order_no: string; status: PackFinishStatus; sec: number; at: string };

type Tab = "station" | "clips" | "settings";

const toLines = (items: ApiItem[]): Line[] => items.map((it) => ({ key: it.id, qty: it.qty, codes: it.codes, scanned: 0, manual: 0, info: it, reason: null }));
const fmtSec = (s: number): string => (s >= 60 ? `${Math.floor(s / 60)} นาที ${s % 60} วิ` : `${s} วิ`);

export function PackingStation({ packerName }: { packerName: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("station");
  const [settings, setSettings] = useState<StationSettingsValue>(() => loadSettings());
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [pending, setPending] = useState<Lookup | null>(null);
  const [blocked, setBlocked] = useState<{ order_no: string | null; reasons: string[] } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemNote, setProblemNote] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [typed, setTyped] = useState("");
  const [savingCount, setSavingCount] = useState(0);

  const activeRef = useRef<Active | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  const pendingRef = useRef<Lookup | null>(null);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const autoClipRef = useRef<RecordedClip | null>(null);       // คลิปที่หยุดเองตอนครบ 60 วิ (ออเดอร์ยังไม่จบ)
  const doneConfirmAt = useRef(0);                              // กดจบตอนยังเช็กไม่ครบ = กดซ้ำภายใน 4 วิ เพื่อยืนยัน
  const busyRef = useRef(false);
  const isPhone = useMediaQuery("(max-width: 1023px)");
  usePageOwnsBottomBar(isPhone && !!active && tab === "station");   // มือถือ: แถบปุ่มจบของหน้านี้อยู่ล่างจอ แทนแถบเมนูแอป

  const sound = useCallback((k: PackSound) => { if (settings.sound) playPackSound(k); }, [settings.sound]);
  const say = useCallback((tone: Flash["tone"], text: string, snd?: PackSound) => {
    setFlash({ tone, text, at: Date.now() });
    if (snd) sound(snd);
  }, [sound]);

  const rec = useClipRecorder({
    deviceId: settings.deviceId || undefined,
    enabled: settings.record && tab === "station",
    readBarcodes: settings.camScan,
    onBarcode: (code) => { void handleScanRef.current(code); },
    onAutoStop: () => {
      void rec.stop().then((clip) => { autoClipRef.current = clip; });
      say("warn", `ครบ ${CLIP_MAX_SEC} วิ — หยุดอัดแล้ว (แพ็คต่อได้ ยิงจบตามปกติ)`, "warn");
    },
  });
  const recRef = useRef(rec);
  useEffect(() => { recRef.current = rec; });

  // ทะเบียนกล่อง + ลบคลิปในเครื่องที่เก่าเกินกำหนด + ขอเบราว์เซอร์อย่าลบที่เก็บเอง
  useEffect(() => {
    apiFetch("/api/packing?boxes=1").then((r) => r.json()).then((j: { boxes?: BoxSize[] }) => setBoxes(j.boxes ?? [])).catch(() => {});
    void requestPersist();
    void pruneClips(settings.keepDays).catch(() => {});
  }, [settings.keepDays]);

  useEffect(() => { if (flash) { const t = window.setTimeout(() => setFlash((f) => (f?.at === flash.at ? null : f)), 4500); return () => window.clearTimeout(t); } }, [flash]);

  const overlayFor = useCallback((d: Lookup) => ({ order: d.order.order_no ?? "-", tracking: d.order.tracking_no ?? d.order.package_no ?? "", packer: packerName, station: settings.station }), [packerName, settings.station]);

  // ── ค้นออเดอร์ ──
  const lookup = useCallback(async (code: string): Promise<{ data?: Lookup; notFound?: boolean; error?: string }> => {
    try {
      const r = await apiFetch(`/api/packing?code=${encodeURIComponent(code)}`);
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 && j.not_found) return { notFound: true, error: j.error };
      if (!r.ok) return { error: j.error || "ค้นออเดอร์ไม่สำเร็จ ลองใหม่" };
      return { data: j as Lookup };
    } catch { return { error: "เน็ตหลุด — ค้นออเดอร์ไม่ได้ ลองยิงใหม่" }; }
  }, []);

  // ── จบออเดอร์ (หยุดกล้องก่อน แล้วบันทึกเบื้องหลัง ไม่ให้ออเดอร์ถัดไปรอ) ──
  const finish = useCallback(async (status: PackFinishStatus, method: FinishMethod | null, problem?: string, note?: string) => {
    const a = activeRef.current;
    if (!a) return;
    activeRef.current = null;
    setActive(null); setProblemOpen(false); setProblemNote(""); doneConfirmAt.current = 0;
    const r = recRef.current;
    let clip: RecordedClip | null = null;
    if (status === "abandoned") { await r.stop({ discard: true }); }
    else if (r.recording) { clip = await r.stop({ snapshot: true }); }
    else if (autoClipRef.current) { clip = { ...autoClipRef.current, snapshot: await r.snapshot() }; }
    autoClipRef.current = null;
    r.setOverlay(null);

    setSavingCount((n) => n + 1);
    void (async () => {
      let clipMeta: Record<string, unknown> | null = null;
      try {
        if (clip) {
          const sha = await sha256Hex(clip.blob);
          const id = `${a.sessionId ?? a.data.order.id}-${Date.now()}`;
          await saveClip({
            id, session_id: a.sessionId, order_id: a.data.order.id, order_no: a.data.order.order_no, tracking_no: a.data.order.tracking_no,
            packer: packerName, station: settings.station || null, status, created_at: new Date().toISOString(),
            mime: clip.mime, size: clip.blob.size, duration_sec: clip.duration_sec, sha256: sha, video: clip.blob, snapshot: clip.snapshot,
          });
          clipMeta = { store: "local", local_id: id, size: clip.blob.size, duration_sec: clip.duration_sec, mime: clip.mime, sha256: sha, snapshot: !!clip.snapshot };
        }
      } catch {
        toast.error("เก็บคลิปในเครื่องไม่สำเร็จ (ที่เก็บเต็ม?) — การแพ็คยังบันทึกอยู่");
      }
      if (a.sessionId) {
        try {
          const res = await apiFetch("/api/packing", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "finish", session_id: a.sessionId, status, finish_method: method, problem, problem_note: note,
              box_used: a.boxUsed ?? a.data.box?.name ?? null, box_suggested: a.data.box?.name ?? null, checked_at: a.checkedAt,
              checks: { lines: a.lines.map((l) => ({ id: l.key, qty: l.qty, scanned: l.scanned, manual: l.manual, reason: l.reason })), wrong_scans: a.wrongScans, over_scans: a.overScans },
              clip: clipMeta,
            }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) toast.error(j.error || `บันทึกออเดอร์ ${a.data.order.order_no ?? ""} ไม่สำเร็จ`);
          else if (status !== "abandoned") setRecent((p) => [{ order_no: a.data.order.order_no ?? "-", status, sec: Number(j.duration_sec) || 0, at: new Date().toISOString() }, ...p].slice(0, 30));
        } catch { toast.error(`เน็ตหลุด — บันทึกออเดอร์ ${a.data.order.order_no ?? ""} ไม่สำเร็จ`); }
      }
      setSavingCount((n) => Math.max(0, n - 1));
    })();
  }, [packerName, settings.station, toast]);

  // ── เริ่มแพ็คออเดอร์ ──
  const startPacking = useCallback(async (d: Lookup) => {
    setPending(null); setBlocked(null);
    let sessionId: string | null = null;
    try {
      const r = await apiFetch("/api/packing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", order_id: d.order.id, scanned_code: d.scanned_code, station: settings.station }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { say("error", j.error || "เริ่มแพ็คไม่สำเร็จ", "error"); return; }
      sessionId = j.session?.id ?? null;
    } catch { say("error", "เน็ตหลุด — เริ่มแพ็คไม่ได้ ลองยิงใหม่", "error"); return; }
    const a: Active = { sessionId, data: d, lines: toLines(d.items), boxUsed: null, wrongScans: [], overScans: 0, checkedAt: null };
    activeRef.current = a;
    setActive(a);
    autoClipRef.current = null;
    const started = settings.record ? recRef.current.start(overlayFor(d)) : false;
    if (settings.record && !started) say("warn", "กล้องยังไม่พร้อม — ออเดอร์นี้ไม่มีคลิป (การแพ็คยังบันทึก)", "warn");
    else say("ok", `เปิดออเดอร์ ${d.order.order_no ?? ""}`, "ok");
  }, [overlayFor, say, settings.record, settings.station]);

  const openOrder = useCallback(async (d: Lookup, confirmed = false) => {
    if (d.gate.level === "block") { setPending(null); setBlocked({ order_no: d.order.order_no, reasons: d.gate.reasons }); say("error", d.gate.reasons[0] ?? "ห้ามแพ็ค", "error"); return; }
    if (d.gate.level === "warn" && !confirmed) { setBlocked(null); setPending(d); say("warn", d.gate.reasons[0] ?? "ตรวจสอบก่อนแพ็ค", "warn"); return; }
    await startPacking(d);
  }, [say, startPacking]);

  // ── จบแบบ "เสร็จ" (เช็กไม่ครบต้องกดซ้ำยืนยัน → บันทึกเป็นมีปัญหา: ของขาด) ──
  const requestDone = useCallback((method: FinishMethod) => {
    const a = activeRef.current;
    if (!a) return;
    if (allChecked(a.lines)) { sound("done"); void finish("done", method); return; }
    const now = Date.now();
    if (now - doneConfirmAt.current < 4000) { sound("warn"); void finish("problem", method, "missing", "จบทั้งที่เช็กไม่ครบ"); return; }
    doneConfirmAt.current = now;
    const p = checkProgress(a.lines);
    say("warn", `ยังเช็กไม่ครบ (${p.done}/${p.total}) — กดจบอีกครั้งใน 4 วิ = บันทึกเป็น "มีปัญหา: ของขาด" · หรือติ๊กมือที่รายการ`, "warn");
  }, [finish, say, sound]);

  // ── ตัวรับรหัสทุกทาง (เครื่องยิง / กล้อง / พิมพ์) ──
  const handleScan = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    const cmd = parsePackCommand(code);
    const a = activeRef.current;
    if (cmd) {
      if (cmd.kind === "box") {
        if (!a) { say("info", `การ์ดกล่อง ${cmd.box} — ยิงใบปะหน้าก่อน`); return; }
        const next = { ...a, boxUsed: cmd.box }; activeRef.current = next; setActive(next); say("ok", `ใช้กล่อง ${cmd.box}`, "ok"); return;
      }
      if (!a) {
        if (cmd.kind === "done" && pendingRef.current) { await openOrder(pendingRef.current, true); return; }
        say("info", "ยังไม่มีออเดอร์ที่กำลังแพ็ค — ยิงใบปะหน้าก่อน"); return;
      }
      if (cmd.kind === "done") requestDone("card");
      else if (cmd.kind === "problem") { setProblemOpen(true); sound("warn"); }
      else if (cmd.kind === "skip") { void finish("abandoned", "card"); say("info", "ข้ามออเดอร์นี้แล้ว (ไม่บันทึกว่าแพ็ค)"); }
      else if (cmd.kind === "redo") {
        await recRef.current.stop({ discard: true });
        autoClipRef.current = null;
        const ok = settings.record && recRef.current.start(overlayFor(a.data));
        say(ok ? "ok" : "warn", ok ? "เริ่มอัดคลิปใหม่" : "กล้องยังไม่พร้อม", ok ? "ok" : "warn");
      }
      return;
    }

    // กำลังแพ็คอยู่ → ลองนับเป็นสินค้าก่อน
    if (a) {
      const r = applyItemScan(a.lines, code);
      if (r.result.kind === "ok") {
        const lines = r.items as Line[];
        const all = allChecked(lines);
        const next = { ...a, lines, checkedAt: all ? a.checkedAt ?? new Date().toISOString() : a.checkedAt };
        activeRef.current = next; setActive(next);
        if (all) say("ok", "ของครบแล้ว — ปิดกล่องแล้วจบได้เลย", "done"); else sound("ok");
        return;
      }
      if (r.result.kind === "over") {
        const next = { ...a, overScans: a.overScans + 1 }; activeRef.current = next; setActive(next);
        say("error", "เกินจำนวนที่สั่ง — เอาชิ้นที่เกินออก", "error"); return;
      }
    }

    // ไม่ใช่สินค้าในออเดอร์ → ลองค้นเป็นใบปะหน้า
    busyRef.current = true; setBusy(true);
    try {
      const res = await lookup(code);
      if (res.data) {
        const d = res.data;
        if (a && d.order.id === a.data.order.id) { say("info", "ออเดอร์นี้กำลังแพ็คอยู่"); return; }
        const p = pendingRef.current;
        if (!a && p && p.order.id === d.order.id) { await openOrder(d, true); return; }   // ยิงใบเดิมซ้ำ = ยืนยันแพ็คต่อ
        if (a) {
          if (allChecked(a.lines)) { sound("done"); await finish("done", "next_label"); }
          else { await finish("problem", "next_label", "missing", "ยิงใบถัดไปทั้งที่เช็กไม่ครบ"); toast.warning(`ออเดอร์ ${a.data.order.order_no ?? ""} ยังเช็กไม่ครบ — บันทึกเป็น "มีปัญหา: ของขาด"`); }
        }
        await openOrder(d);
        return;
      }
      if (a) {
        const next = { ...a, wrongScans: [...a.wrongScans, code].slice(-50) }; activeRef.current = next; setActive(next);
        say("error", `สินค้านี้ไม่อยู่ในออเดอร์ (${code})`, "error"); return;
      }
      if (res.notFound) { say("error", res.error ?? "ไม่พบออเดอร์", "error"); return; }
      say("error", res.error ?? "ค้นไม่สำเร็จ", "error");
    } finally { busyRef.current = false; setBusy(false); }
  }, [finish, lookup, openOrder, overlayFor, requestDone, say, settings.record, sound, toast]);
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  useScanGun((code) => { void handleScan(code); }, { enabled: tab === "station" });

  // แป้นเหยียบ / Spacebar / F9 = จบ (ไม่นับตอนพิมพ์ในช่อง หรือเป็นส่วนหนึ่งของการยิงรัว)
  useEffect(() => {
    if (tab !== "station") return;
    let lastKey = 0;
    const h = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastKey;
      lastKey = now;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
      if (document.querySelector("[data-erp-modal]")) return;
      if ((e.code === "Space" || e.code === "F9") && gap > 150 && !e.repeat) {
        if (!activeRef.current && !pendingRef.current) return;
        e.preventDefault();
        if (activeRef.current) requestDone(e.code === "F9" ? "pedal" : "button");
        else if (pendingRef.current) void openOrder(pendingRef.current, true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openOrder, requestDone, tab]);

  // กันปิดแท็บตอนกำลังบันทึก/แพ็คอยู่
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (activeRef.current || savingCount > 0) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [savingCount]);

  const manualTick = (key: string, reason: string) => {
    const a = activeRef.current;
    if (!a) return;
    const lines = a.lines.map((l) => (l.key === key && itemCount(l) < l.qty ? { ...l, manual: l.manual + 1, reason } : l));
    const all = allChecked(lines);
    const next = { ...a, lines, checkedAt: all ? a.checkedAt ?? new Date().toISOString() : a.checkedAt };
    activeRef.current = next; setActive(next);
    sound(all ? "done" : "ok");
  };
  const undoLine = (key: string) => {
    const a = activeRef.current;
    if (!a) return;
    const lines = a.lines.map((l) => (l.key === key ? { ...l, scanned: 0, manual: 0, reason: null } : l));
    const next = { ...a, lines, checkedAt: null }; activeRef.current = next; setActive(next);
  };
  const setBox = (name: string) => {
    const a = activeRef.current;
    if (!a) return;
    const next = { ...a, boxUsed: name }; activeRef.current = next; setActive(next);
  };

  const todayDone = recent.filter((r) => r.status === "done");
  const avgSec = todayDone.length ? Math.round(todayDone.reduce((s, r) => s + r.sec, 0) / todayDone.length) : 0;

  const updateSettings = (v: StationSettingsValue) => { setSettings(v); saveSettings(v); };

  return (
    <div className="flex flex-col gap-3 pb-28 lg:pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScrollTabs activeKey={tab} className="min-w-0 flex-1">
          {([["station", "สถานีแพ็ค"], ["clips", "คลิปในเครื่องนี้"], ["settings", "ตั้งค่าสถานี"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} data-tab-key={k} type="button" onClick={() => setTab(k)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </ScrollTabs>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">ช่วงทดลอง · คลิปเก็บในเครื่องนี้</span>
        <Link href="/print/packing-cards" target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
          <Icon name="print" /> พิมพ์การ์ดคำสั่ง
        </Link>
      </div>

      {tab === "clips" && <LocalClipsPanel keepDays={settings.keepDays} />}
      {tab === "settings" && <StationSettings value={settings} onChange={updateSettings} devices={rec.devices} canDetect={rec.canDetect} mime={rec.mime} />}

      {tab === "station" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,0.9fr)_1.4fr]">
          {/* ซ้าย: กล้อง + ช่องยิง + สรุปวันนี้ */}
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              <video ref={rec.videoRef} className="hidden" muted playsInline />
              <canvas ref={rec.canvasRef} className="block aspect-video max-h-[32vh] w-full object-contain lg:max-h-none" />
              {!settings.record && <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">ปิดกล้องไว้ (ตั้งค่าสถานี)</div>}
              {settings.record && rec.status !== "on" && (
                <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-200">
                  {rec.status === "error" ? (<div className="space-y-2"><p>{rec.error}</p><button type="button" onClick={() => void rec.retry()} className="rounded-lg bg-white px-3 py-1.5 text-slate-900">ลองเปิดกล้องอีกครั้ง</button></div>) : "กำลังเปิดกล้อง…"}
                </div>
              )}
              {rec.recording && (
                <div className={`absolute right-2 top-2 rounded-lg px-2.5 py-1 text-lg font-bold tabular-nums text-white ${CLIP_MAX_SEC - rec.elapsed <= 15 ? "bg-orange-500" : "bg-red-600"}`}>
                  ● {Math.max(0, CLIP_MAX_SEC - rec.elapsed)}
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); const v = typed; setTyped(""); void handleScan(v); }} className="flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ยิงบาร์โค้ด หรือพิมพ์เลขออเดอร์/เลขพัสดุ แล้วกด Enter"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" inputMode="text" autoComplete="off" />
              <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "กำลังค้น…" : "ค้น"}</button>
            </form>

            <div className="hidden rounded-xl border border-slate-200 bg-white p-3 lg:block">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">รอบนี้ ({packerName})</span>
                <span className="text-slate-500">เสร็จ {todayDone.length} · เฉลี่ย {fmtSec(avgSec)}{savingCount > 0 ? ` · กำลังบันทึก ${savingCount}` : ""}</span>
              </div>
              {recent.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีออเดอร์ที่แพ็คในรอบนี้</p> : (
                <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                  {recent.map((r) => (
                    <li key={r.at} className="flex justify-between gap-2">
                      <span className="truncate">{r.order_no}</span>
                      <span className={r.status === "done" ? "text-emerald-700" : "text-red-600"}>{r.status === "done" ? "เสร็จ" : "มีปัญหา"} · {fmtSec(r.sec)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ขวา: ออเดอร์ */}
          <div className="flex min-w-0 flex-col gap-3">
            {flash && (
              <div role="status" className={`rounded-xl px-4 py-3 text-base font-semibold ${flash.tone === "ok" ? "bg-emerald-50 text-emerald-800" : flash.tone === "error" ? "bg-red-600 text-white" : flash.tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                {flash.text}
              </div>
            )}

            {blocked && !active && (
              <div className="rounded-xl bg-red-600 p-6 text-center text-white">
                <p className="text-3xl font-bold">ห้ามแพ็ค</p>
                <p className="mt-1 text-lg">{blocked.order_no}</p>
                {blocked.reasons.map((r) => <p key={r} className="mt-2">{r}</p>)}
                <button type="button" onClick={() => setBlocked(null)} className="mt-4 rounded-lg bg-white/20 px-4 py-2 text-sm">ปิด</button>
              </div>
            )}

            {pending && !active && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
                <p className="text-lg font-bold text-amber-900">ตรวจสอบก่อนแพ็ค · {pending.order.order_no}</p>
                {pending.gate.reasons.map((r) => <p key={r} className="mt-1 text-amber-900">{r}</p>)}
                <p className="mt-2 text-sm text-amber-800">ยิงใบปะหน้าใบเดิมซ้ำ / การ์ด "แพ็คเสร็จ" / กด Space = แพ็คต่อ</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void openOrder(pending, true)} className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white">แพ็คต่อ</button>
                  <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-amber-300 px-4 py-2 text-amber-900">ไม่แพ็ค</button>
                </div>
              </div>
            )}

            {!active && !pending && !blocked && (
              <div className="grid min-h-[220px] place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
                <div>
                  <Icon name="package" className="text-5xl text-slate-300" />
                  <p className="mt-2 text-xl font-semibold text-slate-700">ยิงใบปะหน้า หรือเลขออเดอร์ เพื่อเริ่ม</p>
                  <p className="mt-1 text-sm text-slate-500">กล้องจะเริ่มอัดทันที (ไม่เกิน {CLIP_MAX_SEC} วิ) · ยิงใบถัดไป = จบใบเดิมอัตโนมัติ</p>
                  <p className="mt-1 text-xs text-slate-400">ยิงได้ทั้งเลขพัสดุและเลขออเดอร์ · Shopee เลขพัสดุเข้าระบบหลังกดจัดส่งแล้ว (รอบดึงทุก 15 นาที)</p>
                </div>
              </div>
            )}

            {active && <OrderPanel a={active} boxes={boxes} onManual={manualTick} onUndo={undoLine} onBox={setBox} />}

            {active && problemOpen && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
                <p className="font-semibold text-red-800">มีปัญหาอะไร? (กดเลือก = จบออเดอร์นี้)</p>
                <input value={problemNote} onChange={(e) => setProblemNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="mt-2 w-full rounded-lg border border-red-200 px-3 py-2 text-sm" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {PACK_PROBLEMS.map((p) => (
                    <button key={p.key} type="button" onClick={() => { sound("warn"); void finish("problem", "button", p.key, problemNote.trim() || undefined); }} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">{p.label}</button>
                  ))}
                  <button type="button" onClick={() => setProblemOpen(false)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">ยกเลิก</button>
                </div>
              </div>
            )}

            {active && (
              <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <button type="button" onClick={() => requestDone("button")} className={`flex-1 rounded-xl py-4 text-xl font-bold text-white ${allChecked(active.lines) ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/70"}`}>
                  แพ็คเสร็จ <span className="hidden text-sm font-normal lg:inline">(Space / แป้นเหยียบ / การ์ด)</span>
                </button>
                <button type="button" onClick={() => setProblemOpen((v) => !v)} className="rounded-xl border-2 border-red-300 px-4 text-sm font-semibold text-red-700">มีปัญหา</button>
                <button type="button" onClick={() => void handleScan("*PK-SKIP")} className="hidden rounded-xl border border-slate-300 px-3 text-sm text-slate-600 sm:block">ข้าม</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── แผงออเดอร์ที่กำลังแพ็ค ──
function OrderPanel({ a, boxes, onManual, onUndo, onBox }: { a: Active; boxes: BoxSize[]; onManual: (key: string, reason: string) => void; onUndo: (key: string) => void; onBox: (name: string) => void }) {
  const o = a.data.order;
  const p = checkProgress(a.lines);
  const boxName = a.boxUsed ?? a.data.box?.name ?? null;
  const boxInfo = useMemo(() => boxes.find((b) => b.name === boxName) ?? a.data.box, [boxes, boxName, a.data.box]);
  const [boxOpen, setBoxOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xl font-bold text-slate-900">{o.order_no}</p>
          <span className="text-sm text-slate-500">{[o.platform, o.carrier].filter(Boolean).join(" · ")}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          {o.customer_name ?? ""}{o.tracking_no ? ` · พัสดุ ${o.tracking_no}` : o.package_no ? ` · แพ็กเกจ ${o.package_no}` : ""}
          {o.cod_amount > 0 && <span className="ml-1 rounded bg-amber-100 px-1.5 text-amber-800">เก็บปลายทาง ฿{o.cod_amount.toLocaleString()}</span>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">กล่องที่ใช้ {a.boxUsed && a.boxUsed !== a.data.box?.name ? "(เปลี่ยนเอง)" : "(แนะนำ)"}</p>
          {boxName ? (
            <p className="text-3xl font-bold text-slate-900">{boxName} <span className="text-sm font-normal text-slate-500">{boxSizeText(boxInfo)}</span></p>
          ) : <p className="text-lg font-semibold text-amber-700">ยังไม่ได้ตั้งกล่อง — เลือกกล่องที่ใช้จริง</p>}
          {a.data.missing_box && boxName && <p className="text-xs text-amber-700">บางรายการยังไม่ได้ตั้งกล่อง</p>}
          <button type="button" onClick={() => setBoxOpen((v) => !v)} className="mt-1 text-xs text-sky-700 underline">เปลี่ยนกล่อง</button>
          {boxOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boxes.map((b) => (
                <button key={b.name} type="button" onClick={() => { onBox(b.name); setBoxOpen(false); }} className={`rounded-lg border px-2 py-1 text-xs ${b.name === boxName ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>{b.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className={`rounded-xl border p-3 ${a.data.notes.length || o.buyer_note ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs text-slate-500">หมายเหตุพิเศษ</p>
          {!a.data.notes.length && !o.buyer_note && <p className="text-sm text-slate-400">ไม่มี</p>}
          {a.data.notes.map((n) => (
            <div key={n.parent} className="mt-1 text-sm text-amber-900">
              {n.flags.map((f) => <span key={f} className="mr-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium">{f}</span>)}
              {n.text} <span className="text-xs text-amber-700">({n.parent})</span>
            </div>
          ))}
          {o.buyer_note && <p className="mt-1 text-sm font-medium text-amber-900">ลูกค้าเขียน: “{o.buyer_note}”</p>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <p className="font-semibold text-slate-800">เช็กของ</p>
          <p className={`text-sm font-semibold ${p.done >= p.total ? "text-emerald-700" : "text-slate-600"}`}>{p.done}/{p.total} ชิ้น</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {a.lines.map((l) => {
            const n = itemCount(l), done = n >= l.qty;
            const img = r2ImageUrl(l.info.image_key, 160);
            return (
              <li key={l.key} className={`flex items-center gap-3 px-3 py-2 ${done ? "bg-emerald-50" : ""}`}>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-300"><Icon name="image" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{l.info.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {l.info.sku_code ?? l.info.shop_code ?? "-"}{l.info.color ? ` · ${l.info.color}` : ""}
                    {l.info.level === "parent" && <span className="ml-1 text-amber-700">(รู้แค่รุ่น ไม่รู้สี)</span>}
                    {l.info.level === "none" && <span className="ml-1 text-amber-700">(จับคู่สินค้าไม่ได้ — ติ๊กมือ)</span>}
                  </p>
                  {l.manual > 0 && <p className="text-xs text-slate-500">ติ๊กมือ {l.manual} · {l.reason}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-lg font-bold tabular-nums ${done ? "text-emerald-700" : "text-slate-700"}`}>{done ? "✓ " : ""}{n}/{l.qty}</span>
                  {!done ? (
                    <select value="" onChange={(e) => { if (e.target.value) onManual(l.key, e.target.value); }} className="max-w-[120px] rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600">
                      <option value="">ติ๊กมือ…</option>
                      {MANUAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : <button type="button" onClick={() => onUndo(l.key)} className="text-xs text-slate-400 underline">เริ่มนับใหม่</button>}
                </div>
              </li>
            );
          })}
        </ul>
        {(a.wrongScans.length > 0 || a.overScans > 0) && (
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-red-600">ยิงผิด {a.wrongScans.length} ครั้ง{a.overScans ? ` · ยิงเกิน ${a.overScans} ครั้ง` : ""}</p>
        )}
      </div>
    </div>
  );
}
