export type DeliverySlot =
  | "上午"
  | "中午"
  | "下午"
  | "尽快配送"
  | "具体时间"
  | "自取";

export interface OrderInput {
  delivery_date: string;
  delivery_slot: DeliverySlot | "";
  delivery_time_exact?: string | null;
  receiver_info: string;
  buyer_info: string;
  product_image_paths?: string[];
  product_description: string;
  card_message?: string | null;
}

export interface OrderRecord extends OrderInput {
  id: number;
  order_id: string;
  print_count: number;
  created_at: string;
  updated_at: string;
}

export interface PrintTemplateInput {
  name: string;
  html: string;
  css: string;
  is_default: number;
  config_json?: string | null;
}

export interface PrintTemplateRecord extends PrintTemplateInput {
  id: number;
  updated_at: string;
}
