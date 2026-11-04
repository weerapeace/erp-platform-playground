"use client";

/**
 * 🏢 มุมมอง "ออฟฟิศ" แบบพิกเซลของหน้าออฟฟิศทีม AI — ตัวละครอยู่ห้องตามสถานะจริง + โหมดตกแต่ง (แอดมิน)
 * วาดด้วย ./engine.ts (canvas) · ค่าตกแต่ง/กติกาท่าทาง lib/ai-office-scene.ts · บันทึก /api/ai-office/scene
 * ใช้ของกลาง: useToast · askConfirm/askLeaveUnsaved (ป๊อปยืนยันกลาง) · useT · Icon · apiFetch
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { askConfirm, askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { OFFICE_WORKERS, WORKER_BY_ID, type OfficeLive } from "@/lib/ai-office";
import {
  SCENE_THEMES, SPECIES, FUR_COLORS, SHIRT_COLORS, NICK_MAX, POSE_LABEL,
  cleanScene, defaultScene, swapDesks, workerPose, displayName,
  type SceneConfig, type Pose, type CharacterLook,
} from "@/lib/ai-office-scene";
import { SW, SH, ROOM_SLOTS, POSE_ROOM, seatOf, planPath, stepActor, drawFrame, actorBox, deskBox, DESK_POS, type Actor } from "./engine";

const POSE_ORDER: Pose[] = ["repair", "sleep", "counter", "work", "lounge", "away"];
const POSE_DOT: Record<Pose, string> = { repair: "bg-rose-500", sleep: "bg-rose-300", counter: "bg-amber-500", work: "bg-emerald-500", lounge: "bg-slate-400", away: "bg-slate-300" };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** ตำแหน่งปลายทางของทุกคน: ห้องทำงาน = เก้าอี้โต๊ะตัวเอง · ห้องอื่น = ช่องว่างในห้องตามลำดับทะเบียน */
function targets(cfg: SceneConfig, live: OfficeLive | null): Map<string, { pose: Pose; desk: number; at: [number, number] }> {
  const used: Record<string, number> = {};
  const out = new Map<string, { pose: Pose; desk: number; at: [number, number] }>();
  for (const w of OFFICE_WORKERS) {
    const pose = workerPose(w, live?.workers[w.id]);
    const desk = Math.max(0, cfg.desks.indexOf(w.id));
    const room = POSE_ROOM[pose];
    let at: [number, number];
    if (room === "hall") at = seatOf(desk);
    else {
      const slots = ROOM_SLOTS[room], i = (used[room] = (used[room] ?? -1) + 1);
      const [x, y] = slots[i % slots.length];
      at = i >= slots.length ? [x + 3, y + 2] : [x, y];
    }
    out.set(w.id, { pose, desk, at });
  }
  return out;
}

export function PixelOffice({ live, canEdit, onOpen }: { live: OfficeLive | null; canEdit: boolean; onOpen: (id: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [saved, setSaved] = useState<SceneConfig>(() => defaultScene());
  const [draft, setDraft] = useState<SceneConfig>(() => defaultScene());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [swapFrom, setSwapFrom] = useState(-1);
  const cfg = editing ? draft : saved;
  const dirty = editing && !same(draft, saved);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const actorsRef = useRef<Map<string, Actor>>(new Map());
  const deskOwnerRef = useRef<string[]>(cfg.desks);
  const ui = useRef({ theme: cfg.theme, sel: null as string | null, hover: null as string | null, hoverDesk: -1, swapFrom: -1, editing: false, names: new Map<string, string>() });
  const rm = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // โหลดค่าตกแต่งที่บันทึกไว้
  useEffect(() => {
    let alive = true;
    apiFetch("/api/ai-office/scene").then(async (res) => {
      if (!res.ok) return;
      const j = await res.json() as { data?: unknown };
      if (!alive) return;
      const s = cleanScene(j.data);
      setSaved(s); setDraft(s);
    }).catch(() => { /* ใช้ค่าเริ่มต้น */ });
    return () => { alive = false; };
  }, []);

  // อัปเดตตัวละคร (ท่าทาง/หน้าตา/โต๊ะ) เมื่อสถานะหรือการตกแต่งเปลี่ยน → คนที่ต้องย้ายห้องจะเดินไปเอง
  useEffect(() => {
    const map = actorsRef.current;
    for (const [id, tg] of targets(cfg, live)) {
      const look: CharacterLook = cfg.looks[id];
      const a = map.get(id);
      if (!a) { map.set(id, { id, x: tg.at[0], y: tg.at[1], path: [], walking: false, pose: tg.pose, desk: tg.desk, look }); continue; }
      a.look = look; a.pose = tg.pose; a.desk = tg.desk;
      const dest = a.path.length ? a.path[a.path.length - 1] : [a.x, a.y];
      if (Math.abs(dest[0] - tg.at[0]) > 0.5 || Math.abs(dest[1] - tg.at[1]) > 0.5) {
        if (rm) { a.x = tg.at[0]; a.y = tg.at[1]; a.path = []; }
        else a.path = planPath([a.x, a.y], tg.at);
      }
    }
    deskOwnerRef.current = cfg.desks;
    ui.current.theme = cfg.theme;
    ui.current.names = new Map(OFFICE_WORKERS.map((w) => [w.id, displayName(cfg, w)]));
  }, [cfg, live, rm]);

  useEffect(() => { ui.current.sel = sel; ui.current.swapFrom = swapFrom; ui.current.editing = editing; }, [sel, swapFrom, editing]);

  // วนวาด (หยุดเองเมื่อแท็บถูกซ่อน เพราะ requestAnimationFrame ไม่เรียก)
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0, last = performance.now(), clock = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
      const actors = [...actorsRef.current.values()];
      for (const a of actors) stepActor(a, dt);
      const u = ui.current;
      drawFrame(ctx, actors, deskOwnerRef.current, { theme: u.theme, t: clock, rm, hover: u.hover, sel: u.sel, hoverDesk: u.editing ? u.hoverDesk : -1, swapFrom: u.swapFrom });
      const tag = tagRef.current, show = u.hover ?? u.sel, a = show ? actorsRef.current.get(show) : undefined;
      if (tag) {
        if (a) {
          tag.style.display = "block";
          tag.style.left = pct(a.x + 5, SW);
          tag.style.top = pct(a.y + 14, SH);
          const label = `${u.names.get(a.id) ?? a.id} · ${t(POSE_LABEL[a.pose].th, POSE_LABEL[a.pose].en)}`;
          if (tag.textContent !== label) tag.textContent = label;
        } else tag.style.display = "none";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rm, t]);

  // เตือนก่อนปิดหน้าถ้ายังไม่บันทึก
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const toScene = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH] as const;
  };
  const hitActor = (x: number, y: number) =>
    [...actorsRef.current.values()].filter((a) => { const b = actorBox(a); return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }).sort((p, q) => q.y - p.y)[0];
  const hitDesk = (x: number, y: number) => DESK_POS.findIndex((_, d) => { const b = deskBox(d); return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; });

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toScene(e);
    const a = hitActor(x, y);
    ui.current.hover = a?.id ?? null;
    ui.current.hoverDesk = editing ? (a && a.pose !== "lounge" && a.pose !== "counter" && a.pose !== "repair" ? a.desk : hitDesk(x, y)) : -1;
    if (canvasRef.current) canvasRef.current.style.cursor = a || (editing && ui.current.hoverDesk >= 0) ? "pointer" : "default";
  };
  const onClick = (e: React.MouseEvent) => {
    const [x, y] = toScene(e);
    const a = hitActor(x, y);
    if (editing && swapFrom >= 0) {
      const d = a ? a.desk : hitDesk(x, y);
      if (d >= 0) { setDraft((s) => swapDesks(s, swapFrom, d)); setSwapFrom(-1); }
      return;
    }
    if (!a) { setSel(null); return; }
    setSel(a.id);
    if (!editing) onOpen(a.id);
  };

  const patchLook = (id: string, p: Partial<CharacterLook>) => setDraft((s) => ({ ...s, looks: { ...s.looks, [id]: { ...s.looks[id], ...p } } }));
  const startEdit = () => { setDraft(saved); setEditing(true); setSwapFrom(-1); };
  const stopEdit = useCallback(async () => {
    if (dirty && !(await askLeaveUnsaved())) return;
    setDraft(saved); setEditing(false); setSwapFrom(-1); setSel(null);
  }, [dirty, saved]);
  const save = async () => {
    if (!dirty) { toast.info(t("ยังไม่มีอะไรเปลี่ยน", "Nothing changed")); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/ai-office/scene", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const j = await res.json().catch(() => ({})) as { data?: unknown; error?: string };
      if (!res.ok || !j.data) { toast.error(j.error || t("บันทึกไม่สำเร็จ กรุณาลองใหม่", "Could not save. Try again.")); return; }
      const s = cleanScene(j.data);
      setSaved(s); setDraft(s); setEditing(false); setSwapFrom(-1); setSel(null);
      toast.success(t("บันทึกการตกแต่งแล้ว", "Decoration saved"));
    } catch { toast.error(t("บันทึกไม่สำเร็จ กรุณาลองใหม่", "Could not save. Try again.")); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    const ok = await askConfirm({ title: t("กลับเป็นแบบเริ่มต้น", "Reset to default"), message: t("ตัวละคร โต๊ะ และธีมทั้งหมดจะกลับเป็นแบบเริ่มต้น (ยังไม่บันทึกจนกว่าจะกดบันทึก)", "Characters, desks and theme go back to default (not saved until you press Save)"), confirmText: t("กลับค่าเริ่มต้น", "Reset"), variant: "danger" });
    if (ok) { setDraft(defaultScene()); setSwapFrom(-1); }
  };

  const counts = useMemo(() => {
    const c = {} as Record<Pose, number>;
    for (const p of POSE_ORDER) c[p] = 0;
    for (const w of OFFICE_WORKERS) c[workerPose(w, live?.workers[w.id])]++;
    return c;
  }, [live]);
  const selW = sel ? WORKER_BY_ID[sel] : null;
  const selLook = sel ? draft.looks[sel] : null;

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <button type="button" onClick={startEdit} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 hover:bg-slate-50">
              <Icon value="🎨" />{t("ตกแต่งออฟฟิศ", "Decorate office")}
            </button>
          ) : (
            <>
              <span className="text-[12.5px] font-semibold text-violet-700">{t("โหมดตกแต่ง", "Decorate mode")}</span>
              <span className="text-[12px] text-slate-400">{t("ธีม", "Theme")}</span>
              {SCENE_THEMES.map((th) => (
                <button key={th.id} type="button" onClick={() => setDraft((s) => ({ ...s, theme: th.id }))} aria-pressed={draft.theme === th.id}
                  className={`h-7 rounded-md border px-2.5 text-[12.5px] ${draft.theme === th.id ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t(th.th, th.en)}</button>
              ))}
              <span className="flex-1" />
              <button type="button" onClick={reset} className="h-8 rounded-lg px-3 text-[12.5px] text-slate-500 hover:bg-slate-100">{t("กลับค่าเริ่มต้น", "Reset")}</button>
              <button type="button" onClick={stopEdit} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                <Icon value="💾" />{saving ? t("กำลังบันทึก…", "Saving…") : dirty ? t("บันทึก", "Save") : t("บันทึก (ยังไม่เปลี่ยน)", "Save (no changes)")}
              </button>
            </>
          )}
        </div>
      )}

      <div className="relative mx-auto w-full max-w-[min(100%,calc((100vh-180px)*4/3))] overflow-hidden rounded-xl border border-slate-300 bg-slate-900">
        <canvas ref={canvasRef} width={SW} height={SH} onPointerMove={onMove} onPointerLeave={() => { ui.current.hover = null; ui.current.hoverDesk = -1; }} onClick={onClick}
          className="block h-auto w-full [image-rendering:pixelated]" style={{ aspectRatio: `${SW} / ${SH}` }}
          role="img" aria-label={t("ฉากออฟฟิศ ตัวละครแต่ละตัวอยู่ห้องตามสถานะ", "Office scene, each character sits in the room that matches its status")} />
        {([[t("ห้องทำงาน", "Work hall"), 1, 11.5], [t("มุมพัก · ว่าง", "Lounge · idle"), 62, 1], [t("เคาน์เตอร์ · รอคน", "Counter · waiting"), 62, 31.5], [t("ห้องซ่อม · ติดปัญหา", "Repair · problem"), 62, 93]] as [string, number, number][]).map(([label, x, y]) => (
          <span key={label} className="pointer-events-none absolute whitespace-nowrap rounded bg-[#3E2F25]/85 px-1.5 py-px text-[10.5px] text-[#F4ECDC] sm:text-[11.5px]" style={{ left: `${x}%`, top: `${y}%` }}>{label}</span>
        ))}
        <span className="pointer-events-none absolute bottom-1.5 left-[30%] -translate-x-1/2 whitespace-nowrap rounded border-2 border-[#C9A06B] bg-[#5A3A20] px-3 py-px text-[11px] text-[#FAEEDA] sm:text-[12.5px]">{t("ออฟฟิศทีม AI", "AI team office")}</span>
        <div ref={tagRef} className="pointer-events-none absolute hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#2E2E3A] px-1.5 py-px text-[11px] text-[#F4ECDC] sm:text-[12px]" />
        {editing && swapFrom >= 0 && (
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-amber-400 px-3 py-1 text-[12.5px] font-semibold text-amber-950">
            {t("กดโต๊ะที่จะย้ายไป (โต๊ะว่างก็ได้)", "Tap the desk to move to (empty desks too)")}
            <button type="button" onClick={() => setSwapFrom(-1)} className="ml-2 underline">{t("ยกเลิก", "Cancel")}</button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-600">
          {POSE_ORDER.filter((p) => counts[p] > 0).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${POSE_DOT[p]}`} />{t(POSE_LABEL[p].th, POSE_LABEL[p].en)} <b className="tabular-nums">{counts[p]}</b></span>
          ))}
          <span className="text-slate-400">{t("กดตัวละครเพื่อดูรายละเอียด", "Tap a character for details")}</span>
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-[13px]">
          {!selW || !selLook ? (
            <p className="text-slate-600">{t("กดตัวละครเพื่อแต่งตัวหรือย้ายโต๊ะ · เปลี่ยนธีมได้ที่แถบด้านบน · แก้แล้วกดบันทึกเพื่อให้ทุกคนเห็น", "Tap a character to dress it or move its desk. Change the theme above. Press Save so everyone sees it.")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">{selW.title}</p>
                <button type="button" onClick={() => setSwapFrom(draft.desks.indexOf(selW.id))}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] text-slate-700 hover:bg-slate-50"><Icon value="🔀" />{t("ย้ายโต๊ะ", "Move desk")}</button>
              </div>
              <label className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-slate-500">{t("ชื่อเล่น", "Nickname")}</span>
                <input value={selLook.nick} maxLength={NICK_MAX} placeholder={selW.title} onChange={(e) => patchLook(selW.id, { nick: e.target.value })}
                  className="h-8 w-56 max-w-full rounded-md border border-slate-200 bg-white px-2 text-[13px]" />
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 text-slate-500">{t("ตัวละคร", "Character")}</span>
                {SPECIES.map((sp) => (
                  <button key={sp.id} type="button" onClick={() => patchLook(selW.id, { species: sp.id })} aria-pressed={selLook.species === sp.id}
                    className={`h-7 rounded-md border px-2.5 text-[12.5px] ${selLook.species === sp.id ? "border-violet-300 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{t(sp.th, sp.en)}</button>
                ))}
              </div>
              {([["fur", selLook.species === "human" ? t("สีผม", "Hair") : t("สีขน", "Fur"), FUR_COLORS], ["shirt", t("เสื้อ", "Shirt"), SHIRT_COLORS]] as ["fur" | "shirt", string, string[]][]).map(([key, label, colors]) => (
                <div key={key} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 text-slate-500">{label}</span>
                  {colors.map((c) => (
                    <button key={c} type="button" onClick={() => patchLook(selW.id, { [key]: c })} aria-label={c} aria-pressed={selLook[key] === c}
                      className={`h-6 w-6 rounded-full border-2 ${selLook[key] === c ? "border-slate-800" : "border-white"}`} style={{ background: c }} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
