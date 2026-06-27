import { contextBridge, ipcRenderer } from "electron";

const dashboard = {
  listMemories: () => ipcRenderer.invoke("dashboard:listMemories"),
  getProgress: () => ipcRenderer.invoke("dashboard:getProgress"),
  listDocs: () => ipcRenderer.invoke("dashboard:listDocs"),
  getDoc: (id: string) => ipcRenderer.invoke("dashboard:getDoc", id),
};

contextBridge.exposeInMainWorld("dashboard", dashboard);

export type DashboardApi = typeof dashboard;
