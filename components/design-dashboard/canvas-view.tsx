"use client";

/**
 * มุมมอง "แคนวาส" ของ Design Dashboard (ต่อแบรนด์) — เจ้าของสั่ง 2026-11-23
 *  • 1 กระดาน = 1 แบรนด์ (หรือกลุ่ม) · entity_type = "design_brand_canvas", entity_id = key แบรนด์ (brand_id / กลุ่ม)
 *  • เปิดครั้งแรก ระบบวางโครงให้: กรอบ (frame) 1 กรอบ = 1 สถานะ (ตามคอลัมน์บอร์ด) · ใบงานของแบรนด์อยู่ในกรอบตามสถานะ
 *  • ลากการ์ดข้ามกรอบ → บันทึกกระดานแล้วระบบเปลี่ยนสถานะใบงานจริง (ผ่านตัวย้ายสถานะของหน้าแม่ → มีย้อนกลับ 5 วิ)
 *  • ใบงานใหม่ / สถานะเปลี่ยนจากที่อื่น → การ์ดไปโผล่/ย้ายเข้ากรอบที่ถูกเอง · ใบที่ออกจากแบรนด์ → เอาการ์ดออก
 *  • วางรูป (Ctrl+V/ลากไฟล์) ลิงก์ Pinterest/TikTok/YouTube ข้อความ กล่อง ได้อิสระ · ลากลูกศรผูกกับการ์ดใบงาน = ของอ้างอิงของใบนั้น (โชว์ในใบงานด้วย)
 *  • ดับเบิลคลิกการ์ด = เปิดป๊อปใบงาน · หลายคนแก้พร้อมกันแบบสด (collab) · Ctrl+Z ย้อนกลับ · ลบชิ้นได้
 * ของกลาง: CanvasSketch · การ์ดใบงานกลาง designSheetCardSkeleton (canvas-cards) · ConfirmDialog · useToast
 * ตรรกะ โซน/snap/ข้ามโซน/ของอ้างอิง อยู่ที่ lib/design-brand-canvas.ts (มีเทสต์)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { useT } from "@/components/i18n";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { designSheetCardSkeleton, dsCardText } from "@/components/canvas-cards/skeletons";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { layoutZones, diffZoneMoves, zoneFrames, sheetCards, ZONE_KIND, SHEET_KIND, ZONE_W, ZONE_GAP, ZONE_HEAD, ZONE_MIN_H, GAPX, GAPY, type CanvasEl } from "@/lib/design-brand-canvas";

const CanvasSketch = dynamicImport(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400">กำลังเปิดกระดาน…</div>,
});

export const BRAND_CANVAS_ENTITY = "design_brand_canvas";

type Col = { key: string; label: string; color: string };
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export function BrandCanvasView({ brandKey, columns, sheets, editable, onMoveStatus, onOpenSheet, height = "calc(100vh - 230px)" }: {
  brandKey: string;
  /** คอลัมน์สถานะตามบอร์ด (ลำดับ/ที่ซ่อน/งานลูกค้า-แบรนด์เรา คิดมาแล้ว) */
  columns: Col[];
  /** ใบงานของแบรนด์นี้ (ทุกสถานะในคอลัมน์) */
  sheets: DesignSheetListItem[];
  editable: boolean;
  onMoveStatus: (sheetId: string, status: string) => void;
  onOpenSheet: (id: string) => void;
  height?: string;
}) {
  const t = useT();
  const toast = useToast();
  const ref = useRef<CanvasSketchControls | null>(null);
  const ready = useRef(false);
  const seen = useRef<Map<string, string>>(new Map());
  const syncing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [askRebuild, setAskRebuild] = useState(false);

  const colOf = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const inCols = useMemo(() => sheets.filter((s) => colOf.has(s.status)), [sheets, colOf]);
  const byId = useMemo(() => new Map(inCols.map((s) => [s.id, s])), [inCols]);

  const cardSk = useCallback((s: DesignSheetListItem, x: number, y: number) => {
    const c = colOf.get(s.status);
    return designSheetCardSkeleton({ id: s.id, code: s.code, name: s.name, brand_name: s.brand_name, status: s.status, deadline: s.deadline, cover_url: s.cover_url }, c?.label, c?.color)
      .map((el) => ({ ...el, x: num(el.x) + x, y: num(el.y) + y }));
  }, [colOf]);

  const zoneName = (c: Col | undefined, n: number) => `${c?.label ?? "?"} · ${n}`;

  // ---- อ่านกระดาน → (เขียนสถานะ) + ผูกเข้ากรอบ + หัวกรอบ · arrange=true (ปุ่ม "จัดหน้า") = จัดการ์ดเข้าช่อง + ความสูงกรอบด้วย ----
  // ปกติไม่จัดเอง (เจ้าของขอ 2026-11-23 "บางทีไม่อยากให้จัดหน้าให้") — วางตรงไหนอยู่ตรงนั้น
  const applyBoardState = useCallback((write: boolean, arrange = false) => {
    const c = ref.current; if (!c) return;
    const L = layoutZones(c.getElements() as CanvasEl[]);
    const moves = write && editable && !syncing.current ? diffZoneMoves(L.sheetZone, seen.current) : [];
    for (const [id, st] of L.sheetZone) seen.current.set(id, st);
    for (const m of moves) if (byId.get(m.sheetId)?.status !== m.status) onMoveStatus(m.sheetId, m.status);
    if (!editable) return;
    const mv = new Map(arrange ? L.moves.map((m) => [m.id, m]) : []);
    const ad = new Map(L.adopts.map((a) => [a.id, a.frameId]));
    const fr = new Map(L.frames.map((f) => [f.id, f]));
    c.patchElements((el) => {
      const id = String(el.id ?? "");
      const m = mv.get(id), a = ad.get(id);
      if (m || a) return { ...(m ? { x: m.x, y: m.y } : {}), ...(a ? { frameId: a } : {}) };
      const f = fr.get(id); if (!f) return null;
      const name = zoneName(colOf.get(f.status), f.cards);
      const p: Record<string, unknown> = {};
      if (el.name !== name) p.name = name;
      if (arrange && f.height != null) p.height = f.height;
      return Object.keys(p).length ? p : null;
    });
  }, [editable, byId, onMoveStatus, colOf]);

  // ---- ซิงค์กระดานกับข้อมูลจริง ----
  const syncBoard = useCallback(async (msg = false) => {
    const c = ref.current; if (!c || syncing.current) return;
    syncing.current = true;
    let fresh = false;
    try {
      // 1) กรอบสถานะที่ยังไม่มี → ต่อท้ายทางขวา
      let els = c.getElements() as CanvasEl[];
      const zones = zoneFrames(els);
      const have = new Set(zones.values());
      const frames = els.filter((e) => e.type === "frame" && e.id && zones.has(String(e.id)));
      let nextX = frames.length ? Math.max(...frames.map((f) => num(f.x) + num(f.width))) + ZONE_GAP : 0;
      const newFrames = columns.filter((col) => !have.has(col.key)).map((col) => {
        const sk = { type: "frame", id: `dd-zone-${col.key}-${Math.random().toString(36).slice(2, 7)}`, name: zoneName(col, 0), x: nextX, y: 0, width: ZONE_W, height: ZONE_MIN_H, children: [], customData: { kind: ZONE_KIND, status: col.key } };
        nextX += ZONE_W + ZONE_GAP;
        return sk;
      });
      fresh = newFrames.length > 0 && newFrames.length === columns.length;   // กระดานใหม่เอี่ยม → จัดหน้าให้ครั้งแรกครั้งเดียว
      if (newFrames.length && editable) { await c.insert(newFrames, { scene: true }); els = c.getElements() as CanvasEl[]; }

      // ตำแหน่งกรอบตามสถานะ (มุมบน + ก้น) ไว้วางการ์ดใหม่/ย้ายการ์ด
      const zoneEls = new Map<string, CanvasEl>();
      for (const e of els) { const d = e.customData as { kind?: string; status?: string } | null; if (e.type === "frame" && !e.isDeleted && d?.kind === ZONE_KIND && d.status && !zoneEls.has(d.status)) zoneEls.set(d.status, e); }
      // ช่องว่างถัดไปในแต่ละกรอบ = ใต้การ์ดใบล่างสุดที่อยู่ในกรอบนั้น · วางแล้วยืดกรอบให้ครอบการ์ดเสมอ (ไม่จัดของเดิม)
      const nextY = new Map<string, number>();
      for (const [st, f] of zoneEls) nextY.set(st, num(f.y) + ZONE_HEAD);
      for (const cd of sheetCards(els)) {
        const cx = (cd.minX + cd.maxX) / 2, cy = (cd.minY + cd.maxY) / 2;
        for (const [st, f] of zoneEls) if (cx >= num(f.x) && cx <= num(f.x) + num(f.width) && cy >= num(f.y) && cy <= num(f.y) + num(f.height)) nextY.set(st, Math.max(nextY.get(st)!, cd.maxY + GAPY));
      }
      const growTo = new Map<string, number>();   // frameId → ความสูงใหม่
      const slot = (st: string, h = 300) => {
        const f = zoneEls.get(st)!, fid = String(f.id), y = nextY.get(st)!;
        nextY.set(st, y + h + GAPY);
        const need = y + h + GAPY - num(f.y);
        if (need > (growTo.get(fid) ?? num(f.height))) growTo.set(fid, need);
        return { x: num(f.x) + GAPX, y, frameId: fid };
      };

      // 2) การ์ดใบงานที่ไม่อยู่ในแบรนด์/คอลัมน์นี้แล้ว (และอยู่ในกรอบสถานะ) → เอาออก
      const L = layoutZones(els);
      const gone = [...L.sheetZone.keys()].filter((id) => !byId.has(id));
      if (gone.length && editable) c.removeCards((card) => card.kind === SHEET_KIND && gone.includes(card.id));

      // 3) สถานะเปลี่ยนจากที่อื่น → ย้ายการ์ดไปกรอบที่ถูก (วางที่ก้นกรอบ แล้วให้ snap จัดเอง)
      const wrong = [...L.sheetZone.entries()].filter(([id, st]) => byId.has(id) && byId.get(id)!.status !== st && zoneEls.has(byId.get(id)!.status));
      if (wrong.length && editable) {
        const target = new Map(wrong.map(([id]) => [id, slot(byId.get(id)!.status)]));
        const minPos = new Map<string, { x: number; y: number }>();
        for (const e of els) { const d = e.customData as { kind?: string; id?: string } | null; if (d?.kind === SHEET_KIND && d.id && target.has(String(d.id))) { const p = minPos.get(String(d.id)); minPos.set(String(d.id), { x: Math.min(p?.x ?? Infinity, num(e.x)), y: Math.min(p?.y ?? Infinity, num(e.y)) }); } }
        c.patchElements((el) => {
          const gh = growTo.get(String(el.id ?? "")); if (gh != null) return { height: gh };
          const d = el.customData as { kind?: string; id?: string } | null;
          if (d?.kind !== SHEET_KIND || !d.id) return null;
          const tg = target.get(String(d.id)), mp = minPos.get(String(d.id)); if (!tg || !mp) return null;
          return { x: num(el.x) + tg.x - mp.x, y: num(el.y) + tg.y - mp.y, frameId: tg.frameId };
        });
      }

      // 4) ใบงานที่ยังไม่มีการ์ด → วางในกรอบสถานะของมัน
      const onBoard = new Set((c.listCards() ?? []).filter((x) => x.kind === SHEET_KIND).map((x) => String(x.data.id ?? "")));
      const missing = inCols.filter((s) => !onBoard.has(s.id) && zoneEls.has(s.status));
      if (missing.length && editable) {
        const sk: Record<string, unknown>[] = [];
        missing.forEach((s) => { const at = slot(s.status, s.cover_url ? 290 : 120); sk.push(...cardSk(s, at.x, at.y)); });
        // ยืดกรอบก่อน แล้วค่อยวางการ์ด (จุดกึ่งกลางการ์ดต้องอยู่ในกรอบ ระบบถึงนับว่าอยู่สถานะนั้น)
        c.patchElements((el) => { const gh = growTo.get(String(el.id ?? "")); return gh != null && gh > num(el.height) ? { height: gh } : null; });
        await c.insert(sk, { scene: true });
      }

      // 5) ข้อความ/สีขอบการ์ดเดิมให้ตรงข้อมูลล่าสุด
      if (editable) await c.refreshCards(async (card) => {
        if (card.kind !== SHEET_KIND) return null;
        const s = byId.get(card.id); if (!s) return null;
        const col = colOf.get(s.status);
        const text = dsCardText({ id: s.id, code: s.code, name: s.name, brand_name: s.brand_name, status: s.status, deadline: s.deadline }, col?.label);
        if (card.data.status === s.status && String(card.data.name ?? "") === s.name) return null;
        return { text, data: { ...card.data, status: s.status, name: s.name, code: s.code }, stroke: col?.color ?? null };
      });
      if (msg) toast.success(t("กระดานตรงกับใบงานล่าสุดแล้ว", "Board is up to date"));
    } finally {
      syncing.current = false;
    }
    applyBoardState(false, fresh);
  }, [columns, editable, byId, inCols, cardSk, colOf, applyBoardState, toast, t]);

  // วางโครงใหม่ทั้งกระดาน (ของที่วาดเอง/ของอ้างอิงไม่หาย — ลบเฉพาะการ์ดใบงาน + กรอบสถานะ)
  const rebuild = useCallback(async () => {
    setAskRebuild(false);
    const c = ref.current; if (!c) return;
    setBusy(true);
    try {
      c.removeCards((card) => card.kind === SHEET_KIND);
      c.patchElements((el) => ((el.customData as { kind?: string } | null)?.kind === ZONE_KIND ? { isDeleted: true } : null));
      seen.current = new Map();
      await syncBoard();
      applyBoardState(false, true);
      toast.success(t("วางโครงกระดานใหม่แล้ว (กด Ctrl+Z ย้อนได้)", "Board rebuilt (Ctrl+Z to undo)"));
    } finally { setBusy(false); }
  }, [syncBoard, applyBoardState, toast, t]);

  const onBoardReady = useCallback(async () => {
    for (let i = 0; i < 40 && !ref.current; i++) await new Promise((r) => setTimeout(r, 50));
    if (!ref.current) return;
    ready.current = true;
    await syncBoard();
  }, [syncBoard]);

  // ใบงานเปลี่ยน (ย้ายสถานะจากที่อื่น / ย้อนกลับ / ใบใหม่) → ซิงค์กระดานตาม
  const sig = useMemo(() => inCols.map((s) => `${s.id}:${s.status}:${s.name}`).sort().join("|") + "#" + columns.map((c) => c.key).join(","), [inCols, columns]);
  const lastSig = useRef(sig);
  useEffect(() => {
    if (!ready.current || lastSig.current === sig) return;
    lastSig.current = sig;
    const h = window.setTimeout(() => void syncBoard(), 300);
    return () => window.clearTimeout(h);
  }, [sig, syncBoard]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setBusy(true); void syncBoard(true).finally(() => setBusy(false)); }} disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Icon value="i:refresh" /> {t("ซิงค์ใบงาน", "Sync jobs")}
        </button>
        {editable && (
          <button type="button" onClick={() => applyBoardState(false, true)} disabled={busy} title={t("จัดการ์ดในทุกกรอบให้เรียงเป็นแถว 2 คอลัมน์ + ปรับความสูงกรอบพอดี (Ctrl+Z ย้อนได้)", "Line up cards in every frame (2 columns) and fit frame heights (Ctrl+Z to undo)")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
            <Icon value="i:layout-grid" /> {t("จัดหน้า", "Arrange")}
          </button>
        )}
        {editable && (
          <button type="button" onClick={() => setAskRebuild(true)} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:refresh" /> {t("วางโครงใหม่", "Rebuild layout")}
          </button>
        )}
        <span className="text-[11px] text-slate-400">
          {editable
            ? t("1 กรอบ = 1 สถานะ · ลากการ์ดข้ามกรอบ = เปลี่ยนสถานะ (ย้อนกลับได้) · วาง/แปะรูป ลิงก์ ข้อความได้ · ลากลูกศรผูกกับการ์ด = ของอ้างอิงของใบงาน · ดับเบิลคลิก = เปิดใบงาน",
                "1 frame = 1 status · drag a card across frames to change status (undoable) · paste images/links/notes · arrow to a card = that job's reference · double-click to open")
            : t("ดูอย่างเดียว — แก้กระดานที่จอคอม (ต้องมีสิทธิ์แก้ใบงาน)", "View only — edit on a computer (needs edit rights)")}
        </span>
      </div>
      <CanvasSketch key={brandKey} entityType={BRAND_CANVAS_ENTITY} entityId={brandKey} editable={editable} collab height={height}
        fullscreen="design_brand_board_fullscreen"
        controlsRef={ref}
        onReady={() => { void onBoardReady(); }}
        onSaved={() => applyBoardState(true)}
        onCardOpen={(d) => { if (d?.kind === SHEET_KIND && d.id) onOpenSheet(String(d.id)); }} />
      <ConfirmDialog open={askRebuild} onClose={() => setAskRebuild(false)} onConfirm={() => void rebuild()}
        title={t("วางโครงกระดานใหม่?", "Rebuild the board?")}
        message={t("ระบบจะลบการ์ดใบงานและกรอบสถานะ แล้ววางใหม่ตามสถานะล่าสุด — รูป ลิงก์ ข้อความที่วางเองไม่หาย (เส้นที่ผูกกับการ์ดเดิมจะหลุด) · สถานะใบงานไม่ถูกแตะ",
          "Job cards and status frames will be removed and placed again by current status — your images, links and notes stay (arrows to old cards detach). Job statuses are not touched.")}
        confirmText={t("วางโครงใหม่", "Rebuild")} />
    </div>
  );
}
