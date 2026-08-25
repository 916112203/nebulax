<template>
	<div class="map-page">
		<!-- 地图画布 -->
		<div class="map-canvas">
			<div id="map" ref="mapEl" class="sp-map-container" />

			<!-- 实时通道状态 -->
			<div class="sp-map-mode-badge">
				<el-tag :type="appStore.state.wsOnline ? 'success' : 'warning'" size="small" effect="dark">
					{{ appStore.state.wsOnline ? "实时通道已连接" : "实时通道连接中…" }}
				</el-tag>
			</div>

			<!-- 搜索 -->
			<div class="sp-map-search">
				<el-input v-model="searchText" size="default" placeholder="搜索管线/井编号或名称，如：中山大道" clearable @keyup.enter="doSearch" @clear="clearSearchResult">
					<template #append>
						<el-button @click="doSearch"><el-icon><Search /></el-icon></el-button>
					</template>
				</el-input>
			</div>

			<!-- 工具条 -->
			<div class="sp-map-tools">
				<el-tooltip content="切换底图" placement="left">
					<el-dropdown trigger="click" @command="switchBaseMap">
						<el-button><el-icon><Picture /></el-icon></el-button>
						<template #dropdown>
							<el-dropdown-menu>
								<el-dropdown-item command="vector">矢量地图</el-dropdown-item>
								<el-dropdown-item command="satellite">卫星影像</el-dropdown-item>
							</el-dropdown-menu>
						</template>
					</el-dropdown>
				</el-tooltip>
				<el-tooltip content="专题图" placement="left">
					<el-dropdown trigger="click" @command="applyTheme">
						<el-button :type="theme ? 'primary' : 'default'"><el-icon><Brush /></el-icon></el-button>
						<template #dropdown>
							<el-dropdown-menu>
								<el-dropdown-item command="none">默认（按管线类型）</el-dropdown-item>
								<el-dropdown-item command="diameter" divided>按管径分级</el-dropdown-item>
								<el-dropdown-item command="depth">按埋深分级</el-dropdown-item>
								<el-dropdown-item command="age">按敷设年代</el-dropdown-item>
								<el-dropdown-item command="material">按材质</el-dropdown-item>
							</el-dropdown-menu>
						</template>
					</el-dropdown>
				</el-tooltip>
				<el-tooltip content="距离量测" placement="left">
					<el-button :type="measureMode === 'distance' ? 'primary' : 'default'" @click="toggleMeasure('distance')"><el-icon><Ruler /></el-icon></el-button>
				</el-tooltip>
				<el-tooltip content="面积量测" placement="left">
					<el-button :type="measureMode === 'area' ? 'primary' : 'default'" @click="toggleMeasure('area')"><el-icon><Crop /></el-icon></el-button>
				</el-tooltip>
				<el-tooltip content="多边形选择" placement="left">
					<el-button :type="polySelectMode ? 'primary' : 'default'" @click="togglePolySelect"><el-icon><FullScreen /></el-icon></el-button>
				</el-tooltip>
				<el-tooltip content="清除高亮与量测" placement="left">
					<el-button @click="clearHighlights"><el-icon><Delete /></el-icon></el-button>
				</el-tooltip>
			</div>

			<!-- 图例 -->
			<div class="sp-map-legend">
				<div class="legend-title">图例</div>
				<template v-if="!theme">
					<div v-for="(color, t) in PIPE_COLORS" :key="t"><span class="legend-line" :style="{ background: color }" />{{ t }}</div>
				</template>
				<template v-else>
					<div v-for="g in themeLegend" :key="g.label"><span class="legend-line" :style="{ background: g.color }" />{{ g.label }}</div>
				</template>
				<div><span class="sp-dot" style="background: #f5222d" />故障</div>
				<div><span class="sp-dot" style="background: #faad14" />维修中</div>
				<div><span class="legend-point" style="background: #8c5cc4" />检查井</div>
				<div><span class="legend-point" style="background: #e0911f" />阀门井</div>
				<div><span class="legend-point" style="background: #13c2c2" />泵站</div>
			</div>

			<!-- 实时监测迷你卡 -->
			<div class="sp-map-telemetry sp-card">
				<div class="telemetry-title">
					<span class="sp-dot" :style="{ background: '#52c41a' }" />实时监测
					<span class="telemetry-time">{{ latestTime }}</span>
				</div>
				<div v-for="s in topSensors" :key="s.id" class="telemetry-row" @click="locateSensor(s)">
					<span class="telemetry-name" :title="s.name">{{ s.name }}</span>
					<span class="telemetry-value" :class="{ 'value-alarm': isOverThreshold(s) }">{{ formatValue(s) }}</span>
				</div>
			</div>
		</div>

		<!-- 右侧面板 -->
		<div class="map-side">
			<el-collapse v-model="activePanels">
				<el-collapse-item title="图层管理" name="layers">
					<el-switch v-for="item in layerStates" :key="item.key" v-model="item.visible"
						:active-text="item.name" @change="syncLayerVisibility(item.key, item.visible)"
						style="margin-bottom: 10px; width: 100%" size="small" />
					<el-button size="small" text type="primary" @click="resetLayers">重置图层</el-button>
				</el-collapse-item>

				<el-collapse-item title="条件筛选" name="filter">
					<el-form label-position="top" :model="filterForm" size="small">
						<el-form-item label="管线类型">
							<el-select v-model="filterForm.pipeType" placeholder="全部类型" style="width: 100%">
								<el-option label="全部" value="all" />
								<el-option v-for="t in Object.keys(PIPE_COLORS)" :key="t" :label="t" :value="t" />
							</el-select>
						</el-form-item>
						<el-form-item label="状态">
							<el-select v-model="filterForm.status" placeholder="全部状态" style="width: 100%">
								<el-option label="全部" value="all" />
								<el-option label="正常" value="normal" />
								<el-option label="维修中" value="maintenance" />
								<el-option label="故障" value="fault" />
							</el-select>
						</el-form-item>
						<el-form-item label="最小管径 (mm)">
							<el-input-number v-model="filterForm.diameterMin" :min="0" :step="50" style="width: 100%" />
						</el-form-item>
						<el-form-item label="最小埋深 (m)">
							<el-input-number v-model="filterForm.depthMin" :min="0" :step="0.1" style="width: 100%" />
						</el-form-item>
						<div style="display: flex; gap: 8px">
							<el-button type="primary" size="small" style="flex: 1" @click="applyFilter">应用筛选</el-button>
							<el-button size="small" @click="resetFilter">重置</el-button>
						</div>
					</el-form>
				</el-collapse-item>

				<el-collapse-item title="巡检路线" name="route">
					<el-select v-model="inspectionId" placeholder="选择巡检计划" size="small" style="width: 100%" @change="drawInspectionRoute">
						<el-option v-for="i in inspectionOptions" :key="i.id" :label="`${i.name}（${i.status}）`" :value="i.id" />
					</el-select>
					<div v-if="routeInfo" class="route-info">
						<div>点位 {{ routeInfo.done }}/{{ routeInfo.total }} 已完成</div>
						<div v-if="routeInfo.issues" style="color: #f5222d">发现问题 {{ routeInfo.issues }} 处</div>
					</div>
				</el-collapse-item>

				<el-collapse-item title="数据管理" name="data">
					<div style="display: flex; flex-direction: column; gap: 8px">
						<el-button v-if="authStore.hasRole('operator')" type="primary" size="small" @click="openCreateDrawer">
							<el-icon><Plus /></el-icon>&nbsp;新增要素
						</el-button>
						<el-dropdown @command="handleExport" style="width: 100%">
							<el-button size="small" style="width: 100%">导出 GeoJSON ▾</el-button>
							<template #dropdown>
								<el-dropdown-menu>
									<el-dropdown-item command="pipes">导出管线</el-dropdown-item>
									<el-dropdown-item command="wells">导出检查井</el-dropdown-item>
									<el-dropdown-item command="pumps">导出泵站</el-dropdown-item>
									<el-dropdown-item command="buildings">导出建筑</el-dropdown-item>
									<el-dropdown-item command="all" divided>导出全部图层</el-dropdown-item>
								</el-dropdown-menu>
							</template>
						</el-dropdown>
						<input ref="fileInput" type="file" accept=".json,.geojson,application/json" style="display: none" @change="onUpload" />
						<el-button size="small" @click="fileInput?.click()">导入 GeoJSON</el-button>
					</div>
				</el-collapse-item>
			</el-collapse>
		</div>

		<!-- 要素属性/编辑抽屉 -->
		<FeatureDrawer ref="featureDrawerRef" v-model="drawerVisible" :mode="drawerMode" :layer="drawerLayer" :feature="selectedFeature"
			@locate="locateSelected" @analysis="runAnalysisFromDrawer" @pick-point="startPickPoint" @start-edit="startEdit" @saved="reloadLayers" @deleted="reloadLayers" />

		<!-- 分析结果抽屉 -->
		<AnalysisDrawer v-model="analysisVisible" :result="analysisResult" />
	</div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Draw from "ol/interaction/Draw";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";
import { getLength, getArea } from "ol/sphere";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { apiFeatures, apiAnalysis, apiSensors, apiInspections } from "../api";
import { authStore } from "../store/auth";
import { appStore } from "../store/app";
import { PIPE_COLORS, SENSOR_TYPE_LABELS, STATUS_LABELS } from "../types";
import type { GeoJSONFeature, LayerName, Sensor } from "../types";
import FeatureDrawer from "../components/map/FeatureDrawer.vue";
import AnalysisDrawer, { type AnalysisResult } from "../components/map/AnalysisDrawer.vue";

/* 天地图底图 */
const TK = "ce9373011a39697f989e5da52c53970e";
const tdtUrl = (layer: string) =>
	`https://t{0-7}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TK}`;

/* 专题图分级 */
const THEME_GRADES: Record<string, { label: string; color: string; test: (p: any) => boolean }[]> = {
	diameter: [
		{ label: "< DN300", color: "#bcd7ee", test: (p) => p.diameter < 300 },
		{ label: "DN300 ~ DN600", color: "#6ea8d8", test: (p) => p.diameter < 600 },
		{ label: "DN600 ~ DN1000", color: "#3576a8", test: (p) => p.diameter < 1000 },
		{ label: "≥ DN1000", color: "#163f66", test: () => true },
	],
	depth: [
		{ label: "< 1.5 m", color: "#d8c4e8", test: (p) => p.depth < 1.5 },
		{ label: "1.5 ~ 2.5 m", color: "#a482c2", test: (p) => p.depth < 2.5 },
		{ label: "2.5 ~ 4 m", color: "#6f4f96", test: (p) => p.depth < 4 },
		{ label: "≥ 4 m", color: "#3b2a54", test: () => true },
	],
	age: [
		{ label: "2000 年以前", color: "#b0483b", test: (p) => p.installYear < 2000 },
		{ label: "2000 ~ 2010 年", color: "#d8b39a", test: (p) => p.installYear < 2010 },
		{ label: "2010 ~ 2020 年", color: "#c9c9c9", test: (p) => p.installYear < 2020 },
		{ label: "2020 年以后", color: "#3a7ca8", test: () => true },
	],
	material: [
		{ label: "钢筋混凝土管", color: "#c25a10", test: (p) => p.material === "钢筋混凝土管" },
		{ label: "球墨铸铁管", color: "#2878b8", test: (p) => p.material === "球墨铸铁管" },
		{ label: "PE管", color: "#3a9c3f", test: (p) => p.material === "PE管" },
		{ label: "HDPE双壁波纹管", color: "#c0392b", test: (p) => p.material === "HDPE双壁波纹管" },
		{ label: "其他材质", color: "#7d3fa5", test: () => true },
	],
};

export default defineComponent({
	name: "MapView",
	components: { FeatureDrawer, AnalysisDrawer },
	setup() {
		const route = useRoute();
		const mapEl = ref<HTMLElement>();
		let map: Map;
		let vecLayer: TileLayer<XYZ>, cvaLayer: TileLayer<XYZ>, imgLayer: TileLayer<XYZ>, ciaLayer: TileLayer<XYZ>;
		const pipeSource = new VectorSource();
		const wellSource = new VectorSource();
		const pumpSource = new VectorSource();
		const buildingSource = new VectorSource();
		const sensorSource = new VectorSource();
		const highlightSource = new VectorSource();
		const analysisSource = new VectorSource();
		const routeSource = new VectorSource();
		const measureSource = new VectorSource();
		const selectSource = new VectorSource();
		const pipeLayer = new VectorLayer({ source: pipeSource, properties: { id: "pipes" } });
		const wellLayer = new VectorLayer({ source: wellSource, properties: { id: "wells" } });
		const pumpLayer = new VectorLayer({ source: pumpSource, properties: { id: "pumps" } });
		const buildingLayer = new VectorLayer({ source: buildingSource, properties: { id: "buildings" } });
		const sensorLayer = new VectorLayer({ source: sensorSource, properties: { id: "sensors" }, minZoom: 15 });
		const highlightLayer = new VectorLayer({ source: highlightSource, properties: { id: "highlight" }, zIndex: 10 });
		const analysisLayer = new VectorLayer({ source: analysisSource, properties: { id: "analysis" }, zIndex: 9 });
		const routeLayer = new VectorLayer({ source: routeSource, properties: { id: "route" }, zIndex: 8 });
		const measureLayer = new VectorLayer({ source: measureSource, properties: { id: "measure" }, zIndex: 11 });
		const selectLayer = new VectorLayer({ source: selectSource, properties: { id: "select" }, zIndex: 7 });

		/* ---------- 状态 ---------- */
		const layerStates = ref([
			{ key: "pipes", name: "管线图层", visible: true },
			{ key: "wells", name: "检查井图层", visible: true },
			{ key: "pumps", name: "泵站图层", visible: true },
			{ key: "buildings", name: "建筑图层", visible: true },
			{ key: "sensors", name: "传感器图层", visible: true },
		]);
		const activePanels = ref(["layers", "filter"]);
		const filterForm = reactive({ pipeType: "all", status: "all", diameterMin: 0, depthMin: 0 });
		const theme = ref<"" | "diameter" | "depth" | "age" | "material">("");
		const searchText = ref("");
		const measureMode = ref<"" | "distance" | "area">("");
		const polySelectMode = ref(false);
		let drawInteraction: Draw | null = null;
		let pickMode: { target: string } | null = null;

		const drawerVisible = ref(false);
		const drawerMode = ref<"view" | "edit" | "create">("view");
		const drawerLayer = ref<LayerName>("wells");
		const selectedFeature = ref<GeoJSONFeature | null>(null);
		const featureDrawerRef = ref<InstanceType<typeof FeatureDrawer>>();
		const analysisVisible = ref(false);
		const analysisResult = ref<AnalysisResult | null>(null);

		const sensors = ref<Sensor[]>([]);
		const inspectionOptions = ref<any[]>([]);
		const inspectionId = ref<string>("");
		const routeInfo = ref<{ total: number; done: number; issues: number } | null>(null);
		const latestTime = ref("--");

		/* ---------- 样式 ---------- */
		const pipeStyleFn = (f: Feature) => {
			const p = f.getProperties() as any;
			let color = PIPE_COLORS[p.type] || "#999";
			let width = p.status === "fault" ? 6 : 3.5;
			if (theme.value) {
				const grade = THEME_GRADES[theme.value]?.find((g) => g.test(p));
				color = grade?.color || "#999";
			}
			return new Style({
				stroke: new Stroke({ color, width }),
			});
		};
		const wellStyleFn = (f: Feature) => {
			const p = f.getProperties() as any;
			const isValve = p.type === "阀门井";
			const border = p.status === "fault" ? "#f5222d" : p.status === "maintenance" ? "#faad14" : "#ffffff";
			return new Style({
				image: new CircleStyle({
					radius: isValve ? 6 : 5,
					fill: new Fill({ color: isValve ? "#e0911f" : "#8c5cc4" }),
					stroke: new Stroke({ color: border, width: 1.5 }),
				}),
			});
		};
		const pumpStyleFn = (f: Feature) => {
			const p = f.getProperties() as any;
			return new Style({
				image: new CircleStyle({
					radius: 9,
					fill: new Fill({ color: "#13c2c2" }),
					stroke: new Stroke({ color: p.status === "fault" ? "#f5222d" : "#fff", width: 2 }),
				}),
				text: new Text({ text: "P", font: "bold 11px sans-serif", fill: new Fill({ color: "#fff" }) }),
			});
		};
		const buildingStyleFn = (f: Feature) => {
			const p = f.getProperties() as any;
			return new Style({
				stroke: new Stroke({ color: "#7265e6", width: 1.5 }),
				fill: new Fill({ color: "rgba(114,101,230,0.16)" }),
				text: new Text({ text: p.name || "", font: "10px sans-serif", fill: new Fill({ color: "#5e6d82" }), offsetY: -2 }),
			});
		};
		const sensorStyleFn = (f: Feature) => {
			const p = f.getProperties() as any;
			const v = appStore.state.latest.get(p.id);
			const over = v !== undefined && v > p.threshold;
			const colorMap: Record<string, string> = { flow: "#2878b8", pressure: "#3a9c3f", level: "#c25a10", gas: "#c0392b" };
			const unit = p.unit || "";
			return new Style({
				image: new CircleStyle({
					radius: over ? 8 : 5,
					fill: new Fill({ color: over ? "#f5222d" : colorMap[p.type] || "#1890ff" }),
					stroke: new Stroke({ color: "#fff", width: 1.5 }),
				}),
				text: new Text({
					text: v !== undefined ? `${Math.round(v * 10) / 10}${unit}` : p.name,
					font: "10px sans-serif",
					fill: new Fill({ color: over ? "#f5222d" : "#1f2d3d" }),
					stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: 3 }),
					offsetY: -16,
				}),
			});
		};

		const restyleAll = () => {
			pipeSource.getFeatures().forEach((f) => f.setStyle(pipeStyleFn(f)));
			wellSource.getFeatures().forEach((f) => f.setStyle(wellStyleFn(f)));
			pumpSource.getFeatures().forEach((f) => f.setStyle(pumpStyleFn(f)));
			buildingSource.getFeatures().forEach((f) => f.setStyle(buildingStyleFn(f)));
			sensorSource.getFeatures().forEach((f) => f.setStyle(sensorStyleFn(f)));
		};

		/* ---------- 数据加载 ---------- */
		const geoJson = new GeoJSON();
		const loadLayer = async (layer: LayerName, source: VectorSource) => {
			const fc = await apiFeatures.get(layer);
			source.clear();
			source.addFeatures(geoJson.readFeatures(fc, { featureProjection: "EPSG:3857" }));
		};
		const reloadLayers = async () => {
			await Promise.all([
				loadLayer("pipes", pipeSource),
				loadLayer("wells", wellSource),
				loadLayer("pumps", pumpSource),
				loadLayer("buildings", buildingSource),
			]);
			restyleAll();
		};
		const loadSensors = async () => {
			const { list } = await apiSensors.get();
			sensors.value = list;
			sensorSource.clear();
			list.forEach((s) => {
				const f = new Feature({ geometry: new Point(fromLonLat([s.x, s.y])) });
				f.setProperties(s);
				f.setId(s.id);
				sensorSource.addFeature(f);
			});
			restyleAll();
		};
		const loadInspections = async () => {
			const { list } = await apiInspections.get({ pageSize: 50 });
			inspectionOptions.value = list;
		};

		/* ---------- 图层控制 ---------- */
		const syncLayerVisibility = (key: string, visible: boolean) => {
			const layer = map.getLayers().getArray().find((item) => item.get("id") === key);
			if (layer) layer.setVisible(visible);
		};
		const resetLayers = () => {
			layerStates.value.forEach((item) => {
				item.visible = true;
				syncLayerVisibility(item.key, true);
			});
		};

		/* ---------- 筛选 ---------- */
		const applyFilter = async () => {
			const fc = await apiFeatures.get("pipes", {
				type: filterForm.pipeType,
				status: filterForm.status,
			});
			const features = geoJson.readFeatures(fc, { featureProjection: "EPSG:3857" }).filter((f) => {
				const p = f.getProperties() as any;
				return (p.diameter ?? Infinity) >= filterForm.diameterMin && (p.depth ?? Infinity) >= filterForm.depthMin;
			});
			pipeSource.clear();
			pipeSource.addFeatures(features);
			restyleAll();
			ElMessage.success(`筛选完成：显示 ${features.length} 条管线`);
		};
		const resetFilter = () => {
			filterForm.pipeType = "all";
			filterForm.status = "all";
			filterForm.diameterMin = 0;
			filterForm.depthMin = 0;
			loadLayer("pipes", pipeSource).then(restyleAll);
		};

		/* ---------- 底图与专题图 ---------- */
		const switchBaseMap = (cmd: string) => {
			const isVec = cmd === "vector";
			vecLayer.setVisible(isVec);
			cvaLayer.setVisible(isVec);
			imgLayer.setVisible(!isVec);
			ciaLayer.setVisible(!isVec);
		};
		const themeLegend = computed(() => (theme.value ? THEME_GRADES[theme.value] : []));
		const applyTheme = (cmd: string) => {
			theme.value = (cmd === "none" ? "" : cmd) as any;
			restyleAll();
		};

		/* ---------- 选择与属性 ---------- */
		const highlightStyle = new Style({
			stroke: new Stroke({ color: "rgba(245,34,45,0.95)", width: 5 }),
			fill: new Fill({ color: "rgba(245,34,45,0.12)" }),
		});
		const selectedId = ref("");
		const selectFeature = (f: Feature) => {
			const p = f.getProperties() as any;
			selectedId.value = p.id;
			const props: any = { ...p };
			delete props.wells;
			selectedFeature.value = {
				type: "Feature",
				properties: props,
				geometry: (f.getGeometry() as any),
			} as GeoJSONFeature;
			drawerLayer.value = (p.type && PIPE_COLORS[p.type]) ? "pipes" : p.type === "建筑" ? "buildings" : p.type === "泵站" ? "pumps" : "wells";
			drawerMode.value = "view";
			drawerVisible.value = true;
		};

		const onMapClick = (evt: any) => {
			if (pickMode) return; // 取点模式由专门处理器接管
			const lonLat = toLonLat(evt.coordinate);
			const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
				layerFilter: (l) => ["pipes", "wells", "pumps", "buildings"].includes(l.get("id") as string),
			});
			if (feature) selectFeature(feature as Feature);
			else {
				selectedFeature.value = null;
				drawerVisible.value = false;
			}
		};
		const onPickClick = (evt: any) => {
			if (!pickMode) return;
			const [lon, lat] = toLonLat(evt.coordinate);
			featureDrawerRef.value?.setPoint(pickMode.target, +lon.toFixed(6), +lat.toFixed(6));
			pickMode = null;
			map.un("singleclick", onPickClick);
			map.on("singleclick", onMapClick);
		};
		const startPickPoint = (target: string) => {
			pickMode = { target };
			map.un("singleclick", onMapClick);
			map.on("singleclick", onPickClick);
			ElMessage.info("请在地图上点击目标位置取点");
		};

		const locateSelected = () => {
			if (!selectedFeature.value) return;
			const f = findFeatureInSources(selectedFeature.value.properties.id, drawerLayer.value);
			if (!f) return;
			map.getView().fit(f.getGeometry()!.getExtent(), { padding: [120, 120, 120, 120], maxZoom: 18, duration: 400 });
			highlightSource.clear();
			const copy = f.clone() as Feature;
			copy.setStyle(highlightStyle);
			highlightSource.addFeature(copy);
		};

		const findFeatureInSources = (id: string, layer: LayerName): Feature | undefined => {
			const sourceMap: Record<LayerName, VectorSource> = { pipes: pipeSource, wells: wellSource, pumps: pumpSource, buildings: buildingSource };
			return sourceMap[layer]?.getFeatureById(id) || sourceMap[layer]?.getFeatures().find((f) => f.getProperties().id === id);
		};

		/* ---------- 编辑 ---------- */
		const openCreateDrawer = () => {
			drawerMode.value = "create";
			drawerLayer.value = "wells";
			selectedFeature.value = null;
			drawerVisible.value = true;
		};
		const startEdit = () => {
			drawerMode.value = "edit";
		};

		/* ---------- 空间分析 ---------- */
		const runAnalysisFromDrawer = async (cmd: string) => {
			const f = selectedFeature.value;
			if (!f) { ElMessage.warning("请先选择要素"); return; }
			try {
				if (cmd === "buffer") {
					const result = await apiAnalysis.buffer({ geometry: f.geometry, radius: 500 });
					analysisResult.value = { kind: "buffer", data: result };
					highlightSource.clear();
					result.features.forEach((hf: any) => {
						const fc = geoJson.readFeatures({ type: "FeatureCollection", features: [hf] }, { featureProjection: "EPSG:3857" })[0];
						fc.setStyle(highlightStyle);
						highlightSource.addFeature(fc);
					});
				} else if (cmd === "trace-up" || cmd === "trace-down") {
					const direction = cmd === "trace-up" ? "upstream" : "downstream";
					const result = await apiAnalysis.trace(f.properties.id, direction);
					analysisResult.value = { kind: "trace", data: result };
					analysisSource.clear();
					result.features.features.forEach((hf: any) => {
						const fc = geoJson.readFeatures({ type: "FeatureCollection", features: [hf] }, { featureProjection: "EPSG:3857" })[0];
						fc.setStyle(new Style({
							stroke: new Stroke({ color: direction === "upstream" ? "#2878b8" : "#c25a10", width: 5 }),
						}));
						analysisSource.addFeature(fc);
					});
					const ext = analysisSource.getExtent();
					if (ext) map.getView().fit(ext, { padding: [120, 120, 120, 120], maxZoom: 17, duration: 400 });
				} else if (cmd === "isolation") {
					const result = await apiAnalysis.isolation(f.properties.id);
					analysisResult.value = { kind: "isolation", data: result };
					analysisSource.clear();
					result.affectedPipes.features.forEach((hf: any) => {
						const fc = geoJson.readFeatures({ type: "FeatureCollection", features: [hf] }, { featureProjection: "EPSG:3857" })[0];
						fc.setStyle(new Style({ stroke: new Stroke({ color: "#f5222d", width: 6 }) }));
						analysisSource.addFeature(fc);
					});
					result.valvesToClose.forEach((v) => {
						const vf = new Feature({ geometry: new Point(fromLonLat(v.pt)) });
						vf.setStyle(new Style({
							image: new CircleStyle({ radius: 9, fill: new Fill({ color: "#f5222d" }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
							text: new Text({ text: "✕", font: "bold 12px sans-serif", fill: new Fill({ color: "#fff" }) }),
						}));
						analysisSource.addFeature(vf);
					});
					if (analysisSource.getFeatures().length) {
						const ext = analysisSource.getExtent();
						if (ext) map.getView().fit(ext, { padding: [120, 120, 120, 120], maxZoom: 16, duration: 400 });
					}
				} else if (cmd === "profile") {
					const result = await apiAnalysis.profile(f.properties.id);
					analysisResult.value = { kind: "profile", data: result };
				}
				analysisVisible.value = true;
			} catch (e: any) {
				ElMessage.error(e.message || "分析失败");
			}
		};

		/* ---------- 量测 ---------- */
		const toggleMeasure = (mode: "distance" | "area") => {
			if (measureMode.value === mode) {
				stopDraw();
				return;
			}
			measureMode.value = mode;
			stopDraw();
			measureSource.clear();
			drawInteraction = new Draw({
				source: measureSource,
				type: mode === "distance" ? "LineString" : "Polygon",
				style: new Style({
					stroke: new Stroke({ color: "#1890ff", width: 2, lineDash: [6, 6] }),
					fill: new Fill({ color: "rgba(24,144,255,0.12)" }),
					image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#1890ff" }), stroke: new Stroke({ color: "#fff", width: 1.5 }) }),
				}),
			});
			drawInteraction.on("drawend", (evt: any) => {
				const geom = evt.feature.getGeometry();
				if (mode === "distance") {
					const len = getLength(geom);
					ElMessage.success(`量测距离：${len.toFixed(1)} m`);
				} else {
					const area = getArea(geom);
					ElMessage.success(`量测面积：${area.toFixed(0)} m²（${(area / 10000).toFixed(2)} 公顷）`);
				}
				setTimeout(() => measureSource.clear(), 3500);
			});
			map.addInteraction(drawInteraction);
		};
		const stopDraw = () => {
			if (drawInteraction) {
				map.removeInteraction(drawInteraction);
				drawInteraction = null;
			}
			measureMode.value = "";
		};

		/* ---------- 多边形选择 ---------- */
		const togglePolySelect = () => {
			polySelectMode.value = !polySelectMode.value;
			stopDraw();
			if (!polySelectMode.value) { selectSource.clear(); return; }
			drawInteraction = new Draw({
				source: selectSource,
				type: "Polygon",
				style: new Style({
					stroke: new Stroke({ color: "#fa8c16", width: 2, lineDash: [6, 6] }),
					fill: new Fill({ color: "rgba(250,140,22,0.12)" }),
				}),
			});
			drawInteraction.on("drawend", (evt: any) => {
				const poly = evt.feature.getGeometry() as Polygon;
				const polyExtent = poly.getExtent();
				const found: Feature[] = [];
				[pipeSource, wellSource, pumpSource, buildingSource].forEach((src) => {
					src.getFeatures().forEach((f) => {
						const geom = f.getGeometry();
						// 简化判定：要素几何与多边形范围相交
						if (geom && geom.intersectsExtent(polyExtent)) found.push(f);
					});
				});
				selectSource.clear();
				found.forEach((f) => {
					const copy = f.clone() as Feature;
					copy.setStyle(highlightStyle);
					selectSource.addFeature(copy);
				});
				ElMessage.success(`框选到 ${found.length} 个要素`);
				setTimeout(() => selectSource.clear(), 8000);
				polySelectMode.value = false;
				stopDraw();
			});
			map.addInteraction(drawInteraction);
		};

		const clearHighlights = () => {
			highlightSource.clear();
			analysisSource.clear();
			measureSource.clear();
			selectSource.clear();
			searchSourceClear();
			analysisVisible.value = false;
		};

		/* ---------- 搜索 ---------- */
		const searchHighlightSource = new VectorSource();
		const searchLayer = new VectorLayer({ source: searchHighlightSource, zIndex: 12 });
		const searchSourceClear = () => searchHighlightSource.clear();
		const doSearch = async () => {
			const q = searchText.value.trim();
			if (!q) return;
			try {
				const { features } = await apiFeatures.search(q);
				if (!features.length) { ElMessage.info("未找到匹配要素"); return; }
				searchHighlightSource.clear();
				features.slice(0, 10).forEach((hf: any) => {
					const fc = geoJson.readFeatures({ type: "FeatureCollection", features: [hf] }, { featureProjection: "EPSG:3857" })[0];
					fc.setStyle(new Style({
						stroke: new Stroke({ color: "#fadb14", width: 4 }),
						image: new CircleStyle({ radius: 7, fill: new Fill({ color: "#fadb14" }), stroke: new Stroke({ color: "#1f2d3d", width: 1.5 }) }),
					}));
					searchHighlightSource.addFeature(fc);
				});
				const ext = searchHighlightSource.getExtent();
				if (ext) map.getView().fit(ext, { padding: [120, 120, 120, 120], maxZoom: 17, duration: 400 });
				ElMessage.success(`找到 ${features.length} 个匹配要素（黄色高亮前 10 个）`);
			} catch (e: any) {
				ElMessage.error(e.message || "搜索失败");
			}
		};
		const clearSearchResult = () => searchHighlightSource.clear();

		/* ---------- 巡检路线 ---------- */
		const drawInspectionRoute = async () => {
			routeSource.clear();
			routeInfo.value = null;
			if (!inspectionId.value) return;
			try {
				const { inspection } = await apiInspections.getOne(inspectionId.value);
				const pts = inspection.route.filter((r) => r.pt);
				const line = new Feature({ geometry: new LineString(pts.map((r) => fromLonLat(r.pt!))) });
				line.setStyle(new Style({ stroke: new Stroke({ color: "#722ed1", width: 3.5, lineDash: [12, 6] }) }));
				routeSource.addFeature(line);
				inspection.route.forEach((r) => {
					if (!r.pt) return;
					const color = r.status === "done" ? "#52c41a" : r.status === "issue" ? "#f5222d" : "#bfbfbf";
					const f = new Feature({ geometry: new Point(fromLonLat(r.pt)) });
					f.setStyle(new Style({
						image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 1.5 }) }),
						text: new Text({ text: String(r.order), font: "9px sans-serif", fill: new Fill({ color: "#fff" }) }),
					}));
					routeSource.addFeature(f);
				});
				routeInfo.value = {
					total: inspection.route.length,
					done: inspection.route.filter((r) => r.status === "done").length,
					issues: inspection.route.filter((r) => r.issue).length,
				};
				map.getView().fit(line.getGeometry()!.getExtent(), { padding: [140, 140, 140, 140], maxZoom: 16, duration: 400 });
			} catch (e: any) {
				ElMessage.error(e.message || "路线加载失败");
			}
		};

		/* ---------- 实时监测 ---------- */
		const topSensors = computed(() => sensors.value.slice(0, 5));
		const isOverThreshold = (s: Sensor) => {
			const v = appStore.state.latest.get(s.id);
			return v !== undefined && v > s.threshold;
		};
		const formatValue = (s: Sensor) => {
			const v = appStore.state.latest.get(s.id);
			return v === undefined ? "--" : `${Math.round(v * 10) / 10} ${s.unit}`;
		};
		const locateSensor = (s: Sensor) => {
			map.getView().animate({ center: fromLonLat([s.x, s.y]), zoom: 17, duration: 400 });
			const f = sensorSource.getFeatureById(s.id);
			if (f) {
				highlightSource.clear();
				const copy = f.clone() as Feature;
				copy.setStyle(highlightStyle);
				highlightSource.addFeature(copy);
			}
		};
		watch(() => appStore.state.telemetryTick, () => {
			latestTime.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
			// 更新传感器标注（每 3 次刷新一次全部，避免频繁重建样式）
			sensorSource.getFeatures().forEach((f) => f.setStyle(sensorStyleFn(f)));
		});

		/* ---------- 导入导出 ---------- */
		const fileInput = ref<HTMLInputElement>();
		const doExportSource = (source: VectorSource, filename: string) => {
			const features = source.getFeatures();
			if (!features.length) { ElMessage.warning("该图层没有可导出的要素"); return; }
			const fc = geoJson.writeFeaturesObject(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
			const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		};
		const handleExport = (cmd: string) => {
			const map2: Record<string, [VectorSource, string]> = {
				pipes: [pipeSource, "smartpipe_pipelines.geojson"],
				wells: [wellSource, "smartpipe_wells.geojson"],
				pumps: [pumpSource, "smartpipe_pumps.geojson"],
				buildings: [buildingSource, "smartpipe_buildings.geojson"],
			};
			if (cmd === "all") {
				const all = [...pipeSource.getFeatures(), ...wellSource.getFeatures(), ...pumpSource.getFeatures(), ...buildingSource.getFeatures()];
				const fc = geoJson.writeFeaturesObject(all, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
				const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url; a.download = "smartpipe_all_layers.geojson"; a.click();
				URL.revokeObjectURL(url);
				return;
			}
			const [source, name] = map2[cmd] || [];
			if (source) doExportSource(source, name);
		};
		const onUpload = async (event: Event) => {
			const input = event.target as HTMLInputElement;
			if (!input.files?.length) return;
			const text = await input.files[0].text();
			input.value = "";
			try {
				const gj = JSON.parse(text);
				const features = gj.features || (gj.type === "Feature" ? [gj] : []);
				if (!features.length) throw new Error("文件中没有要素");
				let ok = 0;
				for (const f of features) {
					try {
						const p = f.properties || {};
						const geomType = f.geometry?.type;
						if (!p.id || !geomType) continue;
						const layer: LayerName = geomType === "LineString" ? "pipes" : geomType === "Point" ? (p.type === "泵站" ? "pumps" : "wells") : "buildings";
						if (!["污水管", "雨水管", "给水管", "燃气管", "热力管"].includes(p.type) && layer === "pipes") p.type = "给水管";
						if (layer === "wells") p.type = "检查井";
						if (layer === "buildings") p.type = "建筑";
						await apiFeatures.create(layer, { type: "Feature", properties: p, geometry: f.geometry });
						ok++;
					} catch { /* 跳过冲突要素 */ }
				}
				await reloadLayers();
				ElMessage.success(`导入完成：成功导入 ${ok} 个要素`);
			} catch (e: any) {
				ElMessage.error(`导入失败：${e.message || "文件格式错误"}`);
			}
		};

		/* ---------- 外部定位（从告警/工单跳转） ---------- */
		const locateById = async (id: string, layer?: string) => {
			const layerName: LayerName = (layer === "pipes" || layer === "wells" || layer === "pumps" || layer === "buildings" ? layer : undefined) || (id.startsWith("VF") || id.startsWith("MH") ? "wells" : id.startsWith("PS") ? "pumps" : id.startsWith("BLD") ? "buildings" : "pipes");
			const fc = await apiFeatures.get(layerName, { q: id, pageSize: 5 });
			const hit = fc.features.find((f) => f.properties.id === id);
			if (!hit) { ElMessage.info(`未在地图上找到 ${id}`); return; }
			const f = geoJson.readFeatures({ type: "FeatureCollection", features: [hit] }, { featureProjection: "EPSG:3857" })[0];
			map.getView().fit(f.getGeometry()!.getExtent(), { padding: [140, 140, 140, 140], maxZoom: 17, duration: 500 });
			highlightSource.clear();
			f.setStyle(highlightStyle);
			highlightSource.addFeature(f);
			selectFeature(f);
		};
		watch(
			() => route.query.locate,
			(id) => {
				if (id && map) setTimeout(() => locateById(String(id), route.query.layer as string), 600);
			},
			{ immediate: false },
		);

		/* ---------- 初始化 ---------- */
		onMounted(async () => {
			vecLayer = new TileLayer({ source: new XYZ({ url: tdtUrl("vec") }), visible: true });
			cvaLayer = new TileLayer({ source: new XYZ({ url: tdtUrl("cva") }), visible: true });
			imgLayer = new TileLayer({ source: new XYZ({ url: tdtUrl("img") }), visible: false });
			ciaLayer = new TileLayer({ source: new XYZ({ url: tdtUrl("cia") }), visible: false });
			map = new Map({
				target: mapEl.value,
				layers: [vecLayer, cvaLayer, imgLayer, ciaLayer,
					buildingLayer, pipeLayer, wellLayer, pumpLayer, sensorLayer,
					selectLayer, routeLayer, analysisLayer, highlightLayer, measureLayer, searchLayer],
				view: new View({ center: fromLonLat([116.505, 39.795]), zoom: 14, maxZoom: 19 }),
			});
			map.on("singleclick", onMapClick);
			await Promise.all([reloadLayers(), loadSensors(), loadInspections()]);
			layerStates.value.forEach((item) => syncLayerVisibility(item.key, item.visible));
			// 若从告警页带定位参数跳转
			if (route.query.locate) locateById(String(route.query.locate), route.query.layer as string);
		});
		onBeforeUnmount(() => {
			map?.setTarget(undefined);
		});

		return {
			mapEl, layerStates, activePanels, filterForm, theme, themeLegend, searchText,
			measureMode, polySelectMode, drawerVisible, drawerMode, drawerLayer, selectedFeature,
			featureDrawerRef, analysisVisible, analysisResult, sensors, topSensors, isOverThreshold, formatValue, latestTime,
			inspectionOptions, inspectionId, routeInfo, fileInput,
			PIPE_COLORS, appStore, authStore,
			syncLayerVisibility, resetLayers, applyFilter, resetFilter,
			switchBaseMap, applyTheme, toggleMeasure, togglePolySelect, clearHighlights,
			doSearch, clearSearchResult, drawInspectionRoute, locateSensor,
			openCreateDrawer, startEdit, runAnalysisFromDrawer, startPickPoint, locateSelected,
			handleExport, onUpload, reloadLayers,
		};
	},
});
</script>

<style scoped>
.map-page {
	display: flex;
	height: 100%;
}
.map-canvas {
	flex: 1;
	position: relative;
	min-width: 0;
}
.map-side {
	width: 300px;
	border-left: 1px solid var(--sp-border);
	background: #fff;
	overflow-y: auto;
	padding: 10px 12px 24px;
	flex-shrink: 0;
}
.sp-map-telemetry {
	position: absolute;
	right: 14px;
	top: 120px;
	z-index: 10;
	width: 220px;
	padding: 10px 12px;
	font-size: 12px;
	box-shadow: 0 2px 8px rgba(31, 45, 61, 0.15);
}
.telemetry-title {
	font-weight: 600;
	margin-bottom: 6px;
	display: flex;
	align-items: center;
}
.telemetry-time {
	margin-left: auto;
	color: var(--sp-text-2);
	font-weight: 400;
	font-size: 11px;
}
.telemetry-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 3px 0;
	cursor: pointer;
	border-bottom: 1px dashed var(--sp-border);
}
.telemetry-row:last-child {
	border-bottom: none;
}
.telemetry-name {
	color: var(--sp-text-2);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 130px;
}
.telemetry-value {
	font-family: Consolas, monospace;
	font-weight: 600;
}
.value-alarm {
	color: #f5222d;
	animation: blink 1s infinite;
}
@keyframes blink {
	50% { opacity: 0.35; }
}
.legend-title {
	font-weight: 700;
	margin-bottom: 4px;
}
.legend-line {
	display: inline-block;
	width: 18px;
	height: 4px;
	border-radius: 2px;
	margin-right: 6px;
	vertical-align: middle;
}
.legend-point {
	display: inline-block;
	width: 9px;
	height: 9px;
	border-radius: 50%;
	margin-right: 6px;
	vertical-align: middle;
}
.route-info {
	margin-top: 8px;
	font-size: 12px;
	color: var(--sp-text-2);
}
</style>
