"use client";

import { PlaygroundShell } from "@/components/playground-shell";
import { PatternTicketsView } from "./view";

/** /design/pattern-tickets — ตั๋วงานช่าง Pattern (ฝ่ายออกแบบเปิดตั๋ว · ช่างรับไปทำ) */
export default function PatternTicketsPage() {
  return (
    <PlaygroundShell>
      <PatternTicketsView />
    </PlaygroundShell>
  );
}
