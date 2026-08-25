/**
 * 重置数据库并重新导入种子数据
 * 用法：node src/reseed.js
 */
import { reseed, seedTelemetryHistory, db } from "./db.js";

reseed();
seedTelemetryHistory();
const counts = {
	features: db.prepare("SELECT COUNT(*) AS n FROM features").get().n,
	alarms: db.prepare("SELECT COUNT(*) AS n FROM alarms").get().n,
	workOrders: db.prepare("SELECT COUNT(*) AS n FROM work_orders").get().n,
	inspections: db.prepare("SELECT COUNT(*) AS n FROM inspections").get().n,
};
console.log("✅ 数据已重置：", JSON.stringify(counts));
process.exit(0);
