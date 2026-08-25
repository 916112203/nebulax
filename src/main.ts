import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "./styles.css";
import App from "./App.vue";
import { authStore } from "./store/auth";
import { initApi, getMode } from "./api";
import { initRealtime, appStore } from "./store/app";
import { ROLE_LABELS } from "./types";

/* ---------------- 路由（hash 模式：兼容 GitHub Pages 刷新） ---------------- */
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

/* ---------------- 启动 ---------------- */
const app = createApp(App);
app.use(ElementPlus, { locale: zhCn });
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
	app.component(key, component);
}
app.use(router);
app.config.globalProperties.$mode = () => getMode();
app.config.globalProperties.$roleLabel = (role: string) => ROLE_LABELS[role] || role;

(async () => {
	appStore.state.mode = await initApi((ok) => {
		appStore.state.wsOnline = ok;
	});
	initRealtime();
	app.mount("#app");
})();
