"use client";

/**
 * 📦 สถานีแพ็คสินค้า (ช่วงทดลอง) — docs/packing-station.md
 *
 * ยิงใบปะหน้า/เลขออเดอร์ หรือกดเลือกจากคิว → เปิดออเดอร์ + กล้องเริ่มอัด (≤ 60 วิ) → ยิงสินค้าเช็กของ → จบ
 * วิธีจบ (เจ้าของเลือก F1/F2/F3/F5): ยิงใบปะหน้าใบถัดไป · การ์ดบาร์โค้ด *PK-DONE · แป้นเหยียบ (Space/F9) · ปุ่มใหญ่
 * รอบ 3 (2026-11-19): คิวรอแพ็คให้เลือก (เครื่องยิงเสีย) · ย้อนการยิง / ย้อนออเดอร์ที่เพิ่งจบ / แก้ประวัติวันนี้ · ไม่มีกล้องก็แพ็คได้
 * กติกา = lib/packing · API = /api/packing · คลิปเก็บในเครื่องนี้ (clip-store) จนกว่าจะเชื่อม NAS
 * ⚠️ ไม่ตัดสต๊อก ไม่ส่งสถานะไปร้านค้า
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { shortcutKey } from "@/lib/shortcut-key";
import { useScanGun } from "@/components/scan-input/use-scan-gun";
import { ScrollTabs } from "@/components/scroll-tabs";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { usePageOwnsBottomBar } from "@/lib/app-shell-bar";
import {
  applyItemScan, allChecked, boxSizeText, checkProgress, itemCount, parsePackCommand, undoItemScan, isFreshLock, CLIP_MAX_SEC, MANUAL_REASONS, PACK_PROBLEMS,
  type CheckItem, type FinishMethod, type PackFinishStatus, type PackGate, type BoxSize,
} from "@/lib/packing";
import { useClipRecorder, type RecordedClip } from "./use-clip-recorder";
import { saveClip, sha256Hex, pruneClips, requestPersist } from "./clip-store";
import { playPackSound, setPackMasterVolume, type PackSound } from "./sounds";
import { usePackSoundBank } from "./sound-bank";
import { packAlertSound } from "@/lib/packing-sound";
import { LocalClipsPanel } from "./local-clips";
import { StationSettings, loadSettings, saveSettings, type StationSettingsValue } from "./settings";
import { PackQueue, type QueueRow } from "./queue";
import { TodayPacked, type TodaySession } from "./today-list";

// ── ข้อมูลจาก /api/packing ──
type ApiItem = { id: string; name: string; shop_code: string | null; sku_code: string | null; color: string | null; qty: number; image_key: string | null; matched: boolean; level: "sku" | "parent" | "none"; box: string | null; codes: string[] };
type ApiOrder = { id: string; order_no: string | null; platform: string | null; platform_code: string | null; customer_name: string | null; status: string; platform_status: string | null; ship_by_at: string | null; tracking_no: string | null; package_no: string | null; carrier: string | null; cod_amount: number; packed_at: string | null; packed_by_name: string | null; buyer_note: string | null };
type ApiSession = { id: string; status: string; packer_id: string | null; packer_name: string | null; started_at: string };
type Lookup = { order: ApiOrder; items: ApiItem[]; box: BoxSize | null; missing_box: boolean; notes: { text: string; flags: string[]; parent: string }[]; gate: PackGate; scanned_code: string; sessions?: ApiSession[] };

type Line = CheckItem & { info: ApiItem; reason: string | null };
type Step = { key: string; kind: "scan" | "manual" };
type Active = {
  sessionId: string | null;
  data: Lookup;
  lines: Line[];
  history: Step[];              // ลำดับการยิง/ติ๊ก — ใช้ "ย้อนการยิงล่าสุด"
  boxUsed: string | null;
  wrongScans: string[];
  overScans: number;
  checkedAt: string | null;
};
type Flash = { tone: "ok" | "error" | "warn" | "info"; text: string; at: number };
type Tab = "station" | "clips" | "settings";
type PhoneTab = "queue" | "pack" | "done";

const toLines = (items: ApiItem[]): Line[] => items.map((it) => ({ key: it.id, qty: it.qty, codes: it.codes, scanned: 0, manual: 0, info: it, reason: null }));
const jpost = (body: Record<string, unknown>) => apiFetch("/api/packing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function PackingStation({ packerName, packerId }: { packerName: string; packerId: string | null }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("station");
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("queue");
  const [settings, setSettings] = useState<StationSettingsValue>(() => loadSettings());
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [pending, setPending] = useState<Lookup | null>(null);
  const [blocked, setBlocked] = useState<{ order_no: string | null; reasons: string[] } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemNote, setProblemNote] = useState("");
  const [typed, setTyped] = useState("");
  const [savingCount, setSavingCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((n) => n + 1), []);

  const activeRef = useRef<Active | null>(null);
  const pendingRef = useRef<Lookup | null>(null);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const autoClipRef = useRef<RecordedClip | null>(null);       // คลิปที่หยุดเองตอนครบ 60 วิ (ออเดอร์ยังไม่จบ)
  const doneConfirmAt = useRef(0);                              // กดจบตอนยังเช็กไม่ครบ = กดซ้ำภายใน 4 วิ เพื่อยืนยัน
  const busyRef = useRef(false);
  const isPhone = useMediaQuery("(max-width: 1023px)");
  const soundBank = usePackSoundBank();                              // ชุดเสียงกลาง (ใช้ร่วมทุกโต๊ะ)
  useEffect(() => { setPackMasterVolume(settings.soundVolume); }, [settings.soundVolume]);
  usePageOwnsBottomBar(isPhone && !!active && tab === "station");   // มือถือ: แถบปุ่มจบของหน้านี้อยู่ล่างจอ แทนแถบเมนูแอป

  const setAct = useCallback((a: Active | null) => { activeRef.current = a; setActive(a); }, []);
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
  const camOk = settings.record && rec.status === "on";

  // ทะเบียนกล่อง + ลบคลิปในเครื่องที่เก่าเกินกำหนด + ขอเบราว์เซอร์อย่าลบที่เก็บเอง
  useEffect(() => {
    apiFetch("/api/packing?boxes=1").then((r) => r.json()).then((j: { boxes?: BoxSize[] }) => setBoxes(j.boxes ?? [])).catch(() => {});
    void requestPersist();
    void pruneClips(settings.keepDays).catch(() => {});
  }, [settings.keepDays]);

  useEffect(() => { if (flash) { const t = window.setTimeout(() => setFlash((f) => (f?.at === flash.at ? null : f)), 4500); return () => window.clearTimeout(t); } }, [flash]);

  const overlayFor = useCallback((d: Lookup) => ({ order: d.order.order_no ?? "-", tracking: d.order.tracking_no ?? d.order.package_no ?? "", packer: packerName, station: settings.station }), [packerName, settings.station]);

  // ── ค้นออเดอร์ (รหัสที่ยิง หรือ id จากคิว) ──
  const lookup = useCallback(async (q: { code?: string; orderId?: string }): Promise<{ data?: Lookup; notFound?: boolean; error?: string }> => {
    try {
      const qs = q.orderId ? `order_id=${encodeURIComponent(q.orderId)}` : `code=${encodeURIComponent(q.code ?? "")}`;
      const r = await apiFetch(`/api/packing?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 && j.not_found) return { notFound: true, error: j.error };
      if (!r.ok) return { error: j.error || "ค้นออเดอร์ไม่สำเร็จ ลองใหม่" };
      return { data: j as Lookup };
    } catch { return { error: "เน็ตหลุด — ค้นออเดอร์ไม่ได้ ลองใหม่" }; }
  }, []);

  // ── เริ่มแพ็คออเดอร์ (restore = เปิดกลับมาจากปุ่มย้อนกลับ: คืนผลเช็กของ/กล่องเดิม) ──
  const startPacking = useCallback(async (d: Lookup, restore?: Pick<Active, "lines" | "history" | "boxUsed" | "checkedAt">) => {
    setPending(null); setBlocked(null);
    let sessionId: string | null = null;
    try {
      const r = await jpost({ action: "start", order_id: d.order.id, scanned_code: d.scanned_code, station: settings.station });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { say("error", j.error || "เริ่มแพ็คไม่สำเร็จ", "error"); return; }
      sessionId = j.session?.id ?? null;
    } catch { say("error", "เน็ตหลุด — เริ่มแพ็คไม่ได้ ลองใหม่", "error"); return; }
    setAct({ sessionId, data: d, lines: restore?.lines ?? toLines(d.items), history: restore?.history ?? [], boxUsed: restore?.boxUsed ?? null, wrongScans: [], overScans: 0, checkedAt: restore?.checkedAt ?? null });
    setPhoneTab("pack");
    autoClipRef.current = null;
    const started = settings.record ? recRef.current.start(overlayFor(d)) : false;
    if (settings.record && !started) say("warn", `เปิดออเดอร์ ${d.order.order_no ?? ""} · กล้องไม่พร้อม — ออเดอร์นี้ไม่มีคลิป`, "warn");
    else say("ok", `เปิดออเดอร์ ${d.order.order_no ?? ""}`, "ok");
  }, [overlayFor, say, setAct, settings.record, settings.station]);

  // ── จบออเดอร์ (หยุดกล้องก่อน แล้วบันทึกเบื้องหลัง ไม่ให้ออเดอร์ถัดไปรอ) ──
  const reopenRef = useRef<(a: Active, sessionId: string) => void>(() => {});
  const finish = useCallback(async (status: PackFinishStatus, method: FinishMethod | null, problem?: string, note?: string) => {
    const a = activeRef.current;
    if (!a) return;
    setAct(null); setProblemOpen(false); setProblemNote(""); doneConfirmAt.current = 0;
    setPhoneTab("queue");
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
          const res = await jpost({
            action: "finish", session_id: a.sessionId, status, finish_method: method, problem, problem_note: note,
            box_used: a.boxUsed ?? a.data.box?.name ?? null, box_suggested: a.data.box?.name ?? null, checked_at: a.checkedAt,
            checks: { lines: a.lines.map((l) => ({ id: l.key, qty: l.qty, scanned: l.scanned, manual: l.manual, reason: l.reason })), wrong_scans: a.wrongScans, over_scans: a.overScans },
            clip: clipMeta,
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) toast.error(j.error || `บันทึกออเดอร์ ${a.data.order.order_no ?? ""} ไม่สำเร็จ`);
          else if (status !== "abandoned") {
            // ข้อเสนอ 1: ย้อนออเดอร์ที่เพิ่งจบได้ 10 วิ (เปิดกลับมาแพ็คต่อ พร้อมผลเช็กของเดิม)
            const sid = a.sessionId;
            toast.action(`${status === "done" ? "แพ็คเสร็จ" : "บันทึกมีปัญหา"} · ${a.data.order.order_no ?? ""}`, "ย้อนกลับ", () => reopenRef.current(a, sid), { variant: status === "done" ? "success" : "warning", ms: 10_000 });
          }
        } catch { toast.error(`เน็ตหลุด — บันทึกออเดอร์ ${a.data.order.order_no ?? ""} ไม่สำเร็จ`); }
      }
      setSavingCount((n) => Math.max(0, n - 1));
      bump();
    })();
  }, [bump, packerName, setAct, settings.station, toast]);

  // ── ตรวจก่อนเปิด: ห้ามแพ็ค / เตือน / มีคนอื่นกำลังแพ็คอยู่ (ข้อเสนอ 4) ──
  const openOrder = useCallback(async (d: Lookup, confirmed = false) => {
    // มือถือ: แผงห้ามแพ็ค/ถามก่อนแพ็ค อยู่แท็บ "แพ็ค" → สลับไปให้เห็นปุ่มทันที
    if (d.gate.level === "block") { setPending(null); setBlocked({ order_no: d.order.order_no, reasons: d.gate.reasons }); setPhoneTab("pack"); say("error", d.gate.reasons[0] ?? "ห้ามแพ็ค", packAlertSound(d.order, false, true) ?? "error"); return; }
    const other = (d.sessions ?? []).find((s) => s.status === "packing" && s.packer_id !== packerId && isFreshLock(s.started_at));
    const reasons = [...(other ? [`${other.packer_name ?? "มีคน"} กำลังแพ็คออเดอร์นี้อยู่ — แพ็คแทน?`] : []), ...d.gate.reasons];
    if (reasons.length && !confirmed) { setBlocked(null); setPending({ ...d, gate: { level: "warn", reasons } }); setPhoneTab("pack"); say("warn", reasons[0], packAlertSound(d.order, !!other, false) ?? "warn"); return; }
    await startPacking(d);
  }, [packerId, say, startPacking]);

  // ย้อนกลับจากแจ้งเตือน: ยกเลิกบันทึกเดิม (voided · เก็บประวัติ) แล้วเปิดออเดอร์เดิมพร้อมผลเช็กของ
  reopenRef.current = (a: Active, sessionId: string) => {
    if (activeRef.current) { toast.warning("จบหรือปิดออเดอร์ที่กำลังแพ็คก่อน แล้วค่อยกดแพ็คใหม่จาก \"แพ็คแล้ววันนี้\""); return; }
    void (async () => {
      const r = await jpost({ action: "reopen", session_id: sessionId, reason: "ย้อนกลับจากแจ้งเตือน" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || "ย้อนกลับไม่สำเร็จ"); return; }
      bump();
      await startPacking({ ...a.data, gate: { level: "ok", reasons: [] } }, { lines: a.lines, history: a.history, boxUsed: a.boxUsed, checkedAt: a.checkedAt });
    })();
  };

  // แพ็คใหม่จาก "แพ็คแล้ววันนี้" (ข้อเสนอ 2)
  const repack = useCallback(async (s: TodaySession) => {
    if (activeRef.current) { toast.warning("จบหรือปิดออเดอร์ที่กำลังแพ็คก่อน"); return; }
    const r = await jpost({ action: "reopen", session_id: s.id, reason: "แพ็คใหม่จากรายการวันนี้" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || "เปิดกลับมาแพ็คไม่สำเร็จ"); return; }
    bump();
    const res = await lookup({ orderId: s.order_id });
    if (res.data) await openOrder(res.data, true);
    else toast.error(res.error ?? "เปิดออเดอร์ไม่สำเร็จ");
  }, [bump, lookup, openOrder, toast]);

  // เลือกจากคิว (แทนการยิงใบปะหน้า)
  const pickFromQueue = useCallback(async (row: QueueRow) => {
    const a = activeRef.current;
    if (a) {
      if (a.data.order.id === row.id) { setPhoneTab("pack"); return; }
      toast.warning(`กำลังแพ็ค ${a.data.order.order_no ?? ""} อยู่ — กด "แพ็คเสร็จ" หรือ "ปิดออเดอร์นี้" ก่อน`); return;
    }
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const res = await lookup({ orderId: row.id });
      if (res.data) await openOrder(res.data);
      else say("error", res.error ?? "เปิดออเดอร์ไม่สำเร็จ", "error");
    } finally { busyRef.current = false; setBusy(false); }
  }, [lookup, openOrder, say, toast]);

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

  // ── ย้อนการยิงล่าสุด (ข้อเสนอ 3: ปุ่ม · การ์ด *PK-UNDO · Ctrl+Z) ──
  const undoLast = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const last = a.history[a.history.length - 1];
    if (!last) { say("info", "ยังไม่มีการยิงให้ย้อน"); return; }
    const lines = undoItemScan(a.lines, last.key, last.kind);
    setAct({ ...a, lines, history: a.history.slice(0, -1), checkedAt: allChecked(lines) ? a.checkedAt : null });
    const l = a.lines.find((x) => x.key === last.key);
    say("info", `ย้อนแล้ว: ${l?.info.sku_code ?? l?.info.name ?? ""} −1`, "ok");
  }, [say, setAct]);

  const minusLine = (key: string) => {
    const a = activeRef.current;
    if (!a) return;
    const lines = undoItemScan(a.lines, key, "scan");
    const idx = a.history.map((h) => h.key).lastIndexOf(key);
    setAct({ ...a, lines, history: idx >= 0 ? [...a.history.slice(0, idx), ...a.history.slice(idx + 1)] : a.history, checkedAt: allChecked(lines) ? a.checkedAt : null });
  };

  // ── ตัวรับรหัสทุกทาง (เครื่องยิง / กล้อง / พิมพ์) ──
  const handleScan = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    const cmd = parsePackCommand(code);
    const a = activeRef.current;
    if (cmd) {
      if (cmd.kind === "box") {
        if (!a) { say("info", `การ์ดกล่อง ${cmd.box} — เปิดออเดอร์ก่อน`); return; }
        setAct({ ...a, boxUsed: cmd.box }); say("ok", `ใช้กล่อง ${cmd.box}`, "ok"); return;
      }
      if (!a) {
        if (cmd.kind === "done" && pendingRef.current) { await openOrder(pendingRef.current, true); return; }
        say("info", "ยังไม่มีออเดอร์ที่กำลังแพ็ค — ยิงใบปะหน้าหรือเลือกจากคิวก่อน"); return;
      }
      if (cmd.kind === "done") requestDone("card");
      else if (cmd.kind === "undo") undoLast();
      else if (cmd.kind === "problem") { setProblemOpen(true); sound("warn"); }
      else if (cmd.kind === "skip") { void finish("abandoned", "card"); say("info", "ปิดออเดอร์นี้แล้ว (ไม่บันทึกว่าแพ็ค)"); }
      else if (cmd.kind === "redo") {
        await recRef.current.stop({ discard: true });
        autoClipRef.current = null;
        const ok = settings.record && recRef.current.start(overlayFor(a.data));
        say(ok ? "ok" : "warn", ok ? "เริ่มอัดคลิปใหม่" : "กล้องไม่พร้อม", ok ? "ok" : "warn");
      }
      return;
    }

    // กำลังแพ็คอยู่ → ลองนับเป็นสินค้าก่อน
    if (a) {
      const r = applyItemScan(a.lines, code);
      if (r.result.kind === "ok") {
        const lines = r.items as Line[];
        const all = allChecked(lines);
        setAct({ ...a, lines, history: [...a.history, { key: r.result.key, kind: "scan" }], checkedAt: all ? a.checkedAt ?? new Date().toISOString() : a.checkedAt });
        if (all) say("ok", "ของครบแล้ว — ปิดกล่องแล้วจบได้เลย", "done"); else sound("ok");
        return;
      }
      if (r.result.kind === "over") {
        setAct({ ...a, overScans: a.overScans + 1 });
        say("error", "เกินจำนวนที่สั่ง — เอาชิ้นที่เกินออก", "over"); return;
      }
    }

    // ไม่ใช่สินค้าในออเดอร์ → ลองค้นเป็นใบปะหน้า
    busyRef.current = true; setBusy(true);
    try {
      const res = await lookup({ code });
      if (res.data) {
        const d = res.data;
        if (a && d.order.id === a.data.order.id) { say("info", "ออเดอร์นี้กำลังแพ็คอยู่"); return; }
        const p = pendingRef.current;
        if (!a && p && p.order.id === d.order.id) { await openOrder(d, true); return; }   // ยิงใบเดิมซ้ำ = ยืนยันแพ็คต่อ
        if (a) {
          if (allChecked(a.lines)) { sound("done"); await finish("done", "next_label"); }
          else { await finish("problem", "next_label", "missing", "ยิงใบถัดไปทั้งที่เช็กไม่ครบ"); toast.warning(`ออเดอร์ ${a.data.order.order_no ?? ""} ยังเช็กไม่ครบ — บันทึกเป็น "มีปัญหา: ของขาด" (แก้ได้ใน "แพ็คแล้ววันนี้")`); }
        }
        await openOrder(d);
        return;
      }
      if (a) {
        setAct({ ...a, wrongScans: [...a.wrongScans, code].slice(-50) });
        say("error", `สินค้านี้ไม่อยู่ในออเดอร์ (${code})`, "error"); return;
      }
      if (res.notFound) { say("error", res.error ?? "ไม่พบออเดอร์", "error"); return; }
      say("error", res.error ?? "ค้นไม่สำเร็จ", "error");
    } finally { busyRef.current = false; setBusy(false); }
  }, [finish, lookup, openOrder, overlayFor, requestDone, say, setAct, settings.record, sound, toast, undoLast]);
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  useScanGun((code) => { void handleScan(code); }, { enabled: tab === "station" });

  // แป้นเหยียบ / Spacebar / F9 = จบ · Ctrl+Z = ย้อนการยิงล่าสุด (ไม่นับตอนพิมพ์ในช่อง หรือเป็นส่วนหนึ่งของการยิงรัว)
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
      if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "z" && activeRef.current) { e.preventDefault(); undoLast(); return; }
      if ((e.code === "Space" || e.code === "F9") && gap > 150 && !e.repeat) {
        if (!activeRef.current && !pendingRef.current) return;
        e.preventDefault();
        if (activeRef.current) requestDone(e.code === "F9" ? "pedal" : "button");
        else if (pendingRef.current) void openOrder(pendingRef.current, true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openOrder, requestDone, tab, undoLast]);

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
    setAct({ ...a, lines, history: [...a.history, { key, kind: "manual" }], checkedAt: all ? a.checkedAt ?? new Date().toISOString() : a.checkedAt });
    sound(all ? "done" : "ok");
  };
  const setBox = (name: string) => { const a = activeRef.current; if (a) setAct({ ...a, boxUsed: name }); };

  const updateSettings = (v: StationSettingsValue) => { setSettings(v); saveSettings(v); };
  const show = (pt: PhoneTab) => !isPhone || phoneTab === pt;   // มือถือ: แยกแท็บ · PC: เห็นหมด

  // ── กล้อง: มีกล้อง = ภาพสด · ไม่ใช้/เสีย = แถบเหลืองเล็ก แพ็คต่อได้ (ข้อเสนอ 5) ──
  const camera = (
    <>
      <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 ${camOk || (settings.record && rec.status === "starting") ? "" : "hidden"}`}>
        <video ref={rec.videoRef} className="hidden" muted playsInline />
        <canvas ref={rec.canvasRef} className="block aspect-video max-h-[28vh] w-full object-contain lg:max-h-none" />
        {rec.status === "starting" && <div className="absolute inset-0 grid place-items-center text-sm text-slate-200">กำลังเปิดกล้อง…</div>}
        {rec.recording && (
          <div className={`absolute right-2 top-2 rounded-lg px-2.5 py-1 text-lg font-bold tabular-nums text-white ${CLIP_MAX_SEC - rec.elapsed <= 15 ? "bg-orange-500" : "bg-red-600"}`}>
            ● {Math.max(0, CLIP_MAX_SEC - rec.elapsed)}
          </div>
        )}
      </div>
      {!settings.record && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Icon name="warning" className="mt-0.5" />
          <div className="min-w-0 flex-1"><b>ไม่ใช้กล้อง</b> — แพ็คได้ปกติ แต่ออเดอร์จะไม่มีคลิป
            <button type="button" onClick={() => updateSettings({ ...settings, record: true })} className="ml-2 text-xs text-amber-800 underline">เปิดกล้อง</button>
          </div>
        </div>
      )}
      {settings.record && rec.status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Icon name="warning" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <b>กล้องใช้ไม่ได้</b> — แพ็คต่อได้ แต่ออเดอร์จะไม่มีคลิป
            <p className="text-xs text-amber-800">{rec.error}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              <button type="button" onClick={() => void rec.retry()} className="underline">ลองเปิดอีกครั้ง</button>
              <button type="button" onClick={() => updateSettings({ ...settings, record: false })} className="underline">ไม่ใช้กล้องที่เครื่องนี้</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

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
      {tab === "settings" && <StationSettings value={settings} onChange={updateSettings} devices={rec.devices} canDetect={rec.canDetect} mime={rec.mime} soundBank={soundBank} />}

      {tab === "station" && isPhone && (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {([["queue", "คิว"], ["pack", active ? `กำลังแพ็ค` : "แพ็ค"], ["done", "แพ็คแล้ว"]] as [PhoneTab, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setPhoneTab(k)} className={`rounded-lg py-1.5 text-sm font-medium ${phoneTab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>
              {label}{k === "pack" && active ? " ●" : ""}
            </button>
          ))}
        </div>
      )}

      {tab === "station" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,0.9fr)_1.4fr]">
          {/* ซ้าย: กล้อง + ช่องยิง + คิวรอแพ็ค */}
          <div className="flex flex-col gap-3">
            <div className={show("pack") ? "flex flex-col gap-3" : "hidden"}>{camera}</div>
            <form onSubmit={(e) => { e.preventDefault(); const v = typed; setTyped(""); void handleScan(v); }} className={`gap-2 ${show("queue") || show("pack") ? "flex" : "hidden"}`}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ยิงบาร์โค้ด หรือพิมพ์เลขออเดอร์/เลขพัสดุ แล้วกด Enter"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" inputMode="text" autoComplete="off" />
              <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "กำลังค้น…" : "ค้น"}</button>
            </form>
            {show("queue") && <PackQueue refreshKey={refreshKey} activeOrderId={active?.data.order.id ?? null} meId={packerId} onPick={(r) => void pickFromQueue(r)} />}
          </div>

          {/* ขวา: ออเดอร์ + แพ็คแล้ววันนี้ */}
          <div className="flex min-w-0 flex-col gap-3">
            {flash && (
              <div role="status" className={`rounded-xl px-4 py-3 text-base font-semibold ${flash.tone === "ok" ? "bg-emerald-50 text-emerald-800" : flash.tone === "error" ? "bg-red-600 text-white" : flash.tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                {flash.text}
              </div>
            )}

            {show("pack") && (
              <>
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
                  <div className="grid min-h-[180px] place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
                    <div>
                      <Icon name="package" className="text-5xl text-slate-300" />
                      <p className="mt-2 text-xl font-semibold text-slate-700">ยิงใบปะหน้า หรือกดเลือกจากคิว</p>
                      <p className="mt-1 text-sm text-slate-500">{camOk ? `กล้องจะเริ่มอัดทันที (ไม่เกิน ${CLIP_MAX_SEC} วิ) · ` : ""}ยิงใบถัดไป = จบใบเดิมอัตโนมัติ · เครื่องยิงเสียก็เลือกจากคิวได้</p>
                      {isPhone && <button type="button" onClick={() => setPhoneTab("queue")} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ไปที่คิวรอแพ็ค</button>}
                    </div>
                  </div>
                )}

                {active && <OrderPanel a={active} boxes={boxes} onManual={manualTick} onMinus={minusLine} onBox={setBox} onUndoLast={undoLast} onClose={() => void handleScan("*PK-SKIP")} />}

                {active && problemOpen && (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
                    <p className="font-semibold text-red-800">มีปัญหาอะไร? (กดเลือก = จบออเดอร์นี้ · แก้ทีหลังได้ใน "แพ็คแล้ววันนี้")</p>
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
                  // z-[35] = ทับแถบเมนูล่างของแอป (z-30) ตอนกำลังแพ็ค — เดิมเมนูทับปุ่ม "แพ็คเสร็จ" บนจอแคบ กดแล้วหลุดออกจากหน้า (เจอตอนทดสอบ 2026-11-19)
                  <div className="fixed inset-x-0 bottom-0 z-[35] flex gap-2 border-t border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={isPhone ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" } : undefined}>
                    <button type="button" onClick={() => requestDone("button")} className={`flex-1 rounded-xl py-4 text-xl font-bold text-white ${allChecked(active.lines) ? "bg-emerald-600 hover:bg-emerald-700" : "bg-emerald-600/70"}`}>
                      แพ็คเสร็จ <span className="hidden text-sm font-normal lg:inline">(Space / แป้นเหยียบ / การ์ด)</span>
                    </button>
                    <button type="button" onClick={() => setProblemOpen((v) => !v)} className="rounded-xl border-2 border-red-300 px-4 text-sm font-semibold text-red-700">มีปัญหา</button>
                  </div>
                )}
              </>
            )}

            {show("done") && <TodayPacked refreshKey={refreshKey} boxes={boxes} onRepack={(s) => void repack(s)} onChanged={bump} />}
            {savingCount > 0 && <p className="text-xs text-slate-400">กำลังบันทึก {savingCount} ออเดอร์…</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── แผงออเดอร์ที่กำลังแพ็ค ──
function OrderPanel({ a, boxes, onManual, onMinus, onBox, onUndoLast, onClose }: {
  a: Active; boxes: BoxSize[]; onManual: (key: string, reason: string) => void; onMinus: (key: string) => void; onBox: (name: string) => void; onUndoLast: () => void; onClose: () => void;
}) {
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <p className="font-semibold text-slate-800">เช็กของ <span className={`ml-1 text-sm ${p.done >= p.total ? "text-emerald-700" : "text-slate-500"}`}>{p.done}/{p.total} ชิ้น</span></p>
          <div className="flex gap-1.5">
            <button type="button" onClick={onUndoLast} disabled={!a.history.length} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40" title="Ctrl+Z หรือการ์ด ย้อนการยิง">
              <Icon name="back" /> ย้อนการยิงล่าสุด
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">ปิดออเดอร์นี้ (ไม่บันทึก)</button>
          </div>
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
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => onMinus(l.key)} disabled={n === 0} aria-label="ลดจำนวน 1 ชิ้น" className="h-7 w-7 rounded-lg border border-slate-200 text-sm disabled:opacity-30">−</button>
                    <span className={`min-w-[44px] text-center text-lg font-bold tabular-nums ${done ? "text-emerald-700" : "text-slate-700"}`}>{n}/{l.qty}</span>
                  </div>
                  {!done && (
                    <select value="" onChange={(e) => { if (e.target.value) onManual(l.key, e.target.value); }} className="max-w-[130px] rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600">
                      <option value="">ติ๊กมือ (ไม่ยิง)…</option>
                      {MANUAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
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
