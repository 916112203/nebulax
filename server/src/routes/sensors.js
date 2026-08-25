/** 传感器路由：列表（含最新值）/ 历史曲线 */
import { Router } from "express";
import { db } from "../db.js";

const router = Router();

/** GET /api/sensors */
router.get("/", (req, res) => {
	const list = db.prepare("SELECT * FROM sensors ORDER BY id").all();
	res.json({ list });
});

/** GET /api/sensors/:id/series?range=1h|6h|24h */
router.get("/:id/series", (req, res) => {
	const s = db.prepare("SELECT * FROM sensors WHERE id = ?").get(req.params.id);
	if (!s) return res.status(404).json({ error: "传感器不存在" });
	const range = req.query.range === "24h" ? 24 * 3600 * 1000 : req.query.range === "6h" ? 6 * 3600 * 1000 : 3600 * 1000;
	const since = Date.now() - range;
	const rows = db.prepare("SELECT value, ts FROM telemetry WHERE sensor_id = ? AND ts >= ? ORDER BY ts").all(s.id, since);
	// 历史数据 5min 粒度 + 实时数据 3s 粒度，前端直接绘图
	res.json({ sensor: s, series: rows });
});

export default router;
