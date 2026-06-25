"use client";

import Link from "next/link";
import { useAdmin } from "./AdminContext";

export default function AdminPage() {
  const { selectedDevice, devices, loading } = useAdmin();

  if (loading) {
    return <div className="text-gray-400">로딩중...</div>;
  }

  if (!selectedDevice) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">장치 관리</h2>
          <p className="text-gray-400">
            왼쪽 목록에서 장치를 선택하면 이미지, 설정 등을 관리할 수 있습니다.
          </p>
        </div>

        {devices.length === 0 ? (
          <div className="p-12 bg-gray-800 rounded-xl text-center border border-gray-700">
            <div className="text-6xl mb-4">📱</div>
            <p className="text-gray-400 mb-6">등록된 장치가 없습니다.</p>
            <Link
              href="/admin/devices/new"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 새 장치 추가
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => (
              <div
                key={device.id}
                className="p-6 bg-gray-800 rounded-xl border border-gray-700"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      device.isActive ? "bg-green-400" : "bg-red-400"
                    }`}
                  />
                  <h3 className="text-lg font-semibold text-white">
                    {device.name}
                  </h3>
                </div>
                <p className="text-gray-500 text-sm mb-1">
                  <code className="px-2 py-0.5 bg-gray-700 rounded">
                    {device.deviceId}
                  </code>
                </p>
                {device.description && (
                  <p className="text-gray-400 text-sm mt-2">
                    {device.description}
                  </p>
                )}
                <p className="text-gray-500 text-xs mt-3">
                  {new Date(device.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const cards = [
    {
      title: "이미지 관리",
      description: "배경/프레임 이미지를 관리합니다",
      href: "/admin/images",
      icon: "🖼️",
      color: "from-purple-500 to-purple-600",
    },
    {
      title: "인화 설정",
      description: "인화지 크기, 촬영 모드, 배경을 설정합니다",
      href: "/admin/print-setting",
      icon: "🖨️",
      color: "from-cyan-500 to-cyan-600",
    },
    {
      title: "결제 설정",
      description: "결제 활성화, 금액, PayApp 연동을 설정합니다",
      href: "/admin/payment",
      icon: "💳",
      color: "from-yellow-500 to-yellow-600",
    },
    {
      title: "설정",
      description: "촬영, 크로마키 등 시스템 설정을 관리합니다",
      href: "/admin/settings",
      icon: "⚙️",
      color: "from-green-500 to-green-600",
    },
    {
      title: "프린터/카메라",
      description: "프린터와 카메라를 설정합니다",
      href: "/admin/printer",
      icon: "🔌",
      color: "from-orange-500 to-orange-600",
    },
    {
      title: "장치 편집",
      description: "장치 정보와 장치별 설정을 수정합니다",
      href: `/admin/devices/${selectedDevice.id}`,
      icon: "📱",
      color: "from-blue-500 to-blue-600",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {selectedDevice.name}
        </h2>
        <p className="text-gray-400">
          <code className="px-2 py-0.5 bg-gray-700 rounded text-sm">
            {selectedDevice.deviceId}
          </code>
          {selectedDevice.description && (
            <span className="ml-3">{selectedDevice.description}</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block p-6 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-4xl">{card.icon}</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${card.color} text-white`}
              >
                관리
              </span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {card.title}
            </h3>
            <p className="text-gray-400">{card.description}</p>
          </Link>
        ))}
      </div>

      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">빠른 작업</h3>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/admin/images/upload"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            + 이미지 업로드
          </Link>
          <Link
            href={`/service?device=${selectedDevice.deviceId}`}
            target="_blank"
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
          >
            서비스 화면 열기
          </Link>
        </div>
      </div>
    </div>
  );
}
