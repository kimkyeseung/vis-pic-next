"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AdminProvider, useAdmin } from "./AdminContext";

interface AdminLayoutProps {
  children: React.ReactNode;
}

function AdminLayoutInner({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [adminName, setAdminName] = useState("");
  const { devices, selectedDevice, selectDevice, loading: devicesLoading } = useAdmin();

  useEffect(() => {
    const session = localStorage.getItem("admin_session");
    if (session) {
      try {
        const data = JSON.parse(session);
        setIsLoggedIn(true);
        setAdminName(data.name || data.username);
      } catch {
        setIsLoggedIn(false);
      }
    } else {
      setIsLoggedIn(false);
    }
  }, [pathname]);

  const isLoginPage = pathname.replace(/\/$/, "") === "/admin/login";

  useEffect(() => {
    if (isLoggedIn === false && !isLoginPage) {
      router.push("/admin/login");
    }
  }, [isLoggedIn, isLoginPage, router]);

  const handleLogout = () => {
    localStorage.removeItem("admin_session");
    router.push("/admin/login");
  };

  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">로딩중...</div>
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!isLoggedIn) {
    return null;
  }

  const deviceMenuItems = [
    { href: "/admin/images", label: "이미지 관리", icon: "🖼️" },
    { href: "/admin/settings", label: "설정", icon: "⚙️" },
    { href: "/admin/printer", label: "프린터/카메라", icon: "🖨️" },
  ];

  const currentLabel =
    selectedDevice
      ? deviceMenuItems.find((item) => pathname.replace(/\/$/, "") === item.href)?.label || selectedDevice.name
      : "장치 관리";

  return (
    <div className="h-screen bg-gray-900 flex overflow-hidden">
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">AR-pic 관리자</h1>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">장치 목록</span>
              <Link
                href="/admin/devices/new"
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + 추가
              </Link>
            </div>
            <ul className="space-y-1">
              {devicesLoading ? (
                <li className="px-3 py-2 text-gray-500 text-sm">로딩중...</li>
              ) : devices.length === 0 ? (
                <li className="px-3 py-2 text-gray-500 text-sm">
                  등록된 장치가 없습니다
                </li>
              ) : (
                devices.map((device) => (
                  <li key={device.id}>
                    <button
                      onClick={() => {
                        selectDevice(
                          selectedDevice?.id === device.id ? null : device
                        );
                        if (selectedDevice?.id !== device.id) {
                          router.push("/admin");
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        selectedDevice?.id === device.id
                          ? "bg-blue-600 text-white"
                          : "text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          device.isActive ? "bg-green-400" : "bg-red-400"
                        }`}
                      />
                      <span className="truncate">{device.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {selectedDevice && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  관리
                </span>
                <Link
                  href={`/admin/devices/${selectedDevice.id}`}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  장치 편집
                </Link>
              </div>
              <ul className="space-y-1">
                {deviceMenuItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        pathname.replace(/\/$/, "") === item.href
                          ? "bg-gray-600 text-white"
                          : "text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-3 text-gray-400">
            {selectedDevice && (
              <>
                <span className="text-white font-medium">{selectedDevice.name}</span>
                <span className="text-gray-600">|</span>
              </>
            )}
            <span>{currentLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">{adminName}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminProvider>
  );
}
