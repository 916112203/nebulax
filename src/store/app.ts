/**
 * 应用全局状态：运行模式（在线/演示）、实时通道状态、遥测数据缓冲
 */
import { reactive } from "vue";
import { getMode, onRealtimeEvent, type ApiMode } from "../api";
import type { Alarm, Sensor, TelemetryPoint } from "../types";

const state = reactive({
	mode: "demo" as ApiMode,
	wsOnline: false,
	/** 各传感器最新值 */
	latest: new Map<string, number>(),
	latestTs: 0,
	/** 传感器清单（含阈值，供实时面板使用） */
	sensors: [] as Sensor[],
	/** 最新告警事件（供弹窗提醒） */
	lastAlarmEvent: null as Alarm | null,
	/** 实时事件广播（组件可通过 onRealtimeEvent 订阅） */
	telemetryTick: 0,
});

let lastAlarmId = "";

/** 初始化实时通道：订阅遥测与告警事件 */
export function initRealtime(onWsStatus?: (ok: boolean) => void) {
	return onRealtimeEvent((payload: any) => {
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
	});
}

export const appStore = {
	state,
	getMode,
	/** 记录告警提醒去重（同一告警只提醒一次） */
	shouldNotifyAlarm(alarm: Alarm): boolean {
		if (alarm.id === lastAlarmId) return false;
		lastAlarmId = alarm.id;
		return true;
	},
};
