/**
 * 统一 API 门面：在线模式（后端 REST + WebSocket）与演示模式（浏览器内存引擎）
 * ============================================================
 * 模式判定：启动时探测 {API_BASE}/overview/health
 *  - 探测成功 → online（虚拟机全栈部署）
 *  - 探测失败 / API_BASE 为空 → demo（GitHub Pages 纯前端，零后端依赖）
 */
import { http, probeHealth, connectWS } from "./http";
import { mockApi } from "./mockEngine";
import type {
	Alarm, FeatureCollection, GeoJSONFeature, Inspection, IsolationResult,
	LayerName, OverviewStats, ProfileResult, Sensor, TraceResult, User, WorkOrder,
} from "../types";

export type ApiMode = "online" | "demo";

let mode: ApiMode = "demo";
let wsClose: (() => void) | null = null;
let eventCb: ((payload: any) => void) | null = null;
let wsStatusCb: ((ok: boolean) => void) | null = null;

/** 应用启动时调用：探测后端并选择模式 */
export async function initApi(onWsStatus?: (ok: boolean) => void): Promise<ApiMode> {
	wsStatusCb = onWsStatus || null;
	mode = (await probeHealth()) ? "online" : "demo";
	if (mode === "demo") {
		mockApi.startTelemetry();
		onWsStatus?.(true); // 演示模式视为"实时通道可用"
	} else {
		wsClose = connectWS(
			(msg) => eventCb?.(msg),
			(ok) => onWsStatus?.(ok),
		);
	}
	return mode;
}

export const getMode = () => mode;

/** 订阅实时事件（遥测/告警），返回取消订阅函数 */
export function onRealtimeEvent(cb: (payload: any) => void): () => void {
	if (mode === "demo") return mockApi.onEvent(cb);
	eventCb = cb;
	return () => { eventCb = null; };
}

/* ---------------- 认证 ---------------- */
export const apiAuth = {
	login: (username: string, password: string): Promise<{ token: string; user: User }> =>
		mode === "online" ? http("POST", "/auth/login", { username, password }) : mockApi.login(username, password),
	me: () => (mode === "online" ? http("GET", "/auth/me") : mockApi.me()),
	logout: () => { if (mode === "demo") mockApi.logout(); },
};

/* ---------------- 要素 ---------------- */
export interface FeatureQuery {
	bbox?: string; type?: string; status?: string; q?: string; page?: number; pageSize?: number;
}
export const apiFeatures = {
	get: (layer: LayerName, opts: FeatureQuery = {}): Promise<FeatureCollection> =>
		mode === "online"
			? http("GET", `/features/${layer}?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`)
			: mockApi.getFeatures(layer, opts),
	create: (layer: LayerName, feature: GeoJSONFeature) =>
		mode === "online" ? http("POST", `/features/${layer}`, feature) : mockApi.createFeature(layer, feature),
	update: (layer: LayerName, id: string, feature: GeoJSONFeature) =>
		mode === "online" ? http("PUT", `/features/${layer}/${id}`, feature) : mockApi.updateFeature(layer, id, feature),
	remove: (layer: LayerName, id: string) =>
		mode === "online" ? http("DELETE", `/features/${layer}/${id}`) : mockApi.deleteFeature(layer, id),
	search: (q: string): Promise<{ features: GeoJSONFeature[] }> =>
		mode === "online" ? http("GET", `/features/search/all?q=${encodeURIComponent(q)}`) : mockApi.search(q),
};

/* ---------------- 统计 ---------------- */
export const apiOverview = {
	stats: (): Promise<OverviewStats> => (mode === "online" ? http("GET", "/overview/stats") : mockApi.getStats()),
	health: () => (mode === "online" ? http("GET", "/overview/health") : mockApi.health()),
};

/* ---------------- 告警 ---------------- */
export const apiAlarms = {
	get: (opts: { status?: string; level?: string; type?: string; page?: number; pageSize?: number } = {}) =>
		mode === "online"
			? http("GET", `/alarms?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`)
			: mockApi.getAlarms(opts),
	process: (id: string, action: "accept" | "resolve", resolution?: string): Promise<{ alarm: Alarm }> =>
		mode === "online" ? http("POST", `/alarms/${id}/process`, { action, resolution }) : mockApi.processAlarm(id, action, resolution),
	create: (payload: Partial<Alarm>): Promise<{ alarm: Alarm }> =>
		mode === "online" ? http("POST", "/alarms", payload) : mockApi.createAlarm(payload),
};

/* ---------------- 工单 ---------------- */
export const apiWorkOrders = {
	get: (opts: { status?: string; type?: string; page?: number; pageSize?: number } = {}) =>
		mode === "online"
			? http("GET", `/workorders?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`)
			: mockApi.getWorkOrders(opts),
	create: (payload: Partial<WorkOrder>) =>
		mode === "online" ? http("POST", "/workorders", payload) : mockApi.createWorkOrder(payload),
	update: (id: string, patch: Partial<WorkOrder> & { action?: string; result?: string }) =>
		mode === "online" ? http("PUT", `/workorders/${id}`, patch) : mockApi.updateWorkOrder(id, patch),
};

/* ---------------- 巡检 ---------------- */
export const apiInspections = {
	get: (opts: { status?: string; page?: number; pageSize?: number } = {}) =>
		mode === "online"
			? http("GET", `/inspections?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`)
			: mockApi.getInspections(opts),
	getOne: (id: string): Promise<{ inspection: Inspection }> =>
		mode === "online" ? http("GET", `/inspections/${id}`) : mockApi.getInspection(id),
	create: (payload: Partial<Inspection>) =>
		mode === "online" ? http("POST", "/inspections", payload) : mockApi.createInspection(payload),
	start: (id: string) => (mode === "online" ? http("POST", `/inspections/${id}/start`) : mockApi.startInspection(id)),
	report: (id: string, payload: { wellId: string; status: string; issue?: string }) =>
		mode === "online" ? http("POST", `/inspections/${id}/report`, payload) : mockApi.reportInspection(id, payload),
	complete: (id: string) => (mode === "online" ? http("POST", `/inspections/${id}/complete`) : mockApi.completeInspection(id)),
};

/* ---------------- 传感器 ---------------- */
export const apiSensors = {
	get: (): Promise<{ list: Sensor[] }> => (mode === "online" ? http("GET", "/sensors") : mockApi.getSensors()),
	series: (id: string, range: string): Promise<{ sensor: Sensor; series: { value: number; ts: number }[] }> =>
		mode === "online" ? http("GET", `/sensors/${id}/series?range=${range}`) : mockApi.getSensorSeries(id, range),
};

/* ---------------- 管网分析 ---------------- */
export const apiAnalysis = {
	buffer: (payload: { geometry: any; radius: number; layers?: LayerName[] }) =>
		mode === "online" ? http("POST", "/analysis/buffer", payload) : mockApi.buffer(payload),
	trace: (pipeId: string, direction: "upstream" | "downstream"): Promise<TraceResult> =>
		mode === "online" ? http("POST", "/analysis/trace", { pipeId, direction }) : mockApi.trace({ pipeId, direction }),
	isolation: (pipeId: string): Promise<IsolationResult> =>
		mode === "online" ? http("POST", "/analysis/isolation", { pipeId }) : mockApi.isolation({ pipeId }),
	profile: (pipeId: string): Promise<ProfileResult> =>
		mode === "online" ? http("POST", "/analysis/profile", { pipeId }) : mockApi.profile({ pipeId }),
};

/* ---------------- 用户管理 ---------------- */
export const apiUsers = {
	get: (): Promise<{ list: User[] }> => (mode === "online" ? http("GET", "/users") : mockApi.getUsers()),
	create: (payload: Partial<User> & { password: string }) =>
		mode === "online" ? http("POST", "/users", payload) : mockApi.createUser(payload),
	update: (id: string, patch: Partial<User> & { password?: string }) =>
		mode === "online" ? http("PUT", `/users/${id}`, patch) : mockApi.updateUser(id, patch),
	remove: (id: string) => (mode === "online" ? http("DELETE", `/users/${id}`) : mockApi.deleteUser(id)),
};

export { mockApi };
