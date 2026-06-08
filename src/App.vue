<template>
	<el-container style="height: 100%">
		<el-header
			height="60px"
			class="map-header"
			style="padding: 0 16px; background: #fff"
		>
			<div>
				<h2>SmartPipe GIS</h2>
				<p>智慧城市地下管网管理平台 · GitHub Pages 可部署</p>
			</div>
			<el-button type="primary" size="small" @click="exportGeoJSON"
				>导出管线 GeoJSON</el-button
			>
		</el-header>
		<el-container>
			<el-aside width="320px" class="side-panel">
				<el-card class="info-card" shadow="always">
					<div
						style="
							display: flex;
							justify-content: space-between;
							align-items: center;
							margin-bottom: 12px;
						"
					>
						<span>图层管理</span>
						<el-button type="text" @click="resetLayers">重置</el-button>
					</div>
					<el-switch
						v-for="item in layerStates"
						:key="item.key"
						v-model="item.visible"
						:active-text="item.name"
						@change="syncLayerVisibility(item.key, item.visible)"
						style="margin-bottom: 10px; width: 100%"
					/>
				</el-card>

				<el-card class="info-card" shadow="always">
					<div
						style="
							display: flex;
							justify-content: space-between;
							align-items: center;
							margin-bottom: 12px;
						"
					>
						<span>条件筛选</span>
						<el-button type="text" @click="resetFilter">重置</el-button>
					</div>
					<el-form label-position="top" label-width="100px" :model="filterForm">
						<el-form-item label="最小管径 (mm)">
							<el-input-number
								v-model="filterForm.diameterMin"
								:min="0"
								:step="50"
								style="width: 100%"
							/>
						</el-form-item>
						<el-form-item label="最小埋深 (m)">
							<el-input-number
								v-model="filterForm.depthMin"
								:min="0"
								:step="0.1"
								style="width: 100%"
							/>
						</el-form-item>
						<el-form-item label="状态筛选">
							<el-select v-model="filterForm.status" placeholder="选择状态">
								<el-option label="全部" value="all" />
								<el-option label="正常" value="normal" />
								<el-option label="维修中" value="maintenance" />
								<el-option label="故障" value="fault" />
							</el-select>
						</el-form-item>
					</el-form>
				</el-card>

				<el-card class="info-card" shadow="always">
					<div
						style="
							display: flex;
							justify-content: space-between;
							align-items: center;
							margin-bottom: 12px;
						"
					>
						<span>属性查询</span>
						<el-button type="text" @click="clearSelection">清空</el-button>
					</div>
					<div v-if="selectedProperties">
						<p><strong>名称：</strong>{{ selectedProperties.name || "-" }}</p>
						<p v-if="selectedProperties.id">
							<strong>编号：</strong>{{ selectedProperties.id }}
						</p>
						<p v-if="selectedProperties.type">
							<strong>类型：</strong>{{ selectedProperties.type }}
						</p>
						<p v-if="selectedProperties.diameter">
							<strong>管径：</strong>{{ selectedProperties.diameter }} mm
						</p>
						<p v-if="selectedProperties.depth">
							<strong>埋深：</strong>{{ selectedProperties.depth }} m
						</p>
						<p v-if="selectedProperties.status">
							<strong>状态：</strong
							>{{ statusLabels[selectedProperties.status] }}
						</p>
						<el-button
							v-if="selectedProperties.type === '泵站'"
							type="primary"
							size="small"
							class="highlight-button"
							@click="runBufferQuery"
							>500m 缓冲查询</el-button
						>
					</div>
					<div v-else>
						<p>请点击管线、检查井或泵站查看属性。</p>
					</div>
				</el-card>

				<el-card class="info-card" shadow="always">
					<div
						style="
							display: flex;
							justify-content: space-between;
							align-items: center;
							margin-bottom: 12px;
						"
					>
						<span>数据编辑</span>
					</div>
					<el-form label-position="top" label-width="100px" :model="editForm">
						<el-form-item label="新增检查井 名称">
							<el-input v-model="editForm.name" placeholder="例如 检查井C" />
						</el-form-item>
						<el-form-item label="类型">
							<el-select v-model="editForm.type" placeholder="选择类型">
								<el-option label="检查井" value="检查井" />
								<el-option label="泵站" value="泵站" />
							</el-select>
						</el-form-item>
						<el-form-item label="经度">
							<el-input-number
								v-model="editForm.lon"
								:min="116.39"
								:max="116.41"
								:step="0.0001"
								style="width: 100%"
							/>
						</el-form-item>
						<el-form-item label="纬度">
							<el-input-number
								v-model="editForm.lat"
								:min="39.9"
								:max="39.92"
								:step="0.0001"
								style="width: 100%"
							/>
						</el-form-item>
						<el-button
							type="primary"
							size="small"
							@click="addInspectionPoint"
							style="width: 100%"
							>新增点位</el-button
						>
					</el-form>
				</el-card>

				<el-card class="info-card" shadow="always">
					<div
						style="
							margin-bottom: 12px;
							display: flex;
							justify-content: space-between;
							align-items: center;
						"
					>
						<span>GeoJSON 导入/导出</span>
					</div>
					<input type="file" accept="application/json" @change="onUpload" />
					<p style="margin-top: 10px; font-size: 12px; color: #606266">
						请上传 GeoJSON 格式文件，系统会将符合管线属性的数据导入平台。
					</p>
				</el-card>
			</el-aside>

			<el-container>
				<el-main style="padding: 12px; height: calc(100vh - 60px)">
					<div class="map-container" id="map"></div>
					<el-row :gutter="16" style="margin-top: 16px">
						<el-col :span="12">
							<el-card class="chart-box" shadow="always">
								<h3>管线类型统计</h3>
								<div id="type-chart" style="height: 240px"></div>
							</el-card>
						</el-col>
						<el-col :span="12">
							<el-card class="chart-box" shadow="always">
								<h3>管线状态统计</h3>
								<div id="status-chart" style="height: 240px"></div>
							</el-card>
						</el-col>
					</el-row>
					<el-row :gutter="16" style="margin-top: 16px">
						<el-col :span="12">
							<el-card class="panel-card" shadow="always">
								<h3>巡检路线分析</h3>
								<p>路线点数：{{ inspectionRoute.length }}</p>
								<p>总距离：{{ routeSummary.distance.toFixed(1) }} m</p>
								<p>预计耗时：{{ routeSummary.duration }} min</p>
							</el-card>
						</el-col>
						<el-col :span="12">
							<el-card class="panel-card" shadow="always">
								<h3>告警统计</h3>
								<el-tag type="success">正常 {{ statusCount.normal }}</el-tag>
								<el-tag type="warning"
									>维修中 {{ statusCount.maintenance }}</el-tag
								>
								<el-tag type="danger">故障 {{ statusCount.fault }}</el-tag>
							</el-card>
						</el-col>
					</el-row>
				</el-main>
			</el-container>
		</el-container>
	</el-container>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref, watch } from "vue";
import * as echarts from "echarts";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { OSM } from "ol/source";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import {
	sampleBuildings,
	samplePipelines,
	sampleWells,
	samplePumps,
	inspectionRoute,
	layerDefinitions,
	statusLabels,
} from "./data/sampleData";

interface FeatureProperties {
	id?: string;
	name?: string;
	type?: string;
	diameter?: number;
	depth?: number;
	status?: string;
	length?: number;
}

export default defineComponent({
	setup() {
		const map = ref<Map>();
		const selectedProperties = ref<FeatureProperties | null>(null);
		const layerStates = ref(layerDefinitions.map((item) => ({ ...item })));
		const filterForm = reactive({ diameterMin: 0, depthMin: 0, status: "all" });
		const editForm = reactive({
			name: "",
			type: "检查井",
			lon: 116.3975,
			lat: 39.907,
		});
		const pipelineSource = new VectorSource();
		const buildingSource = new VectorSource();
		const wellSource = new VectorSource();
		const pumpSource = new VectorSource();
		const highlightSource = new VectorSource();
		const routeSource = new VectorSource();
		const typeChartInstance = ref<echarts.ECharts | null>(null);
		const statusChartInstance = ref<echarts.ECharts | null>(null);

		const statusCount = reactive({ normal: 0, maintenance: 0, fault: 0 });
		const routeSummary = reactive({ distance: 0, duration: 0 });

		const getPipelineStyle = (feature: Feature) => {
			const props = feature.getProperties() as FeatureProperties;
			const typeColor =
				props.type === "污水管"
					? "#ff7f50"
					: props.type === "雨水管"
						? "#40a9ff"
						: "#73d13d";
			const status = props.status || "normal";
			const statusColor =
				status === "fault"
					? "#f5222d"
					: status === "maintenance"
						? "#faad14"
						: "#52c41a";
			return new Style({
				stroke: new Stroke({
					color: status === "fault" ? "#f5222d" : typeColor,
					width: 6,
				}),
				text: new Text({
					text: props.id || "",
					font: "12px Microsoft YaHei",
					fill: new Fill({ color: "#ffffff" }),
					stroke: new Stroke({ color: "#000000", width: 2 }),
					offsetY: -14,
				}),
			});
		};

		const pointStyle = (type: string, status?: string) => {
			const fillColor = type === "泵站" ? "#13c2c2" : "#9254de";
			const borderColor =
				status === "fault"
					? "#f5222d"
					: status === "maintenance"
						? "#faad14"
						: "#ffffff";
			return new Style({
				image: new CircleStyle({
					radius: type === "泵站" ? 10 : 7,
					fill: new Fill({ color: fillColor }),
					stroke: new Stroke({ color: borderColor, width: 2 }),
				}),
				text: new Text({
					text: type === "泵站" ? "P" : "W",
					font: "12px Microsoft YaHei",
					fill: new Fill({ color: "#fff" }),
					offsetY: -18,
				}),
			});
		};

		const highlightStyle = new Style({
			stroke: new Stroke({ color: "rgba(255, 99, 71, 0.9)", width: 4 }),
			fill: new Fill({ color: "rgba(255, 99, 71, 0.12)" }),
		});

		const loadSource = () => {
			const geojson = new GeoJSON();
			buildingSource.addFeatures(
				geojson.readFeatures(sampleBuildings, {
					featureProjection: "EPSG:3857",
				}),
			);
			pipelineSource.addFeatures(
				geojson.readFeatures(samplePipelines, {
					featureProjection: "EPSG:3857",
				}),
			);
			wellSource.addFeatures(
				geojson.readFeatures(sampleWells, { featureProjection: "EPSG:3857" }),
			);
			pumpSource.addFeatures(
				geojson.readFeatures(samplePumps, { featureProjection: "EPSG:3857" }),
			);
			pipelineSource
				.getFeatures()
				.forEach((feature) => feature.setStyle(getPipelineStyle(feature)));
			wellSource
				.getFeatures()
				.forEach((feature) =>
					feature.setStyle(
						pointStyle(
							"检查井",
							(feature.getProperties() as FeatureProperties).status,
						),
					),
				);
			pumpSource
				.getFeatures()
				.forEach((feature) =>
					feature.setStyle(
						pointStyle(
							"泵站",
							(feature.getProperties() as FeatureProperties).status,
						),
					),
				);
		};

		const resetLayers = () => {
			layerStates.value = layerDefinitions.map((item) => ({ ...item }));
			layerStates.value.forEach((item) =>
				syncLayerVisibility(item.key, item.visible),
			);
		};

		const syncLayerVisibility = (key: string, visible: boolean) => {
			const layer = map.value
				?.getLayers()
				.getArray()
				.find((item) => item.get("id") === key);
			if (layer) {
				layer.setVisible(visible);
			}
		};

		const resetFilter = () => {
			filterForm.diameterMin = 0;
			filterForm.depthMin = 0;
			filterForm.status = "all";
			applyFilter();
		};

		const applyFilter = () => {
			const all = new GeoJSON().readFeatures(samplePipelines, {
				featureProjection: "EPSG:3857",
			});
			const filtered = all.filter((feature) => {
				const props = feature.getProperties() as FeatureProperties;
				const passDiameter =
					props.diameter === undefined ||
					props.diameter >= filterForm.diameterMin;
				const passDepth =
					props.depth === undefined || props.depth >= filterForm.depthMin;
				const passStatus =
					filterForm.status === "all" || props.status === filterForm.status;
				return passDiameter && passDepth && passStatus;
			});
			pipelineSource.clear();
			pipelineSource.addFeatures(filtered);
			pipelineSource
				.getFeatures()
				.forEach((feature) => feature.setStyle(getPipelineStyle(feature)));
			updateStatusCount();
			updateCharts();
		};

		const clearSelection = () => {
			selectedProperties.value = null;
			highlightSource.clear();
		};

		const onMapClick = (evt: any) => {
			selectedProperties.value = null;
			map.value?.forEachFeatureAtPixel(evt.pixel, (feature) => {
				const props = feature.getProperties() as FeatureProperties;
				selectedProperties.value = props;
			});
		};

		const runBufferQuery = () => {
			if (
				!selectedProperties.value ||
				selectedProperties.value.type !== "泵站"
			) {
				return;
			}
			const pumpFeature = pumpSource
				.getFeatures()
				.find(
					(feature) =>
						(feature.getProperties() as FeatureProperties).id ===
						selectedProperties.value?.id,
				);
			if (!pumpFeature) return;
			const center = (pumpFeature.getGeometry() as Point).getCoordinates();
			const found: string[] = [];
			highlightSource.clear();
			const radius = 500;
			pipelineSource.getFeatures().forEach((feature) => {
				const geometry = feature.getGeometry();
				if (geometry) {
					const closest = geometry.getClosestPoint(center);
					const distance = getLength(new LineString([center, closest]));
					if (distance <= radius) {
						found.push((feature.getProperties() as FeatureProperties).id || "");
						const copy = feature.clone() as Feature;
						copy.setStyle(highlightStyle);
						highlightSource.addFeature(copy);
					}
				}
			});
			wellSource.getFeatures().forEach((feature) => {
				const distance = getLength(
					new LineString([
						center,
						(feature.getGeometry() as Point).getCoordinates(),
					]),
				);
				if (distance <= radius) {
					found.push((feature.getProperties() as FeatureProperties).id || "");
					const copy = feature.clone() as Feature;
					copy.setStyle(highlightStyle);
					highlightSource.addFeature(copy);
				}
			});
			const circle = new Feature({
				geometry: new Point(center).buffer(radius, 64),
			});
			circle.setStyle(highlightStyle);
			highlightSource.addFeature(circle);
			if (found.length === 0) {
				window.alert("缓冲区内未发现管线或检查井。");
			}
		};

		const addInspectionPoint = () => {
			if (!editForm.name) return;
			const feature = new Feature({
				geometry: new Point(fromLonLat([editForm.lon, editForm.lat])),
				id: `PT${Date.now()}`,
				name: editForm.name,
				type: editForm.type,
				status: "normal",
			});
			feature.setStyle(pointStyle(editForm.type, "normal"));
			if (editForm.type === "检查井") {
				wellSource.addFeature(feature);
			} else {
				pumpSource.addFeature(feature);
			}
			localStorage.setItem(
				"smartpipe_inspection_points",
				JSON.stringify({ time: Date.now() }),
			);
			window.alert("新增点位已添加至地图。");
		};

		const onUpload = (event: Event) => {
			const input = event.target as HTMLInputElement;
			if (!input.files?.length) return;
			const file = input.files[0];
			const reader = new FileReader();
			reader.onload = () => {
				try {
					const geojson = JSON.parse(reader.result as string);
					const features = new GeoJSON().readFeatures(geojson, {
						featureProjection: "EPSG:3857",
					});
					pipelineSource.addFeatures(features);
					features.forEach((feature) =>
						feature.setStyle(getPipelineStyle(feature)),
					);
					updateStatusCount();
					updateCharts();
					window.alert("GeoJSON 导入成功。");
				} catch (err) {
					window.alert("导入失败，请检查文件格式。");
				}
			};
			reader.readAsText(file);
		};

		const exportGeoJSON = () => {
			const geojson = new GeoJSON().writeFeaturesObject(
				pipelineSource.getFeatures(),
				{
					featureProjection: "EPSG:3857",
					dataProjection: "EPSG:4326",
				},
			);
			const blob = new Blob([JSON.stringify(geojson, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "smartpipe_pipelines.geojson";
			a.click();
			URL.revokeObjectURL(url);
		};

		const updateStatusCount = () => {
			statusCount.normal = 0;
			statusCount.maintenance = 0;
			statusCount.fault = 0;
			pipelineSource.getFeatures().forEach((feature) => {
				const status = (feature.getProperties() as FeatureProperties)
					.status as string;
				if (
					status &&
					statusCount[status as "normal" | "maintenance" | "fault"] !==
						undefined
				) {
					statusCount[status as "normal" | "maintenance" | "fault"]++;
				}
			});
		};

		const updateRouteSummary = () => {
			const coords = inspectionRoute.map((item) => fromLonLat(item.coordinate));
			if (coords.length < 2) return;
			let total = 0;
			for (let i = 1; i < coords.length; i++) {
				total += getLength(new LineString([coords[i - 1], coords[i]]));
			}
			routeSummary.distance = total;
			routeSummary.duration = Math.max(5, Math.round(total / 120));

			const routeFeature = new Feature({
				geometry: new LineString(coords),
			});
			routeFeature.setStyle(
				new Style({
					stroke: new Stroke({ color: "#722ed1", width: 4, lineDash: [12, 6] }),
				}),
			);
			routeSource.clear();
			routeSource.addFeature(routeFeature);
		};

		const updateCharts = () => {
			const pipelines = pipelineSource
				.getFeatures()
				.map((feature) => feature.getProperties() as FeatureProperties);
			const typeCount = { 污水管: 0, 雨水管: 0, 给水管: 0 };
			pipelines.forEach((item) => {
				if (item.type) typeCount[item.type] = (typeCount[item.type] || 0) + 1;
			});
			const option1 = {
				tooltip: { trigger: "item" },
				legend: { bottom: "0" },
				series: [
					{
						name: "管线类型",
						type: "pie",
						radius: ["40%", "65%"],
						label: { formatter: "{b}: {d}%" },
						data: Object.entries(typeCount).map(([name, value]) => ({
							name,
							value,
						})),
					},
				],
			};
			typeChartInstance.value?.setOption(option1);

			const statusCountChart = {
				normal: 0,
				maintenance: 0,
				fault: 0,
			};
			pipelines.forEach((item) => {
				if (item.status)
					statusCountChart[item.status as "normal" | "maintenance" | "fault"]++;
			});
			const option2 = {
				tooltip: { trigger: "axis" },
				xAxis: { type: "category", data: ["正常", "维修中", "故障"] },
				yAxis: { type: "value" },
				series: [
					{
						data: [
							statusCountChart.normal,
							statusCountChart.maintenance,
							statusCountChart.fault,
						],
						type: "bar",
						itemStyle: { color: "#1890ff" },
					},
				],
			};
			statusChartInstance.value?.setOption(option2);
		};

		onMounted(() => {
			loadSource();
			const mapObj = new Map({
				target: "map",
				layers: [
					new TileLayer({
						source: new OSM(),
						visible: true,
						properties: { id: "base" },
					}),
					new VectorLayer({
						source: buildingSource,
						style: new Style({
							stroke: new Stroke({ color: "#7265e6", width: 2 }),
							fill: new Fill({ color: "rgba(114,101,230,0.18)" }),
						}),
						properties: { id: "building" },
					}),
					new VectorLayer({
						source: pipelineSource,
						properties: { id: "pipeline" },
					}),
					new VectorLayer({ source: wellSource, properties: { id: "well" } }),
					new VectorLayer({ source: pumpSource, properties: { id: "pump" } }),
					new VectorLayer({
						source: highlightSource,
						properties: { id: "highlight" },
					}),
					new VectorLayer({ source: routeSource, properties: { id: "route" } }),
				],
				view: new View({ center: fromLonLat([116.3978, 39.9073]), zoom: 16 }),
			});
			mapObj.on("click", onMapClick);
			map.value = mapObj;
			updateStatusCount();
			updateRouteSummary();
			typeChartInstance.value = echarts.init(
				document.getElementById("type-chart") as HTMLElement,
			);
			statusChartInstance.value = echarts.init(
				document.getElementById("status-chart") as HTMLElement,
			);
			updateCharts();
			window.addEventListener("resize", () => {
				typeChartInstance.value?.resize();
				statusChartInstance.value?.resize();
			});
			layerStates.value.forEach((item) =>
				syncLayerVisibility(item.key, item.visible),
			);
		});

		watch(filterForm, applyFilter, { deep: true });

		return {
			layerStates,
			filterForm,
			editForm,
			selectedProperties,
			statusLabels,
			statusCount,
			inspectionRoute,
			routeSummary,
			resetLayers,
			syncLayerVisibility,
			resetFilter,
			clearSelection,
			runBufferQuery,
			addInspectionPoint,
			onUpload,
			exportGeoJSON,
		};
	},
});
</script>

<style scoped>
#map {
	width: 100%;
	height: 520px;
	border-radius: 12px;
	overflow: hidden;
	box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}
.el-header {
	background: #f5f7fa;
}
.el-header h2 {
	margin: 0;
	font-size: 18px;
}
.el-header p {
	margin: 0;
	color: #606266;
	font-size: 13px;
}
</style>
