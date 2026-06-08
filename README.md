# SmartPipe GIS

智慧城市地下管网管理平台（WebGIS），结合 Vue3、OpenLayers、ECharts 与 Element Plus，面向 GitHub Pages 免费部署。

## 🚀 项目亮点

- 管线、检查井、泵站图层管理
- 属性查询与条件筛选
- 缓冲区空间查询
- 管线类型与状态统计
- 巡检路线分析
- GeoJSON 导入/导出
- GitHub Pages 部署支持

## 技术栈

- Vue 3
- Vite
- TypeScript
- OpenLayers
- ECharts
- Element Plus
- GeoJSON

## 本地启动

```bash
npm install
npm run dev
```

## GitHub Pages 部署

项目已配置 `vite` 构建输出到 `docs/` 目录，直接将仓库 `main` 分支的 `docs/` 目录作为 Pages 发布源即可。

```bash
npm run build
```

## 项目结构

```
webTest/
├── docs/               # Vite build 输出目录
├── public/
├── src/
│   ├── App.vue
│   ├── data/sampleData.ts
│   ├── main.ts
│   └── styles.css
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## 简历描述建议

**项目名称**：智慧城市地下管网管理平台（SmartPipe GIS）

**职责描述**：

- 基于 Vue3 + OpenLayers 构建地下管网可视化平台
- 实现管线、检查井、泵站图层管理与显隐控制
- 实现管线属性查询、条件筛选和 500m 缓冲区空间查询
- 使用 ECharts 构建管线类型与状态统计分析
- 支持 GeoJSON 数据导入导出，具备数据工程能力
- 配置 GitHub Pages 部署，实现静态网站发布

**技术栈**：Vue3、TypeScript、OpenLayers、ECharts、Element Plus、GeoJSON、GitHub Pages
