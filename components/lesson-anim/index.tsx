"use client";

/**
 * 🎞️ LessonAnim — กล่อง "ภาพเคลื่อนไหวสอน" ของกลาง (ศูนย์เรียนรู้ · ใช้กับคู่มืออื่นที่อยากมีภาพสอนแบบกดเล่นได้)
 *   preset = คลังสำเร็จรูป (presets.tsx) · custom = HTML/SVG เฉพาะเรื่อง แสดงใน iframe sandbox="allow-scripts"
 *   (ไม่มี allow-same-origin → สคริปต์ในภาพอ่านคุกกี้/เรียก API ของระบบไม่ได้)
 * ค่าที่เก็บ/ตรวจ = lib/lesson-anim.ts · คู่มือ docs/learning-center.md
 */
import { Icon } from "@/components/icon";
import { animLabel, type LessonAnimation } from "@/lib/lesson-anim";
import { PresetAnim } from "./presets";

const CUSTOM_BASE = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;font-size:14px;color:#334155;background:#fff}svg{max-width:100%;height:auto}button{font:inherit;cursor:pointer}</style>`;

export function CustomAnimFrame({ html, height }: { html: string; height: number }) {
  return (
    <iframe title="ภาพเคลื่อนไหวสอน" sandbox="allow-scripts" srcDoc={CUSTOM_BASE + html} loading="lazy"
      className="block w-full rounded-lg border-0 bg-white" style={{ height }} />
  );
}

export function LessonAnim({ animation }: { animation: LessonAnimation }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-indigo-700">
        <Icon name="sparkles" /> ภาพเคลื่อนไหวสอน · ลองเล่น
        {animation.type === "preset" && <span className="font-normal text-indigo-400">— {animLabel(animation)}</span>}
      </p>
      {animation.type === "preset"
        ? <PresetAnim key={animation.key} animKey={animation.key} />
        : <CustomAnimFrame html={animation.html} height={animation.height} />}
    </div>
  );
}

export { PresetAnim } from "./presets";
