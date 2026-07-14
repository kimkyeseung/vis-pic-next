import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { AdminProvider } from "../AdminContext";
import { AdminSidebar } from "./AdminSidebar";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("admin_session")?.value;

  let adminName = "";
  if (sessionId) {
    const id = parseInt(sessionId, 10);
    if (!isNaN(id)) {
      const admin = await prisma.adminAccount.findUnique({
        where: { id },
        select: { name: true, username: true },
      });
      adminName = admin?.name || admin?.username || "";
    }
  }

  return (
    <AdminProvider>
      <AdminSidebar adminName={adminName}>{children}</AdminSidebar>
    </AdminProvider>
  );
}
