/**
 * SQLite 数据层（sql.js 内存引擎 + 周期落盘）
 * ============================================================
 * 选型说明：sql.js 是 SQLite 的 WebAssembly 编译版，零原生依赖，
 * 任何平台（Windows / Linux / 容器）npm install 即可运行，
 * 从根本上避免原生模块（node-gyp / glibc 版本）导致的部署问题。
 *
 * - 业务数据（要素/告警/工单/巡检/传感器）写入后 5s 内落盘持久化
 * - 遥测时序数据仅存内存（重启后自动重建 24h 历史），每 10 分钟清理 72h 之前的数据
 * - 首次启动自动导入 scripts/generate-mock-data.mjs 生成的种子数据
 * ============================================================
 */
import initSqlJs from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

let handle = null; // sql.js Database 实例

/* ---------------- sql.js 同步适配层 ---------------- */
/** 执行查询并返回行对象数组 */
const query = (sql, params = []) => {
	const stmt = handle.prepare(sql);
	try {
		stmt.bind(params);
		const rows = [];
		while (stmt.step()) rows.push(stmt.getAsObject());
		return rows;
	} finally {
		stmt.free();
	}
};

/** 标记数据脏（telemetry 表除外，避免每 3s 全量落盘） */
let dirty = false;
let saveTimer = null;
const markDirty = (sql) => {
	if (/^insert into telemetry|^delete from telemetry/i.test(sql.trim())) return;
	dirty = true;
	if (!saveTimer) {
		saveTimer = setTimeout(() => {
			saveTimer = null;
			if (dirty) { persistNow(); dirty = false; }
		}, 5000);
	}
};

export const persistNow = () => {
	if (!handle) return;
	mkdirSync(dirname(config.dbFile), { recursive: true });
	writeFileSync(config.dbFile, Buffer.from(handle.export()));
	dirty = false;
};

/** better-sqlite3 风格的同步 API（路由层无感） */
export const db = {
	run(sql, ...params) {
		handle.run(sql, params);
		markDirty(sql);
		return { changes: handle.getRowsModified() };
	},
	get(sql, ...params) {
		return query(sql, params)[0];
	},
	all(sql, ...params) {
		return query(sql, params);
	},
	exec(sql) {
		handle.exec(sql);
		markDirty(sql);
	},
	prepare(sql) {
		return {
			get: (...p) => query(sql, p)[0],
			all: (...p) => query(sql, p),
			run: (...p) => { handle.run(sql, p); markDirty(sql); return { changes: handle.getRowsModified() }; },
		};
	},
	transaction(fn) {
		return (...args) => fn(...args);
	},
};

/* ---------------- 建表 ---------------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
	name TEXT, role TEXT NOT NULL DEFAULT 'viewer', dept TEXT, phone TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS features (
	id TEXT PRIMARY KEY, layer TEXT NOT NULL, geojson TEXT NOT NULL,
	name TEXT, type TEXT, status TEXT, pipe_type TEXT, diameter REAL, depth REAL, road TEXT,
	start_well TEXT, end_well TEXT, wells_json TEXT,
	bbox_minx REAL, bbox_miny REAL, bbox_maxx REAL, bbox_maxy REAL,
	updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_features_layer ON features(layer);
CREATE INDEX IF NOT EXISTS idx_features_bbox ON features(layer, bbox_minx, bbox_maxx, bbox_miny, bbox_maxy);
CREATE TABLE IF NOT EXISTS alarms (
	id TEXT PRIMARY KEY, code TEXT, type TEXT, level TEXT, title TEXT, description TEXT,
	source_type TEXT, source_id TEXT, source_name TEXT,
	status TEXT DEFAULT 'pending', assignee TEXT, created_at TEXT, resolved_at TEXT, resolution TEXT
);
CREATE TABLE IF NOT EXISTS work_orders (
	id TEXT PRIMARY KEY, code TEXT, type TEXT, title TEXT, status TEXT DEFAULT '待派单',
	priority TEXT, assignee TEXT, related_alarm TEXT, related_features TEXT, description TEXT,
	plan_start TEXT, plan_end TEXT, actual_start TEXT, actual_end TEXT, result TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS inspections (
	id TEXT PRIMARY KEY, code TEXT, name TEXT, type TEXT, inspector TEXT,
	route_json TEXT, status TEXT DEFAULT '未开始', plan_date TEXT, start_at TEXT, end_at TEXT,
	progress INTEGER DEFAULT 0, issue_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sensors (
	id TEXT PRIMARY KEY, name TEXT, type TEXT, unit TEXT, source_type TEXT, source_id TEXT, source_name TEXT,
	baseline REAL, amplitude REAL, period REAL, threshold REAL, alarm_type TEXT,
	x REAL, y REAL, status TEXT DEFAULT 'online', last_value REAL, last_ts INTEGER
);
CREATE TABLE IF NOT EXISTS telemetry (
	id INTEGER PRIMARY KEY AUTOINCREMENT, sensor_id TEXT NOT NULL, value REAL NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry ON telemetry(sensor_id, ts);
`;

/* ---------------- 数据装载 ---------------- */
const loadJson = (name) => JSON.parse(readFileSync(join(config.seedDir, name), "utf8"));

const bboxOf = (geom) => {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	const walk = (c) => {
		if (typeof c[0] === "number") {
			minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]);
			miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]);
		} else c.forEach(walk);
	};
	walk(geom.coordinates);
	return { minx, miny, maxx, maxy };
};

const upsertFeature = (layer, f) => {
	const p = f.properties || {};
	const geom = f.geometry || { type: "Point", coordinates: [] };
	const { minx, miny, maxx, maxy } = bboxOf(geom);
	db.prepare(`INSERT OR REPLACE INTO features
		(id, layer, geojson, name, type, status, pipe_type, diameter, depth, road, start_well, end_well, wells_json, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
		p.id, layer, JSON.stringify(f),
		p.name ?? null, p.type ?? null, p.status ?? null,
		p.type ?? null, p.diameter ?? null, p.depth ?? null, p.road ?? null,
		p.startWell ?? null, p.endWell ?? null,
		p.wells ? JSON.stringify(p.wells) : null,
		minx, miny, maxx, maxy, new Date().toISOString(),
	);
};

/** 首次启动（或数据为空）时导入种子数据 */
export function seedIfEmpty() {
	const count = db.get("SELECT COUNT(*) AS n FROM features").n;
	if (count > 0) return false;

	for (const [layer, file] of [
		["pipes", "pipes.geojson"], ["wells", "wells.geojson"],
		["pumps", "pumps.geojson"], ["buildings", "buildings.geojson"],
	]) {
		const fc = loadJson(file);
		fc.features.forEach((f) => upsertFeature(layer, f));
	}
	const biz = loadJson("biz.json");
	const insUser = db.prepare("INSERT INTO users (id, username, password, name, role, dept, phone, created_at) VALUES (?,?,?,?,?,?,?,?)");
	biz.users.forEach((u) => insUser.run(u.id, u.username, bcrypt.hashSync(u.password, 10), u.name, u.role, u.dept, u.phone, new Date().toISOString()));
	const insAlarm = db.prepare(`INSERT INTO alarms (id,code,type,level,title,description,source_type,source_id,source_name,status,assignee,created_at,resolved_at,resolution)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
	biz.alarms.forEach((a) => insAlarm.run(a.id, a.code, a.type, a.level, a.title, a.description, a.sourceType, a.sourceId, a.sourceName, a.status, a.assignee, a.createdAt, a.resolvedAt, a.resolution));
	const insWo = db.prepare(`INSERT INTO work_orders (id,code,type,title,status,priority,assignee,related_alarm,related_features,description,plan_start,plan_end,actual_start,actual_end,result,created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
	biz.workOrders.forEach((w) => insWo.run(w.id, w.code, w.type, w.title, w.status, w.priority, w.assignee, w.relatedAlarm, JSON.stringify(w.relatedFeatures || []), w.description, w.planStart, w.planEnd, w.actualStart, w.actualEnd, w.result, w.createdAt));
	const insIns = db.prepare(`INSERT INTO inspections (id,code,name,type,inspector,route_json,status,plan_date,start_at,end_at,progress,issue_count)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
	biz.inspections.forEach((i) => insIns.run(i.id, i.code, i.name, i.type, i.inspector, JSON.stringify(i.route), i.status, i.planDate, i.startAt, i.endAt, i.progress, i.issueCount));
	const insSen = db.prepare(`INSERT INTO sensors (id,name,type,unit,source_type,source_id,source_name,baseline,amplitude,period,threshold,alarm_type,x,y,status,last_value,last_ts)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'online',NULL,NULL)`);
	biz.sensors.forEach((s) => insSen.run(s.id, s.name, s.type, s.unit, s.sourceType, s.sourceId, s.sourceName, s.baseline, s.amplitude, s.period, s.threshold, s.alarmType, s.x, s.y));
	persistNow();
	console.log(`[db] 首次启动：已导入种子数据（管线/井/泵站/建筑 + 业务数据）→ ${config.dbFile}`);
	return true;
}

/** 重新导入种子数据（清空业务表后重建） */
export function reseed() {
	db.exec("DELETE FROM features; DELETE FROM alarms; DELETE FROM work_orders; DELETE FROM inspections; DELETE FROM sensors; DELETE FROM telemetry;");
	seedIfEmpty();
}

/** 生成每个传感器最近 24h 的遥测历史（5 分钟粒度），供曲线回看 */
export function seedTelemetryHistory() {
	const n = db.get("SELECT COUNT(*) AS n FROM telemetry").n;
	if (n > 0) return;
	const sensors = db.all("SELECT * FROM sensors");
	const ins = db.prepare("INSERT INTO telemetry (sensor_id, value, ts) VALUES (?,?,?)");
	const now = Date.now();
	const step = 5 * 60 * 1000;
	sensors.forEach((s) => {
		const phase = ((s.id.charCodeAt(s.id.length - 1) % 10) / 10) * Math.PI * 2;
		for (let t = now - 24 * 3600 * 1000; t <= now; t += step) {
			ins.run(s.id, Math.round(simValue(s, t, phase) * 1000) / 1000, t);
		}
	});
	console.log(`[db] 已生成 ${sensors.length} 个传感器 24h 遥测历史`);
}

/** 遥测模拟函数（与前端演示模式算法一致）：正弦周期 + 噪声 + 降雨时段加成 */
export function simValue(s, t, phase) {
	const h = new Date(t).getHours();
	const rainFactor = s.type === "level" && h >= 14 && h < 16 ? 1.9 : 1;
	const noise = (Math.sin(t * 0.0001 + phase) + Math.sin(t * 0.00023 + phase * 2) + Math.sin(t * 0.00047)) / 3;
	const value = (s.baseline + s.amplitude * Math.sin((2 * Math.PI * t) / (s.period * 1000) + phase) + noise * s.amplitude * 0.25) * rainFactor;
	return Math.max(0, value);
}

/** 清理 72h 之前的遥测数据（防内存无限增长） */
export function pruneTelemetry() {
	const cutoff = Date.now() - 72 * 3600 * 1000;
	const r = db.run("DELETE FROM telemetry WHERE ts < ?", cutoff);
	if (r.changes > 0) console.log(`[db] 清理遥测历史 ${r.changes} 行`);
}

/* ---------------- 初始化 ---------------- */
export async function initDb() {
	const SQL = await initSqlJs();
	if (existsSync(config.dbFile)) {
		handle = new SQL.Database(readFileSync(config.dbFile));
	} else {
		handle = new SQL.Database();
	}
	handle.exec(SCHEMA);
}

export const featureRowToGeoJSON = (row) => JSON.parse(row.geojson);
