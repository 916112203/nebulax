<template>
	<el-drawer v-model="visible" :title="title" size="480px" destroy-on-close>
		<div v-if="!result" class="empty-tip">暂无分析结果</div>
		<template v-else>
			<!-- 上下游追踪 -->
			<template v-if="result.kind === 'trace'">
				<el-descriptions :column="2" border size="small" class="mb12">
					<el-descriptions-item label="追踪方向">{{ result.data.direction === "upstream" ? "上游" : "下游" }}</el-descriptions-item>
					<el-descriptions-item label="管线类型">{{ result.data.type }}</el-descriptions-item>
					<el-descriptions-item label="涉及管线">{{ result.data.order.length }} 条</el-descriptions-item>
					<el-descriptions-item label="总长度">{{ result.data.totalLength }} m</el-descriptions-item>
				</el-descriptions>
				<div class="list-title">追踪路径（按流向顺序）</div>
				<el-table :data="traceRows" size="small" max-height="420">
					<el-table-column prop="order" label="序" width="46" />
					<el-table-column prop="id" label="管线编号" width="130" />
					<el-table-column prop="name" label="管线名称" show-overflow-tooltip />
					<el-table-column prop="length" label="长度(m)" width="86" align="right" />
				</el-table>
			</template>

			<!-- 爆管关阀分析 -->
			<template v-else-if="result.kind === 'isolation'">
				<div class="iso-header">
					<div>
						<div class="iso-pipe-name">{{ result.data.burstPipe.properties.name }}</div>
						<div class="iso-pipe-meta">
							{{ result.data.burstPipe.properties.id }} · DN{{ result.data.burstPipe.properties.diameter }} · {{ result.data.burstPipe.properties.material }}
						</div>
					</div>
					<el-tag type="danger" effect="dark">{{ result.data.strategy }}</el-tag>
				</div>
				<el-descriptions :column="3" border size="small" class="mb12">
					<el-descriptions-item label="关阀数量">{{ result.data.valvesToClose.length }}</el-descriptions-item>
					<el-descriptions-item label="受影响管段">{{ result.data.affectedPipeIds.length }} 条</el-descriptions-item>
					<el-descriptions-item label="受影响长度">{{ result.data.affectedLength }} m</el-descriptions-item>
					<el-descriptions-item label="影响建筑">{{ result.data.affectedBuildings.length }} 栋</el-descriptions-item>
					<el-descriptions-item label="影响户数">{{ result.data.affectedHouseholds }} 户</el-descriptions-item>
					<el-descriptions-item label="爆管材质">{{ result.data.burstPipe.properties.material }}</el-descriptions-item>
				</el-descriptions>
				<div class="list-title">关阀方案</div>
				<el-table :data="result.data.valvesToClose" size="small" max-height="200">
					<el-table-column prop="wellId" label="井编号" width="130" />
					<el-table-column prop="name" label="井名称" show-overflow-tooltip />
					<el-table-column prop="role" label="作用" width="110" />
					<el-table-column prop="dist" label="距爆点(m)" width="96" align="right" />
				</el-table>
				<div v-if="result.data.affectedBuildings.length" class="list-title" style="margin-top: 12px">
					受影响建筑（估算 {{ result.data.affectedHouseholds }} 户）
				</div>
				<el-tag v-for="b in result.data.affectedBuildings.slice(0, 8)" :key="b.id" size="small" style="margin: 2px 4px 2px 0">
					{{ b.name }}（{{ b.usage }}·{{ b.households }}户）
				</el-tag>
				<div class="list-title" style="margin-top: 12px">应急处置流程</div>
				<el-timeline style="padding-left: 4px">
					<el-timeline-item v-for="(s, i) in result.data.steps" :key="i" :timestamp="`第 ${i + 1} 步`" placement="top" size="small">
						<div class="step-text">{{ s }}</div>
					</el-timeline-item>
				</el-timeline>
			</template>

			<!-- 纵剖面 -->
			<template v-else-if="result.kind === 'profile'">
				<el-descriptions :column="3" border size="small" class="mb12">
					<el-descriptions-item label="管线">{{ result.data.pipe.id }}</el-descriptions-item>
					<el-descriptions-item label="总长">{{ result.data.totalLength }} m</el-descriptions-item>
					<el-descriptions-item label="管径">DN{{ result.data.diameter }}</el-descriptions-item>
				</el-descriptions>
				<div id="profile-chart" style="height: 320px" />
				<div class="profile-note">图表为管线纵断面示意图：横轴为里程 (m)，纵轴为高程 (m)</div>
			</template>

			<!-- 缓冲查询 -->
			<template v-else-if="result.kind === 'buffer'">
				<el-descriptions :column="2" border size="small" class="mb12">
					<el-descriptions-item label="缓冲半径">{{ result.data.radius }} m</el-descriptions-item>
					<el-descriptions-item label="命中要素">{{ result.data.features.length }} 个</el-descriptions-item>
				</el-descriptions>
				<el-table :data="bufferRows" size="small" max-height="420">
					<el-table-column prop="layer" label="图层" width="80" />
					<el-table-column prop="id" label="编号" width="130" />
					<el-table-column prop="name" label="名称" show-overflow-tooltip />
				</el-table>
			</template>
		</template>
	</el-drawer>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, PropType, ref, watch } from "vue";
import * as echarts from "echarts";
import type { IsolationResult, ProfileResult, TraceResult } from "../../types";

export interface AnalysisResult {
	kind: "trace" | "isolation" | "profile" | "buffer";
	data: TraceResult | IsolationResult | ProfileResult | any;
}

const LAYER_CN: Record<string, string> = { pipes: "管线", wells: "检查井", pumps: "泵站", buildings: "建筑" };

export default defineComponent({
	name: "AnalysisDrawer",
	props: {
		modelValue: { type: Boolean, default: false },
		result: { type: Object as PropType<AnalysisResult | null>, default: null },
	},
	emits: ["update:modelValue"],
	setup(props, { emit }) {
		const visible = computed({
			get: () => props.modelValue,
			set: (v) => emit("update:modelValue", v),
		});
		const chart = ref<echarts.ECharts | null>(null);

		const title = computed(() => {
			if (!props.result) return "空间分析";
			return { trace: "上下游追踪分析", isolation: "爆管关阀分析（隔离方案）", profile: "管线纵剖面分析", buffer: "缓冲区空间查询" }[props.result.kind];
		});
		const traceRows = computed(() => {
			if (props.result?.kind !== "trace") return [];
			const d = props.result.data as TraceResult;
			return d.order.map((id, i) => {
				const f = d.features.features.find((x) => x.properties.id === id);
				return { order: i + 1, id, name: f?.properties.name || "-", length: f?.properties.length || 0 };
			});
		});
		const bufferRows = computed(() => {
			if (props.result?.kind !== "buffer") return [];
			const d = props.result.data;
			return d.features.map((f: any) => ({
				layer: LAYER_CN[f.properties.type && ["污水管", "雨水管", "给水管", "燃气管", "热力管"].includes(f.properties.type) ? "pipes" : f.properties.type === "建筑" ? "buildings" : f.properties.type === "泵站" ? "pumps" : "wells"] || "-",
				id: f.properties.id, name: f.properties.name || "-",
			}));
		});

		watch(visible, async (v) => {
			if (v && props.result?.kind === "profile") {
				await nextTick();
				renderProfile(props.result.data as ProfileResult);
			}
		});

		const renderProfile = (d: ProfileResult) => {
			const el = document.getElementById("profile-chart");
			if (!el) return;
			if (!chart.value) chart.value = echarts.init(el);
			const dists = d.points.map((p) => p.dist);
			const ground = d.points.map((p) => p.ground);
			const invert = d.points.map((p) => p.invert);
			chart.value.setOption({
				tooltip: {
					trigger: "axis",
					valueFormatter: (v: number) => `${v} m`,
				},
				legend: { data: ["地面高程", "管底高程"], bottom: 0, textStyle: { fontSize: 11 } },
				grid: { left: 44, right: 16, top: 24, bottom: 48 },
				xAxis: {
					type: "category", data: dists.map((x) => `${x}`),
					name: "里程 (m)", nameLocation: "middle", nameGap: 28,
					axisLabel: { fontSize: 10, interval: Math.max(0, Math.floor(dists.length / 8) - 1) },
					axisLine: { lineStyle: { color: "#c9d4e0" } },
				},
				yAxis: {
					type: "value", name: "高程 (m)", min: (v: any) => Math.floor(v.min - 2), max: (v: any) => Math.ceil(v.max + 1),
					axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: "#edf1f6" } },
				},
				series: [
					{
						name: "地面高程", type: "line", data: ground, symbol: "circle", symbolSize: 5,
						lineStyle: { width: 1.5, color: "#c9d4e0", type: "dashed" },
						itemStyle: { color: "#9aa8b8" },
						label: { show: false },
					},
					{
						name: "管底高程", type: "line", data: invert, symbol: "circle", symbolSize: 6,
						lineStyle: { width: 2, color: "#c25a10" },
						itemStyle: { color: "#c25a10" },
						areaStyle: { color: "rgba(194,90,16,0.12)" },
						label: { show: false },
						markPoint: {
							symbolSize: 44,
							data: [
								{ type: "min", name: "最低点", label: { fontSize: 10, color: "#5e6d82" } },
							],
						},
					},
				],
			});
			chart.value.resize();
		};

		return { visible, title, traceRows, bufferRows };
	},
});
</script>

<style scoped>
.empty-tip {
	color: var(--sp-text-2);
	text-align: center;
	padding: 40px 0;
}
.mb12 {
	margin-bottom: 12px;
}
.list-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 8px;
}
.iso-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 12px;
}
.iso-pipe-name {
	font-weight: 700;
	font-size: 15px;
}
.iso-pipe-meta {
	color: var(--sp-text-2);
	font-size: 12px;
	margin-top: 2px;
}
.step-text {
	font-size: 13px;
	line-height: 1.6;
}
.profile-note {
	font-size: 12px;
	color: var(--sp-text-2);
	margin-top: 6px;
}
</style>
