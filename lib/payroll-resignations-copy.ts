export type ResignationAction = "approve" | "reject" | "cancel";

export type ResignationTransitionCopy = {
  title: string;
  confirmText: string;
  successMessage: string;
  description: string;
  impactItems: string[];
  destructive: boolean;
};

export function getResignationTransitionCopy(action: ResignationAction): ResignationTransitionCopy {
  if (action === "approve") {
    return {
      title: "อนุมัติการลาออก",
      confirmText: "อนุมัติ",
      successMessage: "อนุมัติแจ้งลาออกแล้ว",
      description: "หลังยืนยัน ระบบจะอัปเดตข้อมูลพนักงานจริงทันที",
      impactItems: [
        "เปลี่ยนสถานะพนักงานเป็นลาออก",
        "ปิดสัญญาจ้างปัจจุบันด้วยวันทำงานวันสุดท้าย",
        "บันทึกประวัติการดำเนินการไว้ใน audit log",
      ],
      destructive: false,
    };
  }

  if (action === "reject") {
    return {
      title: "ปฏิเสธคำขอแจ้งลาออก",
      confirmText: "ปฏิเสธ",
      successMessage: "ปฏิเสธคำขอแจ้งลาออกแล้ว",
      description: "คำขอจะถูกปิดเป็นปฏิเสธ แต่ข้อมูลพนักงานยังเหมือนเดิม",
      impactItems: [
        "ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง",
        "เก็บเหตุผล/หมายเหตุ HR ไว้กับคำขอ",
        "บันทึกประวัติการดำเนินการไว้ใน audit log",
      ],
      destructive: true,
    };
  }

  return {
    title: "ยกเลิกคำขอแจ้งลาออก",
    confirmText: "ยกเลิกคำขอ",
    successMessage: "ยกเลิกคำขอแจ้งลาออกแล้ว",
    description: "ใช้กรณีสร้างคำขอผิดหรือไม่ต้องการดำเนินการต่อ",
    impactItems: [
      "ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง",
      "คำขอจะถูกปิดเป็นยกเลิก",
      "บันทึกประวัติการดำเนินการไว้ใน audit log",
    ],
    destructive: true,
  };
}
