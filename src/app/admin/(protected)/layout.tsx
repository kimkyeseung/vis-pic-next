import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getServerAdminSession } from "@/lib/adminAuth";
import { AdminProvider } from "../AdminContext";
import { AdminSidebar } from "./AdminSidebar";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 세션 게이트를 서버 레이아웃에서도 강제한다.
  // proxy(구 middleware)는 프로덕션 standalone 빌드(Tauri 실행파일)에서 실행되지 않는
  // 경우가 있어(빈 middleware-manifest) /admin 접근이 무인증으로 뚫렸다. Next 공식 문서도
  // "Proxy 단독에 의존하지 말고 각 서버 경로에서 인증을 확인하라"고 권장한다.
  // cookies() 사용으로 이 레이아웃은 요청마다 동적 렌더되어 매 접근을 검증한다.
  const session = await getServerAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const admin = await prisma.adminAccount.findUnique({
    where: { id: session.adminId },
    select: { name: true, username: true, isActive: true },
  });
  if (!admin || !admin.isActive) {
    redirect("/admin/login");
  }

  const adminName = admin.name || admin.username || "";

  return (
    <AdminProvider>
      <AdminSidebar adminName={adminName}>{children}</AdminSidebar>
    </AdminProvider>
  );
}
