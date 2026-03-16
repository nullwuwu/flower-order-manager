import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import sqlite3 from "sqlite3";
import type { OrderInput, OrderRecord, PrintTemplateInput, PrintTemplateRecord } from "./types";

const sqlite = sqlite3.verbose();

const DEFAULT_TEMPLATE_HTML = `
<div class="sheet">
  <h1>倾城花艺</h1>
  <table class="order-table">
    <tbody>
      <tr><th>订单号</th><td><strong>{{order_id}}</strong></td></tr>
      <tr><th>配送日期</th><td>{{delivery_date}}</td></tr>
      <tr><th>配送时间</th><td>{{delivery_slot}} {{delivery_time_exact}}</td></tr>
      <tr><th>收货人信息</th><td>{{receiver_info}}</td></tr>
      <tr><th>订货人信息</th><td>{{buyer_info}}</td></tr>
      {{image_block}}
      <tr><th>产品描述</th><td>{{product_description}}</td></tr>
      <tr><th>贺卡内容</th><td>{{card_message}}</td></tr>
    </tbody>
  </table>
</div>
`;

const DEFAULT_TEMPLATE_CSS = `
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; margin: 0; color: #222; }
.sheet { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 10mm; box-sizing: border-box; }
h1 { margin: 0 0 10px; font-size: 22px; }
.order-table { width: 100%; border-collapse: collapse; font-size: 16px; line-height: 1.5; }
.order-table th, .order-table td { border: 1px solid #ddd; padding: 7px 8px; text-align: left; vertical-align: top; }
.order-table th { width: 82px; color: #555; background: #fafafa; white-space: nowrap; }
.product-image-grid { display: flex; gap: 8px; align-items: flex-start; }
.product-image-grid.two-up { flex-wrap: nowrap; }
.product-image-grid.two-up .product-image { flex: 1 1 0; width: auto; min-width: 0; }
.product-image { width: 360px; height: 260px; object-fit: contain; border: 1px solid #ddd; }
`;

type RunResult = { changes: number; lastID: number };

export class DatabaseService {
  private db: sqlite3.Database;
  readonly imageDir: string;
  readonly logFile: string;

  constructor(private userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.imageDir = path.join(userDataDir, "images");
    const logDir = path.join(userDataDir, "logs");
    fs.mkdirSync(this.imageDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    this.logFile = path.join(logDir, "retention.log");
    const dbPath = path.join(userDataDir, "orders.db");
    this.db = new sqlite.Database(dbPath);
  }

  async init(): Promise<void> {
    await this.ensureOrdersTableSchema();
    await this.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS print_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        html TEXT NOT NULL,
        css TEXT NOT NULL,
        config_json TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    await this.ensureTemplateConfigColumn();

    const templateCount = await this.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM print_templates"
    );
    if (!templateCount || templateCount.count === 0) {
      const now = dayjs().toISOString();
      await this.run(
        `INSERT INTO print_templates (name, html, css, config_json, is_default, updated_at) VALUES (?, ?, ?, ?, 1, ?)`,
        ["A4默认模板", DEFAULT_TEMPLATE_HTML, DEFAULT_TEMPLATE_CSS, null, now]
      );
    }
  }

  async getSetting(key: string): Promise<string | undefined> {
    const row = await this.get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
    return row?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.run(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
  }

  async createOrder(input: OrderInput): Promise<OrderRecord> {
    const requiredFields: Array<keyof OrderInput> = ["delivery_date"];
    for (const field of requiredFields) {
      const val = input[field];
      if (!val || String(val).trim() === "") {
        throw new Error(`字段 ${field} 不能为空`);
      }
    }
    this.assertDeliveryDateNotPast(input.delivery_date);

    const now = dayjs().toISOString();
    const orderId = await this.generateOrderId(now);
    await this.run(
      `INSERT INTO orders (
        order_id, delivery_date, delivery_slot, delivery_time_exact,
        receiver_info, buyer_info, product_image_paths, product_description,
        card_message, print_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        orderId,
        input.delivery_date,
        input.delivery_slot,
        input.delivery_time_exact ?? null,
        input.receiver_info,
        input.buyer_info,
        this.serializeImagePaths(input.product_image_paths),
        input.product_description,
        input.card_message ?? null,
        now,
        now
      ]
    );
    const created = await this.getOrderByOrderId(orderId);
    if (!created) {
      throw new Error("订单创建失败");
    }
    return created;
  }

  async listOrders(unprintedOnly = false): Promise<OrderRecord[]> {
    const sql = unprintedOnly
      ? "SELECT * FROM orders WHERE print_count = 0 ORDER BY created_at DESC"
      : "SELECT * FROM orders ORDER BY created_at DESC";
    const rows = await this.all<OrderRecord>(sql);
    return rows.map((row) => this.deserializeOrder(row));
  }

  async updateOrder(id: number, input: OrderInput): Promise<OrderRecord> {
    const existing = await this.getOrderById(id);
    if (!existing) {
      throw new Error("订单不存在");
    }
    const requiredFields: Array<keyof OrderInput> = ["delivery_date"];
    for (const field of requiredFields) {
      const val = input[field];
      if (!val || String(val).trim() === "") {
        throw new Error(`字段 ${field} 不能为空`);
      }
    }
    this.assertDeliveryDateNotPast(input.delivery_date);
    const now = dayjs().toISOString();
    const nextImagePaths = Array.isArray(input.product_image_paths)
      ? input.product_image_paths
      : existing.product_image_paths;
    await this.run(
      `UPDATE orders SET
        delivery_date = ?, delivery_slot = ?, delivery_time_exact = ?,
        receiver_info = ?, buyer_info = ?, product_image_paths = ?,
        product_description = ?, card_message = ?, updated_at = ?
      WHERE id = ?`,
      [
        input.delivery_date,
        input.delivery_slot,
        input.delivery_time_exact ?? null,
        input.receiver_info,
        input.buyer_info,
        this.serializeImagePaths(nextImagePaths),
        input.product_description,
        input.card_message ?? null,
        now,
        id
      ]
    );
    await this.cleanupOrphanImages(existing.product_image_paths ?? []);
    const updated = await this.getOrderById(id);
    if (!updated) {
      throw new Error("订单更新失败");
    }
    return updated;
  }

  async deleteOrders(ids: number[]): Promise<number> {
    const uniqIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqIds.length === 0) return 0;
    const placeholders = uniqIds.map(() => "?").join(", ");
    const images = await this.all<{ product_image_paths: string }>(
      `SELECT product_image_paths FROM orders WHERE id IN (${placeholders})`,
      uniqIds
    );
    const result = await this.run(`DELETE FROM orders WHERE id IN (${placeholders})`, uniqIds);
    await this.cleanupOrphanImages(images.flatMap((x) => this.parseImagePaths(x.product_image_paths)));
    return result.changes;
  }

  async getOrderById(id: number): Promise<OrderRecord | undefined> {
    const row = await this.get<OrderRecord>("SELECT * FROM orders WHERE id = ?", [id]);
    return row ? this.deserializeOrder(row) : undefined;
  }

  async getOrderByOrderId(orderId: string): Promise<OrderRecord | undefined> {
    const row = await this.get<OrderRecord>("SELECT * FROM orders WHERE order_id = ?", [orderId]);
    return row ? this.deserializeOrder(row) : undefined;
  }

  async incrementPrintCount(id: number): Promise<void> {
    const now = dayjs().toISOString();
    await this.run("UPDATE orders SET print_count = print_count + 1, updated_at = ? WHERE id = ?", [
      now,
      id
    ]);
  }

  async listTemplates(): Promise<PrintTemplateRecord[]> {
    return this.all<PrintTemplateRecord>(
      "SELECT * FROM print_templates ORDER BY is_default DESC, updated_at DESC"
    );
  }

  async upsertTemplate(template: PrintTemplateInput, id?: number): Promise<PrintTemplateRecord> {
    const now = dayjs().toISOString();
    if (template.is_default === 1) {
      await this.run("UPDATE print_templates SET is_default = 0");
    }
    if (id) {
      await this.run(
        "UPDATE print_templates SET name = ?, html = ?, css = ?, config_json = ?, is_default = ?, updated_at = ? WHERE id = ?",
        [
          template.name,
          template.html,
          template.css,
          template.config_json ?? null,
          template.is_default,
          now,
          id
        ]
      );
    } else {
      await this.run(
        "INSERT INTO print_templates (name, html, css, config_json, is_default, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          template.name,
          template.html,
          template.css,
          template.config_json ?? null,
          template.is_default,
          now
        ]
      );
    }
    const row = await this.get<PrintTemplateRecord>(
      "SELECT * FROM print_templates ORDER BY updated_at DESC LIMIT 1"
    );
    if (!row) {
      throw new Error("模板保存失败");
    }
    return row;
  }

  async getDefaultTemplate(): Promise<PrintTemplateRecord> {
    const row =
      (await this.get<PrintTemplateRecord>(
        "SELECT * FROM print_templates WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1"
      )) ??
      (await this.get<PrintTemplateRecord>(
        "SELECT * FROM print_templates ORDER BY updated_at DESC LIMIT 1"
      ));
    if (!row) {
      throw new Error("未找到打印模板");
    }
    return row;
  }

  async cleanupExpiredOrders(days = 7): Promise<{ deleted: number; cutoff: string }> {
    const cutoff = dayjs().subtract(days, "day").toISOString();
    const oldImages = await this.all<{ product_image_paths: string }>(
      "SELECT product_image_paths FROM orders WHERE created_at < ?",
      [cutoff]
    );
    const result = await this.run("DELETE FROM orders WHERE created_at < ?", [cutoff]);
    await this.cleanupOrphanImages(oldImages.flatMap((x) => this.parseImagePaths(x.product_image_paths)));
    this.appendRetentionLog(cutoff, result.changes);
    return { deleted: result.changes, cutoff };
  }

  async countUnprintedOrders(): Promise<number> {
    const row = await this.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM orders WHERE print_count = 0"
    );
    return row?.count ?? 0;
  }

  close(): void {
    this.db.close();
  }

  private async cleanupOrphanImages(pathsToCheck: string[]): Promise<void> {
    const uniq = [...new Set(pathsToCheck.filter(Boolean))];
    const usedRows = await this.all<{ product_image_paths: string }>("SELECT product_image_paths FROM orders");
    const usedSet = new Set(
      usedRows.flatMap((row) => this.parseImagePaths(row.product_image_paths)).filter(Boolean)
    );
    for (const imagePath of uniq) {
      if (!usedSet.has(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch {
          // Ignore missing file and continue cleanup.
        }
      }
    }
  }

  private appendRetentionLog(cutoff: string, deleted: number): void {
    const line = `[${dayjs().format("YYYY-MM-DD HH:mm:ss")}] cutoff=${cutoff} deleted=${deleted}\n`;
    fs.appendFileSync(this.logFile, line, "utf-8");
  }

  private assertDeliveryDateNotPast(deliveryDate: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
      throw new Error("配送日期格式无效");
    }
    const picked = dayjs(`${deliveryDate}T00:00:00`);
    if (!picked.isValid()) {
      throw new Error("配送日期格式无效");
    }
    if (picked.isBefore(dayjs().startOf("day"))) {
      throw new Error("配送日期不能早于今天");
    }
  }

  private async ensureTemplateConfigColumn(): Promise<void> {
    const columns = await this.all<{ name: string }>("PRAGMA table_info(print_templates)");
    if (!columns.some((col) => col.name === "config_json")) {
      await this.run("ALTER TABLE print_templates ADD COLUMN config_json TEXT");
    }
  }

  private async ensureOrdersTableSchema(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        delivery_date TEXT NOT NULL,
        delivery_slot TEXT NOT NULL,
        delivery_time_exact TEXT,
        receiver_info TEXT NOT NULL,
        buyer_info TEXT NOT NULL,
        product_image_paths TEXT NOT NULL DEFAULT '[]',
        product_description TEXT NOT NULL,
        card_message TEXT,
        print_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const columns = await this.all<{ name: string }>("PRAGMA table_info(orders)");
    const existing = new Set(columns.map((col) => col.name));
    const expected = [
      "id",
      "order_id",
      "delivery_date",
      "delivery_slot",
      "delivery_time_exact",
      "receiver_info",
      "buyer_info",
      "product_image_paths",
      "product_description",
      "card_message",
      "print_count",
      "created_at",
      "updated_at"
    ];
    const schemaMismatch = expected.some((name) => !existing.has(name));
    if (!schemaMismatch) {
      return;
    }

    await this.run("DROP TABLE IF EXISTS orders");
    await this.run(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        delivery_date TEXT NOT NULL,
        delivery_slot TEXT NOT NULL,
        delivery_time_exact TEXT,
        receiver_info TEXT NOT NULL,
        buyer_info TEXT NOT NULL,
        product_image_paths TEXT NOT NULL DEFAULT '[]',
        product_description TEXT NOT NULL,
        card_message TEXT,
        print_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async generateOrderId(createdAtISO: string): Promise<string> {
    const prefix = dayjs(createdAtISO).format("YYYYMMDD");
    const row = await this.get<{ order_id: string }>(
      "SELECT order_id FROM orders WHERE order_id LIKE ? ORDER BY order_id DESC LIMIT 1",
      [`${prefix}-%`]
    );
    const nextSeq = row ? Number.parseInt(row.order_id.slice(-4), 10) + 1 : 1;
    return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
  }

  private serializeImagePaths(paths?: string[] | null): string {
    if (!paths || paths.length === 0) return "[]";
    return JSON.stringify(paths.map((x) => String(x)).filter(Boolean));
  }

  private parseImagePaths(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      return [];
    }
  }

  private deserializeOrder(row: OrderRecord): OrderRecord {
    const rec = row as unknown as Record<string, unknown>;
    return {
      ...row,
      product_image_paths: this.parseImagePaths(String(rec.product_image_paths ?? "[]"))
    };
  }

  private run(sql: string, params: unknown[] = []): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onResult(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          changes: this.changes ?? 0,
          lastID: this.lastID ?? 0
        });
      });
    });
  }

  private get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row as T | undefined);
      });
    });
  }

  private all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows ?? []) as T[]);
      });
    });
  }
}
