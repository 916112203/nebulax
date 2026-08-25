/** 用户管理路由（admin）：列表 / 新增 / 修改 / 重置密码 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { authenticate, requireRole, publicUser, ROLES } from "../auth.js";

const router = Router();
router.use(authenticate, requireRole("admin"));

/** GET /api/users */
router.get("/", (req, res) => {
	const list = db.prepare("SELECT * FROM users ORDER BY id").all();
	res.json({ list: list.map(publicUser) });
});

/** POST /api/users */
router.post("/", (req, res) => {
	const { username, password, name, role, dept, phone } = req.body || {};
	if (!username || !password || !name) return res.status(400).json({ error: "请填写用户名、密码、姓名" });
	if (!ROLES.includes(role)) return res.status(400).json({ error: "角色不合法" });
	if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) return res.status(409).json({ error: "用户名已存在" });
	const id = `U-${Date.now().toString(36).toUpperCase()}`;
	db.prepare("INSERT INTO users (id,username,password,name,role,dept,phone,created_at) VALUES (?,?,?,?,?,?,?,?)").run(
		id, username, bcrypt.hashSync(password, 10), name, role, dept || null, phone || null, new Date().toISOString()
	);
	res.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});

/** PUT /api/users/:id — 修改用户（角色/部门/密码） */
router.put("/:id", (req, res) => {
	const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
	if (!u) return res.status(404).json({ error: "用户不存在" });
	const { name, role, dept, phone, password } = req.body || {};
	const fields = {};
	if (name !== undefined) fields.name = name;
	if (role !== undefined) {
		if (!ROLES.includes(role)) return res.status(400).json({ error: "角色不合法" });
		fields.role = role;
	}
	if (dept !== undefined) fields.dept = dept;
	if (phone !== undefined) fields.phone = phone;
	if (password) fields.password = bcrypt.hashSync(password, 10);
	if (!Object.keys(fields).length) return res.status(400).json({ error: "没有需要更新的字段" });
	const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
	db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(fields), u.id);
	res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(u.id)) });
});

/** DELETE /api/users/:id — 删除用户（admin 不可删除自身） */
router.delete("/:id", (req, res) => {
	if (req.params.id === req.user.id) return res.status(400).json({ error: "不能删除当前登录账号" });
	const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
	if (!u) return res.status(404).json({ error: "用户不存在" });
	db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
	res.json({ id: u.id, message: `用户 ${u.name} 已删除` });
});

export default router;
