"use client";

/**
 * ป๊อป "ดูหน้าจริง" ของกล่องในแผนผังการทำงาน (เจ้าของเลือก 2026-11-16 แบบ A ป๊อปใหญ่)
 *  - บนสุด: เส้นทางงาน (เส้นเข้า → กล่องนี้ → เส้นออก จาก lib/flow-map) กดกล่องข้าง ๆ = สลับไปดูหน้านั้น · ย่อได้ (จำต่อเครื่อง)
 *  - ซ้าย: หน้าจริงใน iframe (?embed=1 ซ่อนเมนู) ย่อให้พอดี · ปุ่มบันทึก/ลบ/ส่ง ถูกล็อก + ส่งข้อมูลออก (POST/PATCH/...) ถูกกัน
 *  - ชี้ปุ่ม/ช่อง = บอกชื่อ + กดแล้วทำอะไร (lib/flow-map-pages partForText)
 *  - ขวา 3 แท็บ: ส่วนของหน้า (ทะเบียน) · ดึงข้อมูลจาก (จับจากตอนหน้าโหลดจริง → แปลภาษาคน FLOW_API_HUMAN · ชื่อเทคนิคซ่อน) · โซนที่จะแก้
 *  - เลือกโซน 2 แบบ: อิสระ (วาด/ลากย้าย/ลากมุมขยาย) · ล็อกตามกล่อง (ชี้ส่วนของหน้าแล้วกด) · ลบ = Delete / × / ถังขยะ · Ctrl+Z เรียกคืน
 *  - คัดลอกทั้งหมด = ข้อความ (หน้า · เส้นทางงาน · ข้อมูล · โซน+โน้ต) + รูปหน้าจริงพร้อมกรอบเลขโซน (lib/page-snapshot)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { usePushToast } from "@/components/toast";
import { FLOW_EDGES, FLOW_EDGE_TYPES, FLOW_NODES, type FlowEdgeType } from "@/lib/flow-map";
import { DANGER_TEXT, FLOW_PAGE_INFO, apiHuman, pageKey, partForText } from "@/lib/flow-map-pages";
import { copyTextAndImage, snapshotFrame } from "@/lib/page-snapshot";
import { shortcutKey } from "@/lib/shortcut-key";

const FRAME_W = 1280;   // หน้าจริงวาดที่ความกว้างจอ PC แล้วย่อ
const FLOW_KEY = "erp.flowMap.previewFlowOpen";
/** API ที่ทุกหน้าเรียก (เมนู/ผู้ใช้/สิทธิ์) — ไม่นับเป็นข้อมูลของหน้า */
const NOISE = /^\/api\/(menu|me|user|users\/me|auth|notifications|page-view|presence|perf|user-prefs|ui-prefs|permissions|my-|bell|push|heartbeat|app-version|version|issue-reports\/count)/;

type Zone = { id: string; x: number; y: number; w: number; h: number; note: string; kind: "free" | "snap"; el?: string };
type Api = { key: string; path: string; write: boolean; th: string | null; n: number };
type Tab = "parts" | "data" | "zones";
type Hover = { kind: string; text: string; does: string | null; locked: boolean } | null;
const newId = () => Math.random().toString(36).slice(2, 9);
const KIND_TH: Record<string, string> = { BUTTON: "ปุ่ม", A: "ลิงก์", INPUT: "ช่องกรอก", SELECT: "ตัวเลือก", TEXTAREA: "ช่องข้อความ", LABEL: "ป้าย" };

/** ข้อความสั้นที่บอกว่าองค์ประกอบนี้คืออะไร (ตัวหนังสือบนปุ่ม / aria-label / placeholder / หัวข้อแรก) */
function elText(el: Element): string {
  const h = el as HTMLElement & { placeholder?: string };
  const raw = el.getAttribute("aria-label") || el.getAttribute("title") || h.innerText || h.placeholder || "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}
/** จากจุดที่ชี้ → กล่องที่มีความหมาย (ปุ่ม/ช่อง/ตาราง/การ์ด/ส่วนหน้า) ไม่เอาตัวหนังสือ/ไอคอนเล็ก ๆ */
function pickBlock(el: Element | null, doc: Document): Element | null {
  let cur: Element | null = el;
  while (cur && cur !== doc.body) {
    const tag = cur.tagName, r = cur.getBoundingClientRect();
    if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|TABLE|FORM|SECTION|HEADER|NAV|ASIDE)$/.test(tag) || cur.getAttribute("role") === "dialog" || cur.getAttribute("role") === "tabpanel") return cur;
    if (r.width * r.height >= 6000 && r.width >= 80 && getComputedStyle(cur).display !== "inline") return cur;
    cur = cur.parentElement;
  }
  return el;
}

/** page = เปิดจากลิงก์หน้าเลย (การ์ด "หน้าใน ERP" บนกระดาน · 2026-11-22) — หน้าที่อยู่ในผังระบบจะเห็นเส้นทางงานด้วย */
export function FlowPagePreview({ nodeId, onClose, numOf, page }: { nodeId: string | null; onClose: () => void; numOf?: (edgeId: string) => number | null; page?: { href: string; label: string } | null }) {
  const t = useT();
  const pushToast = usePushToast();
  const fromPage = useMemo(() => (page ? Object.keys(FLOW_NODES).find((k) => FLOW_NODES[k].href === page.href) ?? null : null), [page]);
  const [node, setNode] = useState<string | null>(nodeId ?? fromPage);
  useEffect(() => { setNode(nodeId ?? fromPage); }, [nodeId, fromPage]);
  const n = node ? FLOW_NODES[node] : page ? { label: page.label, href: page.href } as (typeof FLOW_NODES)[string] : null;
  const href = n?.href ?? null;
  const info = href ? FLOW_PAGE_INFO[pageKey(href)] : undefined;

  // หน้าในกรอบใช้ sessionStorage ร่วมกับหน้าหลัก (โดเมน/แท็บเดียวกัน) → จดเส้นทางย้อนกลับ/โหมด embed ทับของหน้าหลัก
  // ปิดป๊อปแล้วคืนค่าเดิม (ปุ่มย้อนกลับของหน้าหลักไม่พาไปหน้าตัวอย่าง)
  useEffect(() => {
    const keys = ["erp.navTrail.v1", "erp_shell_embed"];
    let before: (string | null)[] = [];
    try { before = keys.map((k) => sessionStorage.getItem(k)); } catch { return; }
    return () => { try { keys.forEach((k, i) => (before[i] === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, before[i]!))); } catch { /* */ } };
  }, []);
  const [mode, setMode] = useState<"look" | "zone">("look");
  const [zm, setZm] = useState<"free" | "snap">("free");
  const [tab, setTab] = useState<Tab>("parts");
  const [showTech, setShowTech] = useState(false);
  const [flowOpen, setFlowOpen] = useState(true);
  useEffect(() => { try { setFlowOpen(localStorage.getItem(FLOW_KEY) !== "0"); } catch { /* */ } }, []);
  const toggleFlow = () => { const v = !flowOpen; setFlowOpen(v); try { localStorage.setItem(FLOW_KEY, v ? "1" : "0"); } catch { /* */ } };

  // โซนแยกตามหน้า (สลับไปดูหน้าอื่นแล้วกลับมา โซนเดิมยังอยู่)
  const [zonesBy, setZonesBy] = useState<Record<string, Zone[]>>({});
  const zones = useMemo(() => (node ? zonesBy[node] ?? [] : []), [zonesBy, node]);
  const setZones = useCallback((fn: (z: Zone[]) => Zone[]) => { if (node) setZonesBy((m) => ({ ...m, [node]: fn(m[node] ?? []) })); }, [node]);
  const [sel, setSel] = useState<string | null>(null);
  const trashRef = useRef<{ node: string; z: Zone; i: number }[]>([]);
  const removeZone = useCallback((id: string) => {
    if (!node) return;
    setZones((zs) => { const i = zs.findIndex((z) => z.id === id); if (i >= 0) trashRef.current.push({ node, z: zs[i], i }); return zs.filter((z) => z.id !== id); });
    setSel(null);
  }, [node, setZones]);
  const undoRemove = useCallback(() => {
    const last = trashRef.current.pop();
    if (!last) return;
    setZonesBy((m) => { const zs = [...(m[last.node] ?? [])]; zs.splice(Math.min(last.i, zs.length), 0, last.z); return { ...m, [last.node]: zs }; });
  }, []);

  // ── หน้าจริงใน iframe ──
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useEffect(() => {
    if (!box) return;
    const fit = () => setSize({ w: box.clientWidth, h: box.clientHeight });
    fit();
    const ro = new ResizeObserver(fit); ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const scale = Math.min(1, size.w / FRAME_W);
  const frameH = Math.max(300, Math.round(size.h / scale));
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [apis, setApis] = useState<Record<string, Api>>({});
  const modeRef = useRef(mode); modeRef.current = mode;
  const infoRef = useRef(info); infoRef.current = info;
  useEffect(() => { setLoaded(false); setApis({}); setHover(null); setScroll({ x: 0, y: 0 }); setSel(null); }, [href]);

  const noteApi = useCallback((url: string, method: string) => {
    const a = apiHuman(url, method);
    if (!a.path.startsWith("/api/") || NOISE.test(a.path)) return;
    const id = `${a.write ? "w" : "r"}:${a.key}`;
    setApis((m) => ({ ...m, [id]: { ...a, n: (m[id]?.n ?? 0) + 1 } }));
  }, []);

  const onFrameLoad = () => {
    const f = frameRef.current, win = f?.contentWindow as (Window & typeof globalThis) | null, doc = f?.contentDocument;
    if (!win || !doc) return;
    setLoaded(true);
    try {
      // ข้อมูลที่หน้าโหลดไปแล้ว (ก่อนเราเข้าไปดัก) + ที่โหลดต่อจากนี้
      for (const e of win.performance.getEntriesByType("resource") as PerformanceResourceTiming[]) if (/fetch|xmlhttprequest/.test(e.initiatorType)) noteApi(e.name, "GET");
      const po = new win.PerformanceObserver((list) => { for (const e of list.getEntries() as PerformanceResourceTiming[]) if (/fetch|xmlhttprequest/.test(e.initiatorType)) noteApi(e.name, "GET"); });
      po.observe({ type: "resource", buffered: false });
      // กันส่งข้อมูลออก (บันทึก/ลบ/ส่ง) — หน้าตัวอย่างดูได้อย่างเดียว · จดไว้ว่าจะบันทึกไปที่ไหน
      const orig = win.fetch.bind(win);
      win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (method !== "GET" && method !== "HEAD") {
          noteApi(url, method);
          setHover({ kind: "", text: "", does: null, locked: true });
          return Promise.resolve(new win.Response(JSON.stringify({ error: "หน้าตัวอย่างล็อกการบันทึกไว้ — เปิดหน้าจริงเพื่อทำงาน" }), { status: 423, headers: { "Content-Type": "application/json" } }));
        }
        return orig(input, init);
      }) as typeof win.fetch;
    } catch { /* หน้าแปลก ๆ — ยังดูได้ */ }
    win.addEventListener("scroll", () => setScroll({ x: win.scrollX, y: win.scrollY }), { passive: true });
    // ล็อกปุ่มอันตราย (กดก่อนหน้าเห็น)
    doc.addEventListener("click", (ev) => {
      const el = (ev.target as Element | null)?.closest?.("button, a, [role=button], input[type=submit]");
      if (el && DANGER_TEXT.test(elText(el))) { ev.preventDefault(); ev.stopPropagation(); setHover({ kind: KIND_TH[el.tagName] ?? "ปุ่ม", text: elText(el), does: partForText(infoRef.current, elText(el))?.does ?? null, locked: true }); }
    }, true);
    doc.addEventListener("submit", (ev) => { ev.preventDefault(); ev.stopPropagation(); }, true);
    // ชี้ปุ่ม/ช่อง → บอกชื่อ + กดแล้วทำอะไร
    doc.addEventListener("mouseover", (ev) => {
      if (modeRef.current !== "look") return;
      const el = (ev.target as Element | null)?.closest?.("button, a, [role=button], input, select, textarea, label, th, h1, h2, h3");
      if (!el) return;
      const text = elText(el);
      if (!text) return;
      setHover({ kind: KIND_TH[el.tagName] ?? (/^H\d$/.test(el.tagName) ? "หัวข้อ" : el.tagName === "TH" ? "หัวคอลัมน์" : "ส่วน"), text, does: partForText(infoRef.current, text)?.does ?? null, locked: false });
    });
  };

  // ── วาด/ย้าย/ขยาย/เลือกกล่อง บนแผ่นใสทับหน้าจริง ──
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [snapRect, setSnapRect] = useState<{ x: number; y: number; w: number; h: number; label: string } | null>(null);
  const dragRef = useRef<{ t: "new" | "move" | "size"; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  /** จุดบนแผ่นใส → พิกัดบนหน้า (px ของหน้า รวมระยะเลื่อน) */
  const toDoc = (e: { clientX: number; clientY: number }) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale + scroll.x, y: (e.clientY - r.top) / scale + scroll.y, vx: (e.clientX - r.left) / scale, vy: (e.clientY - r.top) / scale };
  };
  const onOverlayDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (mode !== "zone") return;
    overlayRef.current?.focus();
    const p = toDoc(e);
    if (zm === "snap") {
      if (!snapRect) return;
      const z: Zone = { id: newId(), x: snapRect.x, y: snapRect.y, w: snapRect.w, h: snapRect.h, note: "", kind: "snap", el: snapRect.label };
      setZones((zs) => [...zs, z]); setSel(z.id); setTab("zones");
      return;
    }
    const target = e.target as HTMLElement;
    const zid = target.closest<HTMLElement>("[data-zone]")?.dataset.zone;
    const sizing = !!target.closest("[data-size]");
    e.currentTarget.setPointerCapture(e.pointerId);
    if (zid) {
      const z = zones.find((q) => q.id === zid)!;
      setSel(zid);
      dragRef.current = { t: sizing ? "size" : "move", id: zid, sx: p.x, sy: p.y, ox: z.x, oy: z.y, ow: z.w, oh: z.h };
    } else {
      const z: Zone = { id: newId(), x: p.x, y: p.y, w: 0, h: 0, note: "", kind: "free" };
      setZones((zs) => [...zs, z]); setSel(z.id);
      dragRef.current = { t: "new", id: z.id, sx: p.x, sy: p.y, ox: p.x, oy: p.y, ow: 0, oh: 0 };
    }
  };
  const onOverlayMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (mode !== "zone") return;
    const p = toDoc(e);
    if (zm === "snap") {
      const doc = frameRef.current?.contentDocument;
      const el = doc ? pickBlock(doc.elementFromPoint(p.vx, p.vy), doc) : null;
      if (!el) { setSnapRect(null); return; }
      const r = el.getBoundingClientRect();
      setSnapRect({ x: r.left + scroll.x, y: r.top + scroll.y, w: r.width, h: r.height, label: `${KIND_TH[el.tagName] ?? el.tagName.toLowerCase()}${elText(el) ? ` “${elText(el).slice(0, 40)}”` : ""}` });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = p.x - d.sx, dy = p.y - d.sy;
    setZones((zs) => zs.map((z) => {
      if (z.id !== d.id) return z;
      if (d.t === "new") return { ...z, x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(dx), h: Math.abs(dy) };
      if (d.t === "move") return { ...z, x: d.ox + dx, y: d.oy + dy };
      return { ...z, w: Math.max(20, d.ow + dx), h: Math.max(16, d.oh + dy) };
    }));
  };
  const onOverlayUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (d?.t === "new") {
      setZones((zs) => zs.filter((z) => z.id !== d.id || (z.w >= 12 && z.h >= 12)));
      setTab("zones");
    }
  };

  // Delete / Backspace = ลบโซนที่เลือก · Ctrl+Z = เรียกคืนโซนที่เพิ่งลบ (ไม่ทำงานตอนพิมพ์ในช่อง)
  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); removeZone(sel); }
      else if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "z" && trashRef.current.length) { e.preventDefault(); undoRemove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, sel, removeZone, undoRemove]);

  // ── เส้นทางงาน ──
  const flows = useMemo(() => {
    if (!node) return { inn: [], out: [] };
    const all = Object.entries(FLOW_EDGES);
    const pack = ([id, e]: [string, (typeof FLOW_EDGES)[string]], other: string) => ({ id, other, type: e.type as FlowEdgeType, title: e.title, num: numOf?.(id) ?? null });
    return { inn: all.filter(([, e]) => e.to === node && e.from !== node).map((x) => pack(x, x[1].from)), out: all.filter(([, e]) => e.from === node && e.to !== node).map((x) => pack(x, x[1].to)) };
  }, [node, numOf]);

  // ── คัดลอกทั้งหมด ──
  const apiList = useMemo(() => Object.values(apis).sort((a, b) => Number(a.write) - Number(b.write) || a.key.localeCompare(b.key)), [apis]);
  const buildText = () => {
    if (!n) return "";
    const L: string[] = [`หน้า: ${n.label} (${href})`];
    if (flows.inn.length || flows.out.length) {
      L.push("เส้นทางงาน:");
      for (const f of flows.inn) L.push(`- เข้า ← ${FLOW_NODES[f.other]?.label ?? f.other}${f.num ? ` (เส้น ${f.num})` : ""} · ${FLOW_EDGE_TYPES[f.type].label}: ${f.title}`);
      for (const f of flows.out) L.push(`- ออก → ${FLOW_NODES[f.other]?.label ?? f.other}${f.num ? ` (เส้น ${f.num})` : ""} · ${FLOW_EDGE_TYPES[f.type].label}: ${f.title}`);
    }
    if (apiList.length) {
      L.push("ดึง/บันทึกข้อมูล:");
      for (const a of apiList) L.push(`- ${a.write ? "บันทึก" : "อ่าน"}: ${a.th ?? "(ยังไม่มีคำอธิบาย)"} [${a.key}]`);
    }
    L.push("โซนที่อยากแก้:");
    zones.forEach((z, i) => L.push(`${i + 1}. ${z.kind === "snap" ? `ส่วน ${z.el ?? ""}` : `กรอบ x${Math.round(z.x)} y${Math.round(z.y)} กว้าง${Math.round(z.w)} สูง${Math.round(z.h)} px (จอกว้าง ${FRAME_W})`}: ${z.note.trim() || "(ยังไม่ได้เขียน)"}`));
    if (!zones.length) L.push("(ยังไม่ได้เลือกโซน)");
    L.push("[รูปแนบ: หน้าจริงพร้อมกรอบเลขโซน]");
    return L.join("\n");
  };
  const [copying, setCopying] = useState(false);
  const copyAll = async () => {
    setCopying(true);
    const text = buildText();
    let png: Blob | null = null;
    try {
      const f = frameRef.current;
      if (f && loaded) png = await snapshotFrame(f, zones.map((z, i) => ({ x: z.x - scroll.x, y: z.y - scroll.y, w: z.w, h: z.h, n: i + 1 })));
    } catch { png = null; }
    try {
      const r = await copyTextAndImage(png ? text : text.replace("[รูปแนบ: หน้าจริงพร้อมกรอบเลขโซน]", ""), png);
      pushToast("success", r === "both" ? t("คัดลอกข้อความ + รูปแล้ว — วางในแชต Claude ได้เลย", "Copied text + image") : t("คัดลอกข้อความแล้ว (เบราว์เซอร์นี้ใส่รูปไม่ได้)", "Copied text only"));
    } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
    setCopying(false);
  };

  if ((!nodeId && !page) || !n) return null;
  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-2.5 text-[12.5px] border-b-2 whitespace-nowrap ${tab === k ? "border-violet-600 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
  );
  const segBtn = (on: boolean) => `h-7 px-2.5 text-[12px] inline-flex items-center gap-1 ${on ? "bg-violet-100 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`;
  const flowBox = (id: string, title: string) => {
    const o = FLOW_NODES[id];
    return (
      <button type="button" disabled={!o?.href} onClick={() => o?.href && setNode(id)} title={title}
        className={`h-8 px-2.5 rounded-lg border text-[12px] whitespace-nowrap ${o?.href ? "border-slate-300 bg-white hover:border-violet-400 hover:text-violet-700" : "border-dashed border-slate-300 text-slate-400"}`}>{o?.label ?? id}</button>
    );
  };
  const arrow = (type: FlowEdgeType, num: number | null, title: string) => {
    const ty = FLOW_EDGE_TYPES[type];
    return (
      <span className="inline-flex flex-col items-center min-w-[64px]" title={title}>
        <span className="text-[10px] leading-3 whitespace-nowrap" style={{ color: ty.color }}>{num ? `${num} · ` : ""}{ty.label}</span>
        <svg width="64" height="10" viewBox="0 0 64 10" aria-hidden="true"><line x1="2" y1="5" x2="56" y2="5" stroke={ty.color} strokeWidth="2" strokeDasharray={ty.dash} /><path d="M54 1L62 5L54 9" fill="none" stroke={ty.color} strokeWidth="1.6" /></svg>
      </span>
    );
  };
  const hasNotes = Object.values(zonesBy).some((zs) => zs.some((z) => z.note.trim()));

  return (
    <ERPModal open onClose={onClose} title={t(`ดูหน้าจริง · ${n.label}`, `Live page · ${n.label}`)} storageKey="flow-page-preview" hasUnsavedChanges={hasNotes}>
      <div className="flex h-full min-h-[70vh] flex-col gap-2">
        {/* แถบบน: โหมด + เปิดหน้า */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-500">{href ?? t("กล่องนี้ไม่มีหน้า", "No page")}</span>
          <span className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button type="button" className={segBtn(mode === "look")} onClick={() => { setMode("look"); setSnapRect(null); }}><Icon value="i:eye" />{t("ดู", "View")}</button>
            <button type="button" className={segBtn(mode === "zone")} onClick={() => { setMode("zone"); setTab("zones"); }}><Icon value="i:pencil" />{t("เลือกโซน", "Mark zones")}</button>
          </span>
          {mode === "zone" && (
            <span className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              <button type="button" className={segBtn(zm === "free")} onClick={() => { setZm("free"); setSnapRect(null); }} title={t("วาดกรอบตรงไหนก็ได้ ลากย้าย/ลากมุมขยาย", "Draw anywhere")}>{t("อิสระ", "Free")}</button>
              <button type="button" className={segBtn(zm === "snap")} onClick={() => setZm("snap")} title={t("ชี้ส่วนของหน้า แล้วกดเลือกทั้งกล่อง", "Pick a page part")}>{t("ล็อกตามกล่อง", "Snap to part")}</button>
            </span>
          )}
          <span className="flex-1" />
          {href && <a href={href} target="_blank" rel="noopener" className="h-8 px-3 inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-[12px] text-white hover:bg-indigo-700">{t("เปิดหน้า", "Open")} <Icon value="i:external-link" /></a>}
        </div>

        {/* เส้นทางงาน */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-slate-500">{t("เส้นทางงาน — กดกล่องข้าง ๆ = ดูหน้านั้นต่อ", "Work flow — click a neighbour to open it")}</span>
            <span className="flex-1" />
            <button type="button" onClick={toggleFlow} className="text-[11px] text-slate-500 hover:text-slate-800">{flowOpen ? t("ย่อ ▲", "Hide ▲") : t("ขยาย ▼", "Show ▼")}</button>
          </div>
          {flowOpen && (
            <div className="mt-1.5 flex flex-col items-stretch gap-2 overflow-x-auto sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1">
                {flows.inn.length ? flows.inn.map((f) => <div key={f.id} className="flex items-center gap-1">{flowBox(f.other, f.title)}{arrow(f.type, f.num, f.title)}</div>)
                  : <span className="text-[11px] text-slate-400">{t("ไม่มีงานส่งเข้ามา", "Nothing flows in")}</span>}
              </div>
              <span className="self-center rounded-lg border-2 border-violet-600 bg-violet-50 px-3 py-1.5 text-[12.5px] font-semibold text-violet-800 whitespace-nowrap">{n.label}</span>
              <div className="flex flex-col gap-1">
                {flows.out.length ? flows.out.map((f) => <div key={f.id} className="flex items-center gap-1">{arrow(f.type, f.num, f.title)}{flowBox(f.other, f.title)}</div>)
                  : <span className="text-[11px] text-slate-400">{t("ไม่ได้ส่งต่อไปไหน", "Nothing flows out")}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          {/* หน้าจริง */}
          <div className="flex min-h-[50vh] flex-col">
            <div ref={setBox} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {href ? (
                <>
                  <iframe key={href} ref={frameRef} src={`${href}${href.includes("?") ? "&" : "?"}embed=1`} title={n.label} onLoad={onFrameLoad}
                    // กันหน้าในกรอบสั่งย้ายหน้าหลัก (เช่น ด่านล็อกอินเด้งไปหน้าแรก) · ยังโดเมนเดียวกัน = ล็อกอิน/อ่านข้อมูลได้
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                    className="absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: FRAME_W, height: frameH, transform: `scale(${scale})` }} />
                  {!loaded && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-slate-400">{t("กำลังโหลดหน้าจริง...", "Loading the page...")}</div>}
                  {/* แผ่นใส: โหมดดู = กดทะลุ · โหมดเลือกโซน = วาด/เลือก */}
                  <div ref={overlayRef} tabIndex={-1} className={`absolute inset-0 outline-none ${mode === "zone" ? (zm === "free" ? "cursor-crosshair" : "cursor-pointer") : "pointer-events-none"}`}
                    onPointerDown={onOverlayDown} onPointerMove={onOverlayMove} onPointerUp={onOverlayUp} onPointerLeave={() => setSnapRect(null)}>
                    {zones.map((z, i) => (
                      <div key={z.id} data-zone={z.id}
                        className={`absolute rounded ${z.id === sel ? "border-2 border-orange-500 bg-orange-500/10" : z.kind === "snap" ? "border-2 border-violet-600 bg-violet-500/10" : "border-2 border-dashed border-violet-600 bg-violet-500/10"} ${mode === "zone" && zm === "free" ? "cursor-move" : ""}`}
                        style={{ left: (z.x - scroll.x) * scale, top: (z.y - scroll.y) * scale, width: z.w * scale, height: z.h * scale }}>
                        <span className="absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-700 text-[11px] font-semibold text-white">{i + 1}</span>
                        {mode === "zone" && (
                          <button type="button" onPointerDown={(e) => { e.stopPropagation(); removeZone(z.id); }} aria-label={t("ลบโซน", "Remove zone")}
                            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] text-slate-600 hover:text-rose-600">×</button>
                        )}
                        {mode === "zone" && z.kind === "free" && <span data-size className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-violet-700" />}
                      </div>
                    ))}
                    {mode === "zone" && zm === "snap" && snapRect && (
                      <div className="pointer-events-none absolute rounded border-2 border-sky-500 bg-sky-500/10"
                        style={{ left: (snapRect.x - scroll.x) * scale, top: (snapRect.y - scroll.y) * scale, width: snapRect.w * scale, height: snapRect.h * scale }}>
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-sky-600 px-1.5 text-[10.5px] text-white">{snapRect.label}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : <div className="flex h-full items-center justify-center text-[13px] text-slate-400">{t("กล่องนี้ไม่มีหน้าในระบบ", "This box has no page")}</div>}
            </div>
            {/* แถบใต้หน้า: ชี้อะไรอยู่ / ล็อก */}
            <div className="mt-1.5 min-h-[22px] text-[12px]">
              {mode === "zone" ? (
                <span className="text-slate-500">{zm === "free" ? t("ลากวาดกรอบ · ลากกรอบ = ย้าย · มุมขวาล่าง = ขยาย · กดกรอบแล้วกด Delete = ลบ · Ctrl+Z = เรียกคืน", "Drag to draw · drag to move · corner to resize · Delete removes · Ctrl+Z restores") : t("ชี้ที่ส่วนของหน้า แล้วกดเพื่อเลือกทั้งกล่อง", "Point at a part and click to select it")}</span>
              ) : hover?.locked ? (
                <span className="text-amber-700"><Icon value="i:lock" /> {t("หน้าตัวอย่างล็อกการบันทึก/ลบไว้ (กันแก้ข้อมูลจริง)", "Saving is locked in the preview")}{hover.text ? ` — ${hover.kind} “${hover.text}”${hover.does ? ` · กดแล้ว: ${hover.does}` : ""}` : ""}</span>
              ) : hover ? (
                <span className="text-slate-600">{t("ชี้อยู่", "Pointing at")}: {hover.kind} <b className="font-medium">“{hover.text}”</b>{hover.does ? <> · {t("กดแล้ว", "Click")}: {hover.does}</> : <span className="text-slate-400"> · {t("ยังไม่มีคำอธิบายในทะเบียน", "No description yet")}</span>}</span>
              ) : <span className="text-slate-400">{t("ชี้ที่ปุ่ม/ช่องในหน้า เพื่อดูว่ากดแล้วทำอะไร · ปุ่มบันทึก/ลบถูกล็อกไว้", "Hover a button to see what it does · saving is locked")}</span>}
            </div>
          </div>

          {/* คำอธิบาย / ข้อมูล / โซน */}
          <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex border-b border-slate-200 px-2">{tabBtn("parts", t("ส่วนของหน้า", "Parts"))}{tabBtn("data", t("ดึงข้อมูลจาก", "Data"))}{tabBtn("zones", t(`โซนที่จะแก้ ${zones.length}`, `Zones ${zones.length}`))}</div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[12.5px]">
              {tab === "parts" && (info ? (
                <>
                  <p className="mb-2 text-slate-600">{info.summary}</p>
                  {info.parts.map((p, i) => (
                    <div key={i} className="mb-2 rounded-lg border border-slate-200 p-2">
                      <div className="font-medium text-slate-800">{p.label}</div>
                      <div className="text-slate-600">{p.does}</div>
                      {p.data && <div className="mt-0.5 text-[11.5px] text-emerald-700"><Icon value="i:database" /> {p.data}</div>}
                    </div>
                  ))}
                </>
              ) : <p className="text-slate-400">{t("หน้านี้ยังไม่มีคำอธิบายในทะเบียน (lib/flow-map-pages-data.ts)", "No description for this page yet")}</p>)}
              {tab === "data" && (
                <>
                  {!loaded && <p className="text-slate-400">{t("รอหน้าโหลด...", "Waiting for the page...")}</p>}
                  {loaded && !apiList.length && <p className="text-slate-400">{t("ยังไม่เห็นหน้านี้ดึงข้อมูล — ลองเลื่อนหรือกดแท็บในหน้า", "No data calls seen yet")}</p>}
                  {apiList.map((a) => (
                    <div key={`${a.write}${a.key}`} className="mb-2 rounded-lg border border-slate-200 p-2">
                      <span className={`mr-1 rounded px-1.5 text-[10.5px] ${a.write ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{a.write ? t("บันทึกเข้า (ถูกล็อก)", "Writes (locked)") : t("อ่านจาก", "Reads")}</span>
                      {a.th ?? <span className="text-slate-400">{t("ยังไม่มีคำอธิบาย", "No description yet")}</span>}
                      {(showTech || !a.th) && <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">{a.key}</div>}
                    </div>
                  ))}
                  {apiList.length > 0 && (
                    <label className="mt-1 flex items-center gap-1.5 text-[11.5px] text-slate-500"><input type="checkbox" checked={showTech} onChange={(e) => setShowTech(e.target.checked)} />{t("โชว์ชื่อเทคนิค", "Show technical names")}</label>
                  )}
                  <p className="mt-2 text-[11px] text-slate-400">{t("จับจากตอนหน้าโหลดจริง — ตรงกับของจริงเสมอ · กดแท็บ/ตัวกรองในหน้า แล้วรายการเพิ่มเอง", "Captured live from the page")}</p>
                </>
              )}
              {tab === "zones" && (
                <>
                  {mode !== "zone" && <button type="button" onClick={() => setMode("zone")} className="mb-2 w-full rounded-lg border border-dashed border-violet-300 py-2 text-violet-700 hover:bg-violet-50">{t("+ เลือกโซนบนหน้า", "+ Mark a zone")}</button>}
                  {zones.length ? zones.map((z, i) => (
                    <div key={z.id} className={`mb-2 rounded-lg border p-2 ${z.id === sel ? "border-orange-400" : "border-slate-200"}`} onClick={() => setSel(z.id)}>
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-700 text-[11px] font-semibold text-white">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-500">{z.kind === "snap" ? `${t("ล็อกตาม", "Part")}: ${z.el ?? ""}` : t("วาดอิสระ", "Free box")}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeZone(z.id); }} className="text-slate-400 hover:text-rose-600" aria-label={t("ลบโซน", "Remove zone")}><Icon value="i:trash" /></button>
                      </div>
                      <textarea value={z.note} onChange={(e) => { const v = e.target.value; setZones((zs) => zs.map((q) => (q.id === z.id ? { ...q, note: v } : q))); }}
                        placeholder={t("อยากให้แก้อะไรตรงนี้", "What should change here?")} rows={2}
                        className="mt-1.5 w-full resize-y rounded-md border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-violet-400" />
                    </div>
                  )) : <p className="text-slate-400">{t("ยังไม่มีโซน — กด \"เลือกโซน\" แล้ววาดกรอบ หรือเลือกแบบล็อกตามกล่อง", "No zones yet")}</p>}
                  <button type="button" onClick={() => void copyAll()} disabled={copying}
                    className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 text-[12.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                    <Icon value="i:copy" />{copying ? t("กำลังเตรียมรูป...", "Preparing...") : t("คัดลอกทั้งหมด (ข้อความ + รูป)", "Copy all (text + image)")}
                  </button>
                  <p className="mt-1 text-[11px] text-slate-400">{t("ได้: หน้า · เส้นทางงาน · ข้อมูลที่ใช้ · ทุกโซน+โน้ต · รูปหน้าจริงพร้อมกรอบเลข — วางในแชต Claude ได้ทันที", "Includes page, flow, data, zones and an image")}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
