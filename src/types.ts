/** 全局共享类型定义（与后端 API 契约一致） */

export type LayerName = "pipes" | "wells" | "pumps" | "buildings";
export type FeatureStatus = "normal" | "maintenance" | "fault";
export type PipeType = "污水管" | "雨水管" | "给水管" | "燃气管" | "热力管";

export interface FeatureProperties {
	id: string;
	name?: string;
	type?: string;
	status?: FeatureStatus | string;
	diameter?: number;
	depth?: number;
	length?: number;
	material?: string;
	installYear?: number;
	road?: string;
	usage?: string;
	maintainUnit?: string;
	startWell?: string;
	endWell?: string;
	wells?: string[];
	capacity?: string;
	power?: string;
	subType?: string;
	runtimeHours?: number;
	area?: number;
	floors?: number;
	households?: number;
	usage_type?: string;
	address?: string;
	elevation?: number;
	pipeType?: string;
	[key: string]: unknown;
}

export interface GeoJSONFeature {
	type: "Feature";
	properties: FeatureProperties;
	geometry: {
		type: "Point" | "LineString" | "Polygon" | "MultiLineString";
		coordinates: number[] | number[][] | number[][][] | any;
	};
}

export interface FeatureCollection {
	type: "FeatureCollection";
	features: GeoJSONFeature[];
	total?: number;
	page?: number;
	pageSize?: number;
}

export interface User {
	id: string;
	username: string;
	name: string;
	role: "admin" | "operator" | "inspector" | "viewer";
	dept?: string;
	phone?: string;
}

export interface Alarm {
	id: string;
	code: string;
	type: string;
	level: "critical" | "major" | "minor" | "warning";
	title: string;
	description: string;
	source_type: string;
	source_id: string | null;
	source_name: string | null;
	status: "pending" | "processing" | "resolved";
	assignee: string | null;
	created_at: string;
	resolved_at: string | null;
	resolution: string | null;
}

export interface WorkOrder {
	id: string;
	code: string;
	type: string;
	title: string;
	status: "待派单" | "已派单" | "处理中" | "待验收" | "已完成";
	priority: string;
	assignee: string | null;
	related_alarm: string | null;
	related_features: { layer: string; id: string; name: string }[];
	description: string;
	plan_start: string | null;
	plan_end: string | null;
	actual_start: string | null;
	actual_end: string | null;
	result: string | null;
	created_at: string;
}

export interface InspectionPoint {
	wellId: string;
	name: string;
	order: number;
	pt?: [number, number];
	status: "pending" | "done" | "issue";
	issue: string | null;
}

export interface Inspection {
	id: string;
	code: string;
	name: string;
	type: string;
	inspector: string | null;
	route: InspectionPoint[];
	status: "未开始" | "进行中" | "已完成";
	plan_date: string;
	start_at: string | null;
	end_at: string | null;
	progress: number;
	issue_count: number;
}

export interface Sensor {
	id: string;
	name: string;
	type: "flow" | "pressure" | "level" | "gas";
	unit: string;
	source_type: string;
	source_id: string;
	source_name: string;
	baseline: number;
	amplitude: number;
	period: number;
	threshold: number;
	alarm_type: string;
	x: number;
	y: number;
	status: string;
	last_value: number | null;
	last_ts: number | null;
}

export interface TelemetryPoint {
	sensorId: string;
	value: number;
	ts: number;
}

export interface OverviewStats {
	pipeCount: number;
	pipeLength: number;
	wellCount: number;
	pumpCount: number;
	buildingCount: number;
	typeDist: { name: string; value: number }[];
	statusDist: { name: string; value: number }[];
	materialDist: { name: string; value: number }[];
	alarmStats: { pending: number; processing: number; today: number; total: number };
	alarmTrend: { day: string; n: number }[];
	workOrderStats: { name: string; value: number }[];
	inspectionStats: { total: number; doing: number; done: number };
	sensorStats: { total: number; online: number };
}

export interface TraceResult {
	type: string;
	direction: "upstream" | "downstream";
	pipeId: string;
	features: FeatureCollection;
	order: string[];
	totalLength: number;
}

export interface IsolationResult {
	burstPipe: GeoJSONFeature;
	strategy: string;
	valvesToClose: { wellId: string; name: string; pt: number[]; dist: number; role: string }[];
	affectedPipes: FeatureCollection;
	affectedPipeIds: string[];
	affectedLength: number;
	affectedBuildings: { id: string; name: string; usage: string; households: number }[];
	affectedHouseholds: number;
	steps: string[];
}

export interface ProfileResult {
	pipe: FeatureProperties;
	diameter: number;
	totalLength: number;
	points: { wellId: string; pt: number[]; dist: number; ground: number; invert: number; depth: number }[];
}

export const ROLE_LABELS: Record<string, string> = {
	admin: "系统管理员",
	operator: "调度员",
	inspector: "巡检员",
	viewer: "浏览用户",
};

export const ALARM_LEVEL_LABELS: Record<string, string> = {
	critical: "紧急",
	major: "重要",
	minor: "一般",
	warning: "提示",
};

export const ALARM_STATUS_LABELS: Record<string, string> = {
	pending: "待处理",
	processing: "处理中",
	resolved: "已关闭",
};

export const STATUS_LABELS: Record<string, string> = {
	normal: "正常",
	maintenance: "维修中",
	fault: "故障",
};

/** 管线类型色板（通过 CVD 色觉障碍验证，地图与图表共用保证图例一致） */
export const PIPE_COLORS: Record<string, string> = {
	污水管: "#c25a10",
	雨水管: "#2878b8",
	给水管: "#3a9c3f",
	燃气管: "#c0392b",
	热力管: "#7d3fa5",
};

export const SENSOR_TYPE_LABELS: Record<string, string> = {
	flow: "流量计",
	pressure: "压力计",
	level: "液位计",
	gas: "燃气泄漏检测",
};
