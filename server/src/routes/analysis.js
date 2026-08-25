/** 管网分析路由：缓冲区 / 上下游追踪 / 爆管关阀 / 纵剖面 */
import { Router } from "express";
import { db } from "../db.js";
import { bufferQuery, traceAnalysis, isolationAnalysis, pipeProfile } from "../spatial.js";

const router = Router();

/** POST /api/analysis/buffer {geometry:{type,coordinates}, radius, layers[]} */
router.post("/buffer", (req, res) => {
	const { geometry, radius, layers } = req.body || {};
	if (!geometry || !geometry.coordinates) return res.status(400).json({ error: "请提供 geometry" });
	try {
		const result = bufferQuery({ geometry, radius: Math.min(5000, Math.max(50, Number(radius) || 500)), layers: layers?.length ? layers : undefined });
		res.json(result);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

/** POST /api/analysis/trace {pipeId, direction: upstream|downstream} */
router.post("/trace", (req, res) => {
	const { pipeId, direction } = req.body || {};
	if (!pipeId) return res.status(400).json({ error: "请指定管线 pipeId" });
	if (!["upstream", "downstream"].includes(direction)) return res.status(400).json({ error: "direction 仅支持 upstream / downstream" });
	try {
		const row = db.prepare("SELECT pipe_type FROM features WHERE id = ?").get(pipeId);
		if (!row) return res.status(404).json({ error: `未找到管线 ${pipeId}` });
		res.json(traceAnalysis(row.pipe_type, pipeId, direction));
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

/** POST /api/analysis/isolation {pipeId} — 爆管关阀分析 */
router.post("/isolation", (req, res) => {
	const { pipeId } = req.body || {};
	if (!pipeId) return res.status(400).json({ error: "请指定爆管管线 pipeId" });
	try {
		res.json(isolationAnalysis(pipeId));
	} catch (e) {
		res.status(404).json({ error: e.message });
	}
});

/** POST /api/analysis/profile {pipeId} — 管线纵剖面 */
router.post("/profile", (req, res) => {
	const { pipeId } = req.body || {};
	if (!pipeId) return res.status(400).json({ error: "请指定管线 pipeId" });
	try {
		res.json(pipeProfile(pipeId));
	} catch (e) {
		res.status(404).json({ error: e.message });
	}
});

export default router;
