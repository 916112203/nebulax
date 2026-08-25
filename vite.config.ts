import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	base: "./",
	plugins: [vue()],
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
