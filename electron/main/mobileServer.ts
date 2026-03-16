import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import type { OrderInput, OrderRecord } from "./types";

interface StartMobileServerOptions {
  port: number;
  createOrder: (input: OrderInput) => Promise<OrderRecord>;
  printOrder: (orderId: number) => Promise<void>;
  saveImage: (dataUrl: string) => Promise<string>;
  onCreated: () => void;
  isDev: boolean;
  vitePort: number;
  distDir: string;
}

const getLanIp = (): string => {
  const nets = os.networkInterfaces();
  for (const values of Object.values(nets)) {
    if (!values) continue;
    for (const info of values) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return "127.0.0.1";
};

export const startMobileServer = async (
  opts: StartMobileServerOptions
): Promise<{ server: http.Server; baseUrl: string; mobileUrl: string }> => {
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: "12mb" }));
  app.use(express.json({ limit: "12mb" }));

  app.use("/api", (_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/mobile/orders", async (req, res) => {
    try {
      const body = req.body as Partial<OrderInput> & {
        image_data_url?: string;
        image_data_urls?: string[];
      };
      const imageDataList = Array.isArray(body.image_data_urls)
        ? body.image_data_urls
        : typeof body.image_data_url === "string"
          ? [body.image_data_url]
          : [];
      const imagePaths: string[] = [];
      for (const imageData of imageDataList) {
        if (typeof imageData === "string" && imageData.startsWith("data:image/")) {
          imagePaths.push(await opts.saveImage(imageData));
        }
      }
      const created = await opts.createOrder({
        delivery_date: String(body.delivery_date || ""),
        delivery_slot: body.delivery_slot as OrderInput["delivery_slot"],
        delivery_time_exact: body.delivery_time_exact || null,
        receiver_info: String(body.receiver_info || ""),
        buyer_info: String(body.buyer_info || ""),
        product_image_paths: imagePaths,
        product_description: String(body.product_description || ""),
        card_message: body.card_message || null
      });
      opts.onCreated();
      res.json({ ok: true, orderId: created.id, orderNo: created.order_id });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "订单提交失败"
      });
    }
  });

  app.post("/api/mobile/orders/:id/print", async (req, res) => {
    try {
      const orderId = Number.parseInt(String(req.params.id || ""), 10);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        throw new Error("订单ID无效");
      }
      await opts.printOrder(orderId);
      opts.onCreated();
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "打印失败"
      });
    }
  });

  const distMobile = path.join(opts.distDir, "mobile.html");
  if (!opts.isDev && fs.existsSync(distMobile)) {
    app.use(express.static(opts.distDir));
    app.get("/m", (_req, res) => {
      res.sendFile(distMobile);
    });
  } else {
    app.get("/m", (_req, res) => {
      const ip = getLanIp();
      const apiBase = encodeURIComponent(`http://${ip}:${opts.port}`);
      res.redirect(`http://${ip}:${opts.vitePort}/mobile.html?apiBase=${apiBase}`);
    });
  }

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(opts.port, "0.0.0.0", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const ip = getLanIp();
  return {
    server,
    baseUrl: `http://${ip}:${address.port}`,
    mobileUrl: `http://${ip}:${address.port}/m`
  };
};
