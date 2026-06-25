"use client";

/**
 * เทมเพลตวางรูปเข็มขัด — ลากรูปจริง (ปลายหาง/รู/โลโก้) ไปวาง + ปรับขนาดเอง (ด้านหน้า/หลัง)
 * "วางตรงไหน พิมพ์ตรงนั้น" — ไม่ยืดรูป (preserveAspectRatio meet) · บันทึกค่ากลาง 1 ชุด ใช้ทุกใบงาน
 * พิกัดเก็บเป็นสัดส่วน 0..1 ของกรอบเข็มขัดแต่ละด้าน → ไม่ผูกกับความสูง (boxH) ปรับ boxH ทีหลังก็ยังตรง
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BELT_DEFAULT_PLACE, BELT_DEFAULT_LAYOUT, type BeltImgPlace, type ImgBox, type BeltLayout } from "@/lib/belt-diagram";

const BX = 18, BW = 704;
type Side = "front" | "back";
type Key = "strap" | "hole" | "logo";
type Imgs = { strap: string | null; hole: string | null; frontLogo: string | null; backLogo: string | null };

const KEY_LABEL: Record<Key, string> = { strap: "ทรงปลายหาง (ตัวสาย)", hole: "ลายรู / เจาะรู", logo: "โลโก้" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function BeltPlacementPage() {
  const [imgs, setImgs] = useState<Imgs>({ strap: null, hole: null, frontLogo: null, backLogo: null });
  const [boxH, setBoxH] = useState<number>(BELT_DEFAULT_LAYOUT.boxH);
  const [base, setBase] = useState<BeltLayout>({});                                  // layout เดิม (เก็บ boxH/frontDim/backDim ไว้ตอนบันทึก)
  const [place, setPlace] = useState<{ front: BeltImgPlace; back: BeltImgPlace }>(BELT_DEFAULT_PLACE);
  const [sel, setSel] = useState<{ side: Side; key: Key } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ side: Side; key: Key; mode: "move" | "resize"; sx: number; sy: number; box: ImgBox } | null>(null);

  const fY = 28, bY = fY + boxH + 46, VH = bY + boxH + 30;

  useEffect(() => {
    apiFetch("/api/mo/belt-component-images?sample=1").then((r) => r.json()).then((j) => {
      setImgs({ strap: j.strap ?? null, hole: j.hole ?? null, frontLogo: j.frontLogo ?? null, backLogo: j.backLogo ?? null });
    }).catch(() => {});
    apiFetch("/api/mo/belt-layout").then((r) => r.json()).then((j) => {
      const L = (j.layout ?? {}) as BeltLayout;
      setBase(L);
      if (typeof L.boxH === "number") setBoxH(L.boxH);
      setPlace({
        front: { ...BELT_DEFAULT_PLACE.front, ...(L.images?.front ?? {}) },
        back: { ...BELT_DEFAULT_PLACE.back, ...(L.images?.back ?? {}) },
      });
    }).catch(() => {});
  }, []);

  const hrefOf = (side: Side, key: Key): string | null =>
    key === "strap" ? imgs.strap : key === "hole" ? imgs.hole : (side === "front" ? imgs.frontLogo : imgs.backLogo);
  const boxOf = (side: Side, key: Key): ImgBox => place[side][key] ?? BELT_DEFAULT_PLACE[side][key] ?? { x: 0, y: 0, w: 1, h: 1 };

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left) * (740 / r.width), y: (cy - r.top) * (VH / r.height) };
  };
  const onDown = (side: Side, key: Key, mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toSvg(e.clientX, e.clientY);
    drag.current = { side, key, mode, sx: c.x, sy: c.y, box: { ...boxOf(side, key) } };
    setSel({ side, key });
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const c = toSvg(e.clientX, e.clientY);
    const dx = (c.x - d.sx) / BW, dy = (c.y - d.sy) / boxH;
    let nb: ImgBox;
    if (d.mode === "move") {
      nb = { ...d.box, x: clamp(d.box.x + dx, 0, 1 - d.box.w), y: clamp(d.box.y + dy, 0, 1 - d.box.h) };
    } else {
      nb = { ...d.box, w: clamp(d.box.w + dx, 0.05, 1 - d.box.x), h: clamp(d.box.h + dy, 0.05, 1 - d.box.y) };
    }
    setPlace((p) => ({ ...p, [d.side]: { ...p[d.side], [d.key]: nb } }));
  };
  const onUp = (e: React.PointerEvent) => { drag.current = null; try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ } };

  const abs = (side: Side, key: Key) => {
    const top = side === "front" ? fY : bY, b = boxOf(side, key);
    return { x: BX + b.x * BW, y: top + b.y * boxH, w: b.w * BW, h: b.h * boxH };
  };

  const save = useCallback(async () => {
    setSaving(true); setMsg("");
    try {
      const layout: BeltLayout = { ...base, images: place };
      const res = await apiFetch("/api/mo/belt-layout", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }) });
      const j = await res.json();
      setMsg(j.error ? `❌ ${j.error}` : "✅ บันทึกแล้ว — ใบงานเข็มขัดทุกใบจะวางรูปตามนี้");
    } catch (e) { setMsg(`❌ ${String((e as Error).message)}`); }
    finally { setSaving(false); }
  }, [base, place]);

  // วาดรูป 1 ด้าน (กรอบ + รูปตามลำดับ strap→hole→logo + overlay ลาก/ปรับขนาด)
  const renderSide = (side: Side) => {
    const top = side === "front" ? fY : bY;
    const order: Key[] = ["strap", "hole", "logo"];
    return (
      <g key={side}>
        <text x={BX} y={top - 8} fontSize={13} fontWeight={600} fill="#475569">{side === "front" ? "ด้านหน้า" : "ด้านหลัง"}</text>
        <rect x={BX} y={top} width={BW} height={boxH} fill="none" stroke="#e2e8f0" strokeWidth={1.5} rx={6} />
        {order.map((key) => {
          const href = hrefOf(side, key); if (!href) return null;
          const a = abs(side, key);
          const on = sel?.side === side && sel?.key === key;
          return (
            <g key={key}>
              <image href={href} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: "none" }} />
              {/* overlay ลากย้าย + ไฮไลต์เมื่อเลือก */}
              <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="transparent"
                stroke={on ? "#2563eb" : "transparent"} strokeWidth={on ? 1.5 : 0} strokeDasharray="4 3"
                style={{ cursor: "move" }} onPointerDown={onDown(side, key, "move")} />
              {/* มือจับปรับขนาด (มุมขวาล่าง) เมื่อเลือก */}
              {on && <rect x={a.x + a.w - 6} y={a.y + a.h - 6} width={12} height={12} fill="#2563eb" rx={2}
                style={{ cursor: "nwse-resize" }} onPointerDown={onDown(side, key, "resize")} />}
            </g>
          );
        })}
      </g>
    );
  };

  const noImg = !imgs.strap && !imgs.hole && !imgs.frontLogo && !imgs.backLogo;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-slate-800">🖼️ เทมเพลตวางรูปเข็มขัด</h1>
      <p className="mt-1 text-sm text-slate-500"><b>ลากรูป</b>ไปวาง · ลาก<b>มุมน้ำเงิน</b>ปรับขนาด · วางตรงไหนพิมพ์ตรงนั้น (ไม่ยืดรูป) → กดบันทึก ใช้ทุกใบงาน</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">เลือกชิ้น:</span>
        {(["front", "back"] as Side[]).map((side) => (["strap", "hole", "logo"] as Key[]).map((key) => hrefOf(side, key) && (
          <button key={`${side}.${key}`} onClick={() => setSel({ side, key })}
            className={`px-2 py-1 rounded-md border ${sel?.side === side && sel?.key === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {side === "front" ? "หน้า" : "หลัง"} · {KEY_LABEL[key]}
          </button>
        )))}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        {noImg ? (
          <div className="py-16 text-center text-sm text-slate-400">ยังไม่มีรูปตัวอย่างในตาราง belt_tails / belt_hole / belt_logo<br />อัปโหลดรูปในมาสเตอร์เข็มขัดก่อน แล้วกลับมาวางได้</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 740 ${VH}`} width="100%" style={{ touchAction: "none" }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => setSel(null)}>
            {renderSide("front")}
            {renderSide("back")}
          </svg>
        )}
        <div className="mt-1 text-center text-[11px] text-slate-400">พรีวิวนี้ใช้รูปตัวอย่าง · ใบงานจริงจะใช้รูปของรุ่นนั้น ๆ วางตำแหน่งเดียวกันนี้</div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || noImg} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก (ใช้ทุกใบงาน)"}</button>
        <button onClick={() => setPlace(BELT_DEFAULT_PLACE)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ ค่าเริ่มต้น</button>
        {sel && <button onClick={() => setPlace((p) => ({ ...p, [sel.side]: { ...p[sel.side], [sel.key]: BELT_DEFAULT_PLACE[sel.side][sel.key] } }))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ รีเซ็ตชิ้นที่เลือก</button>}
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">วิธีใช้</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>คลิกรูปเพื่อเลือก → <b>ลากตัวรูป</b>เพื่อย้าย · <b>ลากมุมน้ำเงินขวาล่าง</b>เพื่อปรับขนาด</li>
          <li>จัดทั้ง <b>ด้านหน้า</b> และ <b>ด้านหลัง</b> ให้ตรงที่ต้องการ</li>
          <li>กด <b>บันทึก</b> → ใบงานเข็มขัดทุกใบจะวางรูปตำแหน่งเดียวกันนี้ (ใช้รูปจริงของแต่ละรุ่น)</li>
        </ol>
      </div>
    </div>
  );
}
