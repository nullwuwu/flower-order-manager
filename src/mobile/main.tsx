import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import MobileApp from "./App";
import "./styles.css";

dayjs.locale("zh-cn");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#2e7d57",
          borderRadius: 10
        },
        components: {
          Form: { itemMarginBottom: 12 },
          Card: { bodyPadding: 14 }
        }
      }}
    >
      <MobileApp />
    </ConfigProvider>
  </React.StrictMode>
);
