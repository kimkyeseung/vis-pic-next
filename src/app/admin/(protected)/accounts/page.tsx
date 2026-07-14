import { cookies } from "next/headers";
import { AccountsClient } from "./AccountsClient";

export default async function AccountsPage() {
  const cookieStore = await cookies();
  const sessionVal = cookieStore.get("admin_session")?.value;
  const currentAdminId = sessionVal ? parseInt(sessionVal, 10) : null;

  return <AccountsClient currentAdminId={isNaN(currentAdminId ?? NaN) ? null : currentAdminId} />;
}
