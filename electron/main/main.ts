import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import dayjs from "dayjs";
import QRCode from "qrcode";
import { DatabaseService } from "./db";
import { printOrderWithTemplate } from "./print";
import { startMobileServer } from "./mobileServer";
import type { OrderInput, PrintTemplateInput } from "./types";

const MOBILE_PORT = 17630;
const RETENTION_DAYS = 7;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow: BrowserWindow | null = null;
let mobileUrl = "";
let mobileQrDataUrl = "";
let db: DatabaseService;
let imageSaveDir = "";

const isDev = !app.isPackaged;

const localizeErrorMessage = (error: unknown, fallback = "操作失败"): string => {
  const raw = error instanceof Error ? error.message : String(error || fallback);
  const lower = raw.toLowerCase();
  if (lower.includes("no printers available")) {
    return "未检测到可用打印机，请先连接并在系统中安装打印机";
  }
  if (lower.includes("print job canceled")) {
    return "打印任务已取消";
  }
  if (lower.includes("invalid printer settings")) {
    return "打印机设置无效，请检查系统打印配置";
  }
  return raw || fallback;
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1120,
    minHeight: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const htmlPath = path.join(app.getAppPath(), "dist", "index.html");
    await mainWindow.loadFile(htmlPath);
  }
};

const saveImageFromDataUrl = async (dataUrl: string): Promise<string> => {
  const matched = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matched) {
    throw new Error("图片格式无效");
  }
  const mime = matched[1];
  const base64 = matched[2];
  const extension = mime.includes("png")
    ? "png"
    : mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : "webp";
  const filename = `${dayjs().format("YYYYMMDD_HHmmss_SSS")}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension}`;
  if (!imageSaveDir) {
    imageSaveDir = db.imageDir;
  }
  fs.mkdirSync(imageSaveDir, { recursive: true });
  const output = path.join(imageSaveDir, filename);
  fs.writeFileSync(output, Buffer.from(base64, "base64"));
  return output;
};

const printSingleOrder = async (orderId: number, templateId?: number): Promise<void> => {
  const order = await db.getOrderById(orderId);
  if (!order) {
    throw new Error("订单不存在");
  }
  const template = templateId
    ? (await db.listTemplates()).find((t) => t.id === templateId) ?? (await db.getDefaultTemplate())
    : await db.getDefaultTemplate();
  await printOrderWithTemplate(order, template);
  await db.incrementPrintCount(order.id);
};

const registerIpc = (): void => {
  ipcMain.handle("system:info", async () => ({
    mobileUrl,
    mobileQrDataUrl,
    retentionDays: RETENTION_DAYS
  }));

  ipcMain.handle("orders:list", async (_event, unprintedOnly?: boolean) =>
    db.listOrders(Boolean(unprintedOnly))
  );
  ipcMain.handle("orders:delete", async (_event, ids: number[]) => {
    const deleted = await db.deleteOrders(Array.isArray(ids) ? ids : []);
    mainWindow?.webContents.send("orders:updated");
    return { deleted };
  });

  ipcMain.handle("orders:create", async (_event, payload: OrderInput) => {
    const created = await db.createOrder(payload);
    mainWindow?.webContents.send("orders:updated");
    return created;
  });

  ipcMain.handle("orders:unprinted-count", async () => db.countUnprintedOrders());

  ipcMain.handle("images:save", async (_event, dataUrl: string) => saveImageFromDataUrl(dataUrl));
  ipcMain.handle("images:get-save-dir", async () => imageSaveDir);
  ipcMain.handle("images:choose-save-dir", async () => {
    const options = {
      properties: ["openDirectory"] as Array<"openDirectory">,
      title: "选择图片保存目录"
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return imageSaveDir;
    }
    const picked = result.filePaths[0];
    fs.mkdirSync(picked, { recursive: true });
    imageSaveDir = picked;
    await db.setSetting("image_save_dir", imageSaveDir);
    return imageSaveDir;
  });
  ipcMain.handle("images:open-save-dir", async () => {
    fs.mkdirSync(imageSaveDir, { recursive: true });
    const err = await shell.openPath(imageSaveDir);
    if (err) {
      throw new Error(err);
    }
    return true;
  });

  ipcMain.handle("templates:list", async () => db.listTemplates());
  ipcMain.handle(
    "templates:save",
    async (_event, data: { payload: PrintTemplateInput; id?: number }) =>
      db.upsertTemplate(data.payload, data.id)
  );

  ipcMain.handle(
    "print:one",
    async (_event, args: { orderId: number; templateId?: number }) => {
      try {
        await printSingleOrder(args.orderId, args.templateId);
        mainWindow?.webContents.send("orders:updated");
        return { ok: true };
      } catch (error) {
        throw new Error(localizeErrorMessage(error, "打印失败"));
      }
    }
  );

  ipcMain.handle(
    "print:batch-unprinted",
    async (_event, args: { templateId?: number } = {}) => {
      const orders = await db.listOrders(true);
      const template = args.templateId
        ? (await db.listTemplates()).find((t) => t.id === args.templateId) ??
          (await db.getDefaultTemplate())
        : await db.getDefaultTemplate();
      let success = 0;
      const failures: Array<{ id: number; reason: string }> = [];
      for (const order of orders) {
        try {
          await printOrderWithTemplate(order, template);
          await db.incrementPrintCount(order.id);
          success += 1;
        } catch (error) {
          failures.push({
            id: order.id,
            reason: localizeErrorMessage(error, "打印失败")
          });
        }
      }
      mainWindow?.webContents.send("orders:updated");
      return {
        total: orders.length,
        success,
        failed: failures.length,
        failures
      };
    }
  );

  ipcMain.handle("retention:cleanup", async () => db.cleanupExpiredOrders(RETENTION_DAYS));
};

const bootstrap = async (): Promise<void> => {
  await app.whenReady();
  db = new DatabaseService(app.getPath("userData"));
  await db.init();
  imageSaveDir = (await db.getSetting("image_save_dir")) || db.imageDir;
  fs.mkdirSync(imageSaveDir, { recursive: true });
  await db.cleanupExpiredOrders(RETENTION_DAYS);

  registerIpc();
  await createWindow();

  const mobileServer = await startMobileServer({
    port: MOBILE_PORT,
    saveImage: saveImageFromDataUrl,
    isDev,
    vitePort: 5173,
    distDir: path.join(app.getAppPath(), "dist"),
    createOrder: async (payload) => db.createOrder(payload),
    printOrder: async (orderId) => {
      try {
        await printSingleOrder(orderId);
      } catch (error) {
        throw new Error(localizeErrorMessage(error, "打印失败"));
      }
    },
    onCreated: () => mainWindow?.webContents.send("orders:updated")
  });
  mobileUrl = mobileServer.mobileUrl;
  mobileQrDataUrl = await QRCode.toDataURL(mobileUrl, {
    margin: 1,
    scale: 6
  });

  setInterval(() => {
    db.cleanupExpiredOrders(RETENTION_DAYS).catch(() => {
      // Keep cleanup best-effort.
    });
  }, RETENTION_INTERVAL_MS);
};

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(() => undefined);
  }
});

app.on("before-quit", () => {
  db?.close();
});

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  app.quit();
});
