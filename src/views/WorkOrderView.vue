<template>
	<div class="sp-page">
		<h2 class="sp-page-title"><el-icon><Tickets /></el-icon>工单管理</h2>

		<div class="sp-toolbar">
			<el-select v-model="filter.status" style="width: 140px" @change="load">
				<el-option label="全部状态" value="all" />
				<el-option v-for="s in statusFlow" :key="s" :label="s" :value="s" />
			</el-select>
			<el-select v-model="filter.type" style="width: 140px" @change="load">
				<el-option label="全部类型" value="all" />
				<el-option v-for="t in woTypes" :key="t" :label="t" :value="t" />
			</el-select>
			<el-button @click="load">查询</el-button>
			<el-button v-if="authStore.hasRole('operator')" type="primary" @click="createVisible = true">
				<el-icon><Plus /></el-icon>&nbsp;新建工单
			</el-button>
		</div>

		<div class="sp-card">
			<el-table :data="list" size="small" v-loading="loading" @row-click="openDetail">
				<el-table-column prop="code" label="工单编号" width="130" />
				<el-table-column prop="type" label="类型" width="90">
					<template #default="{ row }">
						<el-tag size="small" effect="plain">{{ row.type }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="title" label="标题" min-width="230" show-overflow-tooltip />
				<el-table-column label="状态" width="100">
					<template #default="{ row }">
						<el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="优先级" width="80">
					<template #default="{ row }">
						<el-tag v-if="row.priority === '紧急'" type="danger" size="small" effect="dark">{{ row.priority }}</el-tag>
						<span v-else>{{ row.priority }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="assignee" label="负责人" width="90">
					<template #default="{ row }">{{ row.assignee || "未派单" }}</template>
				</el-table-column>
				<el-table-column prop="plan_start" label="计划开始" width="110" />
				<el-table-column label="操作" width="240" fixed="right">
					<template #default="{ row }">
						<el-button size="small" link type="primary" @click.stop="openDetail(row)">详情</el-button>
						<el-button v-if="authStore.hasRole('operator') && row.status !== '已完成'" size="small" type="success" link @click.stop="advance(row)">流转</el-button>
						<el-button v-if="authStore.hasRole('operator') && row.status !== '已完成'" size="small" type="warning" link @click.stop="openComplete(row)">完成</el-button>
						<el-button size="small" link @click.stop="locate(row)">地图定位</el-button>
					</template>
				</el-table-column>
			</el-table>
			<div style="display: flex; justify-content: flex-end; margin-top: 12px">
				<el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next, total" @current-change="load" />
			</div>
		</div>

		<!-- 详情抽屉 -->
		<el-drawer v-model="detailVisible" :title="current?.title" size="440px">
			<div v-if="current">
				<el-descriptions :column="2" border size="small" style="margin-bottom: 14px">
					<el-descriptions-item label="工单编号">{{ current.code }}</el-descriptions-item>
					<el-descriptions-item label="状态">
						<el-tag :type="statusTagType(current.status)" size="small">{{ current.status }}</el-tag>
					</el-descriptions-item>
					<el-descriptions-item label="类型">{{ current.type }}</el-descriptions-item>
					<el-descriptions-item label="优先级">{{ current.priority }}</el-descriptions-item>
					<el-descriptions-item label="负责人">{{ current.assignee || "-" }}</el-descriptions-item>
					<el-descriptions-item label="创建时间">{{ current.created_at }}</el-descriptions-item>
					<el-descriptions-item label="计划开始">{{ current.plan_start || "-" }}</el-descriptions-item>
					<el-descriptions-item label="计划结束">{{ current.plan_end || "-" }}</el-descriptions-item>
					<el-descriptions-item label="实际开始">{{ current.actual_start || "-" }}</el-descriptions-item>
					<el-descriptions-item label="实际结束">{{ current.actual_end || "-" }}</el-descriptions-item>
				</el-descriptions>
				<div class="list-title">作业内容</div>
				<p class="wo-desc">{{ current.description || "无描述" }}</p>
				<div v-if="current.related_features?.length" class="list-title">关联设施</div>
				<el-tag v-for="f in current.related_features" :key="f.id" size="small" style="margin: 2px 4px 2px 0">{{ f.name }}（{{ f.id }}）</el-tag>
				<div v-if="current.related_alarm" class="list-title" style="margin-top: 12px">关联告警</div>
				<div v-if="current.related_alarm">{{ current.related_alarm }}</div>
				<div v-if="current.result" class="list-title" style="margin-top: 12px">作业结果</div>
				<p v-if="current.result" class="wo-desc">{{ current.result }}</p>
				<!-- 状态流转时间线 -->
				<div class="list-title" style="margin-top: 12px">流转记录</div>
				<el-steps :active="flowIndex(current.status)" align-center finish-status="success" style="margin-top: 10px">
					<el-step v-for="s in statusFlow" :key="s" :title="s" />
				</el-steps>
				<div v-if="authStore.hasRole('operator') && current.status !== '已完成'" class="wo-actions">
					<el-button type="primary" size="small" @click="advance(current)">流转到下一状态</el-button>
					<el-button type="warning" size="small" @click="openComplete(current)">直接完成</el-button>
				</div>
			</div>
		</el-drawer>

		<!-- 新建工单 -->
		<el-dialog v-model="createVisible" title="新建工单" width="560px">
			<el-form label-position="top" :model="createForm" size="small">
				<el-form-item label="标题">
					<el-input v-model="createForm.title" placeholder="例如 抢修：中山大道污水干管爆管" />
				</el-form-item>
				<el-row :gutter="10">
					<el-col :span="12">
						<el-form-item label="工单类型">
							<el-select v-model="createForm.type" style="width: 100%">
								<el-option v-for="t in woTypes" :key="t" :label="t" :value="t" />
							</el-select>
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="优先级">
							<el-select v-model="createForm.priority" style="width: 100%">
								<el-option label="紧急" value="紧急" />
								<el-option label="高" value="高" />
								<el-option label="中" value="中" />
								<el-option label="低" value="低" />
							</el-select>
						</el-form-item>
					</el-col>
				</el-row>
				<el-row :gutter="10">
					<el-col :span="12">
						<el-form-item label="计划开始">
							<el-date-picker v-model="createForm.plan_start" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
						</el-form-item>
					</el-col>
					<el-col :span="12">
						<el-form-item label="计划结束">
							<el-date-picker v-model="createForm.plan_end" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
						</el-form-item>
					</el-col>
				</el-row>
				<el-form-item label="关联设施（可选）">
					<el-select v-model="createForm.relatedId" filterable clearable placeholder="搜索并选择管线" style="width: 100%">
						<el-option v-for="p in pipeOptions" :key="p.id" :label="`${p.id} · ${p.name}`" :value="p.id" />
					</el-select>
				</el-form-item>
				<el-form-item label="作业描述">
					<el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="描述作业内容与要求" />
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
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiWorkOrders, apiFeatures } from "../api";
import { authStore } from "../store/auth";
import type { WorkOrder } from "../types";

const statusFlow: WorkOrder["status"][] = ["待派单", "已派单", "处理中", "待验收", "已完成"];
const woTypes = ["抢修", "维修", "保养", "巡检", "投诉处理"];

export default defineComponent({
	name: "WorkOrderView",
	setup() {
		const router = useRouter();
		const list = ref<WorkOrder[]>([]);
		const total = ref(0);
		const page = ref(1);
		const pageSize = 10;
		const loading = ref(false);
		const filter = reactive({ status: "all", type: "all" });
		const detailVisible = ref(false);
		const current = ref<WorkOrder | null>(null);
		const createVisible = ref(false);
		const submitting = ref(false);
		const createForm = reactive({ title: "", type: "维修", priority: "中", plan_start: "", plan_end: "", relatedId: "", description: "" });
		const pipeOptions = ref<any[]>([]);

		const statusTagType = (s: string) =>
			s === "已完成" ? "success" : s === "待派单" ? "info" : s === "已派单" ? "primary" : s === "处理中" ? "warning" : "danger";
		const flowIndex = (s: string) => Math.max(0, statusFlow.indexOf(s as WorkOrder["status"]));

		const load = async () => {
			loading.value = true;
			try {
				const res = await apiWorkOrders.get({ status: filter.status, type: filter.type, page: page.value, pageSize });
				list.value = res.list;
				total.value = res.total;
			} catch (e: any) {
				ElMessage.error(e.message || "加载失败");
			} finally {
				loading.value = false;
			}
		};
		const openDetail = (row: WorkOrder) => {
			current.value = row;
			detailVisible.value = true;
		};
		const advance = async (row: WorkOrder) => {
			try {
				await apiWorkOrders.update(row.id, { action: "advance" });
				ElMessage.success(`工单已流转至下一状态`);
				load();
				if (detailVisible.value) openDetail({ ...row, status: statusFlow[Math.min(statusFlow.indexOf(row.status) + 1, statusFlow.length - 1)] });
			} catch (e: any) {
				ElMessage.error(e.message || "操作失败");
			}
		};
		const openComplete = async (row: WorkOrder) => {
			try {
				const { value } = await ElMessageBox.prompt("请填写作业结果说明", `完成工单：${row.title}`, {
					inputValue: "作业完成，设施运行正常",
					confirmButtonText: "确认完成",
				});
				await apiWorkOrders.update(row.id, { action: "complete", result: value });
				ElMessage.success("工单已完成");
				load();
				detailVisible.value = false;
			} catch { /* 取消 */ }
		};
		const locate = (row: WorkOrder) => {
			const f = row.related_features?.[0];
			if (f) router.push({ path: "/map", query: { locate: f.id, layer: f.layer } });
			else ElMessage.info("该工单未关联具体设施");
		};
		const submitCreate = async () => {
			if (!createForm.title) { ElMessage.warning("请填写标题"); return; }
			submitting.value = true;
			try {
				const related = pipeOptions.value.find((p) => p.id === createForm.relatedId);
				await apiWorkOrders.create({
					title: createForm.title, type: createForm.type, priority: createForm.priority,
					plan_start: createForm.plan_start, plan_end: createForm.plan_end,
					description: createForm.description,
					related_features: related ? [{ layer: "pipes", id: related.id, name: related.name }] : [],
				} as any);
				ElMessage.success("工单已创建");
				createVisible.value = false;
				Object.assign(createForm, { title: "", type: "维修", priority: "中", plan_start: "", plan_end: "", relatedId: "", description: "" });
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "创建失败");
			} finally {
				submitting.value = false;
			}
		};

		onMounted(async () => {
			load();
			try {
				const fc = await apiFeatures.get("pipes", { pageSize: 200 });
				pipeOptions.value = fc.features.map((f) => ({ id: f.properties.id, name: f.properties.name }));
			} catch { /* 忽略 */ }
		});

		return {
			list, total, page, pageSize, loading, filter, detailVisible, current,
			createVisible, submitting, createForm, pipeOptions, statusFlow, woTypes,
			statusTagType, flowIndex, load, openDetail, advance, openComplete, locate, submitCreate, authStore,
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
.wo-desc {
	font-size: 13px;
	color: var(--sp-text);
	line-height: 1.7;
	margin: 0;
	white-space: pre-wrap;
}
.wo-actions {
	display: flex;
	gap: 8px;
	margin-top: 16px;
}
</style>
