<template>
	<div class="sp-page">
		<h2 class="sp-page-title"><el-icon><User /></el-icon>用户管理</h2>

		<div class="sp-toolbar">
			<el-alert type="info" :closable="false" show-icon style="flex: 1"
				title="角色权限说明：系统管理员（全部权限）＞ 调度员（工单/要素编辑）＞ 巡检员（巡检/告警处置）＞ 浏览用户（只读）" />
			<el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>&nbsp;新增用户</el-button>
		</div>

		<div class="sp-card">
			<el-table :data="list" size="small" v-loading="loading">
				<el-table-column prop="username" label="用户名" width="140" />
				<el-table-column prop="name" label="姓名" width="120" />
				<el-table-column label="角色" width="130">
					<template #default="{ row }">
						<el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="dept" label="部门" min-width="160">
					<template #default="{ row }">{{ row.dept || "-" }}</template>
				</el-table-column>
				<el-table-column prop="phone" label="联系电话" width="140">
					<template #default="{ row }">{{ row.phone || "-" }}</template>
				</el-table-column>
				<el-table-column label="操作" width="170" fixed="right">
					<template #default="{ row }">
						<el-button size="small" link type="primary" @click="openEdit(row)">编辑</el-button>
						<el-button size="small" link type="danger" :disabled="row.id === authStore.state.user?.id" @click="remove(row)">删除</el-button>
					</template>
				</el-table-column>
			</el-table>
		</div>

		<!-- 新增/编辑对话框 -->
		<el-dialog v-model="dialogVisible" :title="editingId ? '编辑用户' : '新增用户'" width="480px">
			<el-form label-position="top" :model="form" size="small">
				<el-form-item label="用户名">
					<el-input v-model="form.username" :disabled="!!editingId" placeholder="登录账号" />
				</el-form-item>
				<el-form-item label="姓名">
					<el-input v-model="form.name" placeholder="真实姓名" />
				</el-form-item>
				<el-form-item label="角色">
					<el-select v-model="form.role" style="width: 100%">
						<el-option label="系统管理员" value="admin" />
						<el-option label="调度员" value="operator" />
						<el-option label="巡检员" value="inspector" />
						<el-option label="浏览用户" value="viewer" />
					</el-select>
				</el-form-item>
				<el-form-item label="部门">
					<el-input v-model="form.dept" placeholder="例如 管网巡检队" />
				</el-form-item>
				<el-form-item label="联系电话">
					<el-input v-model="form.phone" placeholder="手机号" />
				</el-form-item>
				<el-form-item :label="editingId ? '重置密码（留空则不修改）' : '初始密码'">
					<el-input v-model="form.password" type="password" show-password placeholder="密码" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiUsers } from "../api";
import { authStore } from "../store/auth";
import { ROLE_LABELS } from "../types";
import type { User } from "../types";

export default defineComponent({
	name: "UsersView",
	setup() {
		const list = ref<User[]>([]);
		const loading = ref(false);
		const dialogVisible = ref(false);
		const editingId = ref("");
		const submitting = ref(false);
		const form = reactive({ username: "", name: "", role: "viewer", dept: "", phone: "", password: "" });

		const roleLabel = (r: string) => ROLE_LABELS[r] || r;
		const roleTagType = (r: string) => (r === "admin" ? "danger" : r === "operator" ? "warning" : r === "inspector" ? "success" : "info");

		const load = async () => {
			loading.value = true;
			try {
				const res = await apiUsers.get();
				list.value = res.list;
			} catch (e: any) {
				ElMessage.error(e.message || "加载失败");
			} finally {
				loading.value = false;
			}
		};
		const openCreate = () => {
			editingId.value = "";
			Object.assign(form, { username: "", name: "", role: "viewer", dept: "", phone: "", password: "" });
			dialogVisible.value = true;
		};
		const openEdit = (row: User) => {
			editingId.value = row.id;
			Object.assign(form, { username: row.username, name: row.name, role: row.role, dept: row.dept || "", phone: row.phone || "", password: "" });
			dialogVisible.value = true;
		};
		const submit = async () => {
			if (!form.username || !form.name) { ElMessage.warning("请填写用户名与姓名"); return; }
			if (!editingId.value && !form.password) { ElMessage.warning("请设置初始密码"); return; }
			submitting.value = true;
			try {
				if (editingId.value) {
					const patch: any = { name: form.name, role: form.role, dept: form.dept, phone: form.phone };
					if (form.password) patch.password = form.password;
					await apiUsers.update(editingId.value, patch);
				} else {
					await apiUsers.create({ ...form } as any);
				}
				ElMessage.success("保存成功");
				dialogVisible.value = false;
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "保存失败");
			} finally {
				submitting.value = false;
			}
		};
		const remove = async (row: User) => {
			try {
				await ElMessageBox.confirm(`确定删除用户 ${row.name}（${row.username}）？`, "删除确认", { type: "warning" });
			} catch { return; }
			try {
				await apiUsers.remove(row.id);
				ElMessage.success("用户已删除");
				load();
			} catch (e: any) {
				ElMessage.error(e.message || "删除失败");
			}
		};

		onMounted(load);

		return { list, loading, dialogVisible, editingId, submitting, form, roleLabel, roleTagType, openCreate, openEdit, submit, remove, authStore };
	},
});
</script>
