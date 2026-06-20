"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Image {
  id: number;
  deviceId: string | null;
  imageType: number;
  name: string;
  filename: string;
  priority: number;
}

interface ImageType {
  id: number;
  name: string;
}

export default function ImagesPage() {
  const [images, setImages] = useState<Image[]>([]);
  const [imageTypes, setImageTypes] = useState<ImageType[]>([]);
  const [selectedType, setSelectedType] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  const fetchImages = async (typeId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/image/list/${typeId}`);
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
      const res = await fetch("/api/admin/image-types");
      const data = await res.json();
      setImageTypes(data.imageTypes || []);
    } catch (error) {
      console.error("Failed to fetch image types:", error);
    }
  };

  useEffect(() => {
    fetchImageTypes();
    fetchImages(selectedType);
  }, [selectedType]);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/admin/images/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setImages(images.filter((img) => img.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  const getTypeLabel = (typeId: number) => {
    const type = imageTypes.find((t) => t.id === typeId);
    return type?.name || `타입 ${typeId}`;
  };

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
            {type.name}
          </button>
        ))}
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
              <div className="aspect-video bg-gray-700 flex items-center justify-center">
                <img
                  src={`/static/images/${image.filename}`}
                  alt={image.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%239CA3AF' x='50' y='55' text-anchor='middle' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>
              <div className="p-4">
                <h4 className="text-white font-medium truncate">{image.name}</h4>
                <p className="text-sm text-gray-400 truncate">
                  {image.filename}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-500">
                    우선순위: {image.priority}
                  </span>
                  <button
                    onClick={() => handleDelete(image.id)}
                    className="px-2 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-500 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
