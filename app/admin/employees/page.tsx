"use client";

import { MasterCRUDPage } from "@/components/master-crud";
import { ADMIN_EMPLOYEE_MASTER_CONFIG } from "@/lib/admin-employee-master-config";

export default function AdminEmployeesPage() {
  return <MasterCRUDPage config={ADMIN_EMPLOYEE_MASTER_CONFIG} />;
}
