/// <reference types="vite/client" />

import type { OrderInput, PrintTemplateInput } from "./types";

declare global {
  interface Window {
    api: {
      getSystemInfo: () => Promise<{
        mobileUrl: string;
        mobileQrDataUrl: string;
        retentionDays: number;
      }>;
      listOrders: (unprintedOnly?: boolean) => Promise<import("./types").OrderRecord[]>;
      deleteOrders: (ids: number[]) => Promise<{ deleted: number }>;
      createOrder: (payload: OrderInput) => Promise<import("./types").OrderRecord>;
      saveImage: (dataUrl: string) => Promise<string>;
      getImageSaveDir: () => Promise<string>;
      chooseImageSaveDir: () => Promise<string>;
      openImageSaveDir: () => Promise<boolean>;
      printOrder: (orderId: number, templateId?: number) => Promise<{ ok: true }>;
      batchPrintUnprinted: (
        templateId?: number
      ) => Promise<{ total: number; success: number; failed: number }>;
      listTemplates: () => Promise<import("./types").PrintTemplateRecord[]>;
      saveTemplate: (
        payload: PrintTemplateInput,
        id?: number
      ) => Promise<import("./types").PrintTemplateRecord>;
      runCleanup: () => Promise<{ deleted: number; cutoff: string }>;
      countUnprinted: () => Promise<number>;
      onOrdersUpdated: (callback: () => void) => () => void;
    };
  }
}

export {};
