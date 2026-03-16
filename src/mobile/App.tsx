import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, Card, DatePicker, Form, Input, Select, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { DeliverySlot } from "../types";

const { Title, Text } = Typography;

const DELIVERY_SLOTS: DeliverySlot[] = [
  "上午",
  "中午",
  "下午",
  "尽快配送",
  "具体时间",
  "自取"
];

const getApiBase = (): string => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("apiBase");
  if (fromQuery) {
    return fromQuery.replace(/\/$/, "");
  }
  return window.location.origin.replace(/\/$/, "");
};

const fileToDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });

const getErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : fallback;
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch")) {
    return "连接桌面端失败，请检查局域网和服务状态";
  }
  return raw || fallback;
};

interface LocalImage {
  uid: string;
  dataUrl: string;
}

const MobileApp = (): JSX.Element => {
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<{ id: number; orderNo: string } | null>(null);
  const apiBase = useMemo(() => getApiBase(), []);

  const [form] = Form.useForm();

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        delivery_date: values.delivery_date ? dayjs(values.delivery_date).format("YYYY-MM-DD") : "",
        delivery_slot: (values.delivery_slot as DeliverySlot) || "",
        delivery_time_exact: values.delivery_time_exact || "",
        receiver_info: values.receiver_info,
        buyer_info: values.buyer_info,
        product_description: values.product_description,
        card_message: values.card_message || "",
        image_data_urls: images.map((item) => item.dataUrl)
      };

      const res = await fetch(`${apiBase}/api/mobile/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        orderId?: number;
        orderNo?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "提交失败");
      }
      if (!json.orderId) {
        throw new Error("订单提交成功，但未返回订单ID");
      }
      setSubmittedOrder({
        id: json.orderId,
        orderNo: json.orderNo || `#${json.orderId}`
      });
      message.success("提交成功");
    } catch (error) {
      message.error(getErrorMessage(error, "提交失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = (): void => {
    form.resetFields();
    setImages([]);
    setSubmittedOrder(null);
  };

  const disablePastDate = (current: dayjs.Dayjs): boolean =>
    current.startOf("day").isBefore(dayjs().startOf("day"));

  const imageFileList: UploadFile[] = images.map((item) => ({
    uid: item.uid,
    name: `${item.uid}.png`,
    status: "done",
    url: item.dataUrl
  }));

  const handlePrintNow = async (): Promise<void> => {
    if (!submittedOrder) return;
    try {
      setPrinting(true);
      const res = await fetch(`${apiBase}/api/mobile/orders/${submittedOrder.id}/print`, {
        method: "POST"
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.message || "打印失败");
      }
      message.success("已发送打印");
    } catch (error) {
      message.error(getErrorMessage(error, "打印失败"));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="mobile-shell">
      <div className="mobile-header">
        <Title level={4} style={{ margin: 0 }}>
          订单录入
        </Title>
        <Text type="secondary">局域网同步</Text>
      </div>

      {submittedOrder ? (
        <Card className="mobile-card" title="提交成功">
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Text>订单号：{submittedOrder.orderNo}</Text>
            <Button type="primary" block onClick={() => void handlePrintNow()} loading={printing}>
              立即打印
            </Button>
            <Button block onClick={handleContinue} disabled={printing}>
              继续录单
            </Button>
          </Space>
        </Card>
      ) : (
      <Form form={form} layout="vertical">
        <Card className="mobile-card" title="配送信息">
          <div className="mobile-grid">
            <Form.Item
              label="配送日期"
              name="delivery_date"
              rules={[{ required: true, message: "请选择配送日期" }]}
            >
              <DatePicker style={{ width: "100%" }} placeholder="" disabledDate={disablePastDate} />
            </Form.Item>
            <Form.Item
              label="配送时间"
              name="delivery_slot"
            >
              <Select
                allowClear
                options={DELIVERY_SLOTS.map((item) => ({ value: item, label: item }))}
              />
            </Form.Item>
          </div>
          <Form.Item
            label="具体时间"
            name="delivery_time_exact"
          >
            <Input />
          </Form.Item>
        </Card>

        <Card className="mobile-card" title="客户信息">
          <Form.Item label="收货人信息" name="receiver_info">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="订货人信息" name="buyer_info">
            <Input />
          </Form.Item>
        </Card>

        <Card className="mobile-card" title="商品与贺卡">
          <Form.Item label="产品图片">
            <Upload
              listType="picture-card"
              accept="image/*"
              multiple
              fileList={imageFileList}
              beforeUpload={async (file) => {
                const dataUrl = await fileToDataUrl(file);
                setImages((prev) => [
                  ...prev,
                  {
                    uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
          <Form.Item label="产品描述" name="product_description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="贺卡内容" name="card_message">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text type="secondary">提交后会实时同步到桌面端订单列表。</Text>
            <Button type="primary" block loading={submitting} onClick={() => void handleSubmit()}>
              提交订单
            </Button>
          </Space>
        </Card>
      </Form>
      )}
    </div>
  );
};

export default MobileApp;
