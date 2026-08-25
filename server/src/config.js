/**
 * 服务配置：全部支持环境变量覆盖（.env 或系统环境变量）
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
	port: Number(process.env.PORT || 8080),
	host: process.env.HOST || "0.0.0.0",
	/** JWT 密钥：生产环境务必通过环境变量覆盖 */
	jwtSecret: process.env.JWT_SECRET || "smartpipe-demo-secret-change-me-in-production",
	jwtExpires: process.env.JWT_EXPIRES || "12h",
	/** SQLite 数据库文件路径 */
	dbFile: process.env.DB_FILE || join(__dirname, "..", "data", "smartpipe.db"),
	/** 种子数据目录 */
	seedDir: process.env.SEED_DIR || join(__dirname, "..", "data"),
	/** 遥测模拟参数 */
	telemetry: {
		intervalMs: Number(process.env.TELEMETRY_INTERVAL || 3000), // 推送周期
		anomalyChance: Number(process.env.ANOMALY_CHANCE || 0.04), // 每周期全局异常注入概率（约 1~2 分钟一次）
	},
	/** 前端静态资源目录（若存在则一并托管，便于单容器部署） */
	staticDir: join(__dirname, "..", "..", "docs"),
};
