import prisma from "@/lib/db";
import { getServerAdminSession } from "@/lib/adminAuth";
import { AdminProvider } from "../AdminContext";
import { AdminSidebar } from "./AdminSidebar";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAdminSession();

  let adminName = "";
  if (session) {
    const admin = await prisma.adminAccount.findUnique({
      where: { id: session.adminId },
      select: { name: true, username: true },
    });
    adminName = admin?.name || admin?.username || "";
  }

  return (
    <AdminProvider>
      <AdminSidebar adminName={adminName}>{children}</AdminSidebar>
    </AdminProvider>
  );
}
