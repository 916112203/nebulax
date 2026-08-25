/** 告警路由：列表 / 受理 / 关闭（处置流程） */
import { Router } from "express";
import { db } from "../db.js";
import { authenticate, requireRole } from "../auth.js";

const router = Router();
const fmtTime = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/** GET /api/alarms?status=&level=&type=&page=&pageSize= */
router.get("/", (req, res) => {
	const conds = [];
	const args = [];
	const { status, level, type } = req.query;
	if (status && status !== "all") { conds.push("status = ?"); args.push(status); }
	if (level && level !== "all") { conds.push("level = ?"); args.push(level); }
	if (type && type !== "all") { conds.push("type = ?"); args.push(type); }
	const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
	const total = db.prepare(`SELECT COUNT(*) AS n FROM alarms ${where}`).get(...args).n;
	const page = Math.max(1, Number(req.query.page || 1));
	const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
	const list = db.prepare(`SELECT * FROM alarms ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
	res.json({ list, total, page, pageSize });
});

/** POST /api/alarms/:id/process {action:'accept'|'resolve', resolution?} — 受理/关闭 */
router.post("/:id/process", authenticate, requireRole("inspector"), (req, res) => {
	const { id } = req.params;
	const { action, resolution } = req.body || {};
	const alarm = db.prepare("SELECT * FROM alarms WHERE id = ?").get(id);
	if (!alarm) return res.status(404).json({ error: "告警不存在" });

	if (action === "accept") {
		if (alarm.status !== "pending") return res.status(409).json({ error: "该告警已受理或已关闭" });
		db.prepare("UPDATE alarms SET status='processing', assignee=? WHERE id=?").run(req.user.name || req.user.username, id);
	} else if (action === "resolve") {
		if (alarm.status === "resolved") return res.status(409).json({ error: "该告警已关闭" });
		db.prepare("UPDATE alarms SET status='resolved', resolved_at=?, resolution=?, assignee=? WHERE id=?")
			.run(fmtTime(), resolution || "已现场核查并处置", alarm.assignee || (req.user.name || req.user.username), id);
	} else {
		return res.status(400).json({ error: "action 仅支持 accept / resolve" });
	}
	const updated = db.prepare("SELECT * FROM alarms WHERE id = ?").get(id);
	res.json({ alarm: updated });
});

/** POST /api/alarms — 手动上报告警 */
router.post("/", authenticate, requireRole("inspector"), (req, res) => {
	const { type, level, title, description, sourceType, sourceId, sourceName } = req.body || {};
	if (!title || !description) return res.status(400).json({ error: "请填写告警标题与描述" });
	const id = `AL-MAN-${Date.now().toString(36)}`;
	const code = `ALM-MAN-${String(Date.now() % 1000000)}`;
	db.prepare(`INSERT INTO alarms (id,code,type,level,title,description,source_type,source_id,source_name,status,assignee,created_at,resolved_at,resolution)
		VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL,?,NULL,NULL)`).run(
		id, code, type || "其他", level || "minor", title, description, sourceType || "manual", sourceId || null, sourceName || null, fmtTime()
	);
	res.status(201).json({ alarm: db.prepare("SELECT * FROM alarms WHERE id = ?").get(id) });
});

export default router;
