/**
 * 应用全局状态：实时通道状态、遥测数据缓冲
 */
import { reactive } from "vue";
import { connectWS } from "../api/http";
import type { Alarm, Sensor, TelemetryPoint } from "../types";

const state = reactive({
	wsOnline: false,
	/** 各传感器最新值 */
	latest: new Map<string, number>(),
	latestTs: 0,
	/** 传感器清单（含阈值，供实时面板使用） */
	sensors: [] as Sensor[],
	/** 最新告警事件（供弹窗提醒） */
	lastAlarmEvent: null as Alarm | null,
	/** 实时事件广播（组件可通过订阅刷新） */
	telemetryTick: 0,
});

let wsCloseFn: (() => void) | null = null;

/** 初始化实时通道：订阅遥测与告警事件 */
export function initRealtime(onWsStatus?: (ok: boolean) => void) {
	wsCloseFn = connectWS((payload: any) => {
		if (payload.type === "telemetry") {
			(payload.data as TelemetryPoint[]).forEach((p) => state.latest.set(p.sensorId, p.value));
			state.latestTs = Date.now();
			state.telemetryTick++;
		} else if (payload.type === "alarm") {
			state.lastAlarmEvent = payload.alarm;
			// 触发全局告警弹窗（LayoutView 监听）
			window.dispatchEvent(new CustomEvent("sp-alarm", { detail: payload.alarm }));
		} else if (payload.type === "alarm-update") {
			state.lastAlarmEvent = payload.alarm;
			window.dispatchEvent(new CustomEvent("sp-alarm-update", { detail: payload.alarm }));
		}
	}, (ok) => {
		state.wsOnline = ok;
		onWsStatus?.(ok);
	});
	return () => wsCloseFn?.();
}

export const appStore = {
	state,
};
