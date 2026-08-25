/** 工单路由：列表 / 新建 / 状态流转（待派单→已派单→处理中→待验收→已完成） */
import { Router } from "express";
import { db } from "../db.js";
import { authenticate, requireRole } from "../auth.js";

const router = Router();
const fmtTime = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const STATUS_FLOW = ["待派单", "已派单", "处理中", "待验收", "已完成"];

/** GET /api/workorders?status=&type=&page=&pageSize= */
router.get("/", (req, res) => {
	const conds = [];
	const args = [];
	const { status, type } = req.query;
	if (status && status !== "all") { conds.push("status = ?"); args.push(status); }
	if (type && type !== "all") { conds.push("type = ?"); args.push(type); }
	const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
	const total = db.prepare(`SELECT COUNT(*) AS n FROM work_orders ${where}`).get(...args).n;
	const page = Math.max(1, Number(req.query.page || 1));
	const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
	const list = db.prepare(`SELECT * FROM work_orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
	res.json({ list: list.map((w) => ({ ...w, related_features: w.related_features ? JSON.parse(w.related_features) : [] })), total, page, pageSize });
});

/** POST /api/workorders — 新建工单（operator+） */
router.post("/", authenticate, requireRole("operator"), (req, res) => {
	const { type, title, priority, assignee, description, relatedFeatures, relatedAlarm, planStart, planEnd } = req.body || {};
	if (!title) return res.status(400).json({ error: "请填写工单标题" });
	const id = `WO-${Date.now().toString(36).toUpperCase()}`;
	const code = `GD-${String(Date.now() % 1000000).padStart(6, "0")}`;
	db.prepare(`INSERT INTO work_orders (id,code,type,title,status,priority,assignee,related_alarm,related_features,description,plan_start,plan_end,actual_start,actual_end,result,created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)`).run(
		id, code, type || "维修", title, "待派单", priority || "中", assignee || null,
		relatedAlarm || null, JSON.stringify(relatedFeatures || []), description || "", planStart || null, planEnd || null, fmtTime()
	);
	res.status(201).json({ workOrder: db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id) });
});

/** PUT /api/workorders/:id — 状态流转与字段更新（operator+） */
router.put("/:id", authenticate, requireRole("operator"), (req, res) => {
	const { id } = req.params;
	const wo = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id);
	if (!wo) return res.status(404).json({ error: "工单不存在" });
	const body = req.body || {};

	// 状态流转
	if (body.action) {
		const idx = STATUS_FLOW.indexOf(wo.status);
		let next = null;
		if (body.action === "advance") next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
		if (body.action === "complete") next = "已完成";
		if (body.action === "reject") next = "待派单";
		if (!next) return res.status(400).json({ error: "当前状态无法执行该流转" });
		const patch = { status: next };
		if (next === "已派单") patch.actual_start = fmtTime();
		if (next === "已完成") patch.actual_end = fmtTime();
		if (body.result) patch.result = body.result;
		const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
		db.prepare(`UPDATE work_orders SET ${sets} WHERE id = ?`).run(...Object.values(patch), id);
	}

	// 通用字段更新
	const { title, priority, assignee, description, planStart, planEnd } = body;
	const fields = {};
	if (title !== undefined) fields.title = title;
	if (priority !== undefined) fields.priority = priority;
	if (assignee !== undefined) fields.assignee = assignee;
	if (description !== undefined) fields.description = description;
	if (planStart !== undefined) fields.plan_start = planStart;
	if (planEnd !== undefined) fields.plan_end = planEnd;
	if (Object.keys(fields).length) {
		const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
		db.prepare(`UPDATE work_orders SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);
	}

	res.json({ workOrder: db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id) });
});

export default router;
