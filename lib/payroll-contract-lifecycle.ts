import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

type ExpiredContractRow = {
  id: string;
  employee_id: string | null;
  end_date: string | null;
};

const todayBangkokISO = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const isExpiredContractEndDate = (date: unknown) => {
  const s = String(date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= todayBangkokISO();
};

export function applyContractLifecycle<T extends Record<string, unknown>>(row: T): T {
  if (isExpiredContractEndDate(row.end_date) && row.status !== "cancelled") {
    return { ...row, status: "ended", is_current: false };
  }
  return row;
}

async function employeesWithoutActiveCurrentContract(admin: Admin, employeeIds: string[]): Promise<string[]> {
  const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { data: activeContracts, error: activeError } = await admin
    .from("employee_contracts")
    .select("employee_id")
    .in("employee_id", uniqueIds)
    .eq("is_current", true)
    .eq("status", "active");
  if (activeError) throw new Error(activeError.message);

  const stillActive = new Set(((activeContracts ?? []) as { employee_id: string | null }[])
    .map((row) => row.employee_id)
    .filter((id): id is string => Boolean(id)));
  return uniqueIds.filter((id) => !stillActive.has(id));
}

export async function closeEmployeesWithoutActiveCurrentContract(admin: Admin, employeeIds: string[]): Promise<number> {
  const employeesToClose = await employeesWithoutActiveCurrentContract(admin, employeeIds);
  if (employeesToClose.length === 0) return 0;

  const { error: employeeError } = await admin
    .from("employees")
    .update({ employment_status: "inactive" })
    .in("id", employeesToClose)
    .eq("employment_status", "active");
  if (employeeError) throw new Error(employeeError.message);

  return employeesToClose.length;
}

export async function resignEmployeesWithoutActiveCurrentContract(
  admin: Admin,
  employeeResignDates: Record<string, string | null | undefined>,
): Promise<number> {
  const employeeIds = Object.keys(employeeResignDates);
  const employeesToResign = await employeesWithoutActiveCurrentContract(admin, employeeIds);
  if (employeesToResign.length === 0) return 0;

  let resignedCount = 0;
  for (const employeeId of employeesToResign) {
    const resignDate = String(employeeResignDates[employeeId] ?? todayBangkokISO()).slice(0, 10);
    const { error: employeeError } = await admin
      .from("employees")
      .update({ employment_status: "resigned", resign_date: resignDate })
      .eq("id", employeeId)
      .eq("employment_status", "active");
    if (employeeError) throw new Error(employeeError.message);
    resignedCount += 1;
  }

  return resignedCount;
}

export async function syncEndedCurrentContracts(admin: Admin, employeeIds?: string[]): Promise<{ contractsEnded: number; employeesClosed: number }> {
  let expiredQuery = admin
    .from("employee_contracts")
    .select("id, employee_id, end_date")
    .eq("is_current", true)
    .neq("status", "cancelled")
    .lte("end_date", todayBangkokISO());

  if (employeeIds && employeeIds.length > 0) {
    expiredQuery = expiredQuery.in("employee_id", employeeIds);
  }

  const { data: expiredContracts, error: expiredError } = await expiredQuery;
  if (expiredError) throw new Error(expiredError.message);

  const expired = ((expiredContracts ?? []) as ExpiredContractRow[]).filter((row) => isExpiredContractEndDate(row.end_date));
  if (expired.length === 0) return { contractsEnded: 0, employeesClosed: 0 };

  const expiredIds = expired.map((row) => row.id);
  const affectedEmployeeIds = Array.from(new Set(expired.map((row) => row.employee_id).filter((id): id is string => Boolean(id))));
  const resignDates = expired.reduce<Record<string, string>>((acc, row) => {
    if (!row.employee_id || !row.end_date) return acc;
    const date = row.end_date.slice(0, 10);
    if (!acc[row.employee_id] || date > acc[row.employee_id]) acc[row.employee_id] = date;
    return acc;
  }, {});

  const { error: contractError } = await admin
    .from("employee_contracts")
    .update({ status: "ended", is_current: false })
    .in("id", expiredIds);
  if (contractError) throw new Error(contractError.message);

  if (affectedEmployeeIds.length === 0) return { contractsEnded: expired.length, employeesClosed: 0 };

  const employeesClosed = await resignEmployeesWithoutActiveCurrentContract(admin, resignDates);

  return { contractsEnded: expired.length, employeesClosed };
}
