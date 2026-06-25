"use client";

/**
 * เทมเพลตวางรูปเข็มขัด — ลากรูปจริง (ปลายหาง/รู/โลโก้) ไปวาง + ปรับขนาดเอง "ด้านเดียว"
 * วางด้านเดียว → ระบบใช้ทั้งด้านหน้า-หลังให้เหมือนกันอัตโนมัติ · "วางตรงไหน พิมพ์ตรงนั้น" (ไม่ยืดรูป meet)
 * พิกัดเก็บเป็นสัดส่วน 0..1 ของกรอบเข็มขัด → ไม่ผูกกับความสูง (boxH) · บันทึกค่ากลาง 1 ชุด ใช้ทุกใบงาน
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BELT_DEFAULT_PLACE, BELT_DEFAULT_LAYOUT, type BeltImgPlace, type ImgBox, type BeltLayout } from "@/lib/belt-diagram";

const BX = 18, BW = 704;
type Key = "strap" | "hole" | "logo";
type Imgs = { strap: string | null; hole: string | null; logo: string | null };

const KEY_LABEL: Record<Key, string> = { strap: "ทรงปลายหาง (ตัวสาย)", hole: "ลายรู / เจาะรู", logo: "โลโก้" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// เส้นบอกระยะแบบวงเล็บ (ก้านชี้เข้าหาเข็มขัด) — โชว์ในพรีวิว/เทมเพลต
const bracketGeom = (x: number, w: number, y: number, down: boolean) => {
  const t = down ? -6 : 6;
  return { d: `M${x},${y + t} V${y} H${x + w} V${y + t}`, lx: x + w / 2, ly: down ? y + 14 : y - 5 };
};

export default function BeltPlacementPage() {
  const [imgs, setImgs] = useState<Imgs>({ strap: null, hole: null, logo: null });
  const [boxH, setBoxH] = useState<number>(BELT_DEFAULT_LAYOUT.boxH);
  const [base, setBase] = useState<BeltLayout>({});                                  // layout เดิม (เก็บ boxH/frontDim/backDim ไว้ตอนบันทึก)
  const [place, setPlace] = useState<BeltImgPlace>(BELT_DEFAULT_PLACE.front);        // ชุดเดียว ใช้ทั้งหน้า-หลัง
  const [sel, setSel] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [selDim, setSelDim] = useState<"front" | "back" | null>(null);          // เส้นแดงที่เลือก (ห่างโลโก้/ถึงปลายสาย)
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: Key; mode: "move" | "resize"; sx: number; sy: number; box: ImgBox } | null>(null);
  const dimDrag = useRef<{ which: "front" | "back"; mode: "move" | "width"; sx: number; sy: number; dim: { x: number; y: number; w: number } } | null>(null);

  const fd = base.frontDim ?? BELT_DEFAULT_LAYOUT.frontDim;
  const bd = base.backDim ?? BELT_DEFAULT_LAYOUT.backDim;
  const fY = 28;
  const fbY = fY - fd.y, bbY = fY + boxH + bd.y;          // เส้น "ห่างโลโก้" (เหนือ) / "ถึงปลายสาย" (ใต้)
  const VH = Math.max(fY + boxH + 42, bbY + 32);          // เผื่อขอบล่างให้เส้น "ถึงปลายสาย" + ป้ายไม่ตกขอบ

  useEffect(() => {
    apiFetch("/api/mo/belt-component-images?sample=1").then((r) => r.json()).then((j) => {
      setImgs({ strap: j.strap ?? null, hole: j.hole ?? null, logo: j.frontLogo ?? j.backLogo ?? null });
    }).catch(() => {});
    apiFetch("/api/mo/belt-layout").then((r) => r.json()).then((j) => {
      const L = (j.layout ?? {}) as BeltLayout;
      setBase(L);
      if (typeof L.boxH === "number") setBoxH(L.boxH);
      setPlace({ ...BELT_DEFAULT_PLACE.front, ...(L.images?.front ?? L.images?.back ?? {}) });
    }).catch(() => {});
  }, []);

  const hrefOf = (key: Key): string | null => imgs[key];
  const boxOf = (key: Key): ImgBox => place[key] ?? BELT_DEFAULT_PLACE.front[key] ?? { x: 0, y: 0, w: 1, h: 1 };
  const abs = (key: Key) => { const b = boxOf(key); return { x: BX + b.x * BW, y: fY + b.y * boxH, w: b.w * BW, h: b.h * boxH }; };

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left) * (740 / r.width), y: (cy - r.top) * (VH / r.height) };
  };
  const onDown = (key: Key, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toSvg(e.clientX, e.clientY);
    drag.current = { key, mode, sx: c.x, sy: c.y, box: { ...boxOf(key) } };
    setSel(key);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  // ลากเส้นแดง (วงเล็บบอกระยะ) — ย้าย x + ดึงขึ้น/ลง (y) หรือลากปุ่มขวาปรับความกว้าง w
  const dimDown = (which: "front" | "back", mode: "move" | "width") => (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toSvg(e.clientX, e.clientY);
    const dim = which === "front" ? fd : bd;
    dimDrag.current = { which, mode, sx: c.x, sy: c.y, dim: { ...dim } };
    setSelDim(which); setSel(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const c = toSvg(e.clientX, e.clientY);
    const d = drag.current;
    if (d) {
      const dx = (c.x - d.sx) / BW, dy = (c.y - d.sy) / boxH;
      const nb: ImgBox = d.mode === "move"
        ? { ...d.box, x: clamp(d.box.x + dx, 0, 1 - d.box.w), y: clamp(d.box.y + dy, 0, 1 - d.box.h) }
        : { ...d.box, w: clamp(d.box.w + dx, 0.05, 1 - d.box.x), h: clamp(d.box.h + dy, 0.05, 1 - d.box.y) };
      setPlace((p) => ({ ...p, [d.key]: nb }));
      return;
    }
    const dd = dimDrag.current;
    if (dd) {
      const dx = c.x - dd.sx, dy = c.y - dd.sy;
      const nd = dd.mode === "width"
        ? { ...dd.dim, w: clamp(dd.dim.w + dx, 30, BX + BW - dd.dim.x) }
        : { ...dd.dim, x: clamp(dd.dim.x + dx, BX, BX + BW - 20),
            // front (เหนือกรอบ) ลากขึ้น = y มาก · back (ใต้กรอบ) ลากลง = y มาก
            y: dd.which === "front" ? clamp(dd.dim.y - dy, 0, 24) : clamp(dd.dim.y + dy, 0, 90) };
      setBase((b) => ({ ...b, [dd.which === "front" ? "frontDim" : "backDim"]: nd }));
    }
  };
  const onUp = (e: React.PointerEvent) => { drag.current = null; dimDrag.current = null; try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ } };

  const save = useCallback(async () => {
    setSaving(true); setMsg("");
    try {
      // วางด้านเดียว → เซฟให้ทั้งหน้า-หลังเหมือนกัน
      const layout: BeltLayout = { ...base, images: { front: place, back: place } };
      const res = await apiFetch("/api/mo/belt-layout", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }) });
      const j = await res.json();
      setMsg(j.error ? `❌ ${j.error}` : "✅ บันทึกแล้ว — ใบงานเข็มขัดทุกใบใช้ตำแหน่งนี้ทั้งด้านหน้า-หลัง");
    } catch (e) { setMsg(`❌ ${String((e as Error).message)}`); }
    finally { setSaving(false); }
  }, [base, place]);

  // ── โหลดเทมเพลตนี้ (กรอบ + กล่องบอกตำแหน่ง/ขนาดของแต่ละรูป) ไปทำรูปให้พอดีก่อนอัปโหลด — ด้านเดียว ──
  const triggerDownload = (href: string, name: string) => {
    const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  const buildGuideSvg = () => {
    const colors: Record<Key, string> = { strap: "#94a3b8", hole: "#0ea5e9", logo: "#7c3aed" };
    const parts: string[] = [
      `<rect x="0" y="0" width="740" height="${VH}" fill="#ffffff"/>`,
      `<text x="${BX}" y="14" font-size="11" fill="#64748b" font-family="sans-serif">เทมเพลตวางรูปเข็มขัด (ด้านเดียว ใช้ทั้งหน้า-หลัง) · กรอบประ = ตำแหน่ง+ขนาด (px) · เส้นแดง = ระยะ — ทำรูปพอดีช่องแล้วอัปโหลด</text>`,
      `<rect x="${BX}" y="${fY}" width="${BW}" height="${boxH}" fill="none" stroke="#cbd5e1" stroke-width="1.5" rx="6"/>`,
    ];
    for (const key of ["strap", "hole", "logo"] as Key[]) {
      if (!hrefOf(key)) continue;
      const b = boxOf(key);
      const x = BX + b.x * BW, y = fY + b.y * boxH, w = b.w * BW, h = b.h * boxH;
      parts.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="none" stroke="${colors[key]}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
      parts.push(`<text x="${(x + 4).toFixed(0)}" y="${(y + 13).toFixed(0)}" font-size="10" fill="${colors[key]}" font-family="sans-serif">${KEY_LABEL[key]} · ${w.toFixed(0)}×${h.toFixed(0)}px</text>`);
    }
    const gf = bracketGeom(fd.x, fd.w, fbY, false);
    parts.push(`<path d="${gf.d}" fill="none" stroke="#b91c1c" stroke-width="1.1"/><text x="${gf.lx}" y="${gf.ly}" font-size="11" fill="#b91c1c" text-anchor="middle">ห่างโลโก้</text>`);
    const gb = bracketGeom(bd.x, bd.w, bbY, true);
    parts.push(`<path d="${gb.d}" fill="none" stroke="#b91c1c" stroke-width="1.1"/><text x="${gb.lx}" y="${gb.ly}" font-size="11" fill="#b91c1c" text-anchor="middle">ถึงปลายสาย</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="${VH}" viewBox="0 0 740 ${VH}">${parts.join("")}</svg>`;
  };
  const downloadSvg = () => {
    const url = URL.createObjectURL(new Blob([buildGuideSvg()], { type: "image/svg+xml" }));
    triggerDownload(url, "belt-placement-template.svg"); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadPng = () => {
    const svg = buildGuideSvg();
    const h = Number(svg.match(/height="(\d+)"/)?.[1] ?? VH);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 740; c.height = h;
      const ctx = c.getContext("2d"); if (ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 740, h); ctx.drawImage(img, 0, 0); }
      c.toBlob((png) => { if (!png) return; const u = URL.createObjectURL(png); triggerDownload(u, "belt-placement-template.png"); setTimeout(() => URL.revokeObjectURL(u), 1000); }, "image/png");
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  const noImg = !imgs.strap && !imgs.hole && !imgs.logo;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-slate-800">🖼️ เทมเพลตวางรูปเข็มขัด</h1>
      <p className="mt-1 text-sm text-slate-500"><b>ลากรูป</b>ไปวาง · ลาก<b>มุมน้ำเงิน</b>ปรับขนาด · ลาก<b className="text-rose-600">เส้นแดง</b>ย้าย/ดึงขึ้น-ลง (ปุ่มแดงขวา = ปรับความกว้าง) · จัด<b>ด้านเดียว</b> ใช้ทั้งหน้า-หลัง → กดบันทึก</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">เลือกชิ้น:</span>
        {(["strap", "hole", "logo"] as Key[]).map((key) => hrefOf(key) && (
          <button key={key} onClick={() => setSel(key)}
            className={`px-2 py-1 rounded-md border ${sel === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {KEY_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        {noImg ? (
          <div className="py-16 text-center text-sm text-slate-400">ยังไม่มีรูปตัวอย่างในตาราง belt_tails / belt_hole / belt_logo<br />อัปโหลดรูปในมาสเตอร์เข็มขัดก่อน แล้วกลับมาวางได้</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 740 ${VH}`} width="100%" style={{ touchAction: "none" }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => { setSel(null); setSelDim(null); }}>
            <text x={BX} y={fY - 8} fontSize={13} fontWeight={600} fill="#475569">เข็มขัด (ด้านเดียว)</text>
            <rect x={BX} y={fY} width={BW} height={boxH} fill="none" stroke="#e2e8f0" strokeWidth={1.5} rx={6} />
            {(["strap", "hole", "logo"] as Key[]).map((key) => {
              const href = hrefOf(key); if (!href) return null;
              const a = abs(key);
              const on = sel === key;
              return (
                <g key={key}>
                  <image href={href} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="xMidYMid slice" style={{ pointerEvents: "none" }} />
                  <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="transparent"
                    stroke={on ? "#2563eb" : "transparent"} strokeWidth={on ? 1.5 : 0} strokeDasharray="4 3"
                    style={{ cursor: "move" }} onPointerDown={onDown(key, "move")} />
                  {on && <rect x={a.x + a.w - 6} y={a.y + a.h - 6} width={12} height={12} fill="#2563eb" rx={2}
                    style={{ cursor: "nwse-resize" }} onPointerDown={onDown(key, "resize")} />}
                </g>
              );
            })}
            {/* เส้นความห่าง (วงเล็บ) — ลากปรับได้: ลากตัวเส้น = ย้าย/ดึงขึ้น-ลง · ลากปุ่มแดงขวา = ปรับความกว้าง */}
            {(["front", "back"] as const).map((which) => {
              const dim = which === "front" ? fd : bd;
              const y = which === "front" ? fbY : bbY;
              const g = bracketGeom(dim.x, dim.w, y, which === "back");
              const on = selDim === which;
              return (
                <g key={which}>
                  <path d={g.d} fill="none" stroke="#b91c1c" strokeWidth={on ? 1.9 : 1.1} />
                  <text x={g.lx} y={g.ly} fontSize={11} fill="#b91c1c" textAnchor="middle" style={{ pointerEvents: "none" }}>{which === "front" ? "ห่างโลโก้" : "ถึงปลายสาย"}</text>
                  <path d={g.d} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: "move" }} onPointerDown={dimDown(which, "move")} />
                  {on && <rect x={dim.x + dim.w - 5} y={y - 5} width={10} height={10} fill="#b91c1c" rx={2} style={{ cursor: "ew-resize" }} onPointerDown={dimDown(which, "width")} />}
                </g>
              );
            })}
          </svg>
        )}
        <div className="mt-1 text-center text-[11px] text-slate-400">พรีวิวใช้รูปตัวอย่าง · ใบงานจริงใช้รูปของรุ่นนั้น ๆ วางตำแหน่งเดียวกันนี้ทั้งด้านหน้า-หลัง</div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || noImg} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก (ใช้ทุกใบงาน)"}</button>
        <button onClick={downloadPng} disabled={noImg} title="โหลดเทมเพลตนี้ (กรอบ+ตำแหน่ง/ขนาดของแต่ละรูป) ไปทำรูปให้พอดีช่องก่อนอัปโหลด" className="h-9 rounded-lg border border-amber-300 bg-white px-4 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">⬇️ โหลดเทมเพลต (PNG)</button>
        <button onClick={downloadSvg} disabled={noImg} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">SVG</button>
        <button onClick={() => setPlace(BELT_DEFAULT_PLACE.front)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ ค่าเริ่มต้น</button>
        {sel && <button onClick={() => setPlace((p) => ({ ...p, [sel]: BELT_DEFAULT_PLACE.front[sel] }))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ รีเซ็ตชิ้นที่เลือก</button>}
        {selDim && <button onClick={() => setBase((b) => ({ ...b, [selDim === "front" ? "frontDim" : "backDim"]: selDim === "front" ? BELT_DEFAULT_LAYOUT.frontDim : BELT_DEFAULT_LAYOUT.backDim }))}
          className="h-9 rounded-lg border border-rose-200 bg-white px-4 text-sm text-rose-500 hover:bg-rose-50">↺ รีเซ็ตเส้นแดง ({selDim === "front" ? "ห่างโลโก้" : "ถึงปลายสาย"})</button>}
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">วิธีใช้</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>คลิกรูปเพื่อเลือก → <b>ลากตัวรูป</b>เพื่อย้าย · <b>ลากมุมน้ำเงินขวาล่าง</b>เพื่อปรับขนาด</li>
          <li><b className="text-rose-700">เส้นแดงบอกระยะ</b> (ห่างโลโก้/ถึงปลายสาย) — ลากตัวเส้นเพื่อย้ายซ้าย-ขวา/ดึงขึ้น-ลง · ลาก<b>ปุ่มแดงปลายขวา</b>เพื่อปรับความกว้าง · ถ้าเส้นล่างชิดขอบ ดึงขึ้นได้</li>
          <li>จัด<b>ด้านเดียว</b>ให้สวย → กด <b>บันทึก</b> (ระบบใช้ตำแหน่งนี้ทั้งด้านหน้า-หลังให้อัตโนมัติ)</li>
          <li>อยากทำรูปจริงให้พอดี → กด <b>โหลดเทมเพลต</b> ไปเป็นไกด์ · พื้นหลังโปร่งใส ห้ามกล่องทึบ</li>
        </ol>
      </div>
    </div>
  );
}
