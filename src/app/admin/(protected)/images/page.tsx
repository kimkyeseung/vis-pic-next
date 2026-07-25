"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OrderDialog from "./OrderDialog";
import EditDialog from "./EditDialog";
import { useAdmin } from "@/app/admin/AdminContext";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS, WALLPAPER_IMAGE_TYPE, LOGO_IMAGE_TYPE } from "@/constants/images";

// 테마관리에서 다루는 타입(배경화면·로고)은 이미지 관리 탭에서 숨긴다.
const THEME_MANAGED_TYPES = new Set<number>([WALLPAPER_IMAGE_TYPE, LOGO_IMAGE_TYPE]);

interface Image {
  id: number;
  deviceIds: string[];
  imageType: number;
  name: string;
  filename: string;
  priority: number;
  active: boolean;
}

interface ImageType {
  id: number;
  name: string;
}

interface DeviceOption {
  deviceId: string;
  name: string;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export default function ImagesPage() {
  const [images, setImages] = useState<Image[]>([]);
  const [imageTypes, setImageTypes] = useState<ImageType[]>([]);
  const [selectedType, setSelectedType] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("");
  const [sizes, setSizes] = useState<Record<number, number | null>>({});
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  // 전체 이미지 vs 선택 장치에 적용되는 이미지만 보기
  const { selectedDevice } = useAdmin();
  const [deviceFilter, setDeviceFilter] = useState<"all" | "device">("all");
  const currentDeviceId = selectedDevice?.deviceId ?? null;

  useEffect(() => {
    const loadImageBaseUrl = async () => {
      try {
        const res = await fetch("/api/images/url/");
        if (!res.ok) return;
        const data = await res.json();
        if (data.baseUrl) setImageBaseUrl(data.baseUrl);
      } catch {
        // use default
      }
    };
    loadImageBaseUrl();

    const loadDevices = async () => {
      try {
        const res = await fetch("/api/devices/");
        if (!res.ok) return;
        const data = await res.json();
        setDevices(data.devices || []);
      } catch {
        // 장치 목록 없이도 편집(전체 적용)은 가능
      }
    };
    loadDevices();
  }, []);

  const fetchImages = async (typeId: number) => {
    setLoading(true);
    setSizes({});
    try {
      // "이 장치" 필터: 연결 없음(전체 장치) + 해당 장치에 연결된 이미지만
      const q = deviceFilter === "device" && currentDeviceId ? `?device_id=${currentDeviceId}` : "";
      const res = await fetch(`/api/image/list/${typeId}/${q}`, { cache: "no-store" });
      const data = await res.json();
      setImages(data.images || []);
    } catch (error) {
      console.error("Failed to fetch images:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchImageTypes = async () => {
    try {
      const res = await fetch("/api/admin/image-types/");
      const data = await res.json();
      setImageTypes(data.imageTypes || []);
    } catch (error) {
      console.error("Failed to fetch image types:", error);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([fetchImageTypes(), fetchImages(selectedType)]);
    })();
    // deviceFilter/currentDeviceId 변경 시에도 재조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, deviceFilter, currentDeviceId]);

  useEffect(() => {
    if (!imageBaseUrl || images.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        images.map(async (image) => {
          try {
            const res = await fetch(`${imageBaseUrl}/${image.filename}`, {
              method: "HEAD",
            });
            const len = res.headers.get("content-length");
            return [image.id, len ? parseInt(len, 10) : null] as const;
          } catch {
            return [image.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      setSizes(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [images, imageBaseUrl]);

  const handleDownload = async (image: Image) => {
    setDownloadingId(image.id);
    try {
      const res = await fetch(`${imageBaseUrl}/${image.filename}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = image.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
      alert("다운로드에 실패했습니다.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/admin/images/${id}/`, {
        method: "DELETE",
      });

      if (res.ok) {
        setImages(images.filter((img) => img.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  const isBackgroundTab = selectedType === BACKGROUND_IMAGE_TYPE;
  const activeBackgroundCount = images.filter((img) => img.active).length;

  const handleToggleActive = async (image: Image) => {
    const next = !image.active;
    // 활성화 시도인데 이미 6개 활성이면 클라이언트에서 먼저 차단 (서버도 재검증)
    if (
      next &&
      image.imageType === BACKGROUND_IMAGE_TYPE &&
      activeBackgroundCount >= MAX_ACTIVE_BACKGROUNDS
    ) {
      alert(`배경은 최대 ${MAX_ACTIVE_BACKGROUNDS}개까지만 활성화할 수 있습니다.`);
      return;
    }
    try {
      const res = await fetch(`/api/admin/images/${image.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "상태 변경에 실패했습니다.");
        return;
      }
      setImages((prev) => prev.map((img) => (img.id === image.id ? { ...img, active: next } : img)));
    } catch {
      alert("서버 연결에 실패했습니다.");
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    background: "배경",
    image: "프레임",
    sticker: "스티커",
  };

  const getTypeLabel = (typeId: number) => {
    const type = imageTypes.find((t) => t.id === typeId);
    if (!type) return `타입 ${typeId}`;
    return TYPE_LABELS[type.name] || type.name;
  };

  const isVideo = (filename: string) =>
    filename.endsWith(".mp4") || filename.endsWith(".webm");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">이미지 관리</h2>
        <Link
          href="/admin/images/upload"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          + 이미지 업로드
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {imageTypes.filter((type) => !THEME_MANAGED_TYPES.has(type.id)).map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedType === type.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {getTypeLabel(type.id)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* 전체 / 이 장치 이미지 보기 토글 */}
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            <button
              onClick={() => setDeviceFilter("all")}
              className={`px-3 py-2 transition-colors ${deviceFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              전체
            </button>
            <button
              onClick={() => setDeviceFilter("device")}
              disabled={!currentDeviceId}
              title={currentDeviceId ? undefined : "장치를 먼저 선택하세요"}
              className={`px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${deviceFilter === "device" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            >
              {selectedDevice ? `${selectedDevice.name} 이미지` : "이 장치"}
            </button>
          </div>
          <button
            onClick={() => setShowOrderDialog(true)}
            disabled={images.length === 0}
            className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            순서 관리
          </button>
        </div>
      </div>

      {isBackgroundTab && (
        <div
          className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between gap-3 ${
            activeBackgroundCount > MAX_ACTIVE_BACKGROUNDS
              ? "bg-red-900/40 border-red-600 text-red-300"
              : "bg-gray-800 border-gray-700 text-gray-300"
          }`}
        >
          <span>
            <span className="font-semibold text-white">서비스에 노출할 배경을 선택하세요</span> (최대 {MAX_ACTIVE_BACKGROUNDS}개) — 카드를 클릭해 켜고 끕니다.
            {activeBackgroundCount > MAX_ACTIVE_BACKGROUNDS &&
              ` 현재 ${MAX_ACTIVE_BACKGROUNDS}개를 초과했습니다 — 초과분을 꺼주세요.`}
          </span>
          <span className={`shrink-0 font-bold ${activeBackgroundCount > MAX_ACTIVE_BACKGROUNDS ? "" : "text-white"}`}>
            선택됨 {activeBackgroundCount} / {MAX_ACTIVE_BACKGROUNDS}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">로딩중...</div>
      ) : images.length === 0 ? (
        <div className="p-8 bg-gray-800 rounded-xl text-center">
          <p className="text-gray-400 mb-4">
            {getTypeLabel(selectedType)} 이미지가 없습니다.
          </p>
          <Link
            href="/admin/images/upload"
            className="text-purple-400 hover:underline"
          >
            이미지 업로드하기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="bg-gray-800 rounded-xl overflow-hidden"
            >
              <div
                onClick={() => (isBackgroundTab ? handleToggleActive(image) : setEditingImage(image))}
                className={`aspect-video bg-gray-700 flex items-center justify-center cursor-pointer group relative ${
                  isBackgroundTab && !image.active ? "opacity-40" : ""
                }`}
                title={isBackgroundTab ? (image.active ? "노출 중 — 클릭하여 숨김" : "숨김 — 클릭하여 노출") : "클릭하여 편집"}
              >
                {isBackgroundTab ? (
                  image.active ? (
                    <span className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow">
                      ✓
                    </span>
                  ) : (
                    <span className="absolute top-2 left-2 z-20 bg-black/70 text-gray-200 text-xs px-2 py-0.5 rounded">
                      숨김
                    </span>
                  )
                ) : (
                  <span className="absolute inset-0 z-10 hidden items-center justify-center bg-black/40 text-sm font-medium text-white group-hover:flex">
                    편집
                  </span>
                )}
                {isVideo(image.filename) ? (
                  <video
                    src={`${imageBaseUrl}/${image.filename}`}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={`${imageBaseUrl}/${image.filename}`}
                    alt={image.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%239CA3AF' x='50' y='55' text-anchor='middle' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                )}
              </div>
              <div className="p-4">
                <h4 className="text-white font-medium truncate">{image.name}</h4>
                <p className="text-sm text-gray-400 truncate">
                  {image.filename}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    우선순위: {image.priority}
                  </span>
                  <span className="text-xs text-gray-500">
                    {sizes[image.id] === undefined
                      ? "…"
                      : sizes[image.id] === null
                        ? "-"
                        : formatSize(sizes[image.id] as number)}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => setEditingImage(image)}
                    className="w-full px-2 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                  >
                    편집
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(image)}
                      disabled={downloadingId === image.id}
                      className="flex-1 px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                      {downloadingId === image.id ? "다운로드중…" : "다운로드"}
                    </button>
                    <button
                      onClick={() => handleDelete(image.id)}
                      className="px-2 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingImage && (
        <EditDialog
          image={editingImage}
          imageBaseUrl={imageBaseUrl}
          devices={devices}
          onClose={() => setEditingImage(null)}
          onSaved={() => {
            setEditingImage(null);
            fetchImages(selectedType);
          }}
        />
      )}

      {showOrderDialog && (
        <OrderDialog
          images={images}
          imageBaseUrl={imageBaseUrl}
          typeLabel={getTypeLabel(selectedType)}
          onClose={() => setShowOrderDialog(false)}
          onSaved={() => {
            setShowOrderDialog(false);
            fetchImages(selectedType);
          }}
        />
      )}
    </div>
  );
}
