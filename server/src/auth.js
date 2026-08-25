/**
 * JWT 认证与角色权限
 * 角色：admin（系统管理员）/ operator（调度员）/ inspector（巡检员）/ viewer（只读）
 */
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { config } from "./config.js";

export const ROLES = ["admin", "operator", "inspector", "viewer"];

/** 角色层级（数字越大权限越高） */
const LEVEL = { viewer: 0, inspector: 1, operator: 2, admin: 3 };

export const signToken = (user) =>
	jwt.sign({ id: user.id, username: user.username, name: user.name, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });

/** 认证中间件：解析 Authorization: Bearer <token> */
export function authenticate(req, res, next) {
	const header = req.headers.authorization || "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;
	if (!token) return res.status(401).json({ error: "未登录或登录已过期" });
	try {
		req.user = jwt.verify(token, config.jwtSecret);
		next();
	} catch {
		return res.status(401).json({ error: "未登录或登录已过期" });
	}
}

/** 角色授权中间件：requireRole('operator') 表示 operator 及以上可访问 */
export const requireRole = (...roles) => (req, res, next) => {
	if (!req.user) return res.status(401).json({ error: "未登录或登录已过期" });
	if (LEVEL[req.user.role] < Math.min(...roles.map((r) => LEVEL[r] ?? -1))) {
		return res.status(403).json({ error: "当前账号无权执行此操作" });
	}
	next();
};

export const publicUser = (row) => ({ id: row.id, username: row.username, name: row.name, role: row.role, dept: row.dept, phone: row.phone });

export const findUserByUsername = (username) => db.prepare("SELECT * FROM users WHERE username = ?").get(username);
