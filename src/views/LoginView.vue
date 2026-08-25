<template>
	<div class="login-wrap">
		<div class="login-bg" />
		<div class="login-panel sp-card">
			<div class="login-brand">
				<div class="brand-logo">🛰️</div>
				<h1>SmartPipe GIS</h1>
				<p>智慧城市地下管网管理平台</p>
				<el-tag v-if="appStore.state.mode === 'demo'" type="warning" size="small" effect="plain">
					<i class="el-icon-info" /> 演示模式（未连接后端，数据为浏览器内置模拟数据）
				</el-tag>
				<el-tag v-else type="success" size="small" effect="plain">已连接后端服务</el-tag>
			</div>
			<el-form :model="form" @keyup.enter="doLogin">
				<el-form-item>
					<el-input v-model="form.username" size="large" placeholder="用户名">
						<template #prefix><el-icon><User /></el-icon></template>
					</el-input>
				</el-form-item>
				<el-form-item>
					<el-input v-model="form.password" size="large" type="password" show-password placeholder="密码">
						<template #prefix><el-icon><Lock /></el-icon></template>
					</el-input>
				</el-form-item>
				<el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="doLogin">
					登 录
				</el-button>
			</el-form>
			<div class="login-demo-accounts">
				<div class="demo-title">演示账号（点击快速填充）</div>
				<div v-for="acc in demoAccounts" :key="acc.username" class="demo-account" @click="fill(acc)">
					<span class="acc-role" :style="{ background: acc.color }">{{ acc.roleLabel }}</span>
					<span class="acc-name">{{ acc.username }} / {{ acc.password }}</span>
					<span class="acc-desc">{{ acc.desc }}</span>
				</div>
			</div>
		</div>
		<div class="login-footer">
			SmartPipe GIS · 模拟真实案例演示系统 · 数据均为虚构，仅用于教学与产品演示
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { authStore } from "../store/auth";
import { appStore } from "../store/app";

const demoAccounts = [
	{ username: "admin", password: "admin123", role: "admin", roleLabel: "系统管理员", color: "#f5222d", desc: "全部权限 + 用户管理" },
	{ username: "zhangwei", password: "zhang123", role: "operator", roleLabel: "调度员", color: "#fa8c16", desc: "工单流转 + 要素编辑" },
	{ username: "lina", password: "lina123", role: "inspector", roleLabel: "巡检员", color: "#52c41a", desc: "巡检执行 + 告警处置" },
	{ username: "wangfang", password: "wang123", role: "viewer", roleLabel: "浏览用户", color: "#1890ff", desc: "只读查看" },
];

export default defineComponent({
	name: "LoginView",
	setup() {
		const router = useRouter();
		const form = reactive({ username: "", password: "" });
		const loading = ref(false);

		const fill = (acc: { username: string; password: string }) => {
			form.username = acc.username;
			form.password = acc.password;
		};

		const doLogin = async () => {
			if (!form.username || !form.password) {
				ElMessage.warning("请输入用户名和密码");
				return;
			}
			loading.value = true;
			try {
				await authStore.login(form.username, form.password);
				ElMessage.success("登录成功");
				router.push("/dashboard");
			} catch (e: any) {
				ElMessage.error(e.message || "登录失败");
			} finally {
				loading.value = false;
			}
		};

		return { form, loading, demoAccounts, doLogin, fill, appStore };
	},
});
</script>

<style scoped>
.login-wrap {
	height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
}
.login-bg {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(160deg, rgba(15, 33, 51, 0.92) 0%, rgba(24, 70, 110, 0.85) 55%, rgba(13, 87, 136, 0.8) 100%),
		repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255, 255, 255, 0.03) 40px),
		repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255, 255, 255, 0.03) 40px);
}
.login-panel {
	position: relative;
	z-index: 2;
	width: 400px;
	padding: 34px 36px 26px;
	border-radius: 14px;
}
.login-brand {
	text-align: center;
	margin-bottom: 22px;
}
.brand-logo {
	font-size: 40px;
}
.login-brand h1 {
	margin: 6px 0 2px;
	font-size: 22px;
	letter-spacing: 1px;
}
.login-brand p {
	margin: 0 0 12px;
	color: var(--sp-text-2);
	font-size: 13px;
}
.login-demo-accounts {
	margin-top: 22px;
	border-top: 1px dashed var(--sp-border);
	padding-top: 14px;
}
.demo-title {
	font-size: 12px;
	color: var(--sp-text-2);
	margin-bottom: 8px;
}
.demo-account {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: 6px;
	cursor: pointer;
	font-size: 12px;
}
.demo-account:hover {
	background: #f0f6ff;
}
.acc-role {
	color: #fff;
	border-radius: 4px;
	padding: 1px 7px;
	font-size: 11px;
	flex-shrink: 0;
}
.acc-name {
	font-family: Consolas, monospace;
	flex-shrink: 0;
}
.acc-desc {
	color: var(--sp-text-2);
}
.login-footer {
	position: absolute;
	bottom: 18px;
	width: 100%;
	text-align: center;
	color: rgba(255, 255, 255, 0.6);
	font-size: 12px;
	z-index: 2;
}
</style>
