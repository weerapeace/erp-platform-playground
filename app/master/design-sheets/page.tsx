import { DesignSheetsDetail } from "./detail-view";

// หน้า /master/design-sheets (โหมดเต็ม: ตาราง/Canvas + popup) — logic อยู่ใน detail-view (reuse ได้)
export default function DesignSheetsPage() {
  return <DesignSheetsDetail />;
}
