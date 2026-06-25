"use client";

import { useState } from "react";
import nextDynamic from "next/dynamic";
// drawer เก่าตัวจริงของ MasterCRUD — โหลดเฉพาะตอนเปิด + dynamic กัน import วนกับ master-crud
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

export function RecordPeekLink({
  moduleKey,
  recordId,
  label,
}: {
  moduleKey: string;
  recordId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-100"
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0">↗</span>
      </button>
      {open && (
        <MasterRecordDrawer
          moduleKey={moduleKey}
          recordId={recordId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
