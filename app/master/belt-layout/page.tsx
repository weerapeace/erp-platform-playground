"use client";

/**
 * ตั้งค่ารูปเข็มขัดในใบงาน (เฟส 2) — ปรับ ความสูง + ตำแหน่งเส้นบอกระยะ แล้วบันทึก
 * ค่ากลาง 1 ชุด (belt_diagram_layout) → ใบงานเข็มขัดทุกใบใช้ค่านี้
 * พรีวิวใช้ตัววาดจริง (buildBeltDiagramSvg) โหมดเวกเตอร์ — ตำแหน่ง/ความสูงใช้ระบบพิกัดเดียวกับใบงานจริง
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { buildBeltDiagramSvg, BELT_DEFAULT_LAYOUT, type BeltLayout } from "@/lib/belt-diagram";

type Dim = { x: number; y: number; w: number };

export default function BeltLayoutPage() {
  const D = BELT_DEFAULT_LAYOUT;
  const [boxH, setBoxH] = useState<number>(D.boxH);
  const [fd, setFd] = useState<Dim>(D.frontDim);
  const [bd, setBd] = useState<Dim>(D.backDim);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch("/api/mo/belt-layout").then((r) => r.json()).then((j) => {
      const L = (j.layout ?? {}) as BeltLayout;
      if (typeof L.boxH === "number") setBoxH(L.boxH);
      if (L.frontDim) setFd(L.frontDim);
      if (L.backDim) setBd(L.backDim);
    }).catch(() => {});
  }, []);

  const layout: BeltLayout = { boxH, frontDim: fd, backDim: bd };
  const svg = buildBeltDiagramSvg({ brandText: "Louis Montini", holeCount: 5, holeSpacingIn: 1, toEndIn: 7, logoDistIn: 1, tailShape: "duckbill", layout });

  const save = useCallback(async () => {
    setSaving(true); setMsg("");
    try {
      const res = await apiFetch("/api/mo/belt-layout", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }) });
      const j = await res.json();
      setMsg(j.error ? `❌ ${j.error}` : "✅ บันทึกแล้ว — ใบงานเข็มขัดทุกใบจะใช้ค่านี้");
    } catch (e) { setMsg(`❌ ${String((e as Error).message)}`); }
    finally { setSaving(false); }
  }, [layout]);

  const slider = (label: string, value: number, min: number, max: number, set: (n: number) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-36 shrink-0 text-slate-600">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1" />
      <span className="w-12 text-right tabular-nums text-slate-500">{value}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-slate-800">⚙️ ตั้งค่ารูปเข็มขัดในใบงาน</h1>
      <p className="mt-1 text-sm text-slate-500">ปรับความสูง + ตำแหน่งเส้นบอกระยะ → กดบันทึก → <b>ใบงานเข็มขัดทุกใบ</b>ใช้ค่านี้</p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="mt-1 text-center text-[11px] text-slate-400">พรีวิว (แผนผัง) — รูปจริงจะใช้ตำแหน่ง/ความสูงเดียวกันนี้</div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-700">เข็มขัด</div>
          {slider("ความสูง (compact)", boxH, 60, 150, setBoxH)}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-700">เส้น “ห่างโลโก้” (ด้านหน้า)</div>
          {slider("ตำแหน่ง ซ้าย-ขวา", fd.x, 18, 700, (n) => setFd({ ...fd, x: n }))}
          {slider("ระยะเหนือกรอบ", fd.y, 2, 40, (n) => setFd({ ...fd, y: n }))}
          {slider("ความกว้าง", fd.w, 20, 200, (n) => setFd({ ...fd, w: n }))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 sm:col-span-2">
          <div className="text-sm font-semibold text-slate-700">เส้น “ถึงปลายสาย” (ด้านหลัง)</div>
          {slider("ตำแหน่ง ซ้าย-ขวา", bd.x, 18, 700, (n) => setBd({ ...bd, x: n }))}
          {slider("ระยะใต้กรอบ", bd.y, 2, 40, (n) => setBd({ ...bd, y: n }))}
          {slider("ความกว้าง", bd.w, 50, 704, (n) => setBd({ ...bd, w: n }))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก (ใช้ทุกใบงาน)"}</button>
        <button onClick={() => { setBoxH(D.boxH); setFd(D.frontDim); setBd(D.backDim); }} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ ค่าเริ่มต้น</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
