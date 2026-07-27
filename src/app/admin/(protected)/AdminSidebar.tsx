"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Device } from "@/types";
import { useAdmin } from "../AdminContext";

interface AdminSidebarProps {
  adminName: string;
  children: React.ReactNode;
}

export function AdminSidebar({ adminName, children }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { devices, selectedDevice, selectDevice, loading: devicesLoading } = useAdmin();
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

  const pathNoSlash = pathname.replace(/\/$/, "");

  // 지점 전환: 항상 하나 선택 유지. 장치 관리(/admin/devices*) 경로에서만 대시보드로,
  // 그 외(이미지·설정 등)에서는 현재 페이지를 유지한다.
  const handleSelectDevice = (device: Device) => {
    setDeviceMenuOpen(false);
    if (selectedDevice?.id === device.id) return;
    selectDevice(device);
    // 장치 편집 페이지에서 지점 전환 → 새 지점의 편집 페이지로 이동(그 지점 설정/가격을 이어서 편집).
    // 그 외 장치 관리 경로(목록·생성)에서는 대시보드로, 이미지·설정 등은 현재 페이지 유지.
    if (/^\/admin\/devices\/\d+$/.test(pathNoSlash)) {
      router.push(`/admin/devices/${device.id}`);
    } else if (pathNoSlash.startsWith("/admin/devices")) {
      router.push("/admin");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout/", { method: "POST" }).catch(() => {});
    localStorage.removeItem("admin_session");
    router.push("/admin/login");
  };

  const deviceMenuItems = [
    { href: "/admin/images", label: "이미지 관리", icon: "🖼️" },
    { href: "/admin/theme-setting", label: "테마 관리", icon: "🎨" },
    { href: "/admin/print-setting", label: "인화 설정", icon: "🖨️" },
    { href: "/admin/capture-setting", label: "촬영 설정", icon: "📷" },
    { href: "/admin/timer-setting", label: "타이머 설정", icon: "⏱️" },
    { href: "/admin/payment", label: "결제 설정", icon: "💳" },
    { href: "/admin/payment-history", label: "결제 내역", icon: "📋" },
  ];

  const isAccountsSection = pathNoSlash.startsWith("/admin/accounts");

  const currentLabel = isAccountsSection
    ? "계정 관리"
    : deviceMenuItems.find((item) => pathNoSlash === item.href)?.label ??
      (pathNoSlash === "/admin"
        ? "대시보드"
        : pathNoSlash.startsWith("/admin/devices")
          ? "장치 관리"
          : "관리자");

  return (
    <div className="h-screen bg-gray-900 flex overflow-hidden">
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">AR-pic 관리자</h1>
        </div>

        {/* 최상위 탭: 장치 관리 / 계정 관리 */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => { if (isAccountsSection) router.push("/admin"); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              !isAccountsSection
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            장치 관리
          </button>
          <button
            onClick={() => router.push("/admin/accounts")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              isAccountsSection
                ? "text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            계정 관리
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          {isAccountsSection ? null : (
            <>
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
                          onClick={() => handleSelectDevice(device)}
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

              <div className="mb-3 pb-3 border-b border-gray-700">
                <Link
                  href="/admin/preview"
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    pathNoSlash === "/admin/preview" ? "bg-gray-600 text-white" : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  <span>🎬</span>
                  <span>화면 미리보기</span>
                </Link>
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
            </>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-3 text-gray-400">
            {!isAccountsSection && devices.length > 0 && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setDeviceMenuOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full ${selectedDevice?.isActive ? "bg-green-400" : "bg-red-400"}`} />
                    <span className="font-medium">{selectedDevice?.name ?? "지점 선택"}</span>
                    <span className="text-gray-400 text-xs">▾</span>
                  </button>
                  {deviceMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDeviceMenuOpen(false)} />
                      <div className="absolute top-full left-0 mt-1 z-20 min-w-[220px] max-h-80 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1">
                        <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider">지점 선택</div>
                        {devices.map((device) => (
                          <button
                            key={device.id}
                            onClick={() => handleSelectDevice(device)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                              selectedDevice?.id === device.id ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${device.isActive ? "bg-green-400" : "bg-red-400"}`} />
                            <span className="truncate flex-1">{device.name}</span>
                            {selectedDevice?.id === device.id && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <span className="text-gray-600">|</span>
              </>
            )}
            <span>{currentLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">{adminName}</span>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
            >
              초기화면
            </Link>
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
