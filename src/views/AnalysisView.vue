<template>
	<div class="sp-page">
		<h2 class="sp-page-title"><el-icon><Connection /></el-icon>管网分析中心</h2>

		<el-tabs v-model="tab">
			<!-- 连通追踪 -->
			<el-tab-pane label="连通性追踪" name="trace">
				<div class="sp-card">
					<div class="sp-card-body">
						<div class="sp-toolbar">
							<el-select v-model="traceForm.pipeId" filterable placeholder="选择目标管线" style="width: 320px">
								<el-option v-for="p in pipeOptions" :key="p.id" :label="`${p.id} · ${p.name}`" :value="p.id" />
							</el-select>
							<el-radio-group v-model="traceForm.direction">
								<el-radio-button value="upstream">上游追踪</el-radio-button>
								<el-radio-button value="downstream">下游追踪</el-radio-button>
							</el-radio-group>
							<el-button type="primary" :loading="traceLoading" @click="runTrace">开始分析</el-button>
							<el-button v-if="traceResult" @click="viewOnMap('trace')">在地图中查看</el-button>
						</div>
						<div v-if="traceResult" class="trace-result">
							<el-descriptions :column="4" border size="small">
								<el-descriptions-item label="目标管线">{{ traceResult.pipeId }}</el-descriptions-item>
								<el-descriptions-item label="方向">{{ traceResult.direction === "upstream" ? "上游" : "下游" }}</el-descriptions-item>
								<el-descriptions-item label="涉及管线">{{ traceResult.order.length }} 条</el-descriptions-item>
								<el-descriptions-item label="总长度">{{ traceResult.totalLength }} m</el-descriptions-item>
							</el-descriptions>
							<el-table :data="traceRows" size="small" style="margin-top: 12px" max-height="380">
								<el-table-column type="index" label="#" width="50" />
								<el-table-column prop="id" label="管线编号" width="150" />
								<el-table-column prop="name" label="管线名称" min-width="200" show-overflow-tooltip />
								<el-table-column prop="road" label="所属道路" width="120" />
								<el-table-column prop="diameter" label="管径" width="100" />
								<el-table-column prop="length" label="长度(m)" width="100" align="right" />
							</el-table>
						</div>
					</div>
				</div>
			</el-tab-pane>

			<!-- 爆管关阀 -->
			<el-tab-pane label="爆管关阀分析" name="isolation">
				<div class="sp-card">
					<div class="sp-card-body">
						<div class="sp-toolbar">
							<el-select v-model="isoForm.pipeId" filterable placeholder="选择爆管管线" style="width: 320px">
								<el-option v-for="p in pipeOptions" :key="p.id" :label="`${p.id} · ${p.name}`" :value="p.id" />
							</el-select>
							<el-button type="danger" :loading="isoLoading" @click="runIsolation">模拟爆管分析</el-button>
							<el-button v-if="isoResult" @click="viewOnMap('isolation')">在地图中查看</el-button>
						</div>
						<div v-if="isoResult" class="iso-result">
							<el-alert :title="`${isoResult.strategy}方案已生成：关闭 ${isoResult.valvesToClose.length} 处隔离点，隔离 ${isoResult.affectedPipeIds.length} 段管线，预估影响 ${isoResult.affectedHouseholds} 户`"
								type="error" :closable="false" show-icon style="margin-bottom: 14px" />
							<el-row :gutter="14">
								<el-col :span="12">
									<div class="list-title">关阀/封堵清单</div>
									<el-table :data="isoResult.valvesToClose" size="small" max-height="300">
										<el-table-column prop="wellId" label="井编号" width="130" />
										<el-table-column prop="name" label="名称" show-overflow-tooltip />
										<el-table-column prop="role" label="作用" width="110" />
										<el-table-column prop="dist" label="距爆点(m)" width="100" align="right" />
									</el-table>
								</el-col>
								<el-col :span="12">
									<div class="list-title">受影响管段</div>
									<el-table :data="isoResult.affectedPipes.features.map((f: any) => ({ id: f.properties.id, name: f.properties.name, length: f.properties.length }))" size="small" max-height="300">
										<el-table-column prop="id" label="管线编号" width="130" />
										<el-table-column prop="name" label="名称" show-overflow-tooltip />
										<el-table-column prop="length" label="长度(m)" width="90" align="right" />
									</el-table>
								</el-col>
							</el-row>
							<div class="list-title" style="margin-top: 14px">受影响建筑（{{ isoResult.affectedHouseholds }} 户）</div>
							<el-tag v-for="b in isoResult.affectedBuildings" :key="b.id" size="small" style="margin: 2px 4px 2px 0">{{ b.name }}（{{ b.usage }} · {{ b.households }}户）</el-tag>
							<div class="list-title" style="margin-top: 14px">应急处置流程</div>
							<el-timeline style="padding-left: 4px">
								<el-timeline-item v-for="(s, i) in isoResult.steps" :key="i" :timestamp="`第 ${i + 1} 步`" placement="top" size="small">
									<div class="step-text">{{ s }}</div>
								</el-timeline-item>
							</el-timeline>
						</div>
					</div>
				</div>
			</el-tab-pane>

			<!-- 纵剖面 -->
			<el-tab-pane label="管线纵剖面" name="profile">
				<div class="sp-card">
					<div class="sp-card-body">
						<div class="sp-toolbar">
							<el-select v-model="profileForm.pipeId" filterable placeholder="选择管线" style="width: 320px">
								<el-option v-for="p in pipeOptions" :key="p.id" :label="`${p.id} · ${p.name}`" :value="p.id" />
							</el-select>
							<el-button type="primary" :loading="profileLoading" @click="runProfile">生成剖面</el-button>
						</div>
						<div v-if="profileResult">
							<el-descriptions :column="3" border size="small" style="margin-bottom: 12px">
								<el-descriptions-item label="管线">{{ profileResult.pipe.id }} · {{ profileResult.pipe.name }}</el-descriptions-item>
								<el-descriptions-item label="总长">{{ profileResult.totalLength }} m</el-descriptions-item>
								<el-descriptions-item label="管径">DN{{ profileResult.diameter }}</el-descriptions-item>
							</el-descriptions>
							<div id="analysis-profile-chart" style="height: 360px" />
						</div>
					</div>
				</div>
			</el-tab-pane>

			<!-- 缓冲区 -->
			<el-tab-pane label="缓冲区查询" name="buffer">
				<div class="sp-card">
					<div class="sp-card-body">
						<div class="sp-toolbar">
							<el-input-number v-model="bufferForm.lon" :precision="6" :step="0.001" :controls="false" style="width: 150px" />
							<el-input-number v-model="bufferForm.lat" :precision="6" :step="0.001" :controls="false" style="width: 150px" />
							<el-select v-model="bufferForm.radius" style="width: 130px">
								<el-option label="300 米" :value="300" />
								<el-option label="500 米" :value="500" />
								<el-option label="800 米" :value="800" />
								<el-option label="1000 米" :value="1000" />
							</el-select>
							<el-button type="primary" :loading="bufferLoading" @click="runBuffer">执行查询</el-button>
							<el-button v-if="bufferResult" @click="viewOnMap('buffer')">在地图中查看</el-button>
						</div>
						<div v-if="bufferResult" style="margin-top: 10px">
							<div class="list-title">命中要素（{{ bufferResult.features.length }} 个）</div>
							<el-table :data="bufferRows" size="small" max-height="420">
								<el-table-column prop="layer" label="图层" width="90" />
								<el-table-column prop="id" label="编号" width="150" />
								<el-table-column prop="name" label="名称" show-overflow-tooltip />
								<el-table-column prop="type" label="类型" width="120" />
							</el-table>
						</div>
					</div>
				</div>
			</el-tab-pane>
		</el-tabs>
	</div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import * as echarts from "echarts";
import { ElMessage } from "element-plus";
import { apiAnalysis, apiFeatures } from "../api";
import { PIPE_COLORS } from "../types";
import type { GeoJSONFeature, IsolationResult, ProfileResult, TraceResult } from "../types";

const LAYER_CN: Record<string, string> = { pipes: "管线", wells: "检查井", pumps: "泵站", buildings: "建筑" };

export default defineComponent({
	name: "AnalysisView",
	setup() {
		const router = useRouter();
		const tab = ref("trace");
		const pipeOptions = ref<{ id: string; name: string }[]>([]);
		const allPipes = ref<GeoJSONFeature[]>([]);

		const traceForm = reactive({ pipeId: "", direction: "downstream" });
		const traceResult = ref<TraceResult | null>(null);
		const traceLoading = ref(false);

		const isoForm = reactive({ pipeId: "" });
		const isoResult = ref<IsolationResult | null>(null);
		const isoLoading = ref(false);

		const profileForm = reactive({ pipeId: "" });
		const profileResult = ref<ProfileResult | null>(null);
		const profileLoading = ref(false);
		let profileChart: echarts.ECharts | null = null;

		const bufferForm = reactive({ lon: 116.505, lat: 39.795, radius: 500 });
		const bufferResult = ref<any>(null);
		const bufferLoading = ref(false);
		/** 各分析的最新参数（跳转地图时复现） */
		const lastAnalysis = ref<{ kind: string; pipeId?: string } | null>(null);

		const traceRows = computed(() => {
			if (!traceResult.value) return [];
			return traceResult.value.order.map((id) => {
				const f = traceResult.value!.features.features.find((x) => x.properties.id === id);
				return {
					id, name: f?.properties.name || "-", road: f?.properties.road || "-",
					diameter: f?.properties.diameter || "-", length: f?.properties.length || 0,
				};
			});
		});
		const bufferRows = computed(() => {
			if (!bufferResult.value) return [];
			return bufferResult.value.features.map((f: any) => {
				const t = f.properties.type;
				const layer = t && PIPE_COLORS[t] ? "管线" : t === "建筑" ? "建筑" : t === "泵站" ? "泵站" : "检查井";
				return { layer, id: f.properties.id, name: f.properties.name || "-", type: t || "-" };
			});
		});

		const runTrace = async () => {
			if (!traceForm.pipeId) { ElMessage.warning("请选择目标管线"); return; }
			traceLoading.value = true;
			try {
				traceResult.value = await apiAnalysis.trace(traceForm.pipeId, traceForm.direction as any);
				lastAnalysis.value = { kind: "trace", pipeId: traceForm.pipeId };
			} catch (e: any) {
				ElMessage.error(e.message || "分析失败");
			} finally {
				traceLoading.value = false;
			}
		};
		const runIsolation = async () => {
			if (!isoForm.pipeId) { ElMessage.warning("请选择爆管管线"); return; }
			isoLoading.value = true;
			try {
				isoResult.value = await apiAnalysis.isolation(isoForm.pipeId);
				lastAnalysis.value = { kind: "isolation", pipeId: isoForm.pipeId };
			} catch (e: any) {
				ElMessage.error(e.message || "分析失败");
			} finally {
				isoLoading.value = false;
			}
		};
		const runProfile = async () => {
			if (!profileForm.pipeId) { ElMessage.warning("请选择管线"); return; }
			profileLoading.value = true;
			try {
				profileResult.value = await apiAnalysis.profile(profileForm.pipeId);
				lastAnalysis.value = { kind: "profile", pipeId: profileForm.pipeId };
				await nextTick();
				renderProfile();
			} catch (e: any) {
				ElMessage.error(e.message || "分析失败");
			} finally {
				profileLoading.value = false;
			}
		};
		const renderProfile = () => {
			const d = profileResult.value;
			if (!d) return;
			const el = document.getElementById("analysis-profile-chart");
			if (!el) return;
			if (!profileChart) profileChart = echarts.init(el);
			profileChart.setOption({
				tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v} m` },
				legend: { data: ["地面高程", "管底高程"], bottom: 0, textStyle: { fontSize: 11 } },
				grid: { left: 44, right: 16, top: 24, bottom: 48 },
				xAxis: {
					type: "category", data: d.points.map((p) => `${p.dist}`),
					name: "里程 (m)", nameLocation: "middle", nameGap: 28,
					axisLabel: { fontSize: 10, interval: Math.max(0, Math.floor(d.points.length / 8) - 1) },
					axisLine: { lineStyle: { color: "#c9d4e0" } },
				},
				yAxis: {
					type: "value", name: "高程 (m)", min: (v: any) => Math.floor(v.min - 2), max: (v: any) => Math.ceil(v.max + 1),
					axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: "#edf1f6" } },
				},
				series: [
					{
						name: "地面高程", type: "line", data: d.points.map((p) => p.ground), symbol: "circle", symbolSize: 5,
						lineStyle: { width: 1.5, color: "#c9d4e0", type: "dashed" }, itemStyle: { color: "#9aa8b8" },
					},
					{
						name: "管底高程", type: "line", data: d.points.map((p) => p.invert), symbol: "circle", symbolSize: 6,
						lineStyle: { width: 2, color: "#c25a10" }, itemStyle: { color: "#c25a10" },
						areaStyle: { color: "rgba(194,90,16,0.12)" },
					},
				],
			});
		};
		const runBuffer = async () => {
			bufferLoading.value = true;
			try {
				bufferResult.value = await apiAnalysis.buffer({
					geometry: { type: "Point", coordinates: [bufferForm.lon, bufferForm.lat] },
					radius: bufferForm.radius,
				});
				lastAnalysis.value = { kind: "buffer" };
			} catch (e: any) {
				ElMessage.error(e.message || "查询失败");
			} finally {
				bufferLoading.value = false;
			}
		};
		const viewOnMap = (kind: string) => {
			router.push({ path: "/map", query: { analysis: kind } });
		};

		onMounted(async () => {
			try {
				const fc = await apiFeatures.get("pipes", { pageSize: 500 });
				allPipes.value = fc.features;
				pipeOptions.value = fc.features.map((f) => ({ id: f.properties.id, name: f.properties.name || "" }));
			} catch { /* 忽略 */ }
		});

		return {
			tab, pipeOptions, traceForm, traceResult, traceLoading, traceRows,
			isoForm, isoResult, isoLoading, profileForm, profileResult, profileLoading,
			bufferForm, bufferResult, bufferLoading, bufferRows,
			runTrace, runIsolation, runProfile, runBuffer, viewOnMap,
		};
	},
});
</script>

<style scoped>
.list-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 8px;
}
.step-text {
	font-size: 13px;
	line-height: 1.6;
}
</style>
