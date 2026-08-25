# SmartPipe GIS 方案设计文档

> 版本 1.0 · 2026-08 · 面向教学演示与产品原型验证

## 1. 项目背景与需求分析

### 1.1 案例设定

**滨江市·高新开发区**（虚构）：面积约 13 km²，路网格局为"5 纵 4 横主干道 + 4 条支路"，参考国内典型经开区设计。区域内敷设污水、雨水、给水、燃气、热力五类市政管线，由滨江市水务集团高新分公司统一养护。

### 1.2 需求分析（参照主流管网 GIS 平台）

| 需求域 | 需求描述 | 对标功能 |
|---|---|---|
| 数据管理 | 管网普查成果入库、属性查询、增删改、导入导出 | 数据质检、GeoJSON 交换 |
| 可视化 | 分层展示、图例、专题图（管径/埋深/年代/材质分级） | SuperMap 专题图、ArcGIS Symbology |
| 实时监测 | 传感器遥测推送、阈值告警、趋势曲线 | SCADA 接入、IoT 监测 |
| 业务协同 | 告警受理处置、工单派发流转、巡检计划执行 | 数字政通城管、供水客服工单 |
| 空间分析 | 连通性追踪、爆管关阀隔离、纵剖面、缓冲区 | 鸿业/山维供水管网 GIS |
| 安全权限 | 登录认证、角色权限、接口级鉴权 | RBAC |

### 1.3 角色设计

| 角色 | 说明 | 权限 |
|---|---|---|
| admin 系统管理员 | 陈国栋 | 全部权限 + 用户管理 + 要素删除 |
| operator 调度员 | 张伟 | 工单流转、要素编辑、巡检计划创建 |
| inspector 巡检员 | 李娜 | 巡检执行、告警受理/关闭 |
| viewer 浏览用户 | 王芳 | 全部只读 |

## 2. 总体架构

```
┌─────────────── 表现层（Vue3 SPA，hash 路由） ───────────────┐
│ LoginView / LayoutView / Dashboard / Map / Alarms /         │
│ Inspections / WorkOrders / Analysis / Users                 │
│ API 双模式门面：                                            │
│   online → http.ts（REST + WebSocket）                      │
│   demo   → mockEngine.ts（浏览器内存引擎，契约一致）          │
└────────────┬───────────────────────────────────────────────┘
             │ REST（JSON + Bearer JWT）   WebSocket（遥测/告警）
┌────────────▼───────────────────────────────────────────────┐
│ 服务层（Node.js + Express）                                  │
│  auth(JWT) · features(CRUD+bbox+search) · alarms(处置流程)  │
│  workorders(状态机) · inspections · sensors · users         │
│  analysis(缓冲/追踪/爆管/剖面) · overview(统计)              │
│  TelemetrySimulator（3s 周期遥测 + 异常注入 + WS 广播）       │
└────────────┬───────────────────────────────────────────────┘
             │ 同步 SQL 适配层（better-sqlite3 风格 API）
┌────────────▼───────────────────────────────────────────────┐
│ 数据层：sql.js（SQLite WASM 内存引擎）                        │
│  业务表 → 5s 内落盘持久化；遥测表仅内存 + 72h 清理            │
│  首次启动自动导入 scripts/generate-mock-data.mjs 生成的种子    │
└────────────────────────────────────────────────────────────┘
```

### 2.1 关键设计决策

1. **API 双模式**：前端统一门面 `src/api/index.ts` 按运行模式分发到在线实现（fetch/WS）或演示实现（内存引擎）。启动时探测 `/api/overview/health` 决定模式；GitHub Pages 构建将 `VITE_API_BASE` 置空直接进入演示模式。好处：同一份前端代码覆盖两种交付形态，演示模式零后端依赖。
2. **数据同源**：`scripts/generate-mock-data.mjs` 以固定种子（20260825）通过确定性 PRNG 生成全部模拟数据，同时写入 `server/data/`（后端种子）与 `src/data/mock/`（前端演示）。拓扑关系（管线↔井）在生成阶段建立，保证两种模式下空间分析结果一致。
3. **sql.js 选型**：SQLite 的 WASM 编译版，零原生编译依赖，规避 node-gyp/glibc 部署问题；数据量级（千级要素 + 数十万遥测行）下性能充足；通过"业务表 5s 落盘 + 遥测表内存化 + 定时清理"平衡持久性与写放大。
4. **hash 路由**：兼容 GitHub Pages 子路径部署与刷新。

## 3. 数据模型设计

### 3.1 核心实体

```sql
users(id, username UNIQUE, password(bcrypt), name, role, dept, phone, created_at)

features(id, layer[pipes|wells|pumps|buildings], geojson,   -- 完整 GeoJSON Feature
         name, type, status,                                -- 通用冗余列（筛选/统计）
         pipe_type, diameter, depth, road,                  -- 管线专用
         start_well, end_well, wells_json,                  -- 拓扑关系
         bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,        -- 空间索引
         updated_at)

alarms(id, code, type, level, title, description,
       source_type, source_id, source_name,                 -- 告警来源（要素/传感器/巡检）
       status[pending|processing|resolved], assignee,
       created_at, resolved_at, resolution)

work_orders(id, code, type, title,
            status[待派单|已派单|处理中|待验收|已完成],
            priority, assignee, related_alarm, related_features(JSON),
            description, plan_start, plan_end, actual_start, actual_end,
            result, created_at)

inspections(id, code, name, type, inspector,
            route_json[{wellId,name,order,pt,status,issue}],
            status[未开始|进行中|已完成], plan_date, start_at, end_at,
            progress, issue_count)

sensors(id, name, type[flow|pressure|level|gas], unit,
        source_type, source_id, source_name,               -- 挂载的设施
        baseline, amplitude, period, threshold,            -- 遥测模拟参数
        alarm_type, x, y, status, last_value, last_ts)

telemetry(id, sensor_id, value, ts)                        -- 时序数据（仅内存）
```

### 3.2 管网拓扑建模

- **边**：管线（LineString），属性含 `startWell`/`endWell` 与沿线全部井 `wells[]`；
- **节点**：井（Point），管线端点与道路交叉口处强制布井，30m 内同类型井合并共享 → 交叉口即管网节点；
- 生成结果：5 类管网各自完全连通，84 个共享节点，支撑图遍历类分析。

### 3.3 空间索引策略

要素表冗余 bbox 四列 + 复合索引，SQL 先做 bbox 粗筛（框选/视图范围/缓冲区初筛），JS 做精确距离计算（Haversine 球面距离），在万级要素以下简单高效，无需引入 PostGIS。

## 4. 空间分析算法

### 4.1 上下游连通追踪

以井为节点、管线为边的有向图（方向 = startWell → endWell）。从目标管线出发 BFS：
- **下游**：从 end 井出发，可进入"以该井为起点或途经"的管线，禁止从相邻管线终点逆流进入；
- **上游**：对称。
输出：追踪路径要素集、顺序、总长度。

### 4.2 爆管关阀分析（隔离方案）

经典供水管网 GIS 功能，分三步：
1. **定位**：在爆管自身上按沿线里程定位爆点两侧最近的隔离点（上游 1 处 + 下游 1 处）；
2. **扩展隔离区**：从爆管两端 BFS——给水/燃气管网在第 1 跳及以后的阀门井处关闭阻断；无阀门类型（污水/雨水/热力）按 3 跳边界封堵；
3. **影响评估**：受影响管段 120m 缓冲内的建筑 → 估算影响户数；输出 6 步应急处置流程。

### 4.3 管线纵剖面

沿管线井序累计里程，取井地面高程（模拟 DEM）与管底高程（地面高程 − 埋深），输出断面点位序列，前端绘制"地面线 + 管底线"双线图。

### 4.4 缓冲区查询

bbox 粗筛 + 点到线段 Haversine 精确距离过滤，支持 Point/LineString/Polygon 缓冲，跨图层返回命中要素集。

## 5. API 契约摘要

| 分组 | 接口 | 权限 |
|---|---|---|
| 认证 | POST /api/auth/login、GET /api/auth/me | 公开/登录 |
| 要素 | GET/POST /api/features/:layer、PUT/DELETE /api/features/:layer/:id、GET /api/features/search/all | 读公开，写 operator+/admin |
| 统计 | GET /api/overview/stats、GET /api/overview/health | 公开 |
| 告警 | GET /api/alarms、POST /api/alarms、POST /api/alarms/:id/process | 处置 inspector+ |
| 工单 | GET /api/workorders、POST /api/workorders、PUT /api/workorders/:id | 写 operator+ |
| 巡检 | GET /api/inspections(/:id)、POST /api/inspections、POST /:id/start|report|complete | 写 operator+ / 执行 inspector+ |
| 传感器 | GET /api/sensors、GET /api/sensors/:id/series | 公开 |
| 分析 | POST /api/analysis/{buffer,trace,isolation,profile} | 公开 |
| 用户 | GET/POST /api/users、PUT/DELETE /api/users/:id | admin |
| 实时 | WS /api/ws：telemetry / alarm / alarm-update 事件 | 无需鉴权 |

完整定义见 [API.md](API.md)。

## 6. 遥测模拟器设计

- **模型**：`value = (baseline + amplitude·sin(2πt/period + φ) + 伪噪声·0.25) × rainFactor`；液位传感器在每日 14:00–16:00 施加 1.9× 降雨系数，模拟雨天溢流风险；
- **异常注入**：每周期（3s）4% 概率随机选择一个在线传感器持续越限 2–4 分钟：首次触发生成 pending 告警并 WS 广播（前端全局弹窗 + 地图红点闪烁）；自然恢复后未受理告警自动关闭（模拟远程处置）；
- **历史回放**：启动时生成每传感器 24h/5min 粒度历史（约 9k 行），前端曲线支持 1h/6h/24h 切换；实时数据 3s 粒度持续追加；
- **时序存储策略**：遥测表仅存内存（重启重建历史），每 10 分钟清理 72h 之前数据，避免无界增长。

## 7. 前端设计

### 7.1 页面结构

hash 路由：`/login`、`/dashboard`（大屏）、`/map`（一张图）、`/alarms`、`/inspections`、`/workorders`、`/analysis`、`/users`（admin）。LayoutView 提供侧边导航 + 实时通道状态 + 用户菜单。

### 7.2 地图设计（一张图）

- **底图**：天地图 WMTS（矢量/影像 + 注记）；
- **图层**：建筑（面）、管线（线）、检查井/阀门井/泵站（点）、传感器（实时标注）、巡检路线、分析结果、高亮层，zIndex 分层；
- **交互**：单击查属性 → 抽屉详情 → 编辑/定位/空间分析；图上取点回填编辑表单；量测（距离/面积）；多边形框选；
- **专题图**：管径/埋深（单色相 light→dark 分级）、年代（红-灰-蓝发散色）、材质（分类色），色板通过 CVD 色觉障碍验证，地图与图表同色保证图例一致；
- **实时联动**：遥测每 3s 刷新传感器标注值，越限红色闪烁；告警事件全局弹窗（ElNotification），点击跳转告警中心；
- **跨页定位**：告警/工单"地图定位"经路由参数 `?locate=<id>&layer=` 跳转并自动缩放高亮。

### 7.3 图表规范（dataviz）

- 状态色固定语义（正常绿/维修橙/故障红），分类色与地图图例一致且经 CVD 验证；
- 单 Y 轴、细标记、辅助线弱化、tooltip 全覆盖、图例/直标并存；
- 大屏 KPI 用数字卡（hero number）而非无意义图表。

## 8. 安全设计

- 密码 bcrypt（10 rounds）哈希存储，JWT 12h 过期；
- 角色矩阵接口级鉴权（401/403 语义区分）；
- 前端路由守卫 + 按钮级 `hasRole` 控制（演示模式同构）；
- 生产部署要求覆盖 `JWT_SECRET` 环境变量；
- 已知边界（演示系统定位）：WebSocket 未做令牌校验、未限流、CORS 全开——正式生产需补齐（文档声明）。

## 9. 性能设计

- 空间查询 bbox 索引粗筛 + 精确计算；
- 前端图层按 zoom 分级显示（传感器 minZoom 15），753 井/45 管线量级下 canvas 渲染无压力；
- 构建分包（ol / echarts / element-plus / vendor），页面级路由懒加载；
- 遥测批量推送（每周期单帧包含全部传感器），前端只重建受影响样式。

## 10. 测试与验证

- 后端 API 全量自测：登录成败、权限拒绝、要素 CRUD、bbox、统计、告警处置、工单流转、四种空间分析、传感器曲线、用户管理；
- 前端：vue-tsc 严格类型检查通过、双模式构建通过；
- 数据质检：井-管线拓扑引用零缺失、井全部贴附所属管线（抽样验证）、每类管网连通性验证。
