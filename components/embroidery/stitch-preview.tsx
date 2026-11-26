"use client";
/**
 * 🧵 ภาพตัวอย่างฝีเข็ม — วาดคำสั่งเครื่องปักลงแคนวาส (เส้นด้ายตามสีที่ปัก · เส้นกระโดดประจาง ๆ)
 *   upto = วาดถึงคำสั่งที่เท่าไร (ใช้กับแถบเล่นลำดับการปัก) · ไม่ใส่ = ทั้งหมด
 *   highlight = id ชิ้นที่เลือก (ยังไม่ใช้ระบุจุด — วาดทั้งงาน)
 */
import { useEffect, useRef } from "react";
import type { EmbPlan } from "@/lib/embroidery";

export function StitchPreview({ plan, upto, showJumps = true, height = 360, className = "" }: {
  plan: EmbPlan; upto?: number; showJumps?: boolean; height?: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = ref.current, box = boxRef.current;
    if (!cv || !box) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = box.clientWidth, H = height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!plan.width || !plan.height) return;
      const pad = 16;
      const k = Math.min((W - pad * 2) / plan.width, (H - pad * 2) / plan.height);
      const ox = W / 2, oy = H / 2;
      // ด้ายหนา ~0.35 มม. (ไม่บางกว่า 0.6px ให้ยังมองเห็นตอนย่อ)
      const lw = Math.max(0.6, 0.35 * k);
      const end = Math.min(upto ?? plan.cmds.length, plan.cmds.length);
      let ci = 0;
      let px = 0, py = 0;
      let color = plan.colors[0]?.color ?? "#000";
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.strokeStyle = color; g.lineWidth = lw;
      const flush = () => { g.stroke(); g.beginPath(); };
      for (let i = 0; i < end; i++) {
        const c = plan.cmds[i];
        const x = ox + c.x * k, y = oy + c.y * k;
        if (c.t === "stitch") { g.moveTo(px, py); g.lineTo(x, y); }
        else if (c.t === "jump" && showJumps) {
          flush();
          g.save(); g.setLineDash([2, 3]); g.strokeStyle = "rgba(100,116,139,0.45)"; g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); g.restore();
          g.beginPath(); g.strokeStyle = color; g.lineWidth = lw;
        } else if (c.t === "color") {
          flush(); ci++; color = plan.colors[ci]?.color ?? color; g.strokeStyle = color;
        }
        px = x; py = y;
      }
      flush();
      // ตำแหน่งเข็มตอนเล่นลำดับ
      if (upto != null && upto < plan.cmds.length) {
        g.fillStyle = "#ef4444"; g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [plan, upto, showJumps, height]);

  return (
    <div ref={boxRef} className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-[repeating-linear-gradient(45deg,#fafafa_0_6px,#f4f4f5_6px_12px)] ${className}`}>
      <canvas ref={ref} />
    </div>
  );
}
