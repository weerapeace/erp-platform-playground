"use client";

// ============================================================
// TaskImagesViewer — ปุ่ม "ดูรูป" ของลิ้นชักงาน: ดึงรูปทั้งหมดของงานแล้วเปิดตัวดูรูปแบ่งกลุ่มกลาง (GroupedImageViewer)
//   กลุ่ม: Parent SKU · SKU (แยกตามรหัส + ชื่อสี) · Description · คอนเทนต์ (ซ่อนถ้างานไม่มีคอนเทนต์)
//   งานผูกหลาย Parent → รหัส Parent ต่อท้ายในแต่ละกลุ่ม · ดูอย่างเดียว ไม่มีปุ่มแก้
// ข้อมูล: GET /api/creative-tasks/[id]/images (lib/task-images)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { GroupedImageViewer, type ViewerGroup, type ViewerImage } from "@/components/grouped-image-viewer";
import { useT } from "@/components/i18n";
import { r2ImageUrl } from "@/lib/r2-image";
import type { TaskImage, TaskImagesPayload } from "@/lib/task-images";
import { getTaskImages } from "./data";

const toImg = (im: TaskImage): ViewerImage => ({ url: r2ImageUrl(im.key) ?? "", thumbUrl: r2ImageUrl(im.key, 360), cover: !!im.cover });

export function TaskImagesViewer({ taskId, title, onClose, editActions }: {
  taskId: string; title: string; onClose: () => void;
  /** ปุ่ม "แก้ที่สินค้า" ชิดขวาบน (เปิดจากกล่องโหมดใหม่ · เฉพาะคนที่แก้ได้) — ไม่ส่ง = ดูอย่างเดียว */
  editActions?: React.ReactNode;
}) {
  const t = useT();
  const [data, setData] = useState<TaskImagesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await getTaskImages(taskId)); }
    catch (e) { setError((e as Error).message); }
  }, [taskId]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const groups = useMemo<ViewerGroup[]>(() => {
    if (!data) return [];
    const multi = data.parents.length > 1;
    const noParent = data.parents.length === 0;   // งานมีแต่คอนเทนต์ → ซ่อนกลุ่มสินค้า
    return [
      { key: "parent", label: "Parent SKU", icon: "package", hideWhenEmpty: true,
        owners: data.parents.map((p) => ({ key: p.id, label: p.code, images: p.images.map(toImg) })) },
      { key: "sku", label: "SKU", icon: "tag", hideWhenEmpty: noParent, emptyText: t("ยังไม่มี SKU ลูก", "No child SKUs yet"),
        owners: data.parents.flatMap((p) => p.skus.map((s) => ({ key: s.id, label: s.code, hint: [s.color, multi ? p.code : null].filter(Boolean).join(" · ") || null, images: s.images.map(toImg) }))) },
      { key: "description", label: "Description", icon: "document", hideWhenEmpty: true,
        owners: data.parents.map((p) => ({ key: p.id, label: p.code, images: p.description.map(toImg), warnWhenEmpty: false })) },
      { key: "content", label: t("คอนเทนต์", "Content"), icon: "mobile", hideWhenEmpty: true,
        // คอนเทนต์ "ถ้ามี" — โชว์เฉพาะคอนเทนต์ที่มีรูป (ไม่มีเลย = ซ่อนทั้งกลุ่ม)
        owners: data.contents.filter((c) => c.images.length > 0).map((c) => ({ key: c.id, label: c.title || t("(ไม่มีชื่อ)", "(untitled)"), images: c.images.map(toImg) })) },
    ];
  }, [data, t]);

  const noProduct = !!data && data.parents.length === 0 && data.contents.every((c) => c.images.length === 0);
  return (
    <GroupedImageViewer open onClose={onClose}
      title={`${t("ดูรูป", "Images")} · ${title}`}
      description={editActions ? t("รูปทั้งหมดของงาน — อยากแก้ กด \"แก้ที่สินค้า\"", "All images in this task — press \"Edit product\" to change them") : t("ดูอย่างเดียว — แก้รูปได้ที่หน้าสินค้า", "View only — edit images on the product page")}
      actions={editActions}
      groups={noProduct ? [] : groups} loading={!data && !error} error={error} onRetry={() => void load()}
      emptyTitle={t("งานนี้ยังไม่ผูกสินค้าหรือคอนเทนต์", "This task has no product or content yet")}
      emptyHint={t("ผูก Parent SKU ในลิ้นชักงานก่อน แล้วรูปจะขึ้นที่นี่", "Link a Parent SKU in the task drawer and its images will show here")} />
  );
}
