/** 巡检路由：计划列表 / 详情 / 开始 / 点位上报 / 完成 */
import { Router } from "express";
import { db } from "../db.js";
import { authenticate, requireRole } from "../auth.js";

const router = Router();
const fmtTime = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const fmtDate = () => new Date().toISOString().slice(0, 10);

const serialize = (i) => ({ ...i, route: i.route_json ? JSON.parse(i.route_json) : [] });

/** GET /api/inspections?status=&page= */
router.get("/", (req, res) => {
	const conds = [];
	const args = [];
	if (req.query.status && req.query.status !== "all") { conds.push("status = ?"); args.push(req.query.status); }
	const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
	const total = db.prepare(`SELECT COUNT(*) AS n FROM inspections ${where}`).get(...args).n;
	const page = Math.max(1, Number(req.query.page || 1));
	const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
	const list = db.prepare(`SELECT * FROM inspections ${where} ORDER BY plan_date DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
	res.json({ list: list.map(serialize), total, page, pageSize });
});

/** GET /api/inspections/:id */
router.get("/:id", (req, res) => {
	const i = db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id);
	if (!i) return res.status(404).json({ error: "巡检计划不存在" });
	res.json({ inspection: serialize(i) });
});

/** POST /api/inspections — 新建巡检计划（operator+） */
router.post("/", authenticate, requireRole("operator"), (req, res) => {
	const { name, type, inspector, planDate, route } = req.body || {};
	if (!name || !planDate) return res.status(400).json({ error: "请填写计划名称与计划日期" });
	const id = `IN-${Date.now().toString(36).toUpperCase()}`;
	const code = `XJ-${Date.now().toString(36).toUpperCase()}`;
	const routeList = (route || []).map((r, idx) => ({ ...r, order: idx + 1, status: r.status || "pending", issue: r.issue || null }));
	db.prepare(`INSERT INTO inspections (id,code,name,type,inspector,route_json,status,plan_date,start_at,end_at,progress,issue_count)
		VALUES (?,?,?,?,?,?,'未开始',?,NULL,NULL,0,0)`).run(
		id, code, name, type || "日常巡检", inspector || null, JSON.stringify(routeList), planDate
	);
	res.status(201).json({ inspection: serialize(db.prepare("SELECT * FROM inspections WHERE id = ?").get(id)) });
});

/** POST /api/inspections/:id/start — 开始巡检（inspector+） */
router.post("/:id/start", authenticate, requireRole("inspector"), (req, res) => {
	const i = db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id);
	if (!i) return res.status(404).json({ error: "巡检计划不存在" });
	if (i.status !== "未开始") return res.status(409).json({ error: "该计划已开始或已完成" });
	db.prepare("UPDATE inspections SET status='进行中', start_at=? WHERE id=?").run(fmtTime(), i.id);
	res.json({ inspection: serialize(db.prepare("SELECT * FROM inspections WHERE id = ?").get(i.id)) });
});

/** POST /api/inspections/:id/report {wellId, status, issue?} — 上报点位结果（inspector+） */
router.post("/:id/report", authenticate, requireRole("inspector"), (req, res) => {
	const i = db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id);
	if (!i) return res.status(404).json({ error: "巡检计划不存在" });
	const { wellId, status, issue } = req.body || {};
	const route = i.route_json ? JSON.parse(i.route_json) : [];
	const pt = route.find((r) => r.wellId === wellId);
	if (!pt) return res.status(404).json({ error: "点位不在该计划路线中" });
	pt.status = status || "done";
	pt.issue = issue || null;
	const done = route.filter((r) => r.status === "done").length;
	const issues = route.filter((r) => r.issue).length;
	db.prepare("UPDATE inspections SET route_json=?, progress=?, issue_count=? WHERE id=?").run(
		JSON.stringify(route), Math.round((done / route.length) * 100), issues, i.id
	);
	// 点位发现问题时自动生成告警
	if (issue && status === "issue") {
		const now = fmtTime();
		const alarmId = `AL-INS-${Date.now().toString(36)}`;
		db.prepare(`INSERT INTO alarms (id,code,type,level,title,description,source_type,source_id,source_name,status,assignee,created_at,resolved_at,resolution)
			VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,NULL,NULL)`).run(
			alarmId, `ALM-INS-${String(Date.now() % 1000000)}`, "巡检发现", "minor",
			`巡检发现问题：${wellId}`, `${i.name}巡检中发现 ${wellId}：${issue}`, "wells", wellId, wellId, req.user.name || req.user.username, now
		);
		res.json({ inspection: serialize(db.prepare("SELECT * FROM inspections WHERE id = ?").get(i.id)), alarm: db.prepare("SELECT * FROM alarms WHERE id = ?").get(alarmId) });
		return;
	}
	res.json({ inspection: serialize(db.prepare("SELECT * FROM inspections WHERE id = ?").get(i.id)) });
});

/** POST /api/inspections/:id/complete — 完成巡检（inspector+） */
router.post("/:id/complete", authenticate, requireRole("inspector"), (req, res) => {
	const i = db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id);
	if (!i) return res.status(404).json({ error: "巡检计划不存在" });
	if (i.status === "已完成") return res.status(409).json({ error: "该计划已完成" });
	db.prepare("UPDATE inspections SET status='已完成', end_at=?, progress=100 WHERE id=?").run(fmtTime(), i.id);
	res.json({ inspection: serialize(db.prepare("SELECT * FROM inspections WHERE id = ?").get(i.id)) });
});

export default router;
