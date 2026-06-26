"use client";

/**
 * BrandThemeStyles — CSS กลางที่อ่านตัวแปร --brand-* (จาก themeToCssVars) มา apply
 * กับ element ที่ติด data-gg-* ภายใต้ scope ".brand-themed"
 *
 * ของกลาง: ใช้ได้ทุกหน้าที่อยากให้ธีมแบรนด์มีผล — แค่ครอบ container ด้วย
 *   <div className="brand-themed" style={themeToCssVars(theme)}><BrandThemeStyles/>...</div>
 * ไม่ผูกแบรนด์ใด ๆ (default theme = หน้าตามาตรฐาน)
 */
export function BrandThemeStyles() {
  return (
    <style>{`
      .brand-themed { color: var(--brand-text); }
      .brand-themed h1, .brand-themed h2 { color: var(--brand-heading) !important; }
      .brand-themed [data-gg-stat-card],
      .brand-themed [data-gg-sidebar],
      .brand-themed [data-gg-panel],
      .brand-themed [data-gg-task-card],
      .brand-themed [data-gg-brand-card] {
        background: var(--brand-card-bg) !important;
        border-color: var(--brand-card-border) !important;
        border-radius: var(--brand-card-radius);
        box-shadow: var(--brand-card-shadow) !important;
      }
      .brand-themed [data-gg-stat-card] .text-slate-900,
      .brand-themed [data-gg-brand-card] .text-slate-800,
      .brand-themed [data-gg-task-card] .text-slate-800 { color: var(--brand-heading) !important; }
      .brand-themed [data-gg-stat-card] .text-slate-500,
      .brand-themed [data-gg-stat-card] .text-slate-400,
      .brand-themed [data-gg-brand-card] .text-slate-400,
      .brand-themed [data-gg-task-card] .text-slate-400 { color: var(--brand-muted) !important; }
      .brand-themed [data-gg-action] {
        background: var(--brand-btn2-bg) !important;
        color: var(--brand-btn2-text) !important;
        border-color: var(--brand-card-border) !important;
      }
      .brand-themed [data-gg-action="primary"] {
        background: var(--brand-btn-bg) !important;
        color: var(--brand-btn-text) !important;
        border-color: transparent !important;
      }
      .brand-themed [data-gg-connector] {
        background: linear-gradient(to right, var(--brand-wf-line), transparent) !important;
        box-shadow: none !important;
      }
      .brand-themed [data-gg-column-dot] { background: var(--brand-primary) !important; box-shadow: none !important; }
      .brand-themed [data-gg-brand-count] { background: color-mix(in srgb, var(--brand-accent) 18%, transparent) !important; color: var(--brand-heading) !important; }
    `}</style>
  );
}
