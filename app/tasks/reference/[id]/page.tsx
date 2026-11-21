"use client";

// ============================================================
// /tasks/reference/<id งาน> — กระดานบรีฟของงานแบบเต็มจอ (ลิงก์ส่งต่อ/เปิดจากที่อื่นได้)
// กระดานตัวเดียวกับ "กระดานบรีฟ" ใต้รายละเอียดงานในลิ้นชักงาน (TaskBriefBoard · entity creative_task_brief) — กระดานอ้างอิงเดิมเลิกใช้ 2026-11-21
// เปิดจาก: ลิ้นชักงาน (⛶) · แท็บงานใน Parent SKU · ลิงก์ที่ส่งต่อกัน · สิทธิ์ = tasks.view (แก้ = tasks.edit)
// ============================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/components/i18n";
import { ErrorState } from "@/components/state-views";
import { getTask, type TaskDetail } from "../../data";
import { TaskBriefBoard } from "../../task-reference-board";
import { r2ImageUrl } from "@/lib/r2-image";

export default function TaskReferencePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  // กระดานอ้างอิงเลิกใช้ 2026-11-21 → หน้านี้เปิด "กระดานบรีฟ" เสมอ (ลิงก์เก่า /tasks/reference/<id> และ ?board=brief ใช้ได้ทั้งคู่)
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getTask(id).then((d) => { if (alive) setTask(d); }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "โหลดงานไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [id]);

  if (err) return <div className="p-6"><ErrorState title={t("เปิดงานนี้ไม่ได้ — อาจถูกลบหรือไม่มีสิทธิ์ดู", "Can't open this task — it may be deleted or you lack access")} /></div>;

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={id ? `/tasks?task=${encodeURIComponent(id)}` : "/tasks"} className="text-xs text-slate-500 hover:text-violet-700">← {t("กลับไปงาน", "Back to task")}</Link>
        <h1 className="text-base font-semibold text-slate-800 truncate">🎨 {t("กระดานบรีฟ", "Brief board")}{task ? ` · ${task.title}` : ""}</h1>
        {task?.parent_skus && task.parent_skus.length > 0 && (
          <span className="text-xs font-mono text-slate-500">{task.parent_skus.map((p) => p.code).filter(Boolean).join(", ")}</span>
        )}
      </div>
      {id && task && (
        <TaskBriefBoard taskId={id} height="calc(100vh - 150px)" showOpenFull={false} foldable={false}
            seedImageUrls={(task.reference_images ?? []).map((k) => r2ImageUrl(k)).filter((u): u is string => !!u)} />
      )}
    </div>
  );
}
