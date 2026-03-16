import { useEffect, useRef, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import zhCN from "antd/locale/zh_CN";
import { DragOutlined, HolderOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import type { DeliverySlot, OrderInput, OrderRecord, PrintTemplateRecord } from "../types";

const { Header, Content } = Layout;
const { Title, Text } = Typography;
dayjs.locale("zh-cn");

type TabKey = "entry" | "orders" | "template" | "mobile" | "settings";

interface TemplateRow {
  key:
    | "order_id"
    | "delivery_date"
    | "delivery_slot"
    | "receiver_info"
    | "buyer_info"
    | "product_description"
    | "card_message"
    | "image_block";
  label: string;
  enabled: boolean;
}

interface TemplateVisualConfig {
  title: string;
  fontSize: number;
  lineGap: number;
  imageWidth: number;
  imageHeight: number;
  sampleImageDataUrl: string;
  rows: TemplateRow[];
}

interface LocalImage {
  uid: string;
  dataUrl: string;
}

interface ExistingImage {
  uid: string;
  path: string;
  dataUrl: string;
}

const BUILTIN_SAMPLE_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ffe6ee'/%3E%3Cstop offset='100%25' stop-color='%23fff7da'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='420' height='300' fill='url(%23g)'/%3E%3Ccircle cx='120' cy='170' r='70' fill='%23ff6b8a'/%3E%3Ccircle cx='210' cy='130' r='60' fill='%23ff8ea6'/%3E%3Ccircle cx='285' cy='190' r='65' fill='%23ffb3c2'/%3E%3Crect x='200' y='190' width='10' height='90' rx='4' fill='%235a8f4d'/%3E%3Cpath d='M205 210 C245 200,260 230,210 242 Z' fill='%2377b85f'/%3E%3Ctext x='24' y='40' font-size='24' fill='%23644' font-family='Microsoft YaHei, sans-serif'%3E%E8%8A%B1%E6%9D%9F%E7%A4%BA%E4%BE%8B%E5%9B%BE%3C/text%3E%3C/svg%3E";

const DELIVERY_SLOTS: DeliverySlot[] = [
  "上午",
  "中午",
  "下午",
  "尽快配送",
  "具体时间",
  "自取"
];

const DEFAULT_ROWS: TemplateRow[] = [
  { key: "order_id", label: "订单号", enabled: true },
  { key: "delivery_date", label: "配送日期", enabled: true },
  { key: "delivery_slot", label: "配送时间", enabled: true },
  { key: "receiver_info", label: "收货人信息", enabled: true },
  { key: "buyer_info", label: "订货人信息", enabled: true },
  { key: "image_block", label: "产品图片", enabled: true },
  { key: "product_description", label: "产品描述", enabled: true },
  { key: "card_message", label: "贺卡内容", enabled: true }
];

const DEFAULT_VISUAL_CONFIG: TemplateVisualConfig = {
  title: "倾城花艺",
  fontSize: 16,
  lineGap: 1.5,
  imageWidth: 360,
  imageHeight: 260,
  sampleImageDataUrl: BUILTIN_SAMPLE_IMAGE,
  rows: DEFAULT_ROWS
};

const INITIAL_FORM: OrderInput = {
  delivery_date: "",
  delivery_slot: "",
  delivery_time_exact: "",
  receiver_info: "",
  buyer_info: "",
  product_image_paths: [],
  product_description: "",
  card_message: ""
};

const SAMPLE_ORDER: Omit<OrderRecord, "id" | "created_at" | "updated_at" | "print_count"> = {
  order_id: `${dayjs().format("YYYYMMDD")}-0001`,
  delivery_date: dayjs().format("YYYY-MM-DD"),
  delivery_slot: "上午",
  delivery_time_exact: "10:30",
  receiver_info: "张三 / 13800000000 / 上海市浦东新区",
  buyer_info: "李四 / 13900000000",
  product_image_paths: [],
  product_description: "红玫瑰 11 支，尤加利叶配花",
  card_message: "生日快乐，天天开心"
};

const replaceAllCompat = (input: string, from: string, to: string): string => input.split(from).join(to);

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

const parseVisualConfig = (template: PrintTemplateRecord): TemplateVisualConfig => {
  if (!template.config_json) return DEFAULT_VISUAL_CONFIG;
  try {
    const parsed = JSON.parse(template.config_json) as Partial<TemplateVisualConfig>;
    const parsedRows = Array.isArray(parsed.rows)
      ? parsed.rows.filter((row) => row && row.key && row.label)
      : DEFAULT_ROWS;
    return {
      ...DEFAULT_VISUAL_CONFIG,
      ...parsed,
      sampleImageDataUrl: parsed.sampleImageDataUrl || BUILTIN_SAMPLE_IMAGE,
      rows: parsedRows.length > 0 ? parsedRows : DEFAULT_ROWS
    };
  } catch {
    return DEFAULT_VISUAL_CONFIG;
  }
};

const buildTemplateByConfig = (config: TemplateVisualConfig): { html: string; css: string } => {
  const rowHtml = config.rows
    .filter((row) => row.enabled)
    .map((row) => {
      if (row.key === "image_block") return "{{image_block}}";
      if (row.key === "delivery_slot") {
        return `<tr><th>${escapeHtml(row.label)}</th><td>{{delivery_slot}} {{delivery_time_exact}}</td></tr>`;
      }
      return `<tr><th>${escapeHtml(row.label)}</th><td>{{${row.key}}}</td></tr>`;
    })
    .join("\n");

  const html = `
<div class="sheet">
  <h1>${escapeHtml(config.title)}</h1>
  <table class="order-table">
    <tbody>
      ${rowHtml}
    </tbody>
  </table>
</div>
`.trim();

  const css = `
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; margin: 0; color: #222; }
.sheet { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 10mm; box-sizing: border-box; }
h1 { margin: 0 0 10px; font-size: 22px; }
.order-table { width: 100%; border-collapse: collapse; font-size: ${config.fontSize}px; line-height: ${config.lineGap}; }
.order-table th, .order-table td { border: 1px solid #ddd; padding: 7px 8px; vertical-align: top; text-align: left; }
.order-table th { width: 82px; color: #555; background: #fafafa; white-space: nowrap; }
.product-image-grid { display: flex; gap: 8px; align-items: flex-start; }
.product-image-grid.two-up { flex-wrap: nowrap; }
.product-image-grid.two-up .product-image { flex: 1 1 0; width: auto; min-width: 0; }
.product-image { margin-top: 2px; width: ${config.imageWidth}px; height: ${config.imageHeight}px; object-fit: contain; border: 1px solid #ddd; }
`.trim();

  return { html, css };
};

const App = (): JSX.Element => {
  const [tab, setTab] = useState<TabKey>("orders");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [detailOrder, setDetailOrder] = useState<OrderRecord | null>(null);
  const [detailImageDataUrls, setDetailImageDataUrls] = useState<string[]>([]);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [editForm, setEditForm] = useState<OrderInput>(INITIAL_FORM);
  const [editExistingImages, setEditExistingImages] = useState<ExistingImage[]>([]);
  const [editNewImages, setEditNewImages] = useState<LocalImage[]>([]);
  const [form, setForm] = useState<OrderInput>(INITIAL_FORM);
  const [templateConfig, setTemplateConfig] = useState<TemplateVisualConfig>(DEFAULT_VISUAL_CONFIG);
  const [editingTemplate, setEditingTemplate] = useState<PrintTemplateRecord | null>(null);
  const [enableCodeEdit, setEnableCodeEdit] = useState(false);
  const [unprintedCount, setUnprintedCount] = useState(0);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [mobileUrl, setMobileUrl] = useState("");
  const [mobileQrDataUrl, setMobileQrDataUrl] = useState("");
  const [imageSaveDir, setImageSaveDir] = useState("");
  const [retentionDays, setRetentionDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const dragRowIndexRef = useRef<number | null>(null);

  const loadOrders = async (): Promise<void> => {
    const [items, count] = await Promise.all([window.api.listOrders(false), window.api.countUnprinted()]);
    setOrders(items);
    setSelectedOrderIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
    setUnprintedCount(count);
  };

  const getApiFn = <T extends (...args: never[]) => unknown>(name: string): T | null => {
    const maybe = (window.api as unknown as Record<string, unknown>)[name];
    return typeof maybe === "function" ? (maybe as T) : null;
  };

  const getErrorMessage = (error: unknown, fallback: string): string => {
    const raw = error instanceof Error ? error.message : fallback;
    const extracted = raw.match(/Error invoking remote method '[^']+': Error: (.+)$/)?.[1] ?? raw;
    const lower = extracted.toLowerCase();
    if (lower.includes("no printers available")) {
      return "未检测到可用打印机，请先连接并在系统中安装打印机";
    }
    if (lower.includes("print job canceled")) {
      return "打印任务已取消";
    }
    if (lower.includes("invalid printer settings")) {
      return "打印机设置无效，请检查系统打印配置";
    }
    return extracted || fallback;
  };

  const disablePastDate = (current: dayjs.Dayjs): boolean =>
    current.startOf("day").isBefore(dayjs().startOf("day"));

  const loadImageDataUrls = async (paths: string[]): Promise<string[]> => {
    const loaded = await Promise.all(
      paths.map(async (imgPath) => {
        try {
          return await window.api.readImageDataUrl(imgPath);
        } catch {
          return "";
        }
      })
    );
    return loaded.filter(Boolean);
  };

  const loadTemplate = async (): Promise<void> => {
    const list = await window.api.listTemplates();
    const picked = list.find((x) => x.is_default === 1) ?? list[0] ?? null;
    setEditingTemplate(picked);
    if (picked) {
      setTemplateConfig(parseVisualConfig(picked));
    }
  };

  useEffect(() => {
    const boot = async (): Promise<void> => {
      const getImageSaveDir = getApiFn<() => Promise<string>>("getImageSaveDir");
      const [info, saveDir] = await Promise.all([
        window.api.getSystemInfo(),
        getImageSaveDir ? getImageSaveDir() : Promise.resolve("")
      ]);
      setMobileUrl(info.mobileUrl);
      setMobileQrDataUrl(info.mobileQrDataUrl);
      setRetentionDays(info.retentionDays);
       setImageSaveDir(saveDir);
      await Promise.all([loadOrders(), loadTemplate()]);
    };
    void boot();
    const unbind = window.api.onOrdersUpdated(() => {
      void loadOrders();
    });
    return () => {
      unbind();
    };
  }, []);

  const handleSubmitOrder = async (): Promise<void> => {
    setBusy(true);
    try {
      if (!String(form.delivery_date || "").trim()) {
        message.error("配送日期必填");
        return;
      }
      const payload: OrderInput = {
        ...form
      };
      if (payload.delivery_slot !== "具体时间") payload.delivery_time_exact = "";
      payload.product_image_paths = await Promise.all(images.map((item) => window.api.saveImage(item.dataUrl)));
      await window.api.createOrder(payload);
      setForm(INITIAL_FORM);
      setImages([]);
      await loadOrders();
      setTab("orders");
      message.success("订单已保存");
    } catch (error) {
      message.error(getErrorMessage(error, "订单保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleOnePrint = async (orderId: number): Promise<void> => {
    setBusy(true);
    try {
      await window.api.printOrder(orderId);
      await loadOrders();
      message.success("已发送打印");
    } catch (error) {
      message.error(getErrorMessage(error, "打印失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleBatchPrint = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.api.batchPrintUnprinted();
      await loadOrders();
      message.success(`批量打印完成：总计${result.total}，成功${result.success}，失败${result.failed}`);
    } catch (error) {
      message.error(getErrorMessage(error, "批量打印失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleTemplateSave = async (): Promise<void> => {
    if (!editingTemplate) return;
    setBusy(true);
    try {
      const visualBuilt = buildTemplateByConfig(templateConfig);
      const html = enableCodeEdit ? editingTemplate.html : visualBuilt.html;
      const css = enableCodeEdit ? editingTemplate.css : visualBuilt.css;
      await window.api.saveTemplate(
        {
          name: editingTemplate.name || "A4默认模板",
          html,
          css,
          is_default: 1,
          config_json: JSON.stringify(templateConfig)
        },
        editingTemplate.id
      );
      await loadTemplate();
      message.success("模板已保存");
    } catch (error) {
      message.error(getErrorMessage(error, "模板保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDetail = async (order: OrderRecord): Promise<void> => {
    setDetailOrder(order);
    const imageUrls = await loadImageDataUrls(order.product_image_paths ?? []);
    setDetailImageDataUrls(imageUrls);
  };

  const handleOpenEdit = async (order: OrderRecord): Promise<void> => {
    setEditingOrder(order);
    setEditForm({
      delivery_date: order.delivery_date,
      delivery_slot: order.delivery_slot,
      delivery_time_exact: order.delivery_time_exact ?? "",
      receiver_info: order.receiver_info,
      buyer_info: order.buyer_info,
      product_image_paths: order.product_image_paths ?? [],
      product_description: order.product_description,
      card_message: order.card_message ?? ""
    });
    const existingImages = (await Promise.all(
      (order.product_image_paths ?? []).map(async (imgPath) => {
        try {
          const dataUrl = await window.api.readImageDataUrl(imgPath);
          return {
            uid: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            path: imgPath,
            dataUrl
          };
        } catch {
          return null;
        }
      })
    )) as Array<ExistingImage | null>;
    setEditExistingImages(existingImages.filter((item): item is ExistingImage => Boolean(item)));
    setEditNewImages([]);
  };

  const handleSaveOrderEdit = async (): Promise<void> => {
    if (!editingOrder) return;
    setBusy(true);
    try {
      if (!String(editForm.delivery_date || "").trim()) {
        message.error("配送日期必填");
        return;
      }
      const payload: OrderInput = {
        ...editForm
      };
      if (payload.delivery_slot !== "具体时间") {
        payload.delivery_time_exact = "";
      }
      const savedNewImagePaths = await Promise.all(editNewImages.map((item) => window.api.saveImage(item.dataUrl)));
      payload.product_image_paths = [...editExistingImages.map((item) => item.path), ...savedNewImagePaths];
      await window.api.updateOrder(editingOrder.id, payload);
      setEditingOrder(null);
      setEditExistingImages([]);
      setEditNewImages([]);
      await loadOrders();
      message.success("订单已更新");
    } catch (error) {
      message.error(getErrorMessage(error, "订单更新失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleBatchDelete = (): void => {
    if (selectedOrderIds.length === 0) {
      message.warning("请先选择要删除的订单");
      return;
    }
    Modal.confirm({
      title: "确认批量删除",
      content: `将删除已选中的 ${selectedOrderIds.length} 条订单，是否继续？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setBusy(true);
        try {
          const result = await window.api.deleteOrders(selectedOrderIds);
          setSelectedOrderIds([]);
          await loadOrders();
          message.success(`已删除 ${result.deleted} 条订单`);
        } catch (error) {
          message.error(getErrorMessage(error, "批量删除失败"));
        } finally {
          setBusy(false);
        }
      }
    });
  };

  const handleChooseImageSaveDir = async (): Promise<void> => {
    setBusy(true);
    try {
      const chooseImageSaveDir = getApiFn<() => Promise<string>>("chooseImageSaveDir");
      if (!chooseImageSaveDir) {
        message.error("目录设置接口未加载，请重启应用");
        return;
      }
      const nextDir = await chooseImageSaveDir();
      setImageSaveDir(nextDir);
      message.success("图片保存目录已更新");
    } catch (error) {
      message.error(getErrorMessage(error, "目录设置失败"));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenImageSaveDir = async (): Promise<void> => {
    setBusy(true);
    try {
      const openImageSaveDir = getApiFn<() => Promise<boolean>>("openImageSaveDir");
      if (!openImageSaveDir) {
        message.error("打开目录接口未加载，请重启应用");
        return;
      }
      await openImageSaveDir();
    } catch (error) {
      message.error(getErrorMessage(error, "打开目录失败"));
    } finally {
      setBusy(false);
    }
  };

  const handlePrintMobileQr = (): void => {
    if (!mobileQrDataUrl) {
      message.warning("二维码尚未生成");
      return;
    }
    const printWindow = window.open("", "_blank", "width=520,height=720");
    if (!printWindow) {
      message.error("无法打开打印窗口，请检查弹窗限制");
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <title>二维码录入</title>
          <style>
            body { margin: 0; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #1f2d26; }
            .sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 16mm; }
            h1 { margin: 0 0 10mm; font-size: 24px; }
            .panel { width: fit-content; border: 1px solid #dfe8e3; border-radius: 10px; padding: 10mm; }
            img { width: 260px; height: 260px; display: block; }
            .url { margin-top: 8mm; font-size: 14px; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>倾城花艺二维码录入</h1>
            <div class="panel">
              <img src="${mobileQrDataUrl}" alt="二维码录入" />
              <div class="url">${mobileUrl || ""}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const toDataUrl = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });

  const startResizeImage = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = templateConfig.imageWidth;
    const startH = templateConfig.imageHeight;
    const onMove = (moveEvent: MouseEvent): void => {
      const nextW = Math.max(120, Math.min(700, startW + moveEvent.clientX - startX));
      const nextH = Math.max(90, Math.min(700, startH + moveEvent.clientY - startY));
      setTemplateConfig((s) => ({ ...s, imageWidth: nextW, imageHeight: nextH }));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const moveRow = (from: number, to: number): void => {
    if (from === to || to < 0 || to >= templateConfig.rows.length) return;
    setTemplateConfig((s) => {
      const rows = [...s.rows];
      const [item] = rows.splice(from, 1);
      rows.splice(to, 0, item);
      return { ...s, rows };
    });
  };

  const getSampleCellValue = (key: TemplateRow["key"]): string => {
    if (key === "delivery_slot") return `${SAMPLE_ORDER.delivery_slot} ${SAMPLE_ORDER.delivery_time_exact ?? ""}`.trim();
    if (key === "image_block") return "";
    return String(SAMPLE_ORDER[key as keyof typeof SAMPLE_ORDER] ?? "");
  };

  const getOrderCellValue = (order: OrderRecord, key: TemplateRow["key"]): string => {
    if (key === "delivery_slot") {
      return [order.delivery_slot, order.delivery_time_exact ?? ""].join(" ").trim();
    }
    if (key === "image_block") return "";
    if (key === "order_id") return order.order_id;
    return String(order[key as keyof OrderRecord] ?? "");
  };

  const orderColumns: ColumnsType<OrderRecord> = [
    { title: "订单号", dataIndex: "order_id", key: "order_id", width: 140 },
    {
      title: "配送",
      key: "delivery",
      render: (_, item) => `${item.delivery_date} ${item.delivery_slot} ${item.delivery_time_exact ?? ""}`
    },
    { title: "收货人信息", dataIndex: "receiver_info", key: "receiver_info" },
    { title: "产品描述", dataIndex: "product_description", key: "product_description" },
    { title: "打印次数", dataIndex: "print_count", key: "print_count", width: 100 },
    {
      title: "操作",
      key: "actions",
      width: 220,
          render: (_, item) => (
        <Space size={6}>
          <Button size="small" onClick={() => void handleOpenDetail(item)} disabled={busy}>
            详情
          </Button>
          <Button size="small" onClick={() => void handleOpenEdit(item)} disabled={busy}>
            编辑
          </Button>
          <Button size="small" onClick={() => void handleOnePrint(item.id)} disabled={busy}>
            打印
          </Button>
        </Space>
      )
    }
  ];

  const createFileList: UploadFile[] = images.map((item) => ({
    uid: item.uid,
    name: `${item.uid}.png`,
    status: "done",
    url: item.dataUrl
  }));

  const editFileList: UploadFile[] = [
    ...editExistingImages.map((item) => ({
      uid: item.uid,
      name: item.path.split(/[\\/]/).pop() || "image",
      status: "done" as const,
      url: item.dataUrl
    })),
    ...editNewImages.map((item) => ({
      uid: item.uid,
      name: `${item.uid}.png`,
      status: "done" as const,
      url: item.dataUrl
    }))
  ];

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#2e7d57",
          borderRadius: 10,
          borderRadiusLG: 14,
          fontSize: 14
        },
        components: {
          Form: {
            itemMarginBottom: 12
          },
          Card: {
            bodyPadding: 16
          },
          Tabs: {
            horizontalItemGutter: 14
          }
        }
      }}
    >
      <Layout className="antd-layout">
        <Header className="antd-header">
          <div className="header-side" />
          <Title level={4} className="header-title">
            倾城花艺
          </Title>
          <Space className="header-tags">
            <Tag color="blue">订单总数 {orders.length}</Tag>
            <Tag color="gold">未打印 {unprintedCount}</Tag>
            <Tag color="green">保留 {retentionDays} 天</Tag>
          </Space>
        </Header>
        <Content className="page-content">
          <div className="page-shell">
            <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          size="middle"
          items={[
            {
              key: "orders",
              label: "订单列表",
              children: (
                <Card className="surface-card" bordered={false}>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={() => setTab("entry")} disabled={busy}>
                      新建订单
                    </Button>
                    <Button onClick={() => void handleBatchPrint()} loading={busy}>
                      批量打印未打印订单
                    </Button>
                    <Button danger onClick={handleBatchDelete} loading={busy}>
                      批量删除
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    rowSelection={{
                      selectedRowKeys: selectedOrderIds,
                      onChange: (keys) => setSelectedOrderIds(keys.map((key) => Number(key)))
                    }}
                    columns={orderColumns}
                    dataSource={orders}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              )
            },
            {
              key: "entry",
              label: "订单录入",
              children: (
                <Card className="surface-card" bordered={false}>
                  <Form layout="vertical">
                    <RowBlock>
                      <Form.Item label="配送日期">
                        <DatePicker
                          style={{ width: "100%" }}
                          value={form.delivery_date ? dayjs(form.delivery_date) : null}
                          disabledDate={disablePastDate}
                          placeholder=""
                          format="YYYY-MM-DD"
                          onChange={(_, dateString) =>
                            setForm((s) => ({
                              ...s,
                              delivery_date: (Array.isArray(dateString) ? dateString[0] : dateString) || ""
                            }))
                          }
                        />
                      </Form.Item>
                      <Form.Item label="配送时间">
                        <Select
                          value={form.delivery_slot}
                          allowClear
                          options={DELIVERY_SLOTS.map((slot) => ({ value: slot, label: slot }))}
                          onChange={(value) =>
                            setForm((s) => ({ ...s, delivery_slot: (value as DeliverySlot) || "" }))
                          }
                        />
                      </Form.Item>
                      <Form.Item label="具体时间">
                        <Input
                          value={form.delivery_time_exact ?? ""}
                          onChange={(e) => setForm((s) => ({ ...s, delivery_time_exact: e.target.value }))}
                        />
                      </Form.Item>
                    </RowBlock>
                    <Form.Item label="收货人信息">
                      <Input
                        value={form.receiver_info}
                        onChange={(e) => setForm((s) => ({ ...s, receiver_info: e.target.value }))}
                      />
                    </Form.Item>
                    <Form.Item label="订货人信息">
                      <Input
                        value={form.buyer_info}
                        onChange={(e) => setForm((s) => ({ ...s, buyer_info: e.target.value }))}
                      />
                    </Form.Item>
                    <Form.Item label="产品图片">
                      <Upload
                        accept="image/*"
                        listType="picture-card"
                        multiple
                        fileList={createFileList}
                        beforeUpload={async (file) => {
                          const dataUrl = await toDataUrl(file);
                          setImages((prev) => [
                            ...prev,
                            {
                              uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                              dataUrl
                            }
                          ]);
                          return false;
                        }}
                        onRemove={(file) => {
                          setImages((prev) => prev.filter((item) => item.uid !== file.uid));
                        }}
                      >
                        + 添加图片
                      </Upload>
                    </Form.Item>
                    <Form.Item label="产品描述">
                      <Input.TextArea
                        rows={3}
                        value={form.product_description}
                        onChange={(e) => setForm((s) => ({ ...s, product_description: e.target.value }))}
                      />
                    </Form.Item>
                    <Form.Item label="贺卡内容">
                      <Input.TextArea
                        rows={3}
                        value={form.card_message ?? ""}
                        onChange={(e) => setForm((s) => ({ ...s, card_message: e.target.value }))}
                      />
                    </Form.Item>
                    <Button type="primary" loading={busy} onClick={() => void handleSubmitOrder()}>
                      保存订单
                    </Button>
                  </Form>
                </Card>
              )
            },
            {
              key: "template",
              label: "打印模板",
              children: (
                <Card className="surface-card" bordered={false}>
                  <Title level={5}>模板画布（可直接拖拽排序与改图尺寸）</Title>
                  <div className="design-canvas">
                    <h2>{templateConfig.title || "倾城花艺"}</h2>
                    <table
                      className="template-live-table"
                      style={{
                        fontSize: `${templateConfig.fontSize}px`,
                        lineHeight: String(templateConfig.lineGap)
                      }}
                    >
                      <tbody>
                        {templateConfig.rows.map((row, index) =>
                          row.enabled ? (
                            <tr
                              key={row.key}
                              draggable
                              onDragStart={() => {
                                dragRowIndexRef.current = index;
                              }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                const from = dragRowIndexRef.current;
                                if (from !== null) moveRow(from, index);
                                dragRowIndexRef.current = null;
                              }}
                            >
                              <th>
                                <HolderOutlined className="drag-icon" />
                                <Input
                                  className="label-inline-input"
                                  value={row.label}
                                  onChange={(e) =>
                                    setTemplateConfig((s) => ({
                                      ...s,
                                      rows: s.rows.map((item, idx) =>
                                        idx === index ? { ...item, label: e.target.value } : item
                                      )
                                    }))
                                  }
                                />
                              </th>
                              <td>
                                {row.key === "image_block" ? (
                                  <div
                                    className="image-resize-box"
                                    style={{
                                      width: templateConfig.imageWidth,
                                      height: templateConfig.imageHeight
                                    }}
                                  >
                                    <img src={templateConfig.sampleImageDataUrl} alt="示例图片" />
                                    <div className="resize-handle" onMouseDown={startResizeImage}>
                                      <DragOutlined />
                                    </div>
                                  </div>
                                ) : (
                                  getSampleCellValue(row.key)
                                )}
                              </td>
                            </tr>
                          ) : null
                        )}
                      </tbody>
                    </table>
                  </div>

                  <RowBlock>
                    <Form.Item label="模板标题">
                      <Input
                        value={templateConfig.title}
                        onChange={(e) => setTemplateConfig((s) => ({ ...s, title: e.target.value }))}
                      />
                    </Form.Item>
                    <Form.Item label="字号">
                      <InputNumber
                        min={12}
                        max={24}
                        value={templateConfig.fontSize}
                        onChange={(value) =>
                          setTemplateConfig((s) => ({ ...s, fontSize: Number(value || 16) }))
                        }
                      />
                    </Form.Item>
                    <Form.Item label="行高">
                      <InputNumber
                        min={1.2}
                        max={2}
                        step={0.1}
                        value={templateConfig.lineGap}
                        onChange={(value) =>
                          setTemplateConfig((s) => ({ ...s, lineGap: Number(value || 1.5) }))
                        }
                      />
                    </Form.Item>
                  </RowBlock>
                  <Form.Item label="字段显示/隐藏">
                    <Space wrap>
                      {templateConfig.rows.map((row) => (
                        <Checkbox
                          key={row.key}
                          checked={row.enabled}
                          onChange={(e) =>
                            setTemplateConfig((s) => ({
                              ...s,
                              rows: s.rows.map((item) =>
                                item.key === row.key ? { ...item, enabled: e.target.checked } : item
                              )
                            }))
                          }
                        >
                          {row.label}
                        </Checkbox>
                      ))}
                    </Space>
                  </Form.Item>
                  <Space>
                    <Button type="primary" loading={busy} onClick={() => void handleTemplateSave()}>
                      保存模板
                    </Button>
                  </Space>

                  <Collapse style={{ marginTop: 12 }} items={[{
                    key: "dev",
                    label: "开发者代码编辑（可选）",
                    children: (
                      <>
                        <Checkbox
                          checked={enableCodeEdit}
                          onChange={(e) => setEnableCodeEdit(e.target.checked)}
                        >
                          启用代码编辑（非专业人士不建议）
                        </Checkbox>
                        {editingTemplate ? (
                          <Form layout="vertical" style={{ marginTop: 8 }}>
                            <Form.Item label="HTML模板">
                              <Input.TextArea
                                rows={8}
                                disabled={!enableCodeEdit}
                                value={editingTemplate.html}
                                onChange={(e) =>
                                  setEditingTemplate((s) => (s ? { ...s, html: e.target.value } : s))
                                }
                              />
                            </Form.Item>
                            <Form.Item label="CSS样式">
                              <Input.TextArea
                                rows={8}
                                disabled={!enableCodeEdit}
                                value={editingTemplate.css}
                                onChange={(e) =>
                                  setEditingTemplate((s) => (s ? { ...s, css: e.target.value } : s))
                                }
                              />
                            </Form.Item>
                          </Form>
                        ) : null}
                      </>
                    )
                  }]} />
                </Card>
              )
            },
            {
              key: "mobile",
              label: "二维码录入",
              children: (
                <Card className="surface-card" bordered={false}>
                  <Space direction="vertical">
                    <Text>局域网手机访问地址：{mobileUrl || "加载中..."}</Text>
                    {mobileQrDataUrl ? <img src={mobileQrDataUrl} alt="二维码录入" className="qr" /> : null}
                    <Button onClick={handlePrintMobileQr}>打印二维码</Button>
                    <Text type="secondary">手机扫码后可录入订单，提交后桌面端会自动刷新列表。</Text>
                  </Space>
                </Card>
              )
            },
            {
              key: "settings",
              label: "设置",
              children: (
                <Card className="surface-card" bordered={false}>
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Text strong>图片保存目录</Text>
                    <Text copyable={{ text: imageSaveDir }}>{imageSaveDir || "-"}</Text>
                    <Space>
                      <Button onClick={() => void handleChooseImageSaveDir()} loading={busy}>
                        设置目录
                      </Button>
                      <Button onClick={() => void handleOpenImageSaveDir()} loading={busy}>
                        打开目录
                      </Button>
                    </Space>
                  </Space>
                </Card>
              )
            }
          ]}
        />
            <Modal
              title="订单详情"
              open={Boolean(detailOrder)}
              onCancel={() => {
                setDetailOrder(null);
                setDetailImageDataUrls([]);
              }}
              footer={
                <Button
                  onClick={() => {
                    setDetailOrder(null);
                    setDetailImageDataUrls([]);
                  }}
                >
                  关闭
                </Button>
              }
              width={720}
            >
              {detailOrder ? (
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                  <div className="design-canvas">
                    <h2>{templateConfig.title || "倾城花艺"}</h2>
                    <table
                      className="template-live-table"
                      style={{
                        fontSize: `${templateConfig.fontSize}px`,
                        lineHeight: String(templateConfig.lineGap)
                      }}
                    >
                      <tbody>
                        {templateConfig.rows.map((row) =>
                          row.enabled ? (
                            <tr key={row.key}>
                              <th>{row.label}</th>
                              <td>
                                {row.key === "image_block" ? (
                                  <div
                                    className={`detail-image-block${detailImageDataUrls.length >= 2 ? " two-up" : ""}`}
                                  >
                                    {detailImageDataUrls.length > 0 ? (
                                      detailImageDataUrls.map((src, idx) => (
                                        <img
                                          key={`${idx}-${src.slice(0, 24)}`}
                                          className="detail-template-image"
                                          style={{
                                            width:
                                              detailImageDataUrls.length >= 2
                                                ? "calc((100% - 8px) / 2)"
                                                : templateConfig.imageWidth,
                                            height: templateConfig.imageHeight
                                          }}
                                          src={src}
                                          alt={`产品图片${idx + 1}`}
                                        />
                                      ))
                                    ) : (
                                      <Text type="secondary">无图片</Text>
                                    )}
                                  </div>
                                ) : (
                                  getOrderCellValue(detailOrder, row.key)
                                )}
                              </td>
                            </tr>
                          ) : null
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Text type="secondary">打印次数：{detailOrder.print_count}</Text>
                </Space>
              ) : null}
            </Modal>
            <Modal
              title="编辑订单"
              open={Boolean(editingOrder)}
              onCancel={() => {
                setEditingOrder(null);
                setEditExistingImages([]);
                setEditNewImages([]);
              }}
              onOk={() => void handleSaveOrderEdit()}
              confirmLoading={busy}
              okText="保存"
              cancelText="取消"
              width={760}
            >
              <Form layout="vertical">
                <RowBlock>
                  <Form.Item label="配送日期" required>
                    <DatePicker
                      style={{ width: "100%" }}
                      value={editForm.delivery_date ? dayjs(editForm.delivery_date) : null}
                      disabledDate={disablePastDate}
                      placeholder=""
                      format="YYYY-MM-DD"
                      onChange={(_, dateString) =>
                        setEditForm((s) => ({
                          ...s,
                          delivery_date: (Array.isArray(dateString) ? dateString[0] : dateString) || ""
                        }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label="配送时间">
                    <Select
                      value={editForm.delivery_slot}
                      allowClear
                      options={DELIVERY_SLOTS.map((slot) => ({ value: slot, label: slot }))}
                      onChange={(value) =>
                        setEditForm((s) => ({ ...s, delivery_slot: (value as DeliverySlot) || "" }))
                      }
                    />
                  </Form.Item>
                  <Form.Item label="具体时间">
                    <Input
                      value={editForm.delivery_time_exact ?? ""}
                      onChange={(e) => setEditForm((s) => ({ ...s, delivery_time_exact: e.target.value }))}
                    />
                  </Form.Item>
                </RowBlock>
                <Form.Item label="收货人信息">
                  <Input
                    value={editForm.receiver_info}
                    onChange={(e) => setEditForm((s) => ({ ...s, receiver_info: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="订货人信息">
                  <Input
                    value={editForm.buyer_info}
                    onChange={(e) => setEditForm((s) => ({ ...s, buyer_info: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="产品图片">
                  <Upload
                    accept="image/*"
                    listType="picture-card"
                    multiple
                    fileList={editFileList}
                    beforeUpload={async (file) => {
                      const dataUrl = await toDataUrl(file);
                      setEditNewImages((prev) => [
                        ...prev,
                        {
                          uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          dataUrl
                        }
                      ]);
                      return false;
                    }}
                    onRemove={(file) => {
                      setEditExistingImages((prev) => prev.filter((item) => item.uid !== file.uid));
                      setEditNewImages((prev) => prev.filter((item) => item.uid !== file.uid));
                    }}
                  >
                    + 添加图片
                  </Upload>
                  <Text type="secondary">支持多图，点击缩略图右上角可删除。</Text>
                </Form.Item>
                <Form.Item label="产品描述">
                  <Input.TextArea
                    rows={3}
                    value={editForm.product_description}
                    onChange={(e) => setEditForm((s) => ({ ...s, product_description: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="贺卡内容">
                  <Input.TextArea
                    rows={3}
                    value={editForm.card_message ?? ""}
                    onChange={(e) => setEditForm((s) => ({ ...s, card_message: e.target.value }))}
                  />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

const RowBlock = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="form-grid-antd">{children}</div>
);

export default App;
