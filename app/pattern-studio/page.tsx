"use client";

import { PlaygroundShell } from "@/components/playground-shell";
import { PatternStudioList } from "./view";

/** /pattern-studio — แอปสตูดิโอแพทเทิร์น: รายการแพทเทิร์นทั้งหมด (เปิดแต่ละใบที่ /pattern-studio/<id>) */
export default function PatternStudioPage() {
  return (
    <PlaygroundShell>
      <PatternStudioList />
    </PlaygroundShell>
  );
}
