# SmartPipe GIS 部署指南

本文档说明如何将 **SmartPipe GIS 智慧城市地下管网管理平台** 部署到虚拟机（VM）上，实现前后端交互的完整运行环境。

## 一、架构概览

```
浏览器
  │  HTTP / WebSocket
  ▼
虚拟机（Ubuntu 20.04+ / Debian 11+ 推荐）
├── Nginx（80 端口）
│   ├── 静态托管前端构建产物（docs/）
│   └── /api 反向代理 → Node 后端（8080 端口）
└── Node.js 后端（systemd 守护）
    ├── Express REST API + JWT 认证
    ├── WebSocket 实时遥测推送
    └── SQLite（sql.js 内存引擎 + 周期落盘）
```

> 技术选型说明：后端采用 **sql.js**（SQLite 的 WebAssembly 编译版），
> 零原生编译依赖，任何 Linux/Windows 环境 `npm install` 即可运行，
> 从根本上避免 `node-gyp` / `glibc` 版本导致的部署问题。

## 二、环境要求

| 项目 | 要求 |
|---|---|
| 操作系统 | Ubuntu 20.04 / 22.04 / 24.04，Debian 11+，CentOS 7+（需自行安装 Node 20） |
| Node.js | 18.17+（推荐 20 LTS） |
| 内存 | ≥ 1 GB |
| 磁盘 | ≥ 2 GB |
| 网络 | 虚拟机需可访问互联网（地图底图使用天地图在线服务） |

## 三、方案 A：一键脚本部署（推荐）

```bash
# 1. 上传项目到虚拟机（git 或 scp）
git clone <你的仓库地址> smartpipe
cd smartpipe

# 2. 执行一键部署脚本（自动完成：构建前端 + 配置 nginx + systemd 后端）
sudo bash deploy/deploy.sh
```

完成后访问 `http://<虚拟机IP>/`，使用 `admin / admin123` 登录。

## 四、方案 B：Docker Compose 部署

```bash
# 1. 虚拟机安装 Docker（Ubuntu 示例）
curl -fsSL https://get.docker.com | bash

# 2. 上传项目后启动
cd smartpipe
docker compose -f deploy/docker-compose.yml up -d --build

# 3. 验证
curl http://localhost:8080/api/overview/health
```

访问 `http://<虚拟机IP>:8080/`。

常用命令：

```bash
docker compose -f deploy/docker-compose.yml logs -f   # 查看日志
docker compose -f deploy/docker-compose.yml down      # 停止
docker compose -f deploy/docker-compose.yml up -d     # 重启
```

> 数据持久化：SQLite 数据文件位于命名卷 `smartpipe-data:/data`，
> 容器重建后业务数据（编辑的要素、告警处置记录等）不会丢失。

## 五、方案 C：手动分步部署

### 5.1 安装 Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应输出 v20.x
```

### 5.2 构建前端

```bash
cd smartpipe
npm install
npm run gen:data        # 生成模拟数据（前后端共用）
npm run build           # 在线模式构建（API base=/api）
sudo mkdir -p /var/www/smartpipe
sudo cp -r docs/* /var/www/smartpipe/
```

### 5.3 部署后端

```bash
sudo mkdir -p /opt/smartpipe
sudo cp -r server /opt/smartpipe/
cd /opt/smartpipe/server
sudo npm install --omit=dev
mkdir -p data
```

### 5.4 配置 Nginx

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/conf.d/smartpipe.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 5.5 配置 systemd 服务

```bash
sudo cp deploy/smartpipe-api.service /etc/systemd/system/
# 编辑 /etc/systemd/system/smartpipe-api.service：
#   1. 确认 WorkingDirectory/ExecStart 路径正确
#   2. 修改 JWT_SECRET 为随机长字符串
sudo systemctl daemon-reload
sudo systemctl enable --now smartpipe-api
systemctl status smartpipe-api    # 应为 active (running)
```

### 5.6 验证

```bash
curl http://localhost/api/overview/health
# {"status":"ok","name":"smartpipe-server","version":"1.0.0",...}

# 登录接口自测
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## 六、配置说明

后端支持环境变量配置（`server/.env` 或 systemd/docker 环境变量）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8080 | 后端监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `JWT_SECRET` | （开发默认值） | **生产环境必须修改**为随机长字符串 |
| `JWT_EXPIRES` | 12h | 登录令牌有效期 |
| `DB_FILE` | server/data/smartpipe.db | SQLite 数据文件路径 |
| `TELEMETRY_INTERVAL` | 3000 | 遥测推送周期（毫秒） |
| `ANOMALY_CHANCE` | 0.04 | 每周期异常注入概率 |

## 七、常见问题

**Q1：页面能打开但一直提示"演示模式"？**
前端启动时会探测 `/api/overview/health`，探测失败自动回退演示模式。
请检查：① nginx `/api` 反代配置是否生效（`nginx -t && systemctl reload nginx`）；
② 后端是否在运行（`systemctl status smartpipe-api`）。

**Q2：天地图底图不显示？**
天地图服务需要互联网访问。若虚拟机处于内网且无法访问外网，
需配置代理或将底图切换为离线底图（本项目未内置离线底图包）。

**Q3：修改数据后重启丢失？**
后端每 5 秒将业务数据落盘到 `DB_FILE`。确认该目录对运行用户
（www-data / node）有写权限。

**Q4：如何重置数据？**
```bash
# 停止服务 → 删除数据库文件 → 重启（自动重新导入种子数据）
sudo systemctl stop smartpipe-api
sudo rm /opt/smartpipe/server/data/smartpipe.db
sudo systemctl start smartpipe-api
```

**Q5：如何更换端口？**
修改 `PORT` 环境变量与 nginx 反代配置中的 `proxy_pass` 端口，保持一致即可。

## 八、GitHub Pages（需配合后端）

本项目前端强依赖后端，GitHub Pages 静态托管仅作为前端资源分发，
**必须搭配可访问的后端服务**（后端 CORS 默认已开启）：

```bash
npm install
npm run gen:data
VITE_API_BASE=https://<后端地址>:8080/api npm run build
```

将构建产物 `docs/` 目录作为 GitHub Pages 发布源。

> 前端启动时会向后端发起健康检查，后端不可用则显示错误拦截页
> （不会以空数据或降级模式运行）。
