"use client";

/**
 * พรีวิว กระดาน flowchart กลาง (components/flowchart-board) — ไม่ต้องล็อกอิน/ไม่ต่อ DB
 * จำลอง /api/canvas-sketch ในเบราว์เซอร์ (เก็บใน localStorage ของเครื่องนี้) → ลองวาด รีเฟรช แล้วของยังอยู่
 * ?viewer=1 = จำลองคนที่ไม่มีสิทธิ์แก้ (ดูอย่างเดียว) · ?reset=1 = ล้างกระดานทดลอง
 * ของจริงใช้ที่: /master/storage-plan (แผนผังการเก็บไฟล์)
 */
import { useEffect, useState } from "react";
import { FlowchartBoard } from "@/components/flowchart-board";
import type { FlowScene } from "@/lib/flowchart";

const KEY = "flowchart-board-preview";

/** ดัก fetch เฉพาะ /api/canvas-sketch (ของหน้าทดลองนี้เท่านั้น) */
function installMock(viewer: boolean) {
  const w = window as unknown as { __fcMock?: boolean };
  if (w.__fcMock) return;
  w.__fcMock = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/canvas-sketch")) return orig(input, init);
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
    let st: { scene: unknown; rev: number } = { scene: null, rev: 0 };
    try { st = JSON.parse(localStorage.getItem(KEY) ?? "") ?? st; } catch { /* ว่าง */ }
    if ((init?.method ?? "GET").toUpperCase() === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (Number(body.base_rev ?? 0) !== st.rev) return json({ conflict: true, rev: st.rev, scene: st.scene, error: null });
      st = { scene: body.scene, rev: st.rev + 1 };
      localStorage.setItem(KEY, JSON.stringify(st));
      return json({ ok: true, rev: st.rev, error: null });
    }
    return json({ data: { scene: st.scene, rev: st.rev, can_edit: !viewer, preview_url: null }, error: null });
  };
}

const sample = (t: (th: string, en: string) => string): FlowScene => ({
  kind: "flowchart", v: 1,
  nodes: [
    { id: "s", type: "start", position: { x: 0, y: 120 }, width: 160, height: 56, data: { label: t("รับคำสั่งซื้อ", "Order received") } },
    { id: "q", type: "question", position: { x: 240, y: 96 }, width: 190, height: 104, data: { label: t("มีของในคลัง?", "In stock?") } },
    { id: "a", type: "step", position: { x: 520, y: 20 }, width: 180, height: 64, data: { label: t("แพ็กของ\nภายในวันนี้", "Pack\ntoday") } },
    { id: "b", type: "step", position: { x: 520, y: 220 }, width: 180, height: 64, data: { label: t("เปิดใบขอซื้อ", "Open purchase request"), color: "rose" } },
    { id: "d", type: "storage", position: { x: 780, y: 10 }, width: 180, height: 90, data: { label: t("Supabase\nเก็บใบส่งของ", "Supabase\ndelivery notes"), color: "emerald" } },
  ],
  edges: [
    { id: "e1", source: "s", target: "q", sourceHandle: "r", targetHandle: "l", label: "" },
    { id: "e2", source: "q", target: "a", sourceHandle: "t", targetHandle: "l", label: t("ใช่", "Yes") },
    { id: "e3", source: "q", target: "b", sourceHandle: "b", targetHandle: "l", label: t("ไม่ใช่", "No") },
    { id: "e4", source: "a", target: "d", sourceHandle: "r", targetHandle: "l", label: "" },
  ],
});

export default function FlowchartBoardPreview() {
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("reset") === "1") localStorage.removeItem(KEY);
    const v = q.get("viewer") === "1";
    setViewer(v);
    installMock(v);
    setReady(true);
  }, []);
  return (
    <div className="space-y-2 p-4">
      <h1 className="text-xl font-bold text-slate-900">กระดาน flowchart กลาง — หน้าทดลอง</h1>
      <p className="text-[13px] text-slate-500">
        {viewer ? "จำลองคนดูอย่างเดียว (ไม่มีสิทธิ์แก้)" : "กดปุ่มกล่องด้านบน · ลากจากจุดขอบกล่องไปอีกกล่อง = ต่อเส้น · ดับเบิลคลิก = แก้ข้อความ · เก็บในเครื่องนี้เท่านั้น"}
      </p>
      {ready && <FlowchartBoard entityType="demo_flow" entityId="preview" height="calc(100vh - 120px)" starter={sample} fileName="flowchart-ทดลอง" />}
    </div>
  );
}
