#!/usr/bin/env bash
# ============================================================
# SmartPipe GIS 手动部署脚本（Ubuntu 20.04+/Debian 11+）
# 用法：sudo bash deploy/deploy.sh
# 完成内容：安装依赖 → 构建前端 → 部署到 nginx → 配置 systemd 后端
# ============================================================
set -euo pipefail

APP_DIR="/opt/smartpipe"
WEB_DIR="/var/www/smartpipe"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> [1/6] 检查基础环境"
command -v node >/dev/null 2>&1 || { echo "未检测到 Node.js，请先安装 Node 20+：https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "未检测到 npm"; exit 1; }
NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 版本过低（当前 $(node -v)），需要 Node 18+"
  exit 1
fi
echo "    Node $(node -v) ✓"

echo "==> [2/6] 安装 nginx（如未安装）"
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y nginx
fi

echo "==> [3/6] 构建前端并部署到 $WEB_DIR"
cd "$PROJECT_DIR"
npm ci --no-audit --no-fund
npm run gen:data
npm run build            # 在线模式：API base=/api，由 nginx 反代
mkdir -p "$WEB_DIR"
rm -rf "${WEB_DIR:?}"/*
cp -r docs/* "$WEB_DIR/"
chown -R www-data:www-data "$WEB_DIR"

echo "==> [4/6] 部署后端到 $APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$PROJECT_DIR/server" "$APP_DIR/"
cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund
mkdir -p data
chown -R www-data:www-data "$APP_DIR"

echo "==> [5/6] 配置 nginx 与 systemd"
cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/conf.d/smartpipe.conf
cp "$PROJECT_DIR/deploy/smartpipe-api.service" /etc/systemd/system/
sed -i "s|/opt/smartpipe|$APP_DIR|g" /etc/systemd/system/smartpipe-api.service
systemctl daemon-reload
systemctl enable --now smartpipe-api
nginx -t && systemctl reload nginx

echo "==> [6/6] 验证"
sleep 3
if curl -sf http://127.0.0.1/api/overview/health >/dev/null; then
  echo "    ✓ 后端健康检查通过：http://<本机IP>/api/overview/health"
else
  echo "    ✗ 后端健康检查失败，请查看：journalctl -u smartpipe-api -n 50"
  exit 1
fi

echo ""
echo "=========================================================="
echo "  ✅ SmartPipe GIS 部署完成！"
echo "  访问地址：http://<虚拟机IP>/"
echo "  演示账号：admin/admin123（系统管理员）"
echo "  后端日志：journalctl -u smartpipe-api -f"
echo "=========================================================="
