"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Device } from "@/types";

interface AdminContextType {
  devices: Device[];
  selectedDevice: Device | null;
  selectDevice: (device: Device | null) => void;
  refreshDevices: () => Promise<void>;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType>({
  devices: [],
  selectedDevice: null,
  selectDevice: () => {},
  refreshDevices: async () => {},
  loading: true,
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/devices/");
      const data = await res.json();
      const list: Device[] = data.devices || [];
      setDevices(list);

      // 항상 하나의 지점이 선택돼 있도록: 저장된 선택 복원, 없으면 첫 장치 자동 선택
      const savedId = localStorage.getItem("admin_selected_device");
      const found = savedId ? list.find((d) => d.deviceId === savedId) : undefined;
      const initial = found ?? list[0];
      if (initial) {
        setSelectedDevice(initial);
        localStorage.setItem("admin_selected_device", initial.deviceId);
      }
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchDevices();
    })();
  }, [fetchDevices]);

  const selectDevice = (device: Device | null) => {
    setSelectedDevice(device);
    if (device) {
      localStorage.setItem("admin_selected_device", device.deviceId);
    } else {
      localStorage.removeItem("admin_selected_device");
    }
  };

  return (
    <AdminContext.Provider
      value={{
        devices,
        selectedDevice,
        selectDevice,
        refreshDevices: fetchDevices,
        loading,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
