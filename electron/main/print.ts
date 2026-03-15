import path from "node:path";
import { pathToFileURL } from "node:url";
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

const renderTemplate = (template: PrintTemplateRecord, order: OrderRecord): string => {
  const imageBlock = order.product_image_path
    ? `<tr><th>产品图片</th><td><img class="product-image" src="${pathToFileURL(
        path.resolve(order.product_image_path)
      ).toString()}" /></td></tr>`
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
