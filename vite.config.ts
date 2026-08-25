import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	base: "./",
	plugins: [vue()],
	server: {
		port: 5173,
		strictPort: true, // 端口被占用时直接报错提示，而不是悄悄换端口造成困惑
		proxy: {
			// 开发模式：/api（REST + WebSocket）代理到后端服务
			"/api": {
				target: "http://localhost:8080",
				changeOrigin: true,
				ws: true,
			},
		},
	},
	build: {
		outDir: "docs",
		chunkSizeWarningLimit: 900,
		rollupOptions: {
			output: {
				// 按依赖分组拆包：地图库 / 图表库 / UI 库 / 业务代码
				manualChunks: {
					ol: ["ol"],
					echarts: ["echarts"],
					"element-plus": ["element-plus", "@element-plus/icons-vue"],
					vendor: ["vue", "vue-router"],
				},
			},
		},
	},
});
