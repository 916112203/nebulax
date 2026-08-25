<template>
	<div class="sp-page">
		<h2 class="sp-page-title"><el-icon><Bell /></el-icon>告警中心</h2>

		<!-- 实时告警事件订阅提示 -->
		<div class="sp-card" style="margin-bottom: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 10px">
			<span class="sp-dot" :style="{ background: appStore.state.wsOnline ? '#52c41a' : '#faad14' }" />
			<span style="font-size: 13px; color: var(--sp-text-2)">
				{{ appStore.state.wsOnline ? "实时告警推送已开启：传感器异常将自动生成告警并即时提醒" : "实时通道未连接" }}
			</span>
		</div>

		<!-- 筛选 + 操作 -->
		<div class="sp-toolbar">
			<el-select v-model="filter.status" style="width: 130px" @change="load">
				<el-option label="全部状态" value="all" />
				<el-option label="待处理" value="pending" />
				<el-option label="处理中" value="processing" />
				<el-option label="已关闭" value="resolved" />
			</el-select>
			<el-select v-model="filter.level" style="width: 120px" @change="load">
				<el-option label="全部级别" value="all" />
				<el-option label="紧急" value="critical" />
				<el-option label="重要" value="major" />
				<el-option label="一般" value="minor" />
				<el-option label="提示" value="warning" />
			</el-select>
			<el-select v-model="filter.type" style="width: 150px" @change="load">
				<el-option label="全部类型" value="all" />
				<el-option v-for="t in alarmTypes" :key="t" :label="t" :value="t" />
			</el-select>
			<el-button @click="load">查询</el-button>
			<el-button v-if="authStore.hasRole('inspector')" type="primary" @click="reportVisible = true">
				<el-icon><Plus /></el-icon>&nbsp;上报告警
			</el-button>
			<div style="margin-left: auto; font-size: 13px; color: var(--sp-text-2)">
				共 {{ total }} 条告警
			</div>
		</div>

		<!-- 告警列表 -->
		<div class="sp-card">
			<el-table :data="list" size="small" v-loading="loading">
				<el-table-column label="级别" width="76">
					<template #default="{ row }">
						<el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ levelLabel(row.level) }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="title" label="标题" width="170" show-overflow-tooltip />
				<el-table-column prop="source_name" label="告警来源" width="200" show-overflow-tooltip />
				<el-table-column prop="description" label="描述" show-overflow-tooltip />
				<el-table-column label="状态" width="90">
					<template #default="{ row }">
						<el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="assignee" label="受理人" width="90">
					<template #default="{ row }">{{ row.assignee || "-" }}</template>
				</el-table-column>
				<el-table-column prop="created_at" label="发生时间" width="150" />
				<el-table-column label="操作" width="200" fixed="right">
					<template #default="{ row }">
						<el-button v-if="row.status === 'pending' && authStore.hasRole('inspector')" size="small" type="primary" link @click="process(row, 'accept')">受理</el-button>
						<el-button v-if="row.status !== 'resolved' && authStore.hasRole('inspector')" size="small" type="success" link @click="openResolve(row)">关闭</el-button>
						<el-button v-if="canLocate(row)" size="small" link @click="locate(row)">地图定位</el-button>
					</template>
				</el-table-column>
			</el-table>
			<div style="display: flex; justify-content: flex-end; margin-top: 12px">
				<el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next, total" @current-change="load" />
			</div>
		</div>

		<!-- 上报告警对话框 -->
		<el-dialog v-model="reportVisible" title="上报告警" width="480px">
			<el-form label-position="top" :model="reportForm" size="small">
				<el-form-item label="告警类型">
					<el-select v-model="reportForm.type" style="width: 100%">
						<el-option v-for="t in alarmTypes" :key="t" :label="t" :value="t" />
					</el-select>
				</el-form-item>
				<el-form-item label="告警级别">
					<el-radio-group v-model="reportForm.level">
						<el-radio-button value="critical">紧急</el-radio-button>
						<el-radio-button value="major">重要</el-radio-button>
						<el-radio-button value="minor">一般</el-radio-button>
						<el-radio-button value="warning">提示</el-radio-button>
					</el-radio-group>
				</el-form-item>
				<el-form-item label="标题">
					<el-input v-model="reportForm.title" placeholder="例如：巡查发现井盖缺失" />
				</el-form-item>
				<el-form-item label="描述">
					<el-input v-model="reportForm.description" type="textarea" :rows="3" placeholder="请描述现场情况" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="reportVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitReport">上报</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiAlarms } from "../api";
import { authStore } from "../store/auth";
import { appStore } from "../store/app";
import { ALARM_LEVEL_LABELS, ALARM_STATUS_LABELS } from "../types";
import type { Alarm } from "../types";

export default defineComponent({
	name: "AlarmView",
	setup() {
		const router = useRouter();
		const list = ref<Alarm[]>([]);
		const total = ref(0);
		const page = ref(1);
		const pageSize = 10;
		const loading = ref(false);
		const filter = reactive({ status: "all", level: "all", type: "all" });
		const alarmTypes = ["爆管", "渗漏", "压力异常", "液位超限", "燃气浓度超标", "井盖位移", "水质异常", "流量异常", "巡检发现", "其他"];
		const reportVisible = ref(false);
		const submitting = ref(false);
		const reportForm = reactive({ type: "井盖位移", level: "minor", title: "", description: "" });

		const levelTagType = (l: string) => (l === "critical" ? "danger" : l === "major" ? "warning" : l === "minor" ? "primary" : "info");
		const levelLabel = (l: string) => ALARM_LEVEL_LABELS[l] || l;
		const statusTagType = (s: string) => (s === "pending" ? "danger" : s === "processing" ? "warning" : "success");
		const statusLabel = (s: string) => ALARM_STATUS_LABELS[s] || s;
		const canLocate = (row: Alarm) => row.source_id && ["pipes", "wells", "pumps"].includes(row.source_type);

		const load = async () => {
			loading.value = true;
			try {
				const res = await apiAlarms.get({ status: filter.status, level: filter.level, type: filter.type, page: page.value, pageSize });
				list.value = res.list;
				total.value = res.total;
			} catch (e: any) {
				ElMessage.error(e.message || "加载失败");
			} finally {
				loading.value = false;
			}
		};

		const process = async (row: Alarm, action: "accept" | "resolve", resolution?: string) => {
			try {
				await apiAlarms.process(row.id, action, resolution);
				ElMessage.success(action === "accept" ? "告警已受理" : "告警已关闭");
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "操作失败");
			}
		};
		const openResolve = async (row: Alarm) => {
			try {
				const { value } = await ElMessageBox.prompt("请填写处置结果说明", `关闭告警：${row.title}`, {
					inputValue: "已现场核查并处置",
					confirmButtonText: "确认关闭",
					cancelButtonText: "取消",
				});
				await process(row, "resolve", value);
			} catch { /* 取消 */ }
		};
		const submitReport = async () => {
			if (!reportForm.title || !reportForm.description) { ElMessage.warning("请填写标题与描述"); return; }
			submitting.value = true;
			try {
				await apiAlarms.create({ ...reportForm } as any);
				ElMessage.success("告警已上报");
				reportVisible.value = false;
				reportForm.title = "";
				reportForm.description = "";
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "上报失败");
			} finally {
				submitting.value = false;
			}
		};
		const locate = (row: Alarm) => router.push({ path: "/map", query: { locate: row.source_id!, layer: row.source_type } });

		const onAlarmEvent = () => load();
		onMounted(() => {
			load();
			// 实时告警事件（WebSocket 推送）触发列表刷新
			window.addEventListener("sp-alarm", onAlarmEvent);
			window.addEventListener("sp-alarm-update", onAlarmEvent);
		});
		onBeforeUnmount(() => {
			window.removeEventListener("sp-alarm", onAlarmEvent);
			window.removeEventListener("sp-alarm-update", onAlarmEvent);
		});

		return {
			list, total, page, pageSize, loading, filter, alarmTypes, reportVisible, submitting, reportForm,
			levelTagType, levelLabel, statusTagType, statusLabel, canLocate,
			load, process, openResolve, submitReport, locate, authStore, appStore,
		};
	},
});
</script>
