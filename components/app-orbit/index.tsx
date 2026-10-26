"use client";

/**
 * ◎ วงแอป (App Orbit) — หน้ารวมแอปแบบการ์ดล้อมเป็นวง (ของกลาง)
 *
 *   จอคอม/แท็บเล็ต: การ์ดแอปเรียงตามรูปแบบวง (วงรี/วงกลม/วงแหวน 3 มิติ/แถวเอียง/แกลเลอรี)
 *                   กดแอป = เลือก (หมุนมาบนสุด/หน้าสุด/กลาง) + แผงโชว์เมนูของแอป · กดซ้ำ/ปุ่ม "เปิดแอป" = เข้าแอป
 *                   ลากหมุนวงได้ · ← → เลือกแอปถัดไป
 *   มือถือ (จอแคบ): แถบแกลเลอรีเลื่อนซ้ายขวา ใบกลางใหญ่ + รายการเมนูด้านล่าง
 *   ค้นหา: พิมพ์แล้วแผงโชว์เมนูที่ตรงข้ามทุกแอป · การ์ดที่ไม่เกี่ยวจะจางลง · Enter เปิดผลแรก
 *   เอฟเฟกต์/หน้าตา: prop `style` (lib/app-orbit-style — ค่ากลางทีม + ค่าของฉัน) · แผงปรับ = ./tuner
 *
 * การ์ดขยับด้วย requestAnimationFrame เขียน transform ลง DOM ตรง (ไม่ re-render React ทุกเฟรม)
 * เวทีเป็น `isolate` — z-index ของการ์ด (ถึง 150) อยู่แค่ในวง ไม่ลอยทับแผงลอย/ป๊อปอัปของหน้า
 * ข้อมูล/สิทธิ์มาจากกฎกลาง lib/app-orbit (buildOrbitApps) — ใครเห็นแอป/เมนูไหนเหมือนแถบเมนูทุกอย่าง
 * ใช้ที่: /apps (มุมมอง "วงแอป")
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { orbitAppMatches, orbitCardBox, orbitPose, orbitSnapTarget, searchOrbit, topIndex, ROW_PX_PER_RAD, type OrbitApp, type OrbitMenu } from "@/lib/app-orbit";
import { ORBIT_DEFAULT, type OrbitColor, type OrbitStyle } from "@/lib/app-orbit-style";
import { r2ImageUrl } from "@/lib/r2-image";
import { useViewportLayout } from "@/components/device-view";

const STAGE_H_HUB = 660;    // วงที่มีแผงกลางอยู่ข้างใน (วงรี/วงกลม)
const STAGE_H_OPEN = 440;   // รูปแบบอื่น — แผงอยู่ใต้วง
const STAGE_H_PHONE = 160;
const PANEL_ROWS = 5;       // เมนูที่โชว์ในแผงก่อนกด "ดูทั้งหมด"
const NARROW_W = 700;       // กว้างไม่ถึงนี้ = ใช้แบบแกลเลอรีมือถือ

/** เปิดแอปแล้วให้แท็บแอปด้านบนของเชลล์ตรงกับแอปที่กด (PlaygroundShell อ่าน key นี้ตอนเปิดหน้า) */
function rememberActiveApp(key: string) {
  try { localStorage.setItem("erp-active-app", key); } catch { /* ignore */ }
}

/** สีการ์ด: tint = สีอ่อนจาก theme_color แอป · solid = สีเต็ม · white = ขาวล้วน (ไม่ได้ตั้งสี = ขาว/เทาเข้ม) */
function tileColor(color: string | null, mode: OrbitColor): React.CSSProperties {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
  if (mode === "solid") return { background: hex ?? "#475569", borderColor: "transparent" };
  if (mode === "tint" && hex) return { background: `${hex}1f`, borderColor: `${hex}55` };
  return { background: "#ffffff", borderColor: "#e2e8f0" };
}

function OrbitIcon({ icon, iconUrl, size }: { icon: string | null; iconUrl: string | null; size: number }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r2ImageUrl(iconUrl, size * 2) ?? ""} alt="" className="object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="leading-none shrink-0" style={{ fontSize: size * 0.82 }}>{icon ?? "📦"}</span>;
}

export function AppOrbit({ apps, query, onQueryChange, greeting, title = "วันนี้จะเข้าแอปไหน", accent, initialKey, style = ORBIT_DEFAULT, replayKey = 0 }: {
  /** null = กำลังโหลด */
  apps: OrbitApp[] | null;
  query: string;
  onQueryChange: (q: string) => void;
  greeting: string;
  title?: string;
  accent?: string;
  /** แอปที่เลือกไว้ตอนเปิด (เช่น แอปที่ใช้ล่าสุด) */
  initialKey?: string | null;
  /** หน้าตา/เอฟเฟกต์ (resolveOrbitStyle) */
  style?: OrbitStyle;
  /** เปลี่ยนค่า = เล่นลูกเล่นตอนเปิดหน้าใหม่ */
  replayKey?: number;
}) {
  const router = useRouter();
  const layout = useViewportLayout();
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el); setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const narrow = layout === "phone" || (boxW > 0 && boxW < NARROW_W);
  const mode = narrow ? "gallery" : style.mode;
  const hubInside = !narrow && (mode === "ellipse" || mode === "circle") && style.radius >= 85;
  const stageH = narrow ? STAGE_H_PHONE : hubInside ? STAGE_H_HUB : STAGE_H_OPEN;
  const box = orbitCardBox(style);

  const list = useMemo(() => apps ?? [], [apps]);
  const n = list.length;
  const [selKey, setSelKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selIndex = Math.max(0, list.findIndex((a) => a.key === selKey));
  const selected = n ? list[selIndex] : null;

  // ===== เครื่องขยับการ์ด (rAF) — ค่าที่เปลี่ยนบ่อยเก็บใน ref =====
  const rotRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRef = useRef(-1);
  const interactedRef = useRef(false);   // แกลเลอรีเลื่อนเองจนกว่าจะมีคนแตะ
  const t0Ref = useRef(0);
  const cardEls = useRef<(HTMLButtonElement | null)[]>([]);
  const lastX = useRef<number[]>([]);
  const settle = useRef<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const dim = useMemo(() => list.map((a) => !orbitAppMatches(a, query)), [list, query]);
  const live = useRef({ style, mode, sel: selIndex, n, narrow, dim, dragging, box, advance: () => {} });
  live.current = {
    style, mode, sel: selIndex, n, narrow, dim, dragging, box,
    advance: () => { if (n) setSelKey(list[(selIndex + 1) % n].key); },
  };

  // เลือกแอปเริ่มต้นเมื่อโหลดเสร็จ / รายการแอปเปลี่ยน → จัดใบที่เลือกเข้าตำแหน่ง
  useEffect(() => {
    if (!n) return;
    const has = (k: string | null | undefined) => !!k && list.some((a) => a.key === k);
    const k = has(selKey) ? selKey! : has(initialKey) ? initialKey! : list[0].key;
    setSelKey(k);
    targetRef.current = orbitSnapTarget(mode, rotRef.current, list.findIndex((a) => a.key === k), n, style.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, initialKey, mode]);
  // ลูกเล่นตอนเปิด: เล่นเมื่อแอปโหลดเสร็จ / เปลี่ยนรูปแบบวง / กดเล่นใหม่
  useEffect(() => { t0Ref.current = performance.now(); }, [n > 0, mode, style.intro, replayKey]);

  useEffect(() => {
    let raf = 0, galleryMs = 0, last = performance.now();
    const tick = (now: number) => {
      const L = live.current, stage = stageRef.current;
      // คิดตามเวลาจริง (ไม่ใช่ต่อเฟรม) — จอ 120Hz / เครื่องช้า หมุนเร็วเท่ากัน · เว้นนาน (สลับแท็บ) ไม่กระโดด
      const f = Math.min(now - last, 250) / (1000 / 60);
      last = now;
      if (stage && L.n) {
        const W = stage.clientWidth, H = stage.clientHeight, st = L.style;
        if (targetRef.current !== null) {
          rotRef.current += (targetRef.current - rotRef.current) * (1 - Math.pow(0.88, f));
          if (Math.abs(targetRef.current - rotRef.current) < 0.0005) { rotRef.current = targetRef.current; targetRef.current = null; }
        } else if (st.spin && !L.dragging && !(st.pause && hoverRef.current >= 0)) {
          if (L.mode === "gallery") {
            galleryMs += f * (1000 / 60);
            if (!interactedRef.current && galleryMs > (12 - st.speed) * 240) { galleryMs = 0; L.advance(); }
          } else rotRef.current += st.dir * st.speed * 0.0007 * f;
        }
        const ps = { ...st, mode: L.mode };
        const poses = Array.from({ length: L.n }, (_, i) => {
          const t = st.intro === "none" ? 1 : Math.min(1, Math.max(0, (now - t0Ref.current - i * 35) / 900));
          return orbitPose(i, L.n, rotRef.current, L.sel, W, H, ps, 1 - Math.pow(1 - t, 3), L.narrow);
        });
        // ใบที่ชี้อยู่ = ใบที่ใกล้เมาส์ที่สุด (คิดจากตำแหน่งก่อนหลบ — ใบที่ชี้ไม่หลบหนีเมาส์)
        let hov = -1, bd = Infinity;
        const m = mouseRef.current;
        if (m) poses.forEach((p, i) => { const d = Math.hypot(p.x - m.x, p.y - m.y); if (p.o > 0.3 && d < st.size * p.s * 0.62 && d < bd) { bd = d; hov = i; } });
        hoverRef.current = hov;
        poses.forEach((p, i) => {
          const el = cardEls.current[i]; if (!el) return;
          let x = p.x, y = p.y;
          if (st.push && m && i !== hov) {
            const dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy);
            if (d < st.pushR && d > 0.1) { const f = (1 - d / st.pushR) * st.pushStr; x += (dx / d) * f; y += (dy / d) * f; }
          }
          // วนจากขอบหนึ่งไปอีกขอบ (แถว/แกลเลอรี) → ไม่ต้องเลื่อนข้ามจอให้เห็น
          if (lastX.current[i] !== undefined && Math.abs(x - lastX.current[i]) > W * 0.45) { el.style.transition = "opacity .35s"; settle.current[i] = 2; }
          else if (settle.current[i]) { settle.current[i]--; if (!settle.current[i]) el.style.transition = ""; }
          lastX.current[i] = x;
          const s = p.s * (i === hov ? st.zoom / 100 : 1);
          el.style.transform = `translate(${Math.round(x - L.box.w / 2)}px, ${Math.round(y - L.box.h / 2)}px)${p.ry ? ` perspective(600px) rotateY(${p.ry.toFixed(1)}deg)` : ""} scale(${s.toFixed(3)})`;
          el.style.zIndex = String(i === hov ? 150 : p.z);
          el.style.opacity = (p.o * (L.dim[i] ? 0.22 : 1)).toFixed(2);
        });
        const layer = layerRef.current;
        if (layer) layer.style.transform = st.parallax && m && !L.narrow
          ? `perspective(1000px) rotateX(${(-(m.y / H - 0.5) * 10).toFixed(1)}deg) rotateY(${((m.x / W - 0.5) * 14).toFixed(1)}deg)` : "";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const select = (i: number) => {
    if (!n) return;
    const idx = ((i % n) + n) % n;
    interactedRef.current = true;
    setSelKey(list[idx].key);
    targetRef.current = orbitSnapTarget(mode, rotRef.current, idx, n, style.size);
    setExpanded(false);
  };
  const openApp = (a: OrbitApp) => { rememberActiveApp(a.key); router.push(a.homeHref); };
  const onCard = (i: number) => { if (list[i].key === selKey && !query) openApp(list[i]); else select(i); };

  const results = useMemo(() => searchOrbit(list, query), [list, query]);
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results[0]) { rememberActiveApp(results[0].app.key); router.push(results[0].menu.href); }
    if (e.key === "Escape") onQueryChange("");
  };

  // ลากหมุน (วง/แถว) หรือปัด (แกลเลอรี) — เริ่มนับเป็น "ลาก" เมื่อขยับเกิน 6px · คลิกการ์ดธรรมดายังทำงาน
  const drag = useRef<{ x: number; y: number; a0: number; r0: number; on: boolean; id: number } | null>(null);
  const dragged = useRef(false);
  const angleAt = (cx: number, cy: number) => {
    const b = stageRef.current!.getBoundingClientRect();
    return Math.atan2(cy - (b.top + b.height / 2), cx - (b.left + b.width / 2));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!n || (e.target as HTMLElement).closest("[data-orbit-hub]")) return;
    dragged.current = false;
    drag.current = { x: e.clientX, y: e.clientY, a0: angleAt(e.clientX, e.clientY), r0: rotRef.current, on: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") { const b = stageRef.current!.getBoundingClientRect(); mouseRef.current = { x: e.clientX - b.left, y: e.clientY - b.top }; }
    const d = drag.current; if (!d || mode === "gallery") return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.on = true; dragged.current = true; interactedRef.current = true; targetRef.current = null; setDragging(true);
      try { stageRef.current?.setPointerCapture(d.id); } catch { /* ignore */ }
    }
    if (d.on) rotRef.current = mode === "row" ? d.r0 + (e.clientX - d.x) / ROW_PX_PER_RAD : d.r0 + angleAt(e.clientX, e.clientY) - d.a0;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (mode === "gallery") {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 30) { dragged.current = true; select(selIndex + (dx < 0 ? 1 : -1)); }
      return;
    }
    if (!d.on) return;
    setDragging(false);
    // ปล่อยแล้วเลือกใบที่อยู่ตำแหน่งเด่น (วง = บนสุด/หน้าสุด · แถว = กลางจอ)
    if (mode === "row") {
      const W = stageRef.current!.clientWidth;
      let best = 0, bd = Infinity;
      list.forEach((_, i) => { const p = orbitPose(i, n, rotRef.current, selIndex, W, stageH, { ...style, mode, intro: "none" }); const dd = Math.abs(p.x - W / 2); if (dd < bd) { bd = dd; best = i; } });
      select(best);
    } else select(topIndex(rotRef.current, n));
  };

  const hub = (
    <>
      <p className="text-sm text-slate-500">{greeting}</p>
      <h2 className="mt-0.5 text-xl sm:text-2xl font-bold text-slate-900" style={accent ? { color: accent } : undefined}>{title}</h2>
      <div className="relative mt-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={onSearchKey}
          placeholder="ค้นหาแอปหรือเมนู เช่น PO, เงินเดือน"
          className="w-full h-10 pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        {query && (
          <button type="button" onClick={() => onQueryChange("")} aria-label="ล้างค้นหา"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">×</button>
        )}
      </div>
    </>
  );
  const panel = (rows: number) => (
    <OrbitPanel app={selected} query={query} results={results} rows={rows} expanded={expanded}
      onToggle={() => setExpanded((v) => !v)} onPick={(key) => rememberActiveApp(key)} />
  );
  const counter = `${String(selIndex + 1).padStart(2, "0")} — ${String(n).padStart(2, "0")}`;

  if (apps === null) return <div ref={boxRef} className="py-24 text-center text-sm text-slate-400">กำลังโหลดแอป…</div>;
  if (!n) {
    return (
      <div ref={boxRef} className="py-20 text-center">
        <div className="text-5xl mb-3 opacity-40">🔒</div>
        <p className="text-slate-500 text-sm">ยังไม่มีแอปที่คุณเข้าได้ — ติดต่อแอดมินเพื่อขอสิทธิ์</p>
      </div>
    );
  }

  const tileRadius = style.shape === "circle" ? "50%" : style.shape === "portrait" ? 8 : Math.round(style.size * 0.27);
  const iconSize = Math.round(Math.min(box.tileW, box.tileH) * 0.55);
  const stage = (
    <div ref={stageRef} role="group" aria-label="วงแอป"
      className={`relative isolate select-none ${narrow ? "touch-pan-y" : ""} ${dragging ? "cursor-grabbing" : ""}`} style={{ height: stageH, overflowX: "clip" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerLeave={() => { mouseRef.current = null; }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "ArrowRight") { e.preventDefault(); select(selIndex + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); select(selIndex - 1); }
      }}>
      <div ref={layerRef} className="absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none">
        {list.map((a, i) => {
          const isSel = i === selIndex;
          return (
            <button key={a.key} ref={(el) => { cardEls.current[i] = el; }} type="button" aria-label={a.label} aria-pressed={isSel}
              title={isSel ? `เปิดแอป${a.label}` : a.label}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } onCard(i); }}
              className={`group absolute left-0 top-0 flex flex-col items-center gap-1 opacity-0 will-change-transform motion-reduce:transition-none ${dragging ? "" : "transition-[transform,opacity] duration-500 ease-out"}`}
              style={{ width: box.w, height: box.h }}>
              <span className={`flex items-center justify-center border transition-shadow group-hover:shadow-md ${isSel ? "shadow-md ring-2 ring-blue-500 ring-offset-2" : "shadow-sm"}`}
                style={{ width: box.tileW, height: box.tileH, borderRadius: tileRadius, ...tileColor(a.color, style.color) }}>
                <OrbitIcon icon={a.icon} iconUrl={a.iconUrl} size={iconSize} />
              </span>
              {style.labels && <span className={`text-xs leading-tight max-w-full truncate px-0.5 ${isSel ? "font-semibold text-slate-900" : "text-slate-600"}`}>{a.label}</span>}
            </button>
          );
        })}
      </div>
      {hubInside && (
        <div data-orbit-hub className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] max-w-[calc(100%-240px)] text-center z-[200]">
          {hub}
          <div className="mt-3 text-left">{panel(PANEL_ROWS)}</div>
        </div>
      )}
      {!narrow && <p className="absolute right-0 top-0 text-[11px] tabular-nums text-slate-400">{counter}</p>}
    </div>
  );

  // ===== มือถือ / จอแคบ: แกลเลอรี =====
  if (narrow) {
    return (
      <div ref={boxRef}>
        <div className="text-center px-1">{hub}</div>
        <div className="mt-4 overflow-hidden">{stage}</div>
        <div className="flex items-center justify-between px-2">
          <button type="button" onClick={() => select(selIndex - 1)} aria-label="แอปก่อนหน้า" className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">‹</button>
          <span className="text-xs tabular-nums text-slate-500">{counter}</span>
          <button type="button" onClick={() => select(selIndex + 1)} aria-label="แอปถัดไป" className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">›</button>
        </div>
        <div className="mt-3 bg-white border border-slate-200/70 rounded-2xl p-3">{panel(8)}</div>
      </div>
    );
  }

  // ===== จอคอม =====
  return (
    <div ref={boxRef} className="mx-auto" style={{ maxWidth: 980 }}>
      {stage}
      {!hubInside && (
        <div className="mx-auto mt-2 max-w-[440px] text-center">
          {hub}
          <div className="mt-3 text-left bg-white border border-slate-200/70 rounded-2xl p-3">{panel(PANEL_ROWS)}</div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{mode === "gallery" ? "ปัดหรือกดแอปข้าง ๆ เพื่อเลื่อน" : "ลากเพื่อหมุนวง"} · กดแอปซ้ำเพื่อเปิด</p>
    </div>
  );
}

// แผงกลาง: ผลค้นหา (ตอนพิมพ์) หรือเมนูของแอปที่เลือก + ปุ่มเปิดแอป
function OrbitPanel({ app, query, results, rows, expanded, onToggle, onPick }: {
  app: OrbitApp | null; query: string; results: { app: OrbitApp; menu: OrbitMenu }[];
  rows: number; expanded: boolean; onToggle: () => void; onPick: (appKey: string) => void;
}) {
  const rowCls = "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900";
  if (query.trim()) {
    if (!results.length) return <p className="py-6 text-center text-sm text-slate-500">ไม่พบเมนูที่ตรงกับ &ldquo;{query}&rdquo;</p>;
    return (
      <div className="space-y-0.5">
        {results.map(({ app: a, menu: m }) => (
          <Link key={m.href} href={m.href} onClick={() => onPick(a.key)} className={rowCls}>
            <OrbitIcon icon={m.icon} iconUrl={m.iconUrl} size={18} />
            <span className="flex-1 min-w-0 truncate">{m.label}</span>
            <span className="text-[11px] text-slate-400 truncate max-w-[110px]">{a.label}</span>
          </Link>
        ))}
        <p className="pt-1 text-center text-[11px] text-slate-400">กด Enter เพื่อเปิดรายการแรก</p>
      </div>
    );
  }
  if (!app) return null;
  const shown = expanded ? app.menus : app.menus.slice(0, rows);
  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-1.5 mb-1 border-b border-slate-100">
        <span className="w-7 h-7 rounded-lg border flex items-center justify-center" style={tileColor(app.color, "tint")}>
          <OrbitIcon icon={app.icon} iconUrl={app.iconUrl} size={16} />
        </span>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-900">{app.label}</span>
        <span className="text-[11px] text-slate-400">{app.menus.length} เมนู</span>
      </div>
      <div className={`space-y-0.5 ${expanded ? "max-h-[184px] overflow-y-auto" : ""}`}>
        {shown.map((m) => (
          <Link key={m.href} href={m.href} onClick={() => onPick(app.key)} className={rowCls}>
            <OrbitIcon icon={m.icon} iconUrl={m.iconUrl} size={18} />
            <span className="flex-1 min-w-0 truncate">{m.label}</span>
            <span className="text-slate-300" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
      {app.menus.length > rows && (
        <button type="button" onClick={onToggle} className="w-full mt-1 py-1 text-xs text-slate-500 hover:text-slate-800">
          {expanded ? "ย่อ" : `ดูทั้งหมด ${app.menus.length} เมนู`}
        </button>
      )}
      <Link href={app.homeHref} onClick={() => onPick(app.key)}
        className="mt-2 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
        เปิดแอป{app.label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
