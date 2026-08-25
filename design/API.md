# SmartPipe GIS API 文档

Base URL：`http://<host>:8080/api`（开发环境 `http://localhost:8080/api`）

约定：
- 请求/响应均为 JSON（UTF-8）；
- 认证：`Authorization: Bearer <token>`（登录与健康检查除外）；
- 错误响应：`{ "error": "错误描述" }`，401 未登录/令牌失效，403 无权限，404 资源不存在，409 状态冲突。

## 1. 认证

### POST /auth/login

| 参数 | 类型 | 说明 |
|---|---|---|
| username | string | 用户名 |
| password | string | 密码 |

```json
→ { "token": "eyJ...", "user": { "id": "U-001", "username": "admin", "name": "陈国栋", "role": "admin", "dept": "系统管理部", "phone": "13800000001" } }
```

### GET /auth/me — 当前用户（登录）

## 2. 要素（features）

图层：`pipes` 管线 / `wells` 井 / `pumps` 泵站 / `buildings` 建筑

### GET /features/:layer

查询参数（均可选）：`bbox=minx,miny,maxx,maxy`、`type`、`status`、`q`（编号/名称模糊）、`page`、`pageSize`（≤500）

```json
{ "type": "FeatureCollection", "features": [...], "total": 45, "page": 1, "pageSize": 500 }
```

要素属性示例（管线）：`id, name, type, diameter, depth, length, material, installYear, road, usage, maintainUnit, status, startWell, endWell, wells[]`

### POST /features/:layer（operator+）— 新增，body 为 GeoJSON Feature
### PUT /features/:layer/:id（operator+）— 更新
### DELETE /features/:layer/:id（admin）— 删除
### GET /features/search/all?q=（公开）— 全局搜索，返回 `{ features: [...] }`（≤20 条）

## 3. 统计总览

### GET /overview/stats（公开）

```json
{
  "pipeCount": 45, "pipeLength": 148.3, "wellCount": 753, "pumpCount": 6, "buildingCount": 33,
  "typeDist": [{ "name": "污水管", "value": 10 }],
  "statusDist": [{ "name": "normal", "value": 37 }],
  "materialDist": [{ "name": "钢筋混凝土管", "value": 12 }],
  "alarmStats": { "pending": 12, "processing": 7, "today": 3, "total": 45 },
  "alarmTrend": [{ "day": "08-19", "n": 2 }],
  "workOrderStats": [{ "name": "处理中", "value": 9 }],
  "inspectionStats": { "total": 5, "doing": 1, "done": 3 },
  "sensorStats": { "total": 31, "online": 31 }
}
```

### GET /overview/health（公开）— 健康检查，前端模式探测用

## 4. 告警

### GET /alarms?status=&level=&type=&page=&pageSize=

`status`: pending/processing/resolved；`level`: critical/major/minor/warning

```json
{ "list": [{ "id": "AL-001", "code": "ALM-20260800001", "type": "爆管", "level": "critical",
  "title": "爆管告警", "description": "...", "source_type": "pipes", "source_id": "WS-DN800-01",
  "source_name": "滨河大道污水干管", "status": "pending", "assignee": null,
  "created_at": "2026-08-25 10:30", "resolved_at": null, "resolution": null }],
  "total": 45, "page": 1, "pageSize": 10 }
```

### POST /alarms（inspector+）— 手动上报 `{type, level, title, description, sourceType?, sourceId?, sourceName?}`
### POST /alarms/:id/process（inspector+）— 处置

| body | 说明 |
|---|---|
| `{ "action": "accept" }` | 受理：pending → processing，受理人 = 当前用户 |
| `{ "action": "resolve", "resolution": "..." }` | 关闭：→ resolved |

## 5. 工单

### GET /workorders?status=&type=&page=&pageSize=

`status`: 待派单/已派单/处理中/待验收/已完成；`type`: 抢修/维修/保养/巡检/投诉处理

### POST /workorders（operator+）— 新建 `{type, title, priority, assignee?, relatedAlarm?, relatedFeatures?, description, planStart?, planEnd?}`
### PUT /workorders/:id（operator+）— 更新/流转

| body | 说明 |
|---|---|
| `{ "action": "advance" }` | 流转到下一状态（顺序固定） |
| `{ "action": "complete", "result": "..." }` | 直接完成并记录结果 |
| `{ "action": "reject" }` | 退回待派单 |
| `{ title?, priority?, assignee?, description?, planStart?, planEnd? }` | 字段更新（可与 action 同传） |

## 6. 巡检

### GET /inspections?status=&page=（公开）
### GET /inspections/:id — 详情（route 为点位数组）
### POST /inspections（operator+）— 新建 `{name, type, inspector, planDate, route:[{wellId, name, pt, status, issue}]}`
### POST /inspections/:id/start（inspector+）— 未开始 → 进行中
### POST /inspections/:id/report（inspector+）— 上报点位 `{wellId, status: done|issue, issue?}`；issue 自动生成告警
### POST /inspections/:id/complete（inspector+）— → 已完成，progress=100

## 7. 传感器与遥测

### GET /sensors（公开）— 列表（含 last_value/last_ts 实时值）
### GET /sensors/:id/series?range=1h|6h|24h

```json
{ "sensor": { "id": "SEN-001", "type": "flow", "unit": "m³/h", "threshold": 2000, ... },
  "series": [{ "value": 812.5, "ts": 1755993600000 }, ...] }
```

### WS /api/ws（实时通道）

服务端推送事件：

```json
{ "type": "telemetry", "data": [{ "sensorId": "SEN-001", "value": 812.5, "ts": 1755993600000 }] }
{ "type": "alarm", "alarm": { ...告警对象 } }
{ "type": "alarm-update", "alarm": { ...状态变更后的告警 } }
```

客户端可发送 `{ "type": "ping" }`，服务端回 `{ "type": "pong", "time": ... }`。

## 8. 管网分析

### POST /analysis/buffer（公开）

```json
→ { "geometry": { "type": "Point", "coordinates": [116.505, 39.795] }, "radius": 500, "layers": ["pipes","wells"] }
← { "type": "FeatureCollection", "features": [...], "radius": 500, "layers": [...] }
```

### POST /analysis/trace（公开）

```json
→ { "pipeId": "WS-DN800-01", "direction": "downstream" }   // upstream | downstream
← { "type": "污水管", "direction": "downstream", "pipeId": "...",
    "features": { "type": "FeatureCollection", ... }, "order": ["WS-..."], "totalLength": 3108 }
```

### POST /analysis/isolation（公开）— 爆管关阀分析

```json
→ { "pipeId": "GS-DN400-07" }
← {
  "burstPipe": {...}, "strategy": "关阀隔离",           // 或 "封堵隔离"（无阀门类型）
  "valvesToClose": [{ "wellId": "VF-GS-017", "name": "...", "pt": [..], "dist": 962, "role": "上游阀门" }],
  "affectedPipes": { "type": "FeatureCollection", ... }, "affectedPipeIds": [...],
  "affectedLength": 2340,
  "affectedBuildings": [{ "id": "BLD-001", "name": "...", "usage": "居住", "households": 96 }],
  "affectedHouseholds": 214,
  "steps": ["定位爆管位置...", ...]
}
```

### POST /analysis/profile（公开）— 管线纵剖面

```json
→ { "pipeId": "WS-DN800-01" }
← { "pipe": {...}, "diameter": 800, "totalLength": 3113,
    "points": [{ "wellId": "MH-WS-001", "pt": [...], "dist": 0, "ground": 24.9, "invert": 21.6, "depth": 3.3 }] }
```

## 9. 用户管理（admin）

- GET /users — 列表（不含密码）
- POST /users — `{username, password, name, role, dept?, phone?}`
- PUT /users/:id — 修改（含 `password` 字段可重置密码）
- DELETE /users/:id — 删除（不能删除自身）
