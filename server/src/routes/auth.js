/** 认证路由：登录 / 当前用户 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { findUserByUsername, signToken, authenticate, publicUser } from "../auth.js";

const router = Router();

/** POST /api/auth/login {username, password} */
router.post("/login", (req, res) => {
	const { username, password } = req.body || {};
	if (!username || !password) return res.status(400).json({ error: "请输入用户名和密码" });
	const user = findUserByUsername(username);
	if (!user || !bcrypt.compareSync(password, user.password)) {
		return res.status(401).json({ error: "用户名或密码错误" });
	}
	res.json({ token: signToken(user), user: publicUser(user) });
});

/** GET /api/auth/me */
router.get("/me", authenticate, (req, res) => {
	res.json({ user: req.user });
});

export default router;
