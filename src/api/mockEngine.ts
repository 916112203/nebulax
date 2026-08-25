/**
 * 演示模式引擎（GitHub Pages 纯前端运行，无需后端）
 * ============================================================
 * 在浏览器内存中实现与后端完全一致的 API 契约：
 * 认证、要素 CRUD、告警处置、工单流转、巡检、传感器、
 * 空间分析（缓冲/追踪/爆管/剖面）、遥测模拟与异常注入。
 * 数据与后端种子数据同源（scripts/generate-mock-data.mjs 生成）。
 */
import pipesData from "../data/mock/pipes.json";
import wellsData from "../data/mock/wells.json";
import pumpsData from "../data/mock/pumps.json";
import buildingsData from "../data/mock/buildings.json";
import bizData from "../data/mock/biz.json";
import type {
	Alarm, FeatureCollection, GeoJSONFeature, Inspection, LayerName,
	OverviewStats, ProfileResult, Sensor, TraceResult, User, WorkOrder,
	IsolationResult,
} from "../types";

/* ---------------- 内存数据 ---------------- */
const store: Record<LayerName, GeoJSONFeature[]> = {
	pipes: (pipesData as FeatureCollection).features,
	wells: (wellsData as FeatureCollection).features,
	pumps: (pumpsData as FeatureCollection).features,
	buildings: (buildingsData as FeatureCollection).features,
};
const biz = bizData as any;
let users: any[] = biz.users.map((u: any) => ({ ...u }));
/* 种子数据为驼峰字段，统一映射为 API 契约的蛇形字段 */
let alarms: Alarm[] = biz.alarms.map((a: any) => ({
	id: a.id, code: a.code, type: a.type, level: a.level, title: a.title, description: a.description,
	source_type: a.sourceType, source_id: a.sourceId, source_name: a.sourceName,
	status: a.status, assignee: a.assignee, created_at: a.createdAt, resolved_at: a.resolvedAt, resolution: a.resolution,
}));
let workOrders: WorkOrder[] = biz.workOrders.map((w: any) => ({
	id: w.id, code: w.code, type: w.type, title: w.title, status: w.status, priority: w.priority,
	assignee: w.assignee, related_alarm: w.relatedAlarm, related_features: w.relatedFeatures || [],
	description: w.description, plan_start: w.planStart, plan_end: w.planEnd,
	actual_start: w.actualStart, actual_end: w.actualEnd, result: w.result, created_at: w.createdAt,
}));
let inspections: Inspection[] = biz.inspections.map((i: any) => ({
	id: i.id, code: i.code, name: i.name, type: i.type, inspector: i.inspector,
	route: i.route || [], status: i.status, plan_date: i.planDate,
	start_at: i.startAt, end_at: i.endAt, progress: i.progress, issue_count: i.issueCount,
}));
const sensors: Sensor[] = biz.sensors.map((s: any) => ({
	id: s.id, name: s.name, type: s.type, unit: s.unit,
	source_type: s.sourceType, source_id: s.sourceId, source_name: s.sourceName,
	baseline: s.baseline, amplitude: s.amplitude, period: s.period, threshold: s.threshold,
	alarm_type: s.alarmType, x: s.x, y: s.y, status: s.status, last_value: s.lastValue ?? null, last_ts: null,
}));

let currentUser: User | null = null;
const listeners = new Set<(payload: any) => void>();

/* ---------------- 工具 ---------------- */
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms + Math.random() * 90));
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;
const fmtTime = (t = Date.now()) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
const fmtDate = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const toRad = (d: number) => (d * Math.PI) / 180;

/** 球面距离（米） */
const distM = (a: number[], b: number[]) => {
	const R = 6371000;
	const dLat = toRad(b[1] - a[1]);
	const dLon = toRad(b[0] - a[0]);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const pointSegDistM = (pt: number[], a: number[], b: number[]) => {
	const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
	if (L2 === 0) return distM(pt, a);
	const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1])) / L2));
	return distM(pt, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
};

const ROLE_LEVEL: Record<string, number> = { viewer: 0, inspector: 1, operator: 2, admin: 3 };
const requireRole = (min: string) => {
	if (!currentUser) throw new Error("未登录或登录已过期");
	if (ROLE_LEVEL[currentUser.role] < ROLE_LEVEL[min]) throw new Error("当前账号无权执行此操作");
};
const err = (e: unknown) => { throw e instanceof Error ? e : new Error(String(e)); };

/* ---------------- 认证 ---------------- */
const login = async (username: string, password: string) => {
	await delay(200);
	const u = users.find((x) => x.username === username && x.password === password);
	if (!u) throw new Error("用户名或密码错误");
	currentUser = { id: u.id, username: u.username, name: u.name, role: u.role, dept: u.dept, phone: u.phone };
	return { token: `demo-token-${u.id}-${Date.now()}`, user: { ...currentUser } };
};
const me = async () => {
	await delay();
	if (!currentUser) throw new Error("未登录或登录已过期");
	return { user: { ...currentUser } };
};
const logout = () => { currentUser = null; };

/* ---------------- 要素 ---------------- */
const bboxOf = (geom: any) => {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	const walk = (c: any) => {
		if (typeof c[0] === "number") {
			minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]);
			miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]);
		} else c.forEach(walk);
	};
	walk(geom.coordinates);
	return { minx, miny, maxx, maxy };
};

const getFeatures = async (layer: LayerName, opts: { bbox?: string; type?: string; status?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<FeatureCollection> => {
	await delay();
	let list = store[layer];
	if (opts.bbox) {
		const [minx, miny, maxx, maxy] = opts.bbox.split(",").map(Number);
		list = list.filter((f) => {
			const { minx: b0, miny: b1, maxx: b2, maxy: b3 } = bboxOf(f.geometry);
			return b0 <= maxx && b2 >= minx && b1 <= maxy && b3 >= miny;
		});
	}
	if (opts.type && opts.type !== "all") list = list.filter((f) => f.properties.type === opts.type);
	if (opts.status && opts.status !== "all") list = list.filter((f) => f.properties.status === opts.status);
	if (opts.q) list = list.filter((f) => (f.properties.name || "").includes(opts.q!) || (f.properties.id || "").includes(opts.q!));
	const page = opts.page || 1;
	const pageSize = opts.pageSize || 500;
	return {
		type: "FeatureCollection",
		features: list.slice((page - 1) * pageSize, page * pageSize),
		total: list.length, page, pageSize,
	};
};
const createFeature = async (layer: LayerName, feature: GeoJSONFeature) => {
	await delay();
	requireRole("operator");
	if (store[layer].some((f) => f.properties.id === feature.properties.id)) throw new Error(`编号 ${feature.properties.id} 已存在`);
	store[layer].push(JSON.parse(JSON.stringify(feature)));
	return { id: feature.properties.id, message: "新增成功" };
};
const updateFeature = async (layer: LayerName, id: string, feature: GeoJSONFeature) => {
	await delay();
	requireRole("operator");
	const idx = store[layer].findIndex((f) => f.properties.id === id);
	if (idx < 0) throw new Error(`未找到要素 ${id}`);
	store[layer][idx] = JSON.parse(JSON.stringify(feature));
	return { id, message: "更新成功" };
};
const deleteFeature = async (layer: LayerName, id: string) => {
	await delay();
	requireRole("admin");
	const idx = store[layer].findIndex((f) => f.properties.id === id);
	if (idx < 0) throw new Error(`未找到要素 ${id}`);
	store[layer].splice(idx, 1);
	return { id, message: "删除成功" };
};
const search = async (q: string) => {
	await delay(30);
	if (!q.trim()) return { features: [] };
	const all = [...store.pipes, ...store.wells, ...store.pumps, ...store.buildings];
	const list = all.filter((f) => (f.properties.name || "").includes(q) || (f.properties.id || "").includes(q)).slice(0, 20);
	return { features: list };
};

/* ---------------- 统计 ---------------- */
const getStats = async (): Promise<OverviewStats> => {
	await delay();
	const pipes = store.pipes;
	const pipeLength = Math.round((pipes.reduce((s, f) => s + (f.properties.length || 0), 0) / 1000) * 10) / 10;
	const typeDist = Object.entries(pipes.reduce((a, f) => { a[f.properties.type || ""] = (a[f.properties.type || ""] || 0) + 1; return a; }, {} as Record<string, number>))
		.map(([name, value]) => ({ name, value }));
	const statusDist = Object.entries(pipes.reduce((a, f) => { a[f.properties.status || ""] = (a[f.properties.status || ""] || 0) + 1; return a; }, {} as Record<string, number>))
		.map(([name, value]) => ({ name, value }));
	const materialDist = Object.entries(pipes.reduce((a, f) => { a[f.properties.material || ""] = (a[f.properties.material || ""] || 0) + 1; return a; }, {} as Record<string, number>))
		.map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
	const days: string[] = [];
	for (let i = 6; i >= 0; i--) days.push(fmtDate(Date.now() - i * 86400000));
	const alarmTrend = days.map((day) => ({ day: day.slice(5), n: alarms.filter((a) => a.created_at.startsWith(day)).length }));
	return {
		pipeCount: pipes.length,
		pipeLength,
		wellCount: store.wells.length,
		pumpCount: store.pumps.length,
		buildingCount: store.buildings.length,
		typeDist, statusDist, materialDist,
		alarmStats: {
			pending: alarms.filter((a) => a.status === "pending").length,
			processing: alarms.filter((a) => a.status === "processing").length,
			today: alarms.filter((a) => a.created_at.startsWith(fmtDate())).length,
			total: alarms.length,
		},
		alarmTrend,
		workOrderStats: Object.entries(workOrders.reduce((a, w) => { a[w.status] = (a[w.status] || 0) + 1; return a; }, {} as Record<string, number>))
			.map(([name, value]) => ({ name, value })),
		inspectionStats: {
			total: inspections.length,
			doing: inspections.filter((i) => i.status === "进行中").length,
			done: inspections.filter((i) => i.status === "已完成").length,
		},
		sensorStats: { total: sensors.length, online: sensors.filter((s) => s.status === "online").length },
	};
};
const health = async () => ({ status: "ok", name: "smartpipe-demo", version: "1.0.0", uptime: 0, features: store.pipes.length + store.wells.length, time: new Date().toISOString() });

/* ---------------- 告警 ---------------- */
const getAlarms = async (opts: { status?: string; level?: string; type?: string; page?: number; pageSize?: number } = {}) => {
	await delay();
	let list = alarms;
	if (opts.status && opts.status !== "all") list = list.filter((a) => a.status === opts.status);
	if (opts.level && opts.level !== "all") list = list.filter((a) => a.level === opts.level);
	if (opts.type && opts.type !== "all") list = list.filter((a) => a.type === opts.type);
	list = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	const page = opts.page || 1;
	const pageSize = opts.pageSize || 10;
	return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
};
const processAlarm = async (id: string, action: "accept" | "resolve", resolution?: string) => {
	await delay();
	requireRole("inspector");
	const alarm = alarms.find((a) => a.id === id);
	if (!alarm) throw new Error("告警不存在");
	if (action === "accept") {
		if (alarm.status !== "pending") throw new Error("该告警已受理或已关闭");
		alarm.status = "processing";
		alarm.assignee = currentUser!.name;
	} else {
		if (alarm.status === "resolved") throw new Error("该告警已关闭");
		alarm.status = "resolved";
		alarm.resolved_at = fmtTime();
		alarm.resolution = resolution || "已现场核查并处置";
		alarm.assignee = alarm.assignee || currentUser!.name;
	}
	return { alarm: { ...alarm } };
};
const createAlarm = async (payload: Partial<Alarm>) => {
	await delay();
	requireRole("inspector");
	const alarm: Alarm = {
		id: uid("AL-MAN"), code: `ALM-MAN-${Date.now() % 1000000}`,
		type: payload.type || "其他", level: payload.level || "minor",
		title: payload.title || "手动上报", description: payload.description || "",
		source_type: "manual", source_id: null, source_name: null,
		status: "pending", assignee: null, created_at: fmtTime(), resolved_at: null, resolution: null,
	};
	alarms.unshift(alarm);
	return { alarm: { ...alarm } };
};

/* ---------------- 工单 ---------------- */
const WO_FLOW = ["待派单", "已派单", "处理中", "待验收", "已完成"];
const getWorkOrders = async (opts: { status?: string; type?: string; page?: number; pageSize?: number } = {}) => {
	await delay();
	let list = workOrders;
	if (opts.status && opts.status !== "all") list = list.filter((w) => w.status === opts.status);
	if (opts.type && opts.type !== "all") list = list.filter((w) => w.type === opts.type);
	list = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	const page = opts.page || 1;
	const pageSize = opts.pageSize || 10;
	return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
};
const createWorkOrder = async (payload: Partial<WorkOrder>) => {
	await delay();
	requireRole("operator");
	const wo: WorkOrder = {
		id: uid("WO"), code: `GD-${Date.now() % 1000000}`,
		type: payload.type || "维修", title: payload.title || "",
		status: "待派单", priority: payload.priority || "中",
		assignee: null, related_alarm: payload.related_alarm || null,
		related_features: payload.related_features || [],
		description: payload.description || "", plan_start: payload.plan_start || null,
		plan_end: payload.plan_end || null, actual_start: null, actual_end: null, result: null,
		created_at: fmtTime(),
	};
	workOrders.unshift(wo);
	return { workOrder: { ...wo } };
};
const updateWorkOrder = async (id: string, patch: Partial<WorkOrder> & { action?: string; result?: string }) => {
	await delay();
	requireRole("operator");
	const wo = workOrders.find((w) => w.id === id);
	if (!wo) throw new Error("工单不存在");
	if (patch.action) {
		const idx = WO_FLOW.indexOf(wo.status);
		let next: string | null = null;
		if (patch.action === "advance") next = idx >= 0 && idx < WO_FLOW.length - 1 ? WO_FLOW[idx + 1] : null;
		if (patch.action === "complete") next = "已完成";
		if (patch.action === "reject") next = "待派单";
		if (!next) throw new Error("当前状态无法执行该流转");
		wo.status = next as WorkOrder["status"];
		if (next === "已派单") wo.actual_start = fmtTime();
		if (next === "已完成") wo.actual_end = fmtTime();
		if (patch.result) wo.result = patch.result;
	}
	(["title", "priority", "assignee", "description", "plan_start", "plan_end"] as const).forEach((k) => {
		if (patch[k] !== undefined) (wo as any)[k] = patch[k];
	});
	return { workOrder: { ...wo } };
};

/* ---------------- 巡检 ---------------- */
const getInspections = async (opts: { status?: string; page?: number; pageSize?: number } = {}) => {
	await delay();
	let list = inspections;
	if (opts.status && opts.status !== "all") list = list.filter((i) => i.status === opts.status);
	list = [...list].sort((a, b) => (a.plan_date < b.plan_date ? 1 : -1));
	const page = opts.page || 1;
	const pageSize = opts.pageSize || 10;
	return { list: list.slice((page - 1) * pageSize, page * pageSize).map((i) => ({ ...i })), total: list.length, page, pageSize };
};
const getInspection = async (id: string) => {
	await delay(30);
	const i = inspections.find((x) => x.id === id);
	if (!i) throw new Error("巡检计划不存在");
	return { inspection: { ...i, route: [...i.route] } };
};
const createInspection = async (payload: Partial<Inspection>) => {
	await delay();
	requireRole("operator");
	if (!payload.name || !payload.plan_date) throw new Error("请填写计划名称与计划日期");
	const ins: Inspection = {
		id: uid("IN"), code: `XJ-${Date.now().toString(36).toUpperCase()}`,
		name: payload.name, type: payload.type || "日常巡检",
		inspector: payload.inspector || null,
		route: (payload.route || []).map((r, idx) => ({ ...r, order: idx + 1, status: r.status || "pending", issue: r.issue || null })),
		status: "未开始", plan_date: payload.plan_date, start_at: null, end_at: null, progress: 0, issue_count: 0,
	};
	inspections.unshift(ins);
	return { inspection: { ...ins } };
};
const startInspection = async (id: string) => {
	await delay();
	requireRole("inspector");
	const i = inspections.find((x) => x.id === id);
	if (!i) throw new Error("巡检计划不存在");
	if (i.status !== "未开始") throw new Error("该计划已开始或已完成");
	i.status = "进行中";
	i.start_at = fmtTime();
	return { inspection: { ...i } };
};
const reportInspection = async (id: string, payload: { wellId: string; status: string; issue?: string }) => {
	await delay();
	requireRole("inspector");
	const i = inspections.find((x) => x.id === id);
	if (!i) throw new Error("巡检计划不存在");
	const pt = i.route.find((r) => r.wellId === payload.wellId);
	if (!pt) throw new Error("点位不在该计划路线中");
	pt.status = payload.status as any;
	pt.issue = payload.issue || null;
	const done = i.route.filter((r) => r.status === "done").length;
	i.progress = Math.round((done / i.route.length) * 100);
	i.issue_count = i.route.filter((r) => r.issue).length;
	let alarm: Alarm | null = null;
	if (payload.issue && payload.status === "issue") {
		alarm = {
			id: uid("AL-INS"), code: `ALM-INS-${Date.now() % 1000000}`, type: "巡检发现", level: "minor",
			title: `巡检发现问题：${payload.wellId}`, description: `${i.name}巡检中发现 ${payload.wellId}：${payload.issue}`,
			source_type: "wells", source_id: payload.wellId, source_name: payload.wellId,
			status: "pending", assignee: null, created_at: fmtTime(), resolved_at: null, resolution: null,
		};
		alarms.unshift(alarm);
		emit({ type: "alarm", alarm: { ...alarm } });
	}
	return { inspection: { ...i }, alarm: alarm ? { ...alarm } : null };
};
const completeInspection = async (id: string) => {
	await delay();
	requireRole("inspector");
	const i = inspections.find((x) => x.id === id);
	if (!i) throw new Error("巡检计划不存在");
	if (i.status === "已完成") throw new Error("该计划已完成");
	i.status = "已完成";
	i.end_at = fmtTime();
	i.progress = 100;
	return { inspection: { ...i } };
};

/* ---------------- 传感器 ---------------- */
const telemetryHistory = new Map<string, { value: number; ts: number }[]>();
const getSensors = async () => {
	await delay(30);
	return { list: sensors.map((s) => ({ ...s })) };
};
const getSensorSeries = async (id: string, range: string) => {
	await delay(50);
	const s = sensors.find((x) => x.id === id);
	if (!s) throw new Error("传感器不存在");
	const span = range === "24h" ? 24 : range === "6h" ? 6 : 1;
	if (!telemetryHistory.has(id)) {
		// 惰性生成 24h 历史（5 分钟粒度，与后端一致）
		const phase = ((id.charCodeAt(id.length - 1) % 10) / 10) * Math.PI * 2;
		const series = [];
		for (let t = Date.now() - 24 * 3600 * 1000; t <= Date.now(); t += 5 * 60 * 1000) {
			series.push({ value: Math.round(simValue(s, t, phase) * 1000) / 1000, ts: t });
		}
		telemetryHistory.set(id, series);
	}
	const since = Date.now() - span * 3600 * 1000;
	return { sensor: s, series: telemetryHistory.get(id)!.filter((p) => p.ts >= since) };
};

/* ---------------- 遥测模拟（与后端同公式） ---------------- */
const simValue = (s: Sensor, t: number, phase: number) => {
	const h = new Date(t).getHours();
	const rainFactor = s.type === "level" && h >= 14 && h < 16 ? 1.9 : 1;
	const noise = (Math.sin(t * 0.0001 + phase) + Math.sin(t * 0.00023 + phase * 2) + Math.sin(t * 0.00047)) / 3;
	return Math.max(0, (s.baseline + s.amplitude * Math.sin((2 * Math.PI * t) / (s.period * 1000) + phase) + noise * s.amplitude * 0.25) * rainFactor);
};

const anomalies = new Map<string, { until: number; alarmId: string }>();
let telemetryTimer: ReturnType<typeof setInterval> | null = null;

export function startTelemetry() {
	if (telemetryTimer) return;
	telemetryTimer = setInterval(() => {
		const now = Date.now();
		const batch: any[] = [];
		const online = sensors.filter((s) => s.status === "online");

		// 全局异常注入（约 1~2 分钟一次）
		if (Math.random() < 0.05) {
			const target = online[Math.floor(Math.random() * online.length)];
			if (target && !anomalies.has(target.id)) {
				const until = now + (120 + Math.random() * 180) * 1000;
				const alarmId = uid("AL-SIM");
				const alarm: Alarm = {
					id: alarmId, code: `ALM-SIM-${Date.now() % 1000000}`,
					type: target.alarm_type, level: target.type === "gas" ? "critical" : "major",
					title: `${target.alarm_type}告警`, description: `${target.name}监测值异常，请核查`,
					source_type: "sensors", source_id: target.id, source_name: target.name,
					status: "pending", assignee: null, created_at: fmtTime(now), resolved_at: null, resolution: null,
				};
				alarms.unshift(alarm);
				anomalies.set(target.id, { until, alarmId });
				emit({ type: "alarm", alarm: { ...alarm } });
			}
		}

		online.forEach((s) => {
			let value = simValue(s, now, ((s.id.charCodeAt(s.id.length - 1) % 10) / 10) * Math.PI * 2);
			const anom = anomalies.get(s.id);
			if (anom && now > anom.until) {
				anomalies.delete(s.id);
				const alarm = alarms.find((a) => a.id === anom.alarmId);
				if (alarm && alarm.status !== "resolved") {
					alarm.status = "resolved";
					alarm.resolved_at = fmtTime();
					alarm.resolution = "监测值恢复正常，系统自动关闭告警";
					alarm.assignee = "系统";
					emit({ type: "alarm-update", alarm: { ...alarm } });
				}
			} else if (anom) {
				value = s.threshold * (1.25 + Math.random() * 0.4);
			}
			s.last_value = Math.round(value * 1000) / 1000;
			s.last_ts = now;
			batch.push({ sensorId: s.id, value: s.last_value, ts: now });
		});
		emit({ type: "telemetry", data: batch });
	}, 3000);
}

/* ---------------- 空间分析（与后端 spatial.js 同算法） ---------------- */
const buildNetwork = (type: string) => {
	const pipes = new Map<string, { start: string | undefined; end: string | undefined; feature: GeoJSONFeature }>();
	const wellPipes = new Map<string, Set<string>>();
	store.pipes.filter((f) => f.properties.type === type).forEach((f) => {
		const p = f.properties;
		pipes.set(p.id, { start: p.startWell, end: p.endWell, feature: f });
		(p.wells || [p.startWell, p.endWell]).filter((x): x is string => !!x).forEach((wid) => {
			if (!wellPipes.has(wid)) wellPipes.set(wid, new Set());
			wellPipes.get(wid)!.add(p.id);
		});
	});
	return { pipes, wellPipes };
};

const bufferQuery = async (payload: { geometry: any; radius: number; layers?: LayerName[] }) => {
	await delay(80);
	const { geometry, radius = 500, layers = ["pipes", "wells", "pumps", "buildings"] } = payload;
	const features: GeoJSONFeature[] = [];
	const geomDist = (geom: any, pt: number[]) => {
		const c = geom.coordinates;
		if (geom.type === "Point") return distM(c, pt);
		if (geom.type === "LineString") {
			let m = Infinity;
			for (let i = 1; i < c.length; i++) m = Math.min(m, pointSegDistM(pt, c[i - 1], c[i]));
			return m;
		}
		if (geom.type === "Polygon") return pointSegDistM(pt, c[0][0], c[0][2]);
		return Infinity;
	};
	layers.forEach((layer) => {
		store[layer].forEach((f) => {
			if (geomDist(f.geometry, geometry.coordinates) <= radius) features.push(f);
		});
	});
	return { type: "FeatureCollection", features, radius, layers };
};

const trace = async (payload: { pipeId: string; direction: "upstream" | "downstream" }): Promise<TraceResult> => {
	await delay(80);
	const { pipeId, direction } = payload;
	const target = store.pipes.find((f) => f.properties.id === pipeId);
	if (!target) throw new Error(`未找到管线 ${pipeId}`);
	const type = target.properties.type!;
	const net = buildNetwork(type);
	if (!net.pipes.has(pipeId)) throw new Error(`未找到管线 ${pipeId}`);
	const visited = new Set([pipeId]);
	const queue = [pipeId];
	const order = [pipeId];
	while (queue.length) {
		const pid = queue.shift()!;
		const { start, end } = net.pipes.get(pid)!;
		const fromWell = direction === "downstream" ? end : start;
		if (!fromWell) continue;
		for (const next of net.wellPipes.get(fromWell) || []) {
			if (visited.has(next)) continue;
			const np = net.pipes.get(next)!;
			const blocked = direction === "downstream" ? np.end === fromWell : np.start === fromWell;
			if (blocked) continue;
			visited.add(next);
			order.push(next);
			queue.push(next);
		}
	}
	const features = order.map((pid) => net.pipes.get(pid)!.feature);
	const totalLength = Math.round(features.reduce((s, f) => s + (f.properties.length || 0), 0));
	return { type, direction, pipeId, features: { type: "FeatureCollection", features }, order, totalLength };
};

const isolation = async (payload: { pipeId: string }): Promise<IsolationResult> => {
	await delay(100);
	const { pipeId } = payload;
	const burst = store.pipes.find((f) => f.properties.id === pipeId);
	if (!burst) throw new Error(`未找到管线 ${pipeId}`);
	const type = burst.properties.type!;
	const net = buildNetwork(type);
	const wellById = new Map(store.wells.map((f) => [f.properties.id, f] as const));
	const burstMid = burst.geometry.coordinates[Math.floor(burst.geometry.coordinates.length / 2)];

	const hasValves = type === "给水管" || type === "燃气管";
	const isValve = (wid: string) => wellById.get(wid)?.properties.type === "阀门井";
	const valves: IsolationResult["valvesToClose"] = [];
	const addValve = (wid: string, role: string) => {
		if (valves.some((v) => v.wellId === wid)) return;
		const w = wellById.get(wid);
		if (!w) return;
		valves.push({ wellId: wid, name: w.properties.name || wid, pt: w.geometry.coordinates, dist: Math.round(distM(burstMid, w.geometry.coordinates)), role });
	};

	// 爆管段自身：爆点两侧最近隔离点
	const burstWells = (burst.properties.wells || []).map((wid: string) => wellById.get(wid)).filter((x): x is GeoJSONFeature => !!x);
	if (burstWells.length) {
		const cum = [0];
		for (let i = 1; i < burstWells.length; i++) cum.push(cum[i - 1] + distM(burstWells[i - 1].geometry.coordinates, burstWells[i].geometry.coordinates));
		const burstCum = cum[cum.length - 1] / 2;
		let upValve: any = null, downValve: any = null;
		burstWells.forEach((w: any, i: number) => {
			if (cum[i] <= burstCum) upValve = w; else if (!downValve) downValve = w;
		});
		if (upValve) addValve(upValve.properties.id, hasValves ? "上游阀门" : "上游封堵点");
		if (downValve) addValve(downValve.properties.id, hasValves ? "下游阀门" : "下游封堵点");
	}

	// 从爆管两端扩展隔离区
	const visited = new Set([pipeId]);
	const queue = [{ pid: pipeId, depth: 0 }];
	while (queue.length) {
		const { pid, depth } = queue.shift()!;
		const { start, end } = net.pipes.get(pid)!;
		for (const wid of [start, end]) {
			if (!wid) continue;
			const stopHere = hasValves ? isValve(wid) && depth >= 1 : depth >= 3;
			if (stopHere) { addValve(wid, hasValves ? "隔离边界阀门" : "隔离边界封堵点"); continue; }
			for (const next of net.wellPipes.get(wid) || []) {
				if (visited.has(next)) continue;
				visited.add(next);
				queue.push({ pid: next, depth: depth + 1 });
			}
		}
	}

	const affectedFeatures = [...visited].map((pid) => net.pipes.get(pid)!.feature);
	const affectedLength = Math.round(affectedFeatures.reduce((s, f) => s + (f.properties.length || 0), 0));
	const affectedBuildings = store.buildings.filter((b) => {
		const g: any = b.geometry;
		const center = [((g.coordinates[0][0][0] + g.coordinates[0][2][0]) / 2), ((g.coordinates[0][0][1] + g.coordinates[0][2][1]) / 2)];
		return affectedFeatures.some((f) => {
			const c = f.geometry.coordinates;
			for (let i = 1; i < c.length; i++) if (pointSegDistM(center, c[i - 1], c[i]) < 120) return true;
			return false;
		});
	}).map((b) => ({ id: b.properties.id, name: b.properties.name || "", usage: b.properties.usage || "", households: b.properties.households || 0 }));
	const affectedHouseholds = affectedBuildings.reduce((s, b) => s + b.households, 0);
	const strategy = hasValves ? "关阀隔离" : "封堵隔离";
	const actionName = hasValves ? "阀门" : "封堵点";
	const steps = [
		`定位爆管位置：${burst.properties.name}（${pipeId}），${burst.properties.road || ""}，管径 DN${burst.properties.diameter}，材质 ${burst.properties.material}`,
		`调度抢修班组赶赴现场，同步联系交警部门对 ${burst.properties.road || "事发路段"} 实施交通疏导`,
		`按方案关闭${actionName} ${valves.map((v) => v.wellId).join("、") || "无（管网末端）"}，隔离爆管段`,
		hasValves ? "启动应急供水/导流预案，通知受影响小区物业与重点单位" : "启动应急导流与临时抽排预案，通知受影响小区物业与重点单位",
		"开挖修复受损管段，回填并恢复路面，逐步恢复管网运行",
		"恢复后开展水质监测与压力测试，确认无异常后关闭工单",
	];
	return {
		burstPipe: burst, strategy, valvesToClose: valves,
		affectedPipes: { type: "FeatureCollection", features: affectedFeatures },
		affectedPipeIds: [...visited], affectedLength, affectedBuildings, affectedHouseholds, steps,
	};
};

const profile = async (payload: { pipeId: string }): Promise<ProfileResult> => {
	await delay(80);
	const pipe = store.pipes.find((f) => f.properties.id === payload.pipeId);
	if (!pipe) throw new Error(`未找到管线 ${payload.pipeId}`);
	const wells = pipe.properties.wells || [pipe.properties.startWell, pipe.properties.endWell].filter(Boolean);
	const wellById = new Map(store.wells.map((f) => [f.properties.id, f] as const));
	let acc = 0;
	const points: ProfileResult["points"] = [];
	(wells as string[]).forEach((wid: string, i: number) => {
		const w = wellById.get(wid);
		if (!w) return;
		const pt = w.geometry.coordinates;
		if (i > 0) acc += distM(points[i - 1].pt, pt);
		const ground = w.properties.elevation ?? 24;
		points.push({ wellId: wid, pt, dist: Math.round(acc), ground, invert: +(ground - (pipe.properties.depth || 2)).toFixed(2), depth: pipe.properties.depth || 2 });
	});
	return { pipe: pipe.properties, diameter: pipe.properties.diameter || 0, totalLength: Math.round(acc), points };
};

/* ---------------- 用户管理 ---------------- */
const getUsers = async () => {
	await delay();
	requireRole("admin");
	return { list: users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, dept: u.dept, phone: u.phone })) };
};
const createUser = async (payload: Partial<User> & { password: string }) => {
	await delay();
	requireRole("admin");
	if (users.some((u) => u.username === payload.username)) throw new Error("用户名已存在");
	const u = { id: uid("U"), username: payload.username, password: payload.password, name: payload.name, role: payload.role, dept: payload.dept, phone: payload.phone };
	users.push(u);
	return { user: { id: u.id, username: u.username, name: u.name, role: u.role, dept: u.dept, phone: u.phone } };
};
const updateUser = async (id: string, patch: Partial<User> & { password?: string }) => {
	await delay();
	requireRole("admin");
	const u = users.find((x) => x.id === id);
	if (!u) throw new Error("用户不存在");
	if (patch.password) u.password = patch.password;
	(["name", "role", "dept", "phone"] as const).forEach((k) => { if (patch[k] !== undefined) u[k] = patch[k]; });
	return { user: { id: u.id, username: u.username, name: u.name, role: u.role, dept: u.dept, phone: u.phone } };
};
const deleteUser = async (id: string) => {
	await delay();
	requireRole("admin");
	if (currentUser!.id === id) throw new Error("不能删除当前登录账号");
	const idx = users.findIndex((u) => u.id === id);
	if (idx < 0) throw new Error("用户不存在");
	const u = users.splice(idx, 1)[0];
	return { id, message: `用户 ${u.name} 已删除` };
};

/* ---------------- 事件 ---------------- */
const emit = (payload: any) => listeners.forEach((cb) => cb(payload));
const onEvent = (cb: (payload: any) => void) => {
	listeners.add(cb);
	return () => listeners.delete(cb);
};

/** 演示模式引擎导出的 API 服务（与后端契约一致） */
export const mockApi = {
	mode: "demo" as const,
	login, me, logout,
	getFeatures, createFeature, updateFeature, deleteFeature, search,
	getStats, health,
	getAlarms, processAlarm, createAlarm,
	getWorkOrders, createWorkOrder, updateWorkOrder,
	getInspections, getInspection, createInspection, startInspection, reportInspection, completeInspection,
	getSensors, getSensorSeries,
	buffer: bufferQuery, trace, isolation, profile,
	getUsers, createUser, updateUser, deleteUser,
	onEvent,
	startTelemetry,
};
