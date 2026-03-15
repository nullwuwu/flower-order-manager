# Flower Order Manager（花店订单管理系统）v1

项目代号：`flower-order-manager`

## 功能
- 订单录入（桌面端手工录入）
- 局域网二维码网页录入（手机访问）
- A4 打印、批量打印未打印订单（`print_count = 0`）
- 打印模板可编辑（HTML/CSS）
- 订单图片本地存储（文件）+ 打印
- 7 天滚动存储（按 `created_at` 自动清理）

## 运行
```bash
npm install
npm run dev
```

## 打包
```bash
# Windows（主路线）
npm run pack:win

# macOS（测试）
npm run pack:mac
```

## 关键规则
- 订单 ID：`YYYYMMDD-####`，按自然日重置流水号
- 配送时间为“具体时间”时，`delivery_time_exact` 必填
- 打印计数：订单进入系统打印队列后 `print_count + 1`
- 清理任务：应用启动时和每小时执行一次

## 数据与文件位置
- SQLite：`<userData>/orders.db`
- 图片目录：`<userData>/images`
- 清理日志：`<userData>/logs/retention.log`
