<template>
	<div class="layout">
		<!-- 侧边栏 -->
		<aside class="layout-aside">
			<div class="aside-brand">
				<span class="aside-logo">🛰️</span>
				<div>
					<div class="aside-title">SmartPipe GIS</div>
					<div class="aside-sub">智慧管网管理平台</div>
				</div>
			</div>
			<el-menu :default-active="route.path" router class="aside-menu" background-color="transparent" text-color="#a8bdd0" active-text-color="#fff">
				<el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
					<el-icon><component :is="item.icon" /></el-icon>
					<span>{{ item.label }}</span>
				</el-menu-item>
			</el-menu>
			<div class="aside-footer">
				<div class="aside-mode">
					<el-tag v-if="appStore.state.mode === 'demo'" size="small" type="warning" effect="dark">演示模式</el-tag>
					<el-tag v-else size="small" type="success" effect="dark">在线模式</el-tag>
				</div>
			</div>
		</aside>

		<!-- 主区域 -->
		<div class="layout-main">
			<header class="layout-header">
				<div class="header-title">{{ route.meta.title }}</div>
				<div class="header-right">
					<span class="ws-status">
						<span class="sp-dot" :style="{ background: appStore.state.wsOnline ? '#52c41a' : '#faad14' }" />
						{{ appStore.state.wsOnline ? "实时通道已连接" : "实时通道连接中…" }}
					</span>
					<el-dropdown @command="onUserCommand">
						<span class="user-chip">
							<el-avatar :size="28" style="background: #1890ff">{{ (authStore.state.user?.name || "?")[0] }}</el-avatar>
							<span class="user-name">{{ authStore.state.user?.name }}</span>
							<el-tag size="small" effect="plain">{{ roleLabel(authStore.state.user?.role) }}</el-tag>
						</span>
						<template #dropdown>
							<el-dropdown-menu>
								<el-dropdown-item command="logout">退出登录</el-dropdown-item>
							</el-dropdown-menu>
						</template>
					</el-dropdown>
				</div>
			</header>
			<main class="layout-content">
				<router-view />
			</main>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElNotification } from "element-plus";
import { authStore } from "../store/auth";
import { appStore } from "../store/app";
import { ALARM_LEVEL_LABELS } from "../types";

const menus = [
	{ path: "/dashboard", label: "综合大屏", icon: "DataBoard" },
	{ path: "/map", label: "管网一张图", icon: "MapLocation" },
	{ path: "/alarms", label: "告警中心", icon: "Bell" },
	{ path: "/inspections", label: "巡检管理", icon: "Guide" },
	{ path: "/workorders", label: "工单管理", icon: "Tickets" },
	{ path: "/analysis", label: "管网分析", icon: "Connection" },
	{ path: "/users", label: "用户管理", icon: "User", adminOnly: true },
];

export default defineComponent({
	name: "LayoutView",
	setup() {
		const route = useRoute();
		const router = useRouter();
		const onAlarm = (e: Event) => {
			const alarm = (e as CustomEvent).detail;
			if (!alarm || !appStore.shouldNotifyAlarm(alarm)) return;
			ElNotification({
				title: `${ALARM_LEVEL_LABELS[alarm.level] || ""}告警：${alarm.title}`,
				message: alarm.description || alarm.source_name || "",
				type: alarm.level === "critical" ? "error" : "warning",
				duration: 8000,
				onClick: () => router.push("/alarms"),
			});
		};
		onMounted(() => window.addEventListener("sp-alarm", onAlarm));
		onBeforeUnmount(() => window.removeEventListener("sp-alarm", onAlarm));

		const onUserCommand = (cmd: string) => {
			if (cmd === "logout") {
				authStore.logout();
				router.push("/login");
			}
		};
		const roleLabel = (r?: string) => ({ admin: "系统管理员", operator: "调度员", inspector: "巡检员", viewer: "浏览用户" })[r || ""] || r || "";

		return { route, menus: menus.filter((m) => !m.adminOnly || authStore.hasRole("admin")), authStore, appStore, onUserCommand, roleLabel };
	},
});
</script>

<style scoped>
.layout {
	display: flex;
	height: 100vh;
}
.layout-aside {
	width: 208px;
	background: var(--sp-sidebar-bg);
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
}
.aside-brand {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px 14px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.aside-logo {
	font-size: 26px;
}
.aside-title {
	color: #fff;
	font-weight: 700;
	font-size: 15px;
	letter-spacing: 0.5px;
}
.aside-sub {
	color: #6e8aa5;
	font-size: 11px;
}
.aside-menu {
	border-right: none;
	flex: 1;
	padding-top: 8px;
}
.aside-menu :deep(.el-menu-item) {
	height: 44px;
	margin: 2px 8px;
	border-radius: 8px;
}
.aside-menu :deep(.el-menu-item.is-active) {
	background: var(--sp-sidebar-active);
}
.aside-menu :deep(.el-menu-item:hover) {
	background: rgba(255, 255, 255, 0.07);
}
.aside-footer {
	padding: 14px;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.aside-mode {
	display: flex;
	justify-content: center;
}
.layout-main {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
}
.layout-header {
	height: 52px;
	background: #fff;
	border-bottom: 1px solid var(--sp-border);
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 18px;
	flex-shrink: 0;
}
.header-title {
	font-weight: 700;
	font-size: 15px;
}
.header-right {
	display: flex;
	align-items: center;
	gap: 18px;
}
.ws-status {
	font-size: 12px;
	color: var(--sp-text-2);
	display: flex;
	align-items: center;
}
.user-chip {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	outline: none;
}
.user-name {
	font-size: 13px;
	font-weight: 500;
}
.layout-content {
	flex: 1;
	min-height: 0;
	overflow: hidden;
}
</style>
