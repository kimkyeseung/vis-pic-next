"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  deviceCount: number;
  imageCount: number;
  settingCount: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    deviceCount: 0,
    imageCount: 0,
    settingCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [devicesRes, settingsRes] = await Promise.all([
          fetch("/api/admin/devices"),
          fetch("/api/setting"),
        ]);

        const devicesData = await devicesRes.json();
        const settingsData = await settingsRes.json();

        setStats({
          deviceCount: devicesData.devices?.length || 0,
          imageCount: 0,
          settingCount: Object.keys(settingsData.settings || {}).length,
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const cards = [
    {
      title: "장치 관리",
      description: "등록된 장치를 관리합니다",
      href: "/admin/devices",
      icon: "📱",
      stat: `${stats.deviceCount}개 장치`,
      color: "from-blue-500 to-blue-600",
    },
    {
      title: "이미지 관리",
      description: "배경/프레임 이미지를 관리합니다",
      href: "/admin/images",
      icon: "🖼️",
      stat: `${stats.imageCount}개 이미지`,
      color: "from-purple-500 to-purple-600",
    },
    {
      title: "설정",
      description: "시스템 설정을 관리합니다",
      href: "/admin/settings",
      icon: "⚙️",
      stat: `${stats.settingCount}개 설정`,
      color: "from-green-500 to-green-600",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">대시보드</h2>
        <p className="text-gray-400">AR-pic 포토부스 관리 시스템</p>
      </div>

      {loading ? (
        <div className="text-gray-400">로딩중...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block p-6 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-4xl">{card.icon}</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r ${card.color} text-white`}
                >
                  {card.stat}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {card.title}
              </h3>
              <p className="text-gray-400">{card.description}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">빠른 작업</h3>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/admin/devices/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 새 장치 추가
          </Link>
          <Link
            href="/admin/images/upload"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            + 이미지 업로드
          </Link>
          <Link
            href="/service"
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
