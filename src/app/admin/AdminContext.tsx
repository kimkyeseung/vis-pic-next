"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface Device {
  id: number;
  deviceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

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
      const res = await fetch("/api/admin/devices");
      const data = await res.json();
      const list: Device[] = data.devices || [];
      setDevices(list);

      const savedId = localStorage.getItem("admin_selected_device");
      if (savedId) {
        const found = list.find((d) => d.deviceId === savedId);
        if (found) setSelectedDevice(found);
      }
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
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
