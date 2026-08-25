# ============================================================
# SmartPipe GIS 单容器镜像：Node 后端（API + WebSocket）+ 前端静态托管
# 构建：docker build -f deploy/Dockerfile -t smartpipe-gis .
# 运行：docker run -d -p 8080:8080 --name smartpipe smartpipe-gis
# ============================================================

# ---- 阶段 1：构建前端 ----
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json .env.demo ./
COPY src ./src
COPY scripts ./scripts
RUN npm run gen:data && npm run build

# ---- 阶段 2：运行时（后端 + 托管前端产物） ----
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app
# 安装后端依赖（sql.js 为纯 WASM，无原生编译依赖）
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
# 前端构建产物 + 种子数据
COPY --from=frontend-build /app/docs ./docs
RUN mkdir -p /data
ENV DB_FILE=/data/smartpipe.db
VOLUME ["/data"]
EXPOSE 8080
WORKDIR /app/server
CMD ["node", "src/index.js"]
