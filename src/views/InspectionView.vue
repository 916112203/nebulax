<template>
	<div class="sp-page">
		<h2 class="sp-page-title"><el-icon><Guide /></el-icon>巡检管理</h2>

		<div class="sp-toolbar">
			<el-select v-model="filter.status" style="width: 140px" @change="load">
				<el-option label="全部状态" value="all" />
				<el-option label="未开始" value="未开始" />
				<el-option label="进行中" value="进行中" />
				<el-option label="已完成" value="已完成" />
			</el-select>
			<el-button @click="load">查询</el-button>
			<el-button v-if="authStore.hasRole('operator')" type="primary" @click="createVisible = true">
				<el-icon><Plus /></el-icon>&nbsp;新建巡检计划
			</el-button>
		</div>

		<div class="sp-card">
			<el-table :data="list" size="small" v-loading="loading" @row-click="openDetail">
				<el-table-column prop="name" label="计划名称" min-width="220" show-overflow-tooltip />
				<el-table-column prop="type" label="类型" width="100" />
				<el-table-column label="状态" width="90">
					<template #default="{ row }">
						<el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="进度" width="160">
					<template #default="{ row }">
						<el-progress :percentage="row.progress" :stroke-width="8" :status="row.issue_count ? 'exception' : undefined" />
					</template>
				</el-table-column>
				<el-table-column prop="issue_count" label="问题数" width="70" align="center">
					<template #default="{ row }">
						<el-tag v-if="row.issue_count" type="danger" size="small">{{ row.issue_count }}</el-tag>
						<span v-else>0</span>
					</template>
				</el-table-column>
				<el-table-column prop="inspector" label="巡检员" width="90" />
				<el-table-column prop="plan_date" label="计划日期" width="110" />
				<el-table-column label="操作" width="230" fixed="right">
					<template #default="{ row }">
						<el-button size="small" link type="primary" @click.stop="openDetail(row)">详情</el-button>
						<el-button v-if="row.status === '未开始' && authStore.hasRole('inspector')" size="small" type="success" link @click.stop="startPlan(row)">开始</el-button>
						<el-button v-if="row.status === '进行中' && authStore.hasRole('inspector')" size="small" type="warning" link @click.stop="completePlan(row)">完成</el-button>
						<el-button size="small" link @click.stop="viewOnMap(row)">地图查看</el-button>
					</template>
				</el-table-column>
			</el-table>
		</div>

		<!-- 详情抽屉 -->
		<el-drawer v-model="detailVisible" :title="current?.name" size="460px">
			<div v-if="current">
				<el-descriptions :column="2" border size="small" style="margin-bottom: 14px">
					<el-descriptions-item label="类型">{{ current.type }}</el-descriptions-item>
					<el-descriptions-item label="巡检员">{{ current.inspector || "-" }}</el-descriptions-item>
					<el-descriptions-item label="计划日期">{{ current.plan_date }}</el-descriptions-item>
					<el-descriptions-item label="状态">
						<el-tag :type="statusTagType(current.status)" size="small">{{ current.status }}</el-tag>
					</el-descriptions-item>
					<el-descriptions-item label="进度">{{ current.progress }}%</el-descriptions-item>
					<el-descriptions-item label="问题点位">{{ current.issue_count }} 处</el-descriptions-item>
				</el-descriptions>
				<div class="list-title">巡检点位（按顺序）</div>
				<el-table :data="current.route" size="small" max-height="440">
					<el-table-column prop="order" label="序" width="46" />
					<el-table-column prop="name" label="点位" min-width="150" show-overflow-tooltip />
					<el-table-column label="状态" width="86">
						<template #default="{ row }">
							<el-tag :type="pointTagType(row.status)" size="small">{{ pointLabel(row.status) }}</el-tag>
						</template>
					</el-table-column>
					<el-table-column v-if="isDoing" label="上报" width="90">
						<template #default="{ row }">
							<el-dropdown v-if="row.status === 'pending'" trigger="click" @command="(c: string) => reportPoint(row, c)">
								<el-button size="small" text type="primary">上报 ▾</el-button>
								<template #dropdown>
									<el-dropdown-menu>
										<el-dropdown-item command="done">✅ 正常</el-dropdown-item>
										<el-dropdown-item command="issue" divided>⚠ 发现异常</el-dropdown-item>
									</el-dropdown-menu>
								</template>
							</el-dropdown>
							<span v-else-if="row.issue" style="color: #f5222d; font-size: 12px" :title="row.issue">{{ row.issue.slice(0, 8) }}…</span>
						</template>
					</el-table-column>
				</el-table>
			</div>
		</el-drawer>

		<!-- 新建计划对话框 -->
		<el-dialog v-model="createVisible" title="新建巡检计划" width="560px">
			<el-form label-position="top" :model="createForm" size="small">
				<el-form-item label="计划名称">
					<el-input v-model="createForm.name" placeholder="例如 2026年9月污水管网日常巡检" />
				</el-form-item>
				<el-row :gutter="10">
					<el-col :span="12">
						<el-form-item label="巡检类型">
							<el-select v-model="createForm.type" style="width: 100%">
								<el-option label="日常巡检" value="日常巡检" />
								<el-option label="专项巡检" value="专项巡检" />
								<el-option label="汛期检查" value="汛期检查" />
							</el-select>
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="计划日期">
							<el-date-picker v-model="createForm.plan_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-form-item label="巡检员">
					<el-select v-model="createForm.inspector" style="width: 100%">
						<el-option label="张伟" value="张伟" />
						<el-option label="李娜" value="李娜" />
					</el-select>
				</el-form-item>
				<el-form-item label="巡检点位（从检查井/泵站中选择，最多 12 个）">
					<el-select v-model="selectedWells" multiple filterable style="width: 100%" :loading="wellsLoading" placeholder="搜索并选择点位" :multiple-limit="12">
						<el-option v-for="w in wellOptions" :key="w.id" :label="`${w.id} · ${w.name}`" :value="w.id" />
					</el-select>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="createVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitCreate">创建</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiInspections, apiFeatures } from "../api";
import { authStore } from "../store/auth";
import type { Inspection } from "../types";

export default defineComponent({
	name: "InspectionView",
	setup() {
		const router = useRouter();
		const list = ref<Inspection[]>([]);
		const loading = ref(false);
		const filter = reactive({ status: "all" });
		const detailVisible = ref(false);
		const current = ref<Inspection | null>(null);
		const createVisible = ref(false);
		const submitting = ref(false);
		const createForm = reactive({ name: "", type: "日常巡检", plan_date: "", inspector: "李娜" });
		const selectedWells = ref<string[]>([]);
		const wellOptions = ref<any[]>([]);
		const wellsLoading = ref(false);

		const isDoing = computed(() => current.value?.status === "进行中" && authStore.hasRole("inspector"));
		const statusTagType = (s: string) => (s === "已完成" ? "success" : s === "进行中" ? "primary" : "info");
		const pointTagType = (s: string) => (s === "done" ? "success" : s === "issue" ? "danger" : "info");
		const pointLabel = (s: string) => (s === "done" ? "正常" : s === "issue" ? "异常" : "待检");

		const load = async () => {
			loading.value = true;
			try {
				const res = await apiInspections.get({ status: filter.status, pageSize: 50 });
				list.value = res.list;
			} catch (e: any) {
				ElMessage.error(e.message || "加载失败");
			} finally {
				loading.value = false;
			}
		};
		const openDetail = async (row: Inspection) => {
			try {
				const { inspection } = await apiInspections.getOne(row.id);
				current.value = inspection;
				detailVisible.value = true;
			} catch (e: any) {
				ElMessage.error(e.message || "加载失败");
			}
		};
		const startPlan = async (row: Inspection) => {
			try {
				await apiInspections.start(row.id);
				ElMessage.success("巡检已开始");
				load();
				openDetail(row);
			} catch (e: any) {
				ElMessage.error(e.message || "操作失败");
			}
		};
		const completePlan = async (row: Inspection) => {
			try {
				await ElMessageBox.confirm("确认完成该巡检计划？", "完成巡检", { type: "info" });
			} catch { return; }
			try {
				await apiInspections.complete(row.id);
				ElMessage.success("巡检已完成");
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "操作失败");
			}
		};
		const reportPoint = async (row: any, cmd: string) => {
			if (cmd === "done") {
				await apiInspections.report(current.value!.id, { wellId: row.wellId, status: "done" });
				ElMessage.success(`点位 ${row.wellId} 上报正常`);
			} else {
				try {
					const { value } = await ElMessageBox.prompt("请描述发现的问题", `上报异常：${row.wellId}`, {
						inputValue: "井内有少量淤积",
						confirmButtonText: "上报",
					});
					await apiInspections.report(current.value!.id, { wellId: row.wellId, status: "issue", issue: value });
					ElMessage.warning("问题已上报，系统已生成告警工单");
				} catch { return; }
			}
			openDetail(current.value!);
			load();
		};
		const viewOnMap = (row: Inspection) => {
			router.push({ path: "/map", query: { inspection: row.id } });
		};
		const submitCreate = async () => {
			if (!createForm.name || !createForm.plan_date) { ElMessage.warning("请填写名称与日期"); return; }
			if (!selectedWells.value.length) { ElMessage.warning("请选择巡检点位"); return; }
			submitting.value = true;
			try {
				const route = selectedWells.value.map((wid) => {
					const w = wellOptions.value.find((x) => x.id === wid);
					return { wellId: wid, name: w?.id || wid, pt: w?.pt, status: "pending", issue: null };
				});
				await apiInspections.create({ name: createForm.name, type: createForm.type, inspector: createForm.inspector, plan_date: createForm.plan_date, route } as any);
				ElMessage.success("巡检计划已创建");
				createVisible.value = false;
				selectedWells.value = [];
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "创建失败");
			} finally {
				submitting.value = false;
			}
		};

		onMounted(async () => {
			load();
			wellsLoading.value = true;
			try {
				const fc = await apiFeatures.get("wells", { pageSize: 500 });
				wellOptions.value = fc.features.map((f) => ({ id: f.properties.id, name: f.properties.name, pt: (f.geometry as any).coordinates }));
				const pumps = await apiFeatures.get("pumps");
				pumps.features.forEach((f) => wellOptions.value.push({ id: f.properties.id, name: f.properties.name, pt: (f.geometry as any).coordinates }));
			} finally {
				wellsLoading.value = false;
			}
			// 从地图页带参数跳转（查看某计划路线）
			if (router.currentRoute.value.query.inspection) {
				const { inspection } = await apiInspections.getOne(String(router.currentRoute.value.query.inspection));
				current.value = inspection;
				detailVisible.value = true;
			}
		});

		return {
			list, loading, filter, detailVisible, current, createVisible, submitting, createForm,
			selectedWells, wellOptions, wellsLoading, isDoing,
			statusTagType, pointTagType, pointLabel,
			load, openDetail, startPlan, completePlan, reportPoint, viewOnMap, submitCreate, authStore,
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
</style>
