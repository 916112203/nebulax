/**
 * 统一 API 服务（纯后端模式）
 * ============================================================
 * 前端强依赖后端服务（REST + WebSocket）：
 * 后端不可用时应用启动即拦截并显示错误页，不再回退任何本地模式。
 */
import { http } from "./http";
import type {
	Alarm, FeatureCollection, GeoJSONFeature, Inspection, IsolationResult,
	LayerName, OverviewStats, ProfileResult, Sensor, TraceResult, User, WorkOrder,
} from "../types";

/* ---------------- 认证 ---------------- */
export const apiAuth = {
	login: (username: string, password: string): Promise<{ token: string; user: User }> =>
		http("POST", "/auth/login", { username, password }),
	me: () => http("GET", "/auth/me"),
	logout: () => {},
};

/* ---------------- 要素 ---------------- */
export interface FeatureQuery {
	bbox?: string; type?: string; status?: string; q?: string; page?: number; pageSize?: number;
}
const qs = (opts: object) =>
	new URLSearchParams(
		Object.entries(opts as Record<string, unknown>)
			.filter(([, v]) => v !== undefined && v !== "")
			.map(([k, v]) => [k, String(v)]),
	).toString();

export const apiFeatures = {
	get: (layer: LayerName, opts: FeatureQuery = {}): Promise<FeatureCollection> =>
		http("GET", `/features/${layer}?${qs(opts)}`),
	create: (layer: LayerName, feature: GeoJSONFeature) =>
		http("POST", `/features/${layer}`, feature),
	update: (layer: LayerName, id: string, feature: GeoJSONFeature) =>
		http("PUT", `/features/${layer}/${id}`, feature),
	remove: (layer: LayerName, id: string) =>
		http("DELETE", `/features/${layer}/${id}`),
	search: (q: string): Promise<{ features: GeoJSONFeature[] }> =>
		http("GET", `/features/search/all?q=${encodeURIComponent(q)}`),
};

/* ---------------- 统计 ---------------- */
export const apiOverview = {
	stats: (): Promise<OverviewStats> => http("GET", "/overview/stats"),
	health: () => http("GET", "/overview/health"),
};

/* ---------------- 告警 ---------------- */
export const apiAlarms = {
	get: (opts: { status?: string; level?: string; type?: string; page?: number; pageSize?: number } = {}) =>
		http("GET", `/alarms?${qs(opts)}`),
	process: (id: string, action: "accept" | "resolve", resolution?: string): Promise<{ alarm: Alarm }> =>
		http("POST", `/alarms/${id}/process`, { action, resolution }),
	create: (payload: Partial<Alarm>): Promise<{ alarm: Alarm }> =>
		http("POST", "/alarms", payload),
};

/* ---------------- 工单 ---------------- */
export const apiWorkOrders = {
	get: (opts: { status?: string; type?: string; page?: number; pageSize?: number } = {}) =>
		http("GET", `/workorders?${qs(opts)}`),
	create: (payload: Partial<WorkOrder>) =>
		http("POST", "/workorders", payload),
	update: (id: string, patch: Partial<WorkOrder> & { action?: string; result?: string }) =>
		http("PUT", `/workorders/${id}`, patch),
};

/* ---------------- 巡检 ---------------- */
export const apiInspections = {
	get: (opts: { status?: string; page?: number; pageSize?: number } = {}) =>
		http("GET", `/inspections?${qs(opts)}`),
	getOne: (id: string): Promise<{ inspection: Inspection }> =>
		http("GET", `/inspections/${id}`),
	create: (payload: Partial<Inspection>) =>
		http("POST", "/inspections", payload),
	start: (id: string) => http("POST", `/inspections/${id}/start`),
	report: (id: string, payload: { wellId: string; status: string; issue?: string }) =>
		http("POST", `/inspections/${id}/report`, payload),
	complete: (id: string) => http("POST", `/inspections/${id}/complete`),
};

/* ---------------- 传感器 ---------------- */
export const apiSensors = {
	get: (): Promise<{ list: Sensor[] }> => http("GET", "/sensors"),
	series: (id: string, range: string): Promise<{ sensor: Sensor; series: { value: number; ts: number }[] }> =>
		http("GET", `/sensors/${id}/series?range=${range}`),
};

/* ---------------- 管网分析 ---------------- */
export const apiAnalysis = {
	buffer: (payload: { geometry: any; radius: number; layers?: LayerName[] }) =>
		http("POST", "/analysis/buffer", payload),
	trace: (pipeId: string, direction: "upstream" | "downstream"): Promise<TraceResult> =>
		http("POST", "/analysis/trace", { pipeId, direction }),
	isolation: (pipeId: string): Promise<IsolationResult> =>
		http("POST", "/analysis/isolation", { pipeId }),
	profile: (pipeId: string): Promise<ProfileResult> =>
		http("POST", "/analysis/profile", { pipeId }),
};

/* ---------------- 用户管理 ---------------- */
export const apiUsers = {
	get: (): Promise<{ list: User[] }> => http("GET", "/users"),
	create: (payload: Partial<User> & { password: string }) =>
		http("POST", "/users", payload),
	update: (id: string, patch: Partial<User> & { password?: string }) =>
		http("PUT", `/users/${id}`, patch),
	remove: (id: string) => http("DELETE", `/users/${id}`),
};
