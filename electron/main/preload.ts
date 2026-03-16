import { contextBridge, ipcRenderer } from "electron";
import type { OrderInput, PrintTemplateInput } from "./types";

contextBridge.exposeInMainWorld("api", {
  getSystemInfo: () => ipcRenderer.invoke("system:info"),
  listOrders: (unprintedOnly?: boolean) => ipcRenderer.invoke("orders:list", unprintedOnly),
  deleteOrders: (ids: number[]) => ipcRenderer.invoke("orders:delete", ids),
  createOrder: (payload: OrderInput) => ipcRenderer.invoke("orders:create", payload),
  updateOrder: (id: number, payload: OrderInput) => ipcRenderer.invoke("orders:update", { id, payload }),
  saveImage: (dataUrl: string) => ipcRenderer.invoke("images:save", dataUrl),
  readImageDataUrl: (filePath: string) => ipcRenderer.invoke("images:read-data-url", filePath),
  getImageSaveDir: () => ipcRenderer.invoke("images:get-save-dir"),
  chooseImageSaveDir: () => ipcRenderer.invoke("images:choose-save-dir"),
  openImageSaveDir: () => ipcRenderer.invoke("images:open-save-dir"),
  printOrder: (orderId: number, templateId?: number) =>
    ipcRenderer.invoke("print:one", { orderId, templateId }),
  batchPrintUnprinted: (templateId?: number) =>
    ipcRenderer.invoke("print:batch-unprinted", { templateId }),
  listTemplates: () => ipcRenderer.invoke("templates:list"),
  saveTemplate: (payload: PrintTemplateInput, id?: number) =>
    ipcRenderer.invoke("templates:save", { payload, id }),
  runCleanup: () => ipcRenderer.invoke("retention:cleanup"),
  countUnprinted: () => ipcRenderer.invoke("orders:unprinted-count"),
  onOrdersUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("orders:updated", listener);
    return () => ipcRenderer.off("orders:updated", listener);
  }
});
