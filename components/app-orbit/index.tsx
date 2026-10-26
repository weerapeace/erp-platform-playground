"use client";

/**
 * ◎ วงแอป (App Orbit) — หน้ารวมแอปแบบการ์ดล้อมเป็นวง (ของกลาง)
 *
 *   จอคอม/แท็บเล็ต: การ์ดแอปเรียงเป็นวงรอบแผงกลาง · กดแอป = หมุนขึ้นบนสุด + แผงกลางโชว์เมนูของแอป
 *                   กดซ้ำ/ปุ่ม "เปิดแอป" = เข้าแอป · ลากหมุนวงได้ · ← → เลือกแอปถัดไป
 *   มือถือ (จอแคบ): แถบแกลเลอรีเลื่อนซ้ายขวา ใบกลางใหญ่ + รายการเมนูด้านล่าง
 *   ค้นหา: พิมพ์แล้วแผงกลางโชว์เมนูที่ตรงข้ามทุกแอป · การ์ดที่ไม่เกี่ยวจะจางลง · Enter เปิดผลแรก
 *
 * ข้อมูล/สิทธิ์มาจากกฎกลาง lib/app-orbit (buildOrbitApps) — ใครเห็นแอป/เมนูไหนเหมือนแถบเมนูทุกอย่าง
 * ใช้ที่: /apps (มุมมอง "วงแอป")
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gallerySlot, orbitAppMatches, orbitPoint, searchOrbit, snapRotation, topIndex, type OrbitApp, type OrbitMenu } from "@/lib/app-orbit";
import { r2ImageUrl } from "@/lib/r2-image";
import { useViewportLayout } from "@/components/device-view";

const STAGE_H = 660;      // ความสูงวง (จอคอม) — พอให้แผงกลาง (ค้นหา + เมนู 5 อัน + ปุ่มเปิดแอป) ไม่ชนการ์ดบน/ล่าง
const CARD_W = 92;
const CARD_H = 96;
const PANEL_ROWS = 5;     // เมนูที่โชว์ในแผงกลางก่อนกด "ดูทั้งหมด"
const NARROW_W = 700;     // กว้างไม่ถึงนี้ = ใช้แบบแกลเลอรี

/** เปิดแอปแล้วให้แท็บแอปด้านบนของเชลล์ตรงกับแอปที่กด (PlaygroundShell อ่าน key นี้ตอนเปิดหน้า) */
function rememberActiveApp(key: string) {
  try { localStorage.setItem("erp-active-app", key); } catch { /* ignore */ }
}

/** สีอ่อนของการ์ดจาก theme_color แอป (#rrggbb) — ไม่ได้ตั้ง = การ์ดขาว */
function tintStyle(color: string | null): React.CSSProperties | undefined {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? { background: `${color}1f`, borderColor: `${color}55` } : undefined;
}

function OrbitIcon({ icon, iconUrl, size }: { icon: string | null; iconUrl: string | null; size: number }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r2ImageUrl(iconUrl, size * 2) ?? ""} alt="" className="object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="leading-none shrink-0" style={{ fontSize: size * 0.82 }}>{icon ?? "📦"}</span>;
}

export function AppOrbit({ apps, query, onQueryChange, greeting, title = "วันนี้จะเข้าแอปไหน", accent, initialKey }: {
  /** null = กำลังโหลด */
  apps: OrbitApp[] | null;
  query: string;
  onQueryChange: (q: string) => void;
  greeting: string;
  title?: string;
  accent?: string;
  /** แอปที่เลือกไว้ตอนเปิด (เช่น แอปที่ใช้ล่าสุด) */
  initialKey?: string | null;
}) {
  const router = useRouter();
  const layout = useViewportLayout();
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el); setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const narrow = layout === "phone" || (boxW > 0 && boxW < NARROW_W);

  const list = apps ?? [];
  const n = list.length;
  const [selKey, setSelKey] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // เลือกแอปเริ่มต้นเมื่อโหลดเสร็จ / รายการแอปเปลี่ยน
  useEffect(() => {
    if (!n) return;
    const has = (k: string | null | undefined) => !!k && list.some((a) => a.key === k);
    const k = has(selKey) ? selKey! : has(initialKey) ? initialKey! : list[0].key;
    setSelKey(k);
    setRot((r) => snapRotation(r, list.findIndex((a) => a.key === k), n));   // จำนวนแอปเปลี่ยน = ระยะห่างการ์ดเปลี่ยน → จัดใบที่เลือกขึ้นบนใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, initialKey]);
  const selIndex = Math.max(0, list.findIndex((a) => a.key === selKey));
  const selected = n ? list[selIndex] : null;

  const select = (i: number) => {
    if (!n) return;
    const idx = ((i % n) + n) % n;
    setSelKey(list[idx].key);
    setRot((r) => snapRotation(r, idx, n));
    setExpanded(false);
  };
  const openApp = (a: OrbitApp) => { rememberActiveApp(a.key); router.push(a.homeHref); };
  const onCard = (i: number) => { if (list[i].key === selKey && !query) openApp(list[i]); else select(i); };

  const results = useMemo(() => searchOrbit(list, query), [list, query]);
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results[0]) { rememberActiveApp(results[0].app.key); router.push(results[0].menu.href); }
    if (e.key === "Escape") onQueryChange("");
  };

  // ลากหมุนวง (เริ่มนับเป็น "ลาก" เมื่อขยับเกิน 6px — คลิกการ์ดธรรมดายังทำงาน)
  const drag = useRef<{ x: number; y: number; a0: number; r0: number; on: boolean; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const angleAt = (cx: number, cy: number) => {
    const b = boxRef.current!.getBoundingClientRect();
    return Math.atan2(cy - (b.top + STAGE_H / 2), cx - (b.left + b.width / 2));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (narrow || !n || (e.target as HTMLElement).closest("[data-orbit-hub]")) return;
    drag.current = { x: e.clientX, y: e.clientY, a0: angleAt(e.clientX, e.clientY), r0: rot, on: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.on = true; setDragging(true);
      try { boxRef.current?.setPointerCapture(d.id); } catch { /* ignore */ }
    }
    if (d.on) setRot(d.r0 + angleAt(e.clientX, e.clientY) - d.a0);
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (!d?.on) return;
    setDragging(false);
    select(topIndex(rot, n));   // ปล่อยแล้วแอปที่อยู่บนสุดถูกเลือก
  };

  // ปัดซ้ายขวา (แบบแกลเลอรีมือถือ)
  const swipe = useRef<number | null>(null);
  const swiped = useRef(false);

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

  if (apps === null) {
    return <div ref={boxRef} className="py-24 text-center text-sm text-slate-400">กำลังโหลดแอป…</div>;
  }
  if (!n) {
    return (
      <div ref={boxRef} className="py-20 text-center">
        <div className="text-5xl mb-3 opacity-40">🔒</div>
        <p className="text-slate-500 text-sm">ยังไม่มีแอปที่คุณเข้าได้ — ติดต่อแอดมินเพื่อขอสิทธิ์</p>
      </div>
    );
  }

  // ===== มือถือ / จอแคบ: แกลเลอรี =====
  if (narrow) {
    return (
      <div ref={boxRef}>
        <div className="text-center px-1">{hub}</div>
        <div className="relative mt-4 h-[150px] overflow-hidden touch-pan-y select-none"
          onPointerDown={(e) => { swipe.current = e.clientX; swiped.current = false; }}
          onPointerUp={(e) => {
            if (swipe.current === null) return;
            const dx = e.clientX - swipe.current; swipe.current = null;
            if (Math.abs(dx) > 30) { swiped.current = true; select(selIndex + (dx < 0 ? 1 : -1)); }
          }}>
          {list.map((a, i) => {
            const k = gallerySlot(i, selIndex, n);
            const ak = Math.abs(k);
            const x = k === 0 ? 0 : Math.sign(k) * (96 + (ak - 1) * 70);
            const s = k === 0 ? 1.2 : ak === 1 ? 0.88 : 0.74;
            const dim = !orbitAppMatches(a, query);
            return (
              <button key={a.key} type="button" aria-label={a.label} tabIndex={ak > 2 ? -1 : 0}
                onClick={() => { if (swiped.current) { swiped.current = false; return; } onCard(i); }}
                className="absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5 transition-all duration-500 ease-out motion-reduce:transition-none"
                style={{ width: CARD_W, transform: `translate(calc(-50% + ${x}px), -50%) scale(${s})`, opacity: ak > 2 ? 0 : dim ? 0.25 : 1, zIndex: 10 - ak, pointerEvents: ak > 2 ? "none" : undefined }}>
                <span className={`w-16 h-16 rounded-2xl border flex items-center justify-center bg-white ${k === 0 ? "border-slate-300 shadow-md ring-2 ring-blue-500 ring-offset-2" : "border-slate-200 shadow-sm"}`} style={tintStyle(a.color)}>
                  <OrbitIcon icon={a.icon} iconUrl={a.iconUrl} size={34} />
                </span>
                <span className={`text-xs max-w-full truncate ${k === 0 ? "font-semibold text-slate-900" : "text-slate-500"}`}>{a.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-2">
          <button type="button" onClick={() => select(selIndex - 1)} aria-label="แอปก่อนหน้า" className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">‹</button>
          <span className="text-xs tabular-nums text-slate-500">{String(selIndex + 1).padStart(2, "0")} — {String(n).padStart(2, "0")}</span>
          <button type="button" onClick={() => select(selIndex + 1)} aria-label="แอปถัดไป" className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">›</button>
        </div>
        <div className="mt-3 bg-white border border-slate-200/70 rounded-2xl p-3">{panel(8)}</div>
      </div>
    );
  }

  // ===== จอคอม: วงแอปรอบแผงกลาง =====
  const W = Math.min(boxW || 900, 980);
  const rx = W / 2 - CARD_W / 2 - 8;
  const ry = STAGE_H / 2 - CARD_H / 2 - 6;
  return (
    <div ref={boxRef} role="group" aria-label="วงแอป" tabIndex={-1}
      className={`relative mx-auto select-none ${dragging ? "cursor-grabbing" : ""}`} style={{ height: STAGE_H, maxWidth: 980 }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "ArrowRight") { e.preventDefault(); select(selIndex + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); select(selIndex - 1); }
      }}>
      {list.map((a, i) => {
        const p = orbitPoint(i, n, rot, rx, ry);
        const isSel = i === selIndex;
        const dim = !orbitAppMatches(a, query);
        return (
          <button key={a.key} type="button" aria-label={a.label} aria-pressed={isSel} onClick={() => { if (!dragging) onCard(i); }}
            title={isSel ? `เปิดแอป${a.label}` : a.label}
            className={`group absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5 ease-out motion-reduce:transition-none ${dragging ? "" : "transition-all duration-500"}`}
            style={{ width: CARD_W, transform: `translate(${Math.round(p.x - CARD_W / 2)}px, ${Math.round(p.y - CARD_H / 2)}px)`, opacity: dim ? 0.22 : 1, zIndex: isSel ? 20 : 10 }}>
            <span className={`w-[60px] h-[60px] rounded-2xl border flex items-center justify-center bg-white transition-transform duration-200 group-hover:scale-110 group-hover:shadow-md ${isSel ? "border-slate-300 shadow-md ring-2 ring-blue-500 ring-offset-2" : "border-slate-200 shadow-sm"}`}
              style={tintStyle(a.color)}>
              <OrbitIcon icon={a.icon} iconUrl={a.iconUrl} size={32} />
            </span>
            <span className={`text-xs leading-tight max-w-full truncate px-0.5 ${isSel ? "font-semibold text-slate-900" : "text-slate-600"}`}>{a.label}</span>
          </button>
        );
      })}
      <div data-orbit-hub className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] max-w-[calc(100%-240px)] text-center z-30">
        {hub}
        <div className="mt-3 text-left">{panel(PANEL_ROWS)}</div>
      </div>
      <p className="absolute left-0 bottom-0 text-[11px] text-slate-400">ลากเพื่อหมุนวง · กดแอปซ้ำเพื่อเปิด</p>
      <p className="absolute right-0 bottom-0 text-[11px] tabular-nums text-slate-400">{String(selIndex + 1).padStart(2, "0")} — {String(n).padStart(2, "0")}</p>
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
        <span className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center" style={tintStyle(app.color)}>
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
