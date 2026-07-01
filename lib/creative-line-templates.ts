// ============================================================
// แม่แบบข้อความแจ้งเตือน LINE ของงาน Creative (ของกลาง — ไม่พึ่ง server dep ใช้ได้ทั้ง client/server)
// เก็บค่าที่ผู้ใช้ตั้งเองใน china_app_settings.line_config.templates[key]
// ============================================================

export type LineTemplateDef = { key: string; label: string; labelEn: string; defaultTpl: string; vars: string[] };

export const LINE_TEMPLATES: LineTemplateDef[] = [
  {
    key: "new_task",
    label: "งานใหม่ / มอบงาน",
    labelEn: "New task",
    defaultTpl: "🆕 งานใหม่ {task_no}\n• {title}\n👤 ผู้รับผิดชอบ: {assignees}\n🗓 กำหนดส่ง: {due}",
    vars: ["task_no", "title", "assignees", "due"],
  },
  {
    key: "subtask_submitted",
    label: "งานย่อยส่งมารอตรวจ",
    labelEn: "Subtask submitted for review",
    defaultTpl: "🟡 งานย่อยรอตรวจ/อนุมัติ\n• {subtask}\n📋 {task}\n👤 ส่งโดย: {submitter}",
    vars: ["subtask", "task", "submitter"],
  },
];

/** แทนที่ {var} ด้วยค่าจริง · var ที่ไม่มีค่า = ตัดทิ้ง · เก็บกวาดบรรทัดว่างซ้อน */
export function renderLineTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString())
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function defaultLineTemplate(key: string): string {
  return LINE_TEMPLATES.find((x) => x.key === key)?.defaultTpl ?? "";
}
