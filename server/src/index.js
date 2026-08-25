/**
 * SmartPipe GIS 后端服务入口
 * ============================================================
 * - REST API（Express）：认证 / 要素 CRUD / 告警 / 工单 / 巡检 / 传感器 / 管网分析
 * - WebSocket（ws）：实时遥测推送 + 告警事件广播
 * - 若前端构建产物（docs/）存在则一并托管，支持单进程部署
 * ============================================================
 */
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { initDb, seedIfEmpty, seedTelemetryHistory, pruneTelemetry, persistNow } from "./db.js";
import { TelemetrySimulator } from "./simulator.js";
import authRouter from "./routes/auth.js";
import featuresRouter from "./routes/features.js";
import alarmsRouter from "./routes/alarms.js";
import workOrdersRouter from "./routes/workorders.js";
import inspectionsRouter from "./routes/inspections.js";
import sensorsRouter from "./routes/sensors.js";
import analysisRouter from "./routes/analysis.js";
import overviewRouter from "./routes/overview.js";
import usersRouter from "./routes/users.js";

/* ---------------- 初始化数据库 ---------------- */
await initDb();
seedIfEmpty();
seedTelemetryHistory();
setInterval(pruneTelemetry, 10 * 60 * 1000).unref();

/* ---------------- Express ---------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use("/api/auth", authRouter);
app.use("/api/features", featuresRouter);
app.use("/api/alarms", alarmsRouter);
app.use("/api/workorders", workOrdersRouter);
app.use("/api/inspections", inspectionsRouter);
app.use("/api/sensors", sensorsRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/users", usersRouter);

/* ---------------- 前端静态托管（若已构建） ---------------- */
if (existsSync(config.staticDir)) {
	app.use(express.static(config.staticDir));
	// SPA 回退（hash 路由下一般不会触发，稳妥起见保留）
	app.use((req, res, next) => {
		if (req.method === "GET" && !req.path.startsWith("/api")) {
			return res.sendFile(config.staticDir + "/index.html");
		}
		next();
	});
}

/* 无前端产物时，根路径返回 API 使用提示 */
app.get("/", (req, res) => res.json({ name: "SmartPipe GIS API", docs: "/api/overview/health" }));

/* ---------------- HTTP + WebSocket ---------------- */
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/ws" });

const broadcast = (payload) => {
	const msg = JSON.stringify(payload);
	wss.clients.forEach((c) => {
		if (c.readyState === 1) c.send(msg);
	});
};

wss.on("connection", (ws, req) => {
	console.log(`[ws] 客户端接入（${wss.clients.size} 在线）`);
	ws.on("message", (data) => {
		try {
			const msg = JSON.parse(data.toString());
			if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
		} catch { /* 忽略非法消息 */ }
	});
	ws.on("close", () => console.log(`[ws] 客户端断开（${wss.clients.size} 在线）`));
});

/* ---------------- 遥测模拟器 ---------------- */
const simulator = new TelemetrySimulator(broadcast);
simulator.start();

/* ---------------- 启动 ---------------- */
server.listen(config.port, config.host, () => {
	console.log("========================================================");
	console.log("  SmartPipe GIS 智慧城市地下管网管理平台 - 后端服务");
	console.log(`  API:      http://localhost:${config.port}/api`);
	console.log(`  健康检查: http://localhost:${config.port}/api/overview/health`);
	if (existsSync(config.staticDir)) console.log(`  前端页面: http://localhost:${config.port}/`);
	console.log("========================================================");
});

// 优雅退出：停止模拟器、落盘、关闭服务
const shutdown = () => {
	simulator.stop();
	persistNow();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 3000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
