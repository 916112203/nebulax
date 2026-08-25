/** 总览统计路由：Dashboard 数据大屏 + 系统健康检查 */
import { Router } from "express";
import { db } from "../db.js";

const router = Router();

/** GET /api/overview/stats — 大屏统计 */
router.get("/stats", (req, res) => {
	const pipes = db.prepare("SELECT COUNT(*) AS n, SUM(length) AS len FROM (SELECT json_extract(geojson, '$.properties.length') AS length FROM features WHERE layer='pipes')").get();
	const wellCount = db.prepare("SELECT COUNT(*) AS n FROM features WHERE layer='wells'").get().n;
	const pumpCount = db.prepare("SELECT COUNT(*) AS n FROM features WHERE layer='pumps'").get().n;
	const buildingCount = db.prepare("SELECT COUNT(*) AS n FROM features WHERE layer='buildings'").get().n;

	// 管线类型/状态分布
	const typeDist = db.prepare("SELECT type AS name, COUNT(*) AS value FROM features WHERE layer='pipes' GROUP BY type").all();
	const statusDist = db.prepare("SELECT status AS name, COUNT(*) AS value FROM features WHERE layer='pipes' GROUP BY status").all();

	// 告警统计
	const alarmStats = {
		pending: db.prepare("SELECT COUNT(*) AS n FROM alarms WHERE status='pending'").get().n,
		processing: db.prepare("SELECT COUNT(*) AS n FROM alarms WHERE status='processing'").get().n,
		today: db.prepare("SELECT COUNT(*) AS n FROM alarms WHERE created_at >= date('now','localtime')").get().n,
		total: db.prepare("SELECT COUNT(*) AS n FROM alarms").get().n,
	};
	// 近 7 天告警趋势
	const alarmTrend = db.prepare(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM alarms WHERE created_at >= datetime('now','-6 days') GROUP BY day ORDER BY day`).all();

	// 工单统计
	const workOrderStats = db.prepare("SELECT status AS name, COUNT(*) AS value FROM work_orders GROUP BY status").all();

	// 巡检统计
	const inspectionStats = {
		total: db.prepare("SELECT COUNT(*) AS n FROM inspections").get().n,
		doing: db.prepare("SELECT COUNT(*) AS n FROM inspections WHERE status='进行中'").get().n,
		done: db.prepare("SELECT COUNT(*) AS n FROM inspections WHERE status='已完成'").get().n,
	};

	// 传感器在线
	const sensorStats = {
		total: db.prepare("SELECT COUNT(*) AS n FROM sensors").get().n,
		online: db.prepare("SELECT COUNT(*) AS n FROM sensors WHERE status='online'").get().n,
	};

	// 管线材质分布
	const materialDist = db.prepare(`SELECT json_extract(geojson,'$.properties.material') AS name, COUNT(*) AS value FROM features WHERE layer='pipes' GROUP BY name ORDER BY value DESC LIMIT 6`).all();

	res.json({
		pipeCount: pipes.n,
		pipeLength: Math.round((pipes.len || 0) / 1000 * 10) / 10, // km
		wellCount, pumpCount, buildingCount,
		typeDist, statusDist, materialDist,
		alarmStats, alarmTrend, workOrderStats, inspectionStats, sensorStats,
	});
});

/** GET /api/overview/health — 健康检查（前端探测后端是否可用） */
router.get("/health", (req, res) => {
	res.json({
		status: "ok",
		name: "smartpipe-server",
		version: "1.0.0",
		uptime: Math.round(process.uptime()),
		features: db.prepare("SELECT COUNT(*) AS n FROM features").get().n,
		time: new Date().toISOString(),
	});
});

export default router;
