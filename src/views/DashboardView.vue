<template>
	<div class="sp-page dashboard">
		<!-- KPI 指标卡 -->
		<div class="sp-stat-grid">
			<div v-for="card in statCards" :key="card.label" class="sp-stat-card">
				<div class="sp-stat-icon" :style="{ background: card.color }">
					<el-icon><component :is="card.icon" /></el-icon>
				</div>
				<div>
					<div class="sp-stat-value">{{ card.value }}<span class="stat-unit">{{ card.unit }}</span></div>
					<div class="sp-stat-label">{{ card.label }}</div>
				</div>
			</div>
		</div>

		<!-- 图表区 -->
		<el-row :gutter="14" style="margin-top: 14px">
			<el-col :span="16">
				<div class="sp-card">
					<div class="sp-card-header">近 7 天告警趋势</div>
					<div class="sp-card-body"><div id="chart-trend" style="height: 260px" /></div>
				</div>
			</el-col>
			<el-col :span="8">
				<div class="sp-card">
					<div class="sp-card-header">管线类型分布</div>
					<div class="sp-card-body"><div id="chart-type" style="height: 260px" /></div>
				</div>
			</el-col>
		</el-row>

		<el-row :gutter="14" style="margin-top: 14px">
			<el-col :span="8">
				<div class="sp-card">
					<div class="sp-card-header">管线状态分布</div>
					<div class="sp-card-body"><div id="chart-status" style="height: 240px" /></div>
				</div>
			</el-col>
			<el-col :span="8">
				<div class="sp-card">
					<div class="sp-card-header">工单状态统计</div>
					<div class="sp-card-body"><div id="chart-wo" style="height: 240px" /></div>
				</div>
			</el-col>
			<el-col :span="8">
				<div class="sp-card">
					<div class="sp-card-header">管线材质分布（TOP6）</div>
					<div class="sp-card-body"><div id="chart-material" style="height: 240px" /></div>
				</div>
			</el-col>
		</el-row>

		<!-- 实时监测 -->
		<div class="sp-card" style="margin-top: 14px">
			<div class="sp-card-header">
				实时监测
				<div class="tele-controls">
					<el-select v-model="teleSensorId" size="small" style="width: 260px" @change="loadTelemetrySeries">
						<el-option v-for="s in sensors" :key="s.id" :label="`${s.name}（${s.type === 'flow' ? '流量' : s.type === 'pressure' ? '压力' : s.type === 'level' ? '液位' : '燃气'}）`" :value="s.id" />
					</el-select>
					<el-radio-group v-model="teleRange" size="small" @change="loadTelemetrySeries">
						<el-radio-button value="1h">1 小时</el-radio-button>
						<el-radio-button value="6h">6 小时</el-radio-button>
						<el-radio-button value="24h">24 小时</el-radio-button>
					</el-radio-group>
					<span class="tele-live">
						<span class="sp-dot" :style="{ background: appStore.state.wsOnline ? '#52c41a' : '#faad14' }" />
						{{ appStore.state.wsOnline ? "实时数据流" : "历史数据" }}
					</span>
				</div>
			</div>
			<div class="sp-card-body">
				<div id="chart-telemetry" style="height: 240px" />
			</div>
		</div>

		<!-- 待处理告警预览 -->
		<div class="sp-card" style="margin-top: 14px">
			<div class="sp-card-header">
				待处理告警
				<el-button size="small" text type="primary" @click="$router.push('/alarms')">进入告警中心 →</el-button>
			</div>
			<div class="sp-card-body" style="padding-top: 6px">
				<el-table :data="pendingAlarms" size="small" empty-text="暂无待处理告警">
					<el-table-column label="级别" width="80">
						<template #default="{ row }">
							<el-tag :type="levelTagType(row.level)" size="small">{{ levelLabel(row.level) }}</el-tag>
						</template>
					</el-table-column>
					<el-table-column prop="title" label="标题" width="180" show-overflow-tooltip />
					<el-table-column prop="source_name" label="告警来源" show-overflow-tooltip />
					<el-table-column prop="description" label="描述" show-overflow-tooltip />
					<el-table-column prop="created_at" label="发生时间" width="150" />
					<el-table-column label="操作" width="90">
						<template #default="{ row }">
							<el-button size="small" type="primary" link @click="locateAlarm(row)">定位</el-button>
						</template>
					</el-table-column>
				</el-table>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import * as echarts from "echarts";
import { apiOverview, apiAlarms, apiSensors } from "../api";
import { appStore } from "../store/app";
import { ALARM_LEVEL_LABELS, PIPE_COLORS, SENSOR_TYPE_LABELS, STATUS_LABELS } from "../types";
import type { Alarm, OverviewStats, Sensor } from "../types";

/* dataviz 规范：状态色固定用于状态语义，分类色与地图图例一致 */
const STATUS_COLORS: Record<string, string> = { normal: "#52c41a", maintenance: "#faad14", fault: "#f5222d" };
const AXIS_STYLE = { axisLine: { lineStyle: { color: "#c9d4e0" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } };

export default defineComponent({
	name: "DashboardView",
	setup() {
		const router = useRouter();
		const stats = ref<OverviewStats | null>(null);
		const pendingAlarms = ref<Alarm[]>([]);
		const sensors = ref<Sensor[]>([]);
		const teleSensorId = ref("");
		const teleRange = ref("1h");
		let charts: Record<string, echarts.ECharts> = {};
		let refreshTimer: ReturnType<typeof setInterval> | null = null;

		const statCards = computed(() => {
			const s = stats.value;
			if (!s) return [];
			const inspectionRate = s.inspectionStats.total ? Math.round((s.inspectionStats.done / s.inspectionStats.total) * 100) : 0;
			return [
				{ label: "管网总长度", value: s.pipeLength.toLocaleString(), unit: "km", color: "#2878b8", icon: "Share" },
				{ label: "管线总数", value: String(s.pipeCount), unit: "条", color: "#3a9c3f", icon: "Connection" },
				{ label: "检查井数量", value: String(s.wellCount), unit: "座", color: "#7d3fa5", icon: "Coin" },
				{ label: "泵站数量", value: String(s.pumpCount), unit: "座", color: "#13c2c2", icon: "Odometer" },
				{ label: "建筑数量", value: String(s.buildingCount), unit: "栋", color: "#7265e6", icon: "OfficeBuilding" },
				{ label: "今日告警", value: String(s.alarmStats.today), unit: "条", color: "#fa8c16", icon: "Bell" },
				{ label: "待处理告警", value: String(s.alarmStats.pending + s.alarmStats.processing), unit: "条", color: "#f5222d", icon: "Warning" },
				{ label: "传感器在线", value: `${s.sensorStats.online}/${s.sensorStats.total}`, unit: "", color: "#52c41a", icon: "Monitor" },
			];
		});

		const levelTagType = (l: string) => (l === "critical" ? "danger" : l === "major" ? "warning" : l === "minor" ? "primary" : "info");
		const levelLabel = (l: string) => ALARM_LEVEL_LABELS[l] || l;

		const loadStats = async () => {
			try {
				stats.value = await apiOverview.stats();
			} catch { /* 忽略刷新失败 */ }
		};
		const loadAlarms = async () => {
			try {
				const { list } = await apiAlarms.get({ status: "pending", pageSize: 8 });
				pendingAlarms.value = list;
			} catch { /* 忽略 */ }
		};
		const loadSensors = async () => {
			const { list } = await apiSensors.get();
			sensors.value = list;
			if (list.length && !teleSensorId.value) {
				teleSensorId.value = list[0].id;
				await loadTelemetrySeries();
			}
		};
		const locateAlarm = (alarm: Alarm) => {
			if (!alarm.source_id || alarm.source_type === "sensors" || alarm.source_type === "manual") {
				router.push("/alarms");
				return;
			}
			router.push({ path: "/map", query: { locate: alarm.source_id, layer: alarm.source_type } });
		};

		/* ---------- 图表渲染 ---------- */
		const initChart = (id: string) => {
			if (!charts[id]) charts[id] = echarts.init(document.getElementById(id) as HTMLElement);
			return charts[id];
		};
		const renderTrend = () => {
			const d = stats.value;
			if (!d) return;
			const chart = initChart("chart-trend");
			const total = d.alarmTrend.reduce((s, x) => s + x.n, 0);
			chart.setOption({
				tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
				grid: { left: 40, right: 20, top: 24, bottom: 28 },
				xAxis: { type: "category", data: d.alarmTrend.map((x) => x.day), ...AXIS_STYLE, axisTick: { show: false } },
				yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#edf1f6" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } },
				series: [{
					name: "告警数", type: "line", data: d.alarmTrend.map((x) => x.n),
					symbol: "circle", symbolSize: 7,
					lineStyle: { width: 2, color: "#c25a10" },
					itemStyle: { color: "#c25a10", borderColor: "#fff", borderWidth: 1.5 },
					areaStyle: { color: "rgba(194,90,16,0.10)" },
					label: { show: true, position: "top", color: "#5e6d82", fontSize: 10, formatter: (p: any) => (p.value > 0 ? p.value : "") },
				}],
				title: total ? { text: `共 ${total} 条`, right: 24, top: 0, textStyle: { fontSize: 11, color: "#5e6d82", fontWeight: 400 } } : undefined,
			});
		};
		const renderTypeDist = () => {
			const d = stats.value;
			if (!d) return;
			const chart = initChart("chart-type");
			const data = d.typeDist.map((x) => ({ name: x.name, value: x.value }));
			chart.setOption({
				tooltip: { trigger: "item", formatter: "{b}: {c} 条 ({d}%)" },
				color: data.map((x) => PIPE_COLORS[x.name] || "#999"),
				legend: { bottom: 0, textStyle: { fontSize: 11, color: "#5e6d82" } },
				series: [{
					name: "管线类型", type: "pie", radius: ["42%", "66%"], center: ["50%", "44%"],
					data,
					label: { formatter: "{d}%", color: "#5e6d82", fontSize: 11 },
					itemStyle: { borderColor: "#fff", borderWidth: 2 },
				}],
			});
		};
		const renderStatus = () => {
			const d = stats.value;
			if (!d) return;
			const chart = initChart("chart-status");
			const data = ["normal", "maintenance", "fault"].map((k) => ({ name: STATUS_LABELS[k], value: d.statusDist.find((x) => x.name === k)?.value || 0 }));
			chart.setOption({
				tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
				grid: { left: 40, right: 16, top: 20, bottom: 28 },
				xAxis: { type: "category", data: data.map((x) => x.name), ...AXIS_STYLE, axisTick: { show: false } },
				yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#edf1f6" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } },
				series: [{
					type: "bar", data: data.map((x) => x.value),
					barWidth: 34,
					itemStyle: { color: (p: any) => ["#52c41a", "#faad14", "#f5222d"][p.dataIndex], borderRadius: [4, 4, 0, 0] },
					label: { show: true, position: "top", color: "#5e6d82", fontSize: 11 },
				}],
			});
		};
		const renderWorkOrders = () => {
			const d = stats.value;
			if (!d) return;
			const chart = initChart("chart-wo");
			const data = d.workOrderStats;
			chart.setOption({
				tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
				grid: { left: 70, right: 30, top: 10, bottom: 24 },
				xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#edf1f6" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } },
				yAxis: { type: "category", data: data.map((x) => x.name), ...AXIS_STYLE, axisTick: { show: false } },
				series: [{
					type: "bar", data: data.map((x) => x.value),
					barWidth: 16,
					itemStyle: { color: "#2878b8", borderRadius: [0, 4, 4, 0] },
					label: { show: true, position: "right", color: "#5e6d82", fontSize: 11 },
				}],
			});
		};
		const renderMaterial = () => {
			const d = stats.value;
			if (!d) return;
			const chart = initChart("chart-material");
			const data = [...d.materialDist].reverse();
			chart.setOption({
				tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
				grid: { left: 110, right: 30, top: 10, bottom: 24 },
				xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#edf1f6" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } },
				yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { color: "#5e6d82", fontSize: 10, width: 100, overflow: "truncate" }, axisTick: { show: false }, axisLine: { lineStyle: { color: "#c9d4e0" } } },
				series: [{
					type: "bar", data: data.map((x) => x.value),
					barWidth: 14,
					itemStyle: { color: "#3a9c3f", borderRadius: [0, 4, 4, 0] },
					label: { show: true, position: "right", color: "#5e6d82", fontSize: 11 },
				}],
			});
		};

		/* ---------- 遥测曲线 ---------- */
		const teleSeries = ref<{ value: number; ts: number }[]>([]);
		const loadTelemetrySeries = async () => {
			if (!teleSensorId.value) return;
			const { sensor, series } = await apiSensors.series(teleSensorId.value, teleRange.value);
			teleSeries.value = series;
			renderTelemetry(sensor);
		};
		const renderTelemetry = (sensor: Sensor) => {
			const chart = initChart("chart-telemetry");
			const data = teleSeries.value;
			const fmt = (ts: number) => new Date(ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
			// 24h 曲线按小时刻度，1h 按 10 分钟刻度
			const step = teleRange.value === "24h" ? 24 : teleRange.value === "6h" ? 12 : 6;
			const labels = data.map((p) => fmt(p.ts));
			chart.setOption({
				tooltip: {
					trigger: "axis", axisPointer: { type: "cross" },
					formatter: (params: any) => {
						const p = params[0];
						const v = p.value[1];
						const over = v > sensor.threshold;
						return `${p.axisValue}<br/>${sensor.name}：<b>${v} ${sensor.unit}</b>${over ? `<br/><span style="color:#f5222d">⚠ 超过阈值 ${sensor.threshold} ${sensor.unit}</span>` : ""}`;
					},
				},
				legend: { data: [sensor.name, "告警阈值"], top: 0, textStyle: { fontSize: 11, color: "#5e6d82" } },
				grid: { left: 54, right: 20, top: 30, bottom: 30 },
				xAxis: { type: "category", data: labels, axisLabel: { color: "#5e6d82", fontSize: 10, interval: Math.max(0, Math.floor(labels.length / step) - 1) }, axisLine: { lineStyle: { color: "#c9d4e0" } }, axisTick: { show: false } },
				yAxis: { type: "value", scale: true, splitLine: { lineStyle: { color: "#edf1f6" } }, axisLabel: { color: "#5e6d82", fontSize: 11 } },
				series: [
					{
						name: sensor.name, type: "line", data: data.map((p) => p.value),
						showSymbol: false, smooth: 0.25,
						lineStyle: { width: 1.8, color: "#2878b8" },
						areaStyle: { color: "rgba(40,120,184,0.10)" },
					},
					{
						name: "告警阈值", type: "line",
						data: data.map(() => sensor.threshold),
						showSymbol: false,
						lineStyle: { width: 1.5, color: "#f5222d", type: "dashed" },
						itemStyle: { color: "#f5222d" },
						tooltip: { show: false },
					},
				],
			});
		};

		const onResize = () => Object.values(charts).forEach((c) => c.resize());

		onMounted(async () => {
			await Promise.all([loadStats(), loadAlarms(), loadSensors()]);
			renderTrend();
			renderTypeDist();
			renderStatus();
			renderWorkOrders();
			renderMaterial();
			window.addEventListener("resize", onResize);
			refreshTimer = setInterval(() => {
				loadStats().then(() => {
					renderTrend(); renderTypeDist(); renderStatus(); renderWorkOrders(); renderMaterial();
				});
				loadAlarms();
			}, 60000);
		});
		onBeforeUnmount(() => {
			window.removeEventListener("resize", onResize);
			if (refreshTimer) clearInterval(refreshTimer);
			Object.values(charts).forEach((c) => c.dispose());
			charts = {};
		});

		return {
			stats, statCards, pendingAlarms, sensors, teleSensorId, teleRange, teleSeries,
			levelTagType, levelLabel, locateAlarm, loadTelemetrySeries, appStore, SENSOR_TYPE_LABELS,
		};
	},
});
</script>

<style scoped>
.dashboard {
	padding-bottom: 30px;
}
.stat-unit {
	font-size: 13px;
	font-weight: 400;
	color: var(--sp-text-2);
	margin-left: 3px;
}
.tele-controls {
	display: flex;
	gap: 10px;
	align-items: center;
}
.tele-live {
	font-size: 12px;
	color: var(--sp-text-2);
	display: flex;
	align-items: center;
	font-weight: 400;
}
</style>
