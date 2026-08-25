/**
 * 极简静态服务器（无任何 API 代理）
 * 用途：模拟"后端不可用"的部署场景，验证前端拦截错误页
 * 用法：node scripts/serve-static.mjs [port]
 */
import { createServer } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import { join, extname } from "node:path";

const PORT = Number(process.argv[2] || 4174);
const ROOT = join(process.cwd(), "docs");
const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript",
	".css": "text/css",
	".png": "image/png",
	".svg": "image/svg+xml",
	".json": "application/json",
};

createServer((req, res) => {
	const urlPath = decodeURIComponent(req.url.split("?")[0]);
	// 无后端：/api 一律 404
	if (urlPath.startsWith("/api/")) {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("API not available");
		return;
	}
	let file = join(ROOT, urlPath);
	if (urlPath.endsWith("/") || !extname(urlPath)) file = join(file, "index.html");
	if (existsSync(file) && statSync(file).isFile()) {
		res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
		createReadStream(file).pipe(res);
		return;
	}
	// SPA 回退
	res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
	createReadStream(join(ROOT, "index.html")).pipe(res);
}).listen(PORT, () => console.log(`静态服务器（无后端）: http://localhost:${PORT}`));
