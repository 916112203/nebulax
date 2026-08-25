#!/usr/bin/env bash
# ============================================================
# SmartPipe GIS WSL（Debian）部署脚本 —— 以 root 运行
# 用法（Windows PowerShell / 终端，<密码> 为 WSL 内 sudo 密码）：
#   wsl -d Debian -- bash -c "echo <密码> | sudo -S bash /mnt/c/Users/<用户>/Desktop/webTest/deploy/deploy-wsl.sh"
# 功能：部署前端到 nginx / 配置后端 systemd 服务 / WSL 启动时自启动前后端
# ============================================================
set -euo pipefail

PROJECT=/home/zcj/smartpipe
WEB_ROOT=/var/www/smartpipe
NODE_BIN=/usr/local/bin/node

echo "==> [1/5] 部署前端静态文件到 $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rm -rf "$WEB_ROOT"/*
cp -r "$PROJECT/docs/." "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"
echo "    前端文件数: $(find "$WEB_ROOT" -type f | wc -l)"

echo "==> [2/5] 配置 nginx"
cat > /etc/nginx/sites-available/default <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/smartpipe;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1k;

    # REST API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # WebSocket 升级
    location /api/ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
nginx -t && echo "    nginx 配置检查通过"

echo "==> [3/5] 配置后端 systemd 服务"
cat > /etc/systemd/system/smartpipe-api.service <<UNIT
[Unit]
Description=SmartPipe GIS API Server (智慧城市地下管网管理平台后端)
After=network.target

[Service]
Type=simple
User=zcj
WorkingDirectory=$PROJECT/server
ExecStart=$NODE_BIN $PROJECT/server/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=JWT_SECRET=smartpipe-wsl-$(tr -dc A-Za-z0-9 </dev/urandom | head -c 16)
Environment=DB_FILE=$PROJECT/server/data/smartpipe.db

[Install]
WantedBy=multi-user.target
UNIT
echo "    smartpipe-api.service 已写入"

echo "==> [4/5] 启用自启动（WSL 启动时 systemd 自动拉起前后端）"
systemctl daemon-reload
systemctl enable smartpipe-api
systemctl enable nginx
echo "    已 enable: smartpipe-api + nginx"

echo "==> [5/5] 启动服务并验证"
systemctl restart smartpipe-api
systemctl restart nginx
sleep 3
systemctl is-active smartpipe-api nginx
echo "=========================================================="
echo "  部署完成！Windows 浏览器访问: http://localhost/"
echo "  后端健康检查: http://localhost/api/overview/health"
echo "  日志: journalctl -u smartpipe-api -f"
echo "=========================================================="
