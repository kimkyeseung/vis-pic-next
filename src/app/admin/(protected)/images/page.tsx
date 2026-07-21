"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OrderDialog from "./OrderDialog";
import EditDialog from "./EditDialog";

interface Image {
  id: number;
  deviceIds: string[];
  imageType: number;
  name: string;
  filename: string;
  priority: number;
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
      const res = await fetch(`/api/image/list/${typeId}/`, { cache: "no-store" });
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
  }, [selectedType]);

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
          {imageTypes.map((type) => (
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
        <button
          onClick={() => setShowOrderDialog(true)}
          disabled={images.length === 0}
          className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          순서 관리
        </button>
      </div>

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
                onClick={() => setEditingImage(image)}
                className="aspect-video bg-gray-700 flex items-center justify-center cursor-pointer group relative"
                title="클릭하여 편집"
              >
                <span className="absolute inset-0 z-10 hidden items-center justify-center bg-black/40 text-sm font-medium text-white group-hover:flex">
                  편집
                </span>
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
