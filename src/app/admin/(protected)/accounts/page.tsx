import { getAdminId } from "@/lib/adminAuth";
import { AccountsClient } from "./AccountsClient";

export default async function AccountsPage() {
  const currentAdminId = await getAdminId();
  return <AccountsClient currentAdminId={currentAdminId} />;
}
