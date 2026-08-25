import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "./styles.css";
import App from "./App.vue";
import { authStore } from "./store/auth";
import { probeHealth } from "./api/http";
import { initRealtime, appStore } from "./store/app";
import { ROLE_LABELS } from "./types";

/* ---------------- 路由（hash 模式：兼容 nginx 部署刷新） ---------------- */
const router = createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: "/login", component: () => import("./views/LoginView.vue"), meta: { public: true, title: "登录" } },
		{
			path: "/",
			component: () => import("./views/LayoutView.vue"),
			redirect: "/dashboard",
			children: [
				{ path: "dashboard", component: () => import("./views/DashboardView.vue"), meta: { title: "综合大屏" } },
				{ path: "map", component: () => import("./views/MapView.vue"), meta: { title: "管网一张图" } },
				{ path: "alarms", component: () => import("./views/AlarmView.vue"), meta: { title: "告警中心" } },
				{ path: "inspections", component: () => import("./views/InspectionView.vue"), meta: { title: "巡检管理" } },
				{ path: "workorders", component: () => import("./views/WorkOrderView.vue"), meta: { title: "工单管理" } },
				{ path: "analysis", component: () => import("./views/AnalysisView.vue"), meta: { title: "管网分析" } },
				{ path: "users", component: () => import("./views/UsersView.vue"), meta: { title: "用户管理", admin: true } },
			],
		},
		{ path: "/:pathMatch(.*)*", redirect: "/dashboard" },
	],
});

/* 登录守卫 */
router.beforeEach((to) => {
	if (!to.meta.public && !authStore.isLoggedIn) return "/login";
	if (to.meta.admin && !authStore.hasRole("admin")) return "/dashboard";
	if (to.path === "/login" && authStore.isLoggedIn) return "/dashboard";
	return true;
});
router.afterEach((to) => {
	document.title = `${to.meta.title || ""} · SmartPipe GIS 智慧管网平台`;
});

/* ---------------- 后端不可用拦截页 ---------------- */
const renderBackendDown = (reason: string) => {
	const el = document.getElementById("app");
	if (!el) return;
	el.innerHTML = `
		<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f2133;font-family:'Microsoft YaHei',sans-serif">
			<div style="background:#fff;border-radius:14px;padding:40px 48px;max-width:460px;text-align:center;box-shadow:0 18px 48px rgba(0,0,0,.35)">
				<div style="font-size:44px">🛰️</div>
				<h2 style="margin:10px 0 4px;font-size:20px">SmartPipe GIS 无法启动</h2>
				<p style="color:#5e6d82;font-size:14px;line-height:1.8;margin:12px 0 20px">
					前端必须连接后端服务才能使用。<br/>
					检测到后端不可用：<b>${reason}</b><br/>
					请确认后端已启动（API 地址：<code style="background:#f0f4f8;padding:2px 6px;border-radius:4px">${location.protocol}//${location.host}/api/overview/health</code>）
				</p>
				<button onclick="location.reload()" style="background:#1890ff;color:#fff;border:none;padding:10px 32px;border-radius:8px;font-size:14px;cursor:pointer">重试连接</button>
			</div>
		</div>`;
};

/* ---------------- 启动 ---------------- */
(async () => {
	// 前置校验：后端不可用则直接拦截，不进入应用
	const backendOk = await probeHealth();
	if (!backendOk) {
		renderBackendDown("健康检查失败（2.5s 超时或无响应）");
		return;
	}
	appStore.state.wsOnline = false;
	const app = createApp(App);
	app.use(ElementPlus, { locale: zhCn });
	for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
		app.component(key, component);
	}
	app.use(router);
	app.config.globalProperties.$roleLabel = (role: string) => ROLE_LABELS[role] || role;
	initRealtime();
	app.mount("#app");
})();
