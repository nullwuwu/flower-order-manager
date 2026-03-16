import fs from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import type { OrderRecord, PrintTemplateRecord } from "./types";

const replaceAllCompat = (input: string, from: string, to: string): string =>
  input.split(from).join(to);

const escapeHtml = (value: string): string =>
  replaceAllCompat(
    replaceAllCompat(
      replaceAllCompat(replaceAllCompat(replaceAllCompat(value, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"),
      "\"",
      "&quot;"
    ),
    "'",
    "&#39;"
  );

const getImageMimeByPath = (imagePath: string): string => {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

const readImageAsDataUrl = (imagePath: string): string | null => {
  try {
    const file = fs.readFileSync(imagePath);
    const mime = getImageMimeByPath(imagePath);
    return `data:${mime};base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
};

const renderTemplate = (template: PrintTemplateRecord, order: OrderRecord): string => {
  const imageItems = (order.product_image_paths ?? [])
    .map((imagePath) => readImageAsDataUrl(path.resolve(imagePath)))
    .filter((x): x is string => Boolean(x));
  const imageGridClass = imageItems.length >= 2 ? "product-image-grid two-up" : "product-image-grid";
  const imageBlock =
    imageItems.length > 0
      ? `<tr><th>产品图片</th><td><div class="${imageGridClass}">${imageItems
          .map((src) => `<img class="product-image" src="${src}" />`)
          .join("")}</div></td></tr>`
      : "";

  let html = template.html.replace("{{image_block}}", imageBlock);
  const replacements: Record<string, string> = {
    order_id: order.order_id,
    delivery_date: order.delivery_date,
    delivery_slot: order.delivery_slot,
    delivery_time_exact: order.delivery_time_exact ?? "",
    receiver_info: order.receiver_info,
    buyer_info: order.buyer_info,
    product_description: order.product_description,
    card_message: order.card_message ?? ""
  };

  Object.entries(replacements).forEach(([key, value]) => {
    html = replaceAllCompat(html, `{{${key}}}`, escapeHtml(value));
  });

  return `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>${template.css}</style>
        <style>
          .order-table th { width: 82px !important; }
          .product-image-grid {
            display: flex;
            gap: 8px;
            align-items: flex-start;
          }
          .product-image-grid.two-up {
            flex-wrap: nowrap;
          }
          .product-image-grid.two-up .product-image {
            flex: 1 1 0;
            min-width: 0;
            width: auto !important;
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;
};

export const printOrderWithTemplate = async (
  order: OrderRecord,
  template: PrintTemplateRecord
): Promise<void> => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });
  const html = renderTemplate(template, order);
  const encoded = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await win.loadURL(encoded);
  await new Promise<void>((resolve, reject) => {
    win.webContents.print(
      {
        silent: true,
        printBackground: true
      },
      (success, failureReason) => {
        win.close();
        if (!success) {
          reject(new Error(failureReason || "打印失败"));
          return;
        }
        resolve();
      }
    );
  });
};
