<template>
	<el-container style="height: 100vh; overflow: hidden">
		<el-header height="60px" class="map-header" style="padding: 0 16px; background: #fff">
			<div>
				<h2>SmartPipe GIS</h2>
				<p>智慧城市地下管网管理平台 · 天地图</p>
			</div>
			<el-dropdown @command="handleExport">
				<el-button type="primary" size="small">
		导出 GeoJSON ▼
				</el-button>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item command="pipeline">导出管线</el-dropdown-item>
						<el-dropdown-item command="well">导出检查井</el-dropdown-item>
						<el-dropdown-item command="pump">导出泵站</el-dropdown-item>
						<el-dropdown-item command="building">导出建筑</el-dropdown-item>
						<el-dropdown-item command="all" divided>导出全部图层</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>
		</el-header>
		<el-container>
			<el-aside width="320px" class="side-panel">
				<!-- 底图切换 -->
				<el-card class="info-card" shadow="always">
					<div style="margin-bottom: 8px; font-weight: 500">底图切换</div>
					<el-radio-group v-model="baseMap" size="small" @change="switchBaseMap">
						<el-radio-button value="vector">矢量地图</el-radio-button>
						<el-radio-button value="satellite">卫星影像</el-radio-button>
					</el-radio-group>
				</el-card>

				<!-- 图层管理 -->
				<el-card class="info-card" shadow="always">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
						<span>图层管理</span>
						<el-button type="text" @click="resetLayers">重置</el-button>
					</div>
					<el-switch v-for="item in layerStates" :key="item.key" v-model="item.visible"
						:active-text="item.name" @change="syncLayerVisibility(item.key, item.visible)"
						style="margin-bottom: 10px; width: 100%" />
				</el-card>

				<!-- 条件筛选 -->
				<el-card class="info-card" shadow="always">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
						<span>条件筛选</span>
						<el-button type="text" @click="resetFilter">重置</el-button>
					</div>
					<el-form label-position="top" :model="filterForm">
						<el-form-item label="最小管径 (mm)">
							<el-input-number v-model="filterForm.diameterMin" :min="0" :step="50" style="width: 100%" />
						</el-form-item>
						<el-form-item label="最小埋深 (m)">
							<el-input-number v-model="filterForm.depthMin" :min="0" :step="0.1" style="width: 100%" />
						</el-form-item>
						<el-form-item label="管线类型">
							<el-select v-model="filterForm.pipeType" placeholder="全部类型">
								<el-option label="全部" value="all" />
								<el-option label="污水管" value="污水管" />
								<el-option label="雨水管" value="雨水管" />
								<el-option label="给水管" value="给水管" />
								<el-option label="燃气管" value="燃气管" />
								<el-option label="热力管" value="热力管" />
							</el-select>
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

				<!-- 属性查询 -->
				<el-card class="info-card" shadow="always">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
						<span>属性查询</span>
						<el-button type="text" @click="clearSelection">清空</el-button>
					</div>
					<div v-if="selectedProperties">
						<p><strong>名称：</strong>{{ selectedProperties.name || "-" }}</p>
						<p v-if="selectedProperties.id"><strong>编号：</strong>{{ selectedProperties.id }}</p>
						<p v-if="selectedProperties.type"><strong>类型：</strong>{{ selectedProperties.type }}</p>
						<p v-if="selectedProperties.diameter"><strong>管径：</strong>{{ selectedProperties.diameter }} mm</p>
						<p v-if="selectedProperties.depth"><strong>埋深：</strong>{{ selectedProperties.depth }} m</p>
						<p v-if="selectedProperties.material"><strong>材质：</strong>{{ selectedProperties.material }}</p>
						<p v-if="selectedProperties.installYear"><strong>敷设年份：</strong>{{ selectedProperties.installYear }}</p>
						<p v-if="selectedProperties.capacity"><strong>容量：</strong>{{ selectedProperties.capacity }}</p>
						<p v-if="selectedProperties.power"><strong>功率：</strong>{{ selectedProperties.power }}</p>
						<p v-if="selectedProperties.area"><strong>面积：</strong>{{ selectedProperties.area }} m²</p>
						<p v-if="selectedProperties.floors"><strong>层数：</strong>{{ selectedProperties.floors }} 层</p>
						<p v-if="selectedProperties.status"><strong>状态：</strong>{{ statusLabels[selectedProperties.status] }}</p>
						<div style="display: flex; gap: 8px; margin-top: 10px">
							<el-button v-if="selectedProperties.type === '泵站'" type="primary" size="small"
								@click="runBufferQuery">500m 缓冲查询</el-button>
							<el-button type="warning" size="small" @click="editSelectedFeature">编辑此要素</el-button>
						</div>
					</div>
					<div v-else><p>请点击地图上的要素查看属性，或点击"编辑此要素"进行修改。</p></div>
				</el-card>

				<!-- 数据编辑 -->
				<el-card class="info-card" shadow="always">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
						<span>数据编辑 <el-tag v-if="isEditing" type="warning" size="small">编辑模式</el-tag></span>
						<el-button v-if="isEditing" type="text" @click="cancelEdit">取消编辑</el-button>
					</div>
					<el-form label-position="top" :model="editForm">
						<el-form-item label="要素类别">
							<el-select v-model="editForm.editType" placeholder="选择类别" @change="onEditTypeChange"
								:disabled="isEditing">
								<el-option label="检查井" value="检查井" />
								<el-option label="泵站" value="泵站" />
								<el-option label="管线" value="管线" />
								<el-option label="建筑" value="建筑" />
							</el-select>
						</el-form-item>

						<!-- ===== 检查井 & 泵站 共用 ===== -->
						<template v-if="editForm.editType === '检查井' || editForm.editType === '泵站'">
							<el-form-item label="名称">
								<el-input v-model="editForm.name" placeholder="例如 中山路3#检查井" />
							</el-form-item>
							<el-form-item label="编号">
								<el-input v-model="editForm.id" placeholder="例如 MH-YS-05" />
							</el-form-item>
							<el-form-item label="状态">
								<el-select v-model="editForm.status" placeholder="选择状态">
									<el-option label="正常" value="normal" />
									<el-option label="维修中" value="maintenance" />
									<el-option label="故障" value="fault" />
								</el-select>
							</el-form-item>
							<el-form-item v-if="editForm.editType === '检查井'" label="井深 (m)">
								<el-input-number v-model="editForm.depth" :min="0" :step="0.1" style="width: 100%" />
							</el-form-item>
							<el-form-item v-if="editForm.editType === '泵站'" label="容量 (m³/s)">
								<el-input v-model="editForm.capacity" placeholder="例如 3.2 m³/s" />
							</el-form-item>
							<el-form-item v-if="editForm.editType === '泵站'" label="功率 (kW)">
								<el-input v-model="editForm.power" placeholder="例如 180 kW" />
							</el-form-item>
							<el-form-item label="经度">
								<el-input-number v-model="editForm.lon" :min="116.38" :max="116.42" :step="0.0001"
									style="width: 100%" />
							</el-form-item>
							<el-form-item label="纬度">
								<el-input-number v-model="editForm.lat" :min="39.89" :max="39.93" :step="0.0001"
									style="width: 100%" />
							</el-form-item>
						</template>

						<!-- ===== 管线 ===== -->
						<template v-if="editForm.editType === '管线'">
							<el-form-item label="编号">
								<el-input v-model="editForm.id" placeholder="例如 WS-DN800-04" />
							</el-form-item>
							<el-form-item label="名称">
								<el-input v-model="editForm.name" placeholder="例如 世纪大道污水支管" />
							</el-form-item>
							<el-form-item label="管线类型">
								<el-select v-model="editForm.pipeType" placeholder="选择类型">
									<el-option label="污水管" value="污水管" />
									<el-option label="雨水管" value="雨水管" />
									<el-option label="给水管" value="给水管" />
									<el-option label="燃气管" value="燃气管" />
									<el-option label="热力管" value="热力管" />
								</el-select>
							</el-form-item>
							<el-row :gutter="12">
								<el-col :span="12">
									<el-form-item label="管径 (mm)">
										<el-input-number v-model="editForm.diameter" :min="50" :step="50"
											style="width: 100%" />
									</el-form-item>
								</el-col>
								<el-col :span="12">
									<el-form-item label="埋深 (m)">
										<el-input-number v-model="editForm.depth" :min="0" :step="0.1"
											style="width: 100%" />
									</el-form-item>
								</el-col>
							</el-row>
							<el-form-item label="状态">
								<el-select v-model="editForm.status" placeholder="选择状态">
									<el-option label="正常" value="normal" />
									<el-option label="维修中" value="maintenance" />
									<el-option label="故障" value="fault" />
								</el-select>
							</el-form-item>
							<el-form-item label="材质">
								<el-input v-model="editForm.material" placeholder="例如 HDPE双壁波纹管" />
							</el-form-item>
							<el-row :gutter="12">
								<el-col :span="12">
									<el-form-item label="敷设年份">
										<el-input-number v-model="editForm.installYear" :min="1990" :max="2030"
											style="width: 100%" />
									</el-form-item>
								</el-col>
								<el-col :span="12">
									<el-form-item label="长度 (m)">
										<el-input-number v-model="editForm.length" :min="10" :step="10"
											style="width: 100%" />
									</el-form-item>
								</el-col>
							</el-row>
							<el-form-item label="起点坐标（经度 / 纬度）">
								<el-row :gutter="8">
									<el-col :span="12">
										<el-input-number v-model="editForm.startLon" :min="116.38" :max="116.42"
											:step="0.0001" style="width: 100%" placeholder="经度" />
									</el-col>
									<el-col :span="12">
										<el-input-number v-model="editForm.startLat" :min="39.89" :max="39.93"
											:step="0.0001" style="width: 100%" placeholder="纬度" />
									</el-col>
								</el-row>
							</el-form-item>
							<el-form-item label="终点坐标（经度 / 纬度）">
								<el-row :gutter="8">
									<el-col :span="12">
										<el-input-number v-model="editForm.endLon" :min="116.38" :max="116.42"
											:step="0.0001" style="width: 100%" placeholder="经度" />
									</el-col>
									<el-col :span="12">
										<el-input-number v-model="editForm.endLat" :min="39.89" :max="39.93"
											:step="0.0001" style="width: 100%" placeholder="纬度" />
									</el-col>
								</el-row>
							</el-form-item>
						</template>

						<!-- ===== 建筑 ===== -->
						<template v-if="editForm.editType === '建筑'">
							<el-form-item label="建筑名称">
								<el-input v-model="editForm.name" placeholder="例如 市政管网管理中心" />
							</el-form-item>
							<el-row :gutter="12">
								<el-col :span="12">
									<el-form-item label="面积 (m²)">
										<el-input-number v-model="editForm.area" :min="100" :step="100"
											style="width: 100%" />
									</el-form-item>
								</el-col>
								<el-col :span="12">
									<el-form-item label="层数">
										<el-input-number v-model="editForm.floors" :min="1" :max="100"
											style="width: 100%" />
									</el-form-item>
								</el-col>
							</el-row>
							<el-form-item label="西南角（经度 / 纬度）">
								<el-row :gutter="8">
									<el-col :span="12">
										<el-input-number v-model="editForm.swLon" :min="116.38" :max="116.42"
											:step="0.0001" style="width: 100%" placeholder="经度" />
									</el-col>
									<el-col :span="12">
										<el-input-number v-model="editForm.swLat" :min="39.89" :max="39.93"
											:step="0.0001" style="width: 100%" placeholder="纬度" />
									</el-col>
								</el-row>
							</el-form-item>
							<el-form-item label="东北角（经度 / 纬度）">
								<el-row :gutter="8">
									<el-col :span="12">
										<el-input-number v-model="editForm.neLon" :min="116.38" :max="116.42"
											:step="0.0001" style="width: 100%" placeholder="经度" />
									</el-col>
									<el-col :span="12">
										<el-input-number v-model="editForm.neLat" :min="39.89" :max="39.93"
											:step="0.0001" style="width: 100%" placeholder="纬度" />
									</el-col>
								</el-row>
							</el-form-item>
						</template>
					</el-form>
					<div style="display: flex; gap: 8px">
						<el-button type="primary" size="small" @click="saveFeature" style="flex: 1">
							{{ isEditing ? '更新要素' : '新增要素' }}
						</el-button>
						<el-button v-if="isEditing" type="danger" size="small" @click="deleteFeature">
							删除要素
						</el-button>
					</div>
				</el-card>

				<!-- GeoJSON 导入 -->
				<el-card class="info-card" shadow="always">
					<div style="margin-bottom: 12px"><span>GeoJSON 导入</span></div>
					<input type="file" accept="application/json,.geojson" @change="onUpload" />
					<p style="margin-top: 10px; font-size: 12px; color: #606266">
						支持管线(LineString)、检查井/泵站(Point)、建筑(Polygon)，自动识别类型导入。
					</p>
				</el-card>
			</el-aside>

			<el-container>
				<el-main style="padding: 12px; height: calc(100vh - 60px); overflow-y: auto">
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
								<el-tag type="warning">维修中 {{ statusCount.maintenance }}</el-tag>
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
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import {
	sampleBuildings, samplePipelines, sampleWells, samplePumps,
	inspectionRoute, layerDefinitions, statusLabels, pipelineColors,
} from "./data/sampleData";

const TK = "ce9373011a39697f989e5da52c53970e";
const tiandituUrl = (layer: string) =>
	`https://t{0-7}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TK}`;

interface FeatureProperties {
	id?: string; name?: string; type?: string; diameter?: number;
	depth?: number; status?: string; length?: number; material?: string;
	installYear?: number; capacity?: string; power?: string; area?: number; floors?: number;
}

export default defineComponent({
	setup() {
		const map = ref<Map>();
		const selectedProperties = ref<FeatureProperties | null>(null);
		const layerStates = ref(layerDefinitions.map((item) => ({ ...item })));
		const baseMap = ref<string>("vector");
		const filterForm = reactive({ diameterMin: 0, depthMin: 0, pipeType: "all", status: "all" });

		/* ---- 编辑状态 ---- */
		const editingFeature = ref<Feature | null>(null);
		const editingSource = ref<VectorSource | null>(null);
		const isEditing = ref(false);

		const emptyEditForm = () => ({
			editType: "检查井" as string,
			name: "" as string,
			id: "" as string,
			status: "normal" as string,
			depth: 2.0 as number,
			diameter: 500 as number,
			length: 500 as number,
			material: "" as string,
			installYear: 2024 as number,
			capacity: "" as string,
			power: "" as string,
			pipeType: "污水管" as string,
			area: 5000 as number,
			floors: 5 as number,
			lon: 116.398 as number,
			lat: 39.9075 as number,
			startLon: 116.397 as number,
			startLat: 39.907 as number,
			endLon: 116.398 as number,
			endLat: 39.908 as number,
			swLon: 116.397 as number,
			swLat: 39.907 as number,
			neLon: 116.398 as number,
			neLat: 39.908 as number,
		});
		const editForm = reactive(emptyEditForm());

		const resetEditForm = () => {
			Object.assign(editForm, emptyEditForm());
			editingFeature.value = null;
			editingSource.value = null;
			isEditing.value = false;
		};

		const onEditTypeChange = () => {
			// When switching type while not editing, reset relevant fields
		};

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

		let vecTileLayer: TileLayer<XYZ>;
		let cvaTileLayer: TileLayer<XYZ>;
		let imgTileLayer: TileLayer<XYZ>;
		let ciaTileLayer: TileLayer<XYZ>;

		/* ---- 样式 ---- */
		const getPipelineStyle = (feature: Feature) => {
			const props = feature.getProperties() as FeatureProperties;
			const typeColor = pipelineColors[props.type || ""] || "#faad14";
			const status = props.status || "normal";
			return new Style({
				stroke: new Stroke({ color: status === "fault" ? "#f5222d" : typeColor, width: status === "fault" ? 8 : 6 }),
				text: new Text({ text: props.id || "", font: "11px Microsoft YaHei", fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#000", width: 2 }), offsetY: -16 }),
			});
		};

		const pointStyle = (type: string, status?: string) => {
			const fillColor = type === "泵站" ? "#13c2c2" : "#9254de";
			const borderColor = status === "fault" ? "#f5222d" : status === "maintenance" ? "#faad14" : "#fff";
			return new Style({
				image: new CircleStyle({ radius: type === "泵站" ? 10 : 7, fill: new Fill({ color: fillColor }), stroke: new Stroke({ color: borderColor, width: 2 }) }),
				text: new Text({ text: type === "泵站" ? "P" : "W", font: "bold 11px Microsoft YaHei", fill: new Fill({ color: "#fff" }), offsetY: -18 }),
			});
		};

		const buildingStyle = () => new Style({
			stroke: new Stroke({ color: "#7265e6", width: 2 }),
			fill: new Fill({ color: "rgba(114,101,230,0.18)" }),
			text: new Text({ font: "11px Microsoft YaHei", fill: new Fill({ color: "#333" }), offsetY: 10 }),
		});

		const highlightStyle = new Style({
			stroke: new Stroke({ color: "rgba(255, 99, 71, 0.9)", width: 4 }),
			fill: new Fill({ color: "rgba(255, 99, 71, 0.12)" }),
		});

		/* ---- 为目标 source 的要素统一应用样式 ---- */
		const restyleSource = (src: VectorSource) => {
			src.getFeatures().forEach((f) => {
				const p = f.getProperties() as FeatureProperties;
				if (p.type === "管线") {
					f.setStyle(getPipelineStyle(f));
				} else if (p.type === "检查井") {
					f.setStyle(pointStyle("检查井", p.status));
				} else if (p.type === "泵站") {
					f.setStyle(pointStyle("泵站", p.status));
				} else {
					// building
					const s = buildingStyle();
					s.getText().setText(p.name || "");
					f.setStyle(s);
				}
			});
		};

		const loadSource = () => {
			const geojson = new GeoJSON();
			buildingSource.addFeatures(geojson.readFeatures(sampleBuildings, { featureProjection: "EPSG:3857" }));
			pipelineSource.addFeatures(geojson.readFeatures(samplePipelines, { featureProjection: "EPSG:3857" }));
			wellSource.addFeatures(geojson.readFeatures(sampleWells, { featureProjection: "EPSG:3857" }));
			pumpSource.addFeatures(geojson.readFeatures(samplePumps, { featureProjection: "EPSG:3857" }));
			restyleSource(pipelineSource);
			restyleSource(wellSource);
			restyleSource(pumpSource);
			// Apply building text styles
			buildingSource.getFeatures().forEach((f) => {
				const s = buildingStyle();
				const p = f.getProperties() as FeatureProperties;
				s.getText().setText(p.name || "");
				f.setStyle(s);
			});
		};

		const switchBaseMap = (val: string) => {
			const isVec = val === "vector";
			vecTileLayer.setVisible(isVec);
			cvaTileLayer.setVisible(isVec);
			imgTileLayer.setVisible(!isVec);
			ciaTileLayer.setVisible(!isVec);
		};

		const resetLayers = () => {
			layerStates.value = layerDefinitions.map((item) => ({ ...item }));
			layerStates.value.forEach((item) => syncLayerVisibility(item.key, item.visible));
		};

		const syncLayerVisibility = (key: string, visible: boolean) => {
			const layer = map.value?.getLayers().getArray().find((item) => item.get("id") === key);
			if (layer) layer.setVisible(visible);
		};

		const resetFilter = () => {
			filterForm.diameterMin = 0;
			filterForm.depthMin = 0;
			filterForm.pipeType = "all";
			filterForm.status = "all";
			applyFilter();
		};

		const applyFilter = () => {
			const all = new GeoJSON().readFeatures(samplePipelines, { featureProjection: "EPSG:3857" });
			const filtered = all.filter((feature) => {
				const props = feature.getProperties() as FeatureProperties;
				return (props.diameter === undefined || props.diameter >= filterForm.diameterMin)
					&& (props.depth === undefined || props.depth >= filterForm.depthMin)
					&& (filterForm.pipeType === "all" || props.type === filterForm.pipeType)
					&& (filterForm.status === "all" || props.status === filterForm.status);
			});
			pipelineSource.clear();
			pipelineSource.addFeatures(filtered);
			restyleSource(pipelineSource);
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

		/* ---- 将选中要素加载到编辑表单 ---- */
		const editSelectedFeature = () => {
			if (!selectedProperties.value) return;
			const props = selectedProperties.value;
			const src = findFeatureSource(props.id || "", props.type || "");
			if (!src || !props.id) {
				window.alert("无法定位该要素的数据源。");
				return;
			}
			const feature = src.getFeatures().find(
				(f) => (f.getProperties() as FeatureProperties).id === props.id
			);
			if (!feature) return;

			isEditing.value = true;
			editingFeature.value = feature;
			editingSource.value = src;
			editForm.editType = props.type || "检查井";
			editForm.name = props.name || "";
			editForm.id = props.id || "";
			editForm.status = props.status || "normal";

			if (props.type === "检查井" || props.type === "泵站") {
				editForm.depth = props.depth || 2;
				editForm.capacity = props.capacity || "";
				editForm.power = props.power || "";
				const geom = feature.getGeometry() as Point;
				const coord = geom.getCoordinates();
				const [lon, lat] = from3857ToLonLat(coord[0], coord[1]);
				editForm.lon = lon;
				editForm.lat = lat;
			} else if (props.type === "管线") {
				const geom = feature.getGeometry() as LineString;
				const coords = geom.getCoordinates();
				const [sLon, sLat] = from3857ToLonLat(coords[0][0], coords[0][1]);
				const [eLon, eLat] = from3857ToLonLat(coords[coords.length - 1][0], coords[coords.length - 1][1]);
				editForm.pipeType = props.type || "污水管";
				editForm.diameter = props.diameter || 500;
				editForm.depth = props.depth || 2;
				editForm.material = props.material || "";
				editForm.installYear = props.installYear || 2024;
				editForm.length = props.length || 500;
				editForm.startLon = sLon;
				editForm.startLat = sLat;
				editForm.endLon = eLon;
				editForm.endLat = eLat;
			} else {
				// 建筑
				const geom = feature.getGeometry() as Polygon;
				const coords = geom.getCoordinates()[0];
				const [swLon, swLat] = from3857ToLonLat(coords[0][0], coords[0][1]);
				const [neLon, neLat] = from3857ToLonLat(coords[2][0], coords[2][1]);
				editForm.area = props.area || 5000;
				editForm.floors = props.floors || 5;
				editForm.swLon = swLon;
				editForm.swLat = swLat;
				editForm.neLon = neLon;
				editForm.neLat = neLat;
			}
		};

		// Simple EPSG:3857 → lon/lat conversion
		const from3857ToLonLat = (x: number, y: number): [number, number] => {
			const lon = (x * 180) / 20037508.34;
			const lat = (Math.atan(Math.exp(y / 6378137)) * 360) / Math.PI - 90;
			return [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000];
		};
		const findFeatureSource = (id: string, type: string): VectorSource | null => {
			if (type === "管线") return pipelineSource;
			if (type === "检查井") return wellSource;
			if (type === "泵站") return pumpSource;
			// 建筑：check building source
			if (buildingSource.getFeatures().find(f => (f.getProperties() as FeatureProperties).name === id || (f.getProperties() as FeatureProperties).id === id)) return buildingSource;
			return null;
		};

		const cancelEdit = () => { resetEditForm(); };

		/* ---- 保存（新增 或 更新） ---- */
		const saveFeature = () => {
			if (!editForm.name) { window.alert("请输入名称。"); return; }

			if (isEditing.value && editingFeature.value && editingSource.value) {
				// ---- 更新现有要素 ----
				const src = editingSource.value;
				const feature = editingFeature.value;
				const props: Record<string, any> = {
					name: editForm.name, id: editForm.id, status: editForm.status,
				};

				if (editForm.editType === "检查井" || editForm.editType === "泵站") {
					props.type = editForm.editType;
					props.depth = editForm.depth;
					if (editForm.editType === "泵站") {
						props.capacity = editForm.capacity;
						props.power = editForm.power;
					}
					feature.setGeometry(new Point(fromLonLat([editForm.lon, editForm.lat])));
				} else if (editForm.editType === "管线") {
					props.type = editForm.pipeType;
					props.diameter = editForm.diameter;
					props.depth = editForm.depth;
					props.material = editForm.material;
					props.installYear = editForm.installYear;
					props.length = editForm.length;
					feature.setGeometry(new LineString([
						fromLonLat([editForm.startLon, editForm.startLat]),
						fromLonLat([editForm.endLon, editForm.endLat]),
					]));
				} else if (editForm.editType === "建筑") {
					props.area = editForm.area;
					props.floors = editForm.floors;
					props.type = "建筑";
					const sw = fromLonLat([editForm.swLon, editForm.swLat]);
					const ne = fromLonLat([editForm.neLon, editForm.neLat]);
					const ring = [[sw, [ne[0], sw[1]], ne, [sw[0], ne[1]], sw]];
					feature.setGeometry(new Polygon([ring]));
				}

				// Update properties
				Object.entries(props).forEach(([k, v]) => feature.set(k, v));
				restyleSource(src);
				selectedProperties.value = feature.getProperties() as FeatureProperties;
				updateStatusCount();
				updateCharts();
				window.alert("要素已更新。");
			} else {
				// ---- 新建要素 ----
				const feature = new Feature();
				let targetSource: VectorSource;

				if (editForm.editType === "检查井" || editForm.editType === "泵站") {
					feature.setGeometry(new Point(fromLonLat([editForm.lon, editForm.lat])));
					feature.set("type", editForm.editType);
					feature.set("id", editForm.id || `NEW-${Date.now()}`);
					feature.set("name", editForm.name);
					feature.set("status", editForm.status);
					if (editForm.editType === "检查井") {
						feature.set("depth", editForm.depth);
					} else {
						feature.set("capacity", editForm.capacity);
						feature.set("power", editForm.power);
					}
					targetSource = editForm.editType === "检查井" ? wellSource : pumpSource;
				} else if (editForm.editType === "管线") {
					feature.setGeometry(new LineString([
						fromLonLat([editForm.startLon, editForm.startLat]),
						fromLonLat([editForm.endLon, editForm.endLat]),
					]));
					feature.set("type", editForm.pipeType);
					feature.set("id", editForm.id || `NEW-PIPE-${Date.now()}`);
					feature.set("name", editForm.name);
					feature.set("status", editForm.status);
					feature.set("diameter", editForm.diameter);
					feature.set("depth", editForm.depth);
					feature.set("material", editForm.material);
					feature.set("installYear", editForm.installYear);
					feature.set("length", editForm.length);
					targetSource = pipelineSource;
				} else {
					// 建筑
					const sw = fromLonLat([editForm.swLon, editForm.swLat]);
					const ne = fromLonLat([editForm.neLon, editForm.neLat]);
					const ring = [[sw, [ne[0], sw[1]], ne, [sw[0], ne[1]], sw]];
					feature.setGeometry(new Polygon([ring]));
					feature.set("type", "建筑");
					feature.set("id", `BLD-${Date.now()}`);
					feature.set("name", editForm.name);
					feature.set("area", editForm.area);
					feature.set("floors", editForm.floors);
					targetSource = buildingSource;
				}

				targetSource.addFeature(feature);
				restyleSource(targetSource);
				if (editForm.editType === "管线") { updateStatusCount(); updateCharts(); }
				window.alert("新要素已添加到地图。");
			}

			resetEditForm();
		};

		/* ---- 删除要素 ---- */
		const deleteFeature = () => {
			if (!isEditing.value || !editingFeature.value || !editingSource.value) return;
			if (!window.confirm("确定要删除此要素吗？此操作不可撤销。")) return;
			editingSource.value.removeFeature(editingFeature.value);
			selectedProperties.value = null;
			highlightSource.clear();
			if (editingSource.value === pipelineSource) { updateStatusCount(); updateCharts(); }
			resetEditForm();
			window.alert("要素已删除。");
		};

		const runBufferQuery = () => {
			if (!selectedProperties.value || selectedProperties.value.type !== "泵站") return;
			const pumpFeature = pumpSource.getFeatures().find(
				(feature) => (feature.getProperties() as FeatureProperties).id === selectedProperties.value?.id,
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
					if (getLength(new LineString([center, closest])) <= radius) {
						found.push((feature.getProperties() as FeatureProperties).id || "");
						const copy = feature.clone() as Feature;
						copy.setStyle(highlightStyle);
						highlightSource.addFeature(copy);
					}
				}
			});
			wellSource.getFeatures().forEach((feature) => {
				const dist = getLength(new LineString([center, (feature.getGeometry() as Point).getCoordinates()]));
				if (dist <= radius) {
					found.push((feature.getProperties() as FeatureProperties).id || "");
					const copy = feature.clone() as Feature;
					copy.setStyle(highlightStyle);
					highlightSource.addFeature(copy);
				}
			});
			const circle = new Feature({ geometry: new Point(center).buffer(radius, 64) });
			circle.setStyle(highlightStyle);
			highlightSource.addFeature(circle);
			if (found.length === 0) window.alert("缓冲区内未发现管线或检查井。");
		};

		/* ---- GeoJSON 导入（智能识别类型） ---- */
		const onUpload = (event: Event) => {
			const input = event.target as HTMLInputElement;
			if (!input.files?.length) return;
			const file = input.files[0];
			const reader = new FileReader();
			reader.onload = () => {
				try {
					const geojson = JSON.parse(reader.result as string);
					const features = new GeoJSON().readFeatures(geojson, { featureProjection: "EPSG:3857" });
					let addedPipes = 0, addedWells = 0, addedPumps = 0, addedBuilds = 0;
					features.forEach((f) => {
						const geom = f.getGeometry();
						const props = f.getProperties() as FeatureProperties;
						if (geom instanceof LineString) {
							f.set("type", props.type || "污水管");
							f.set("id", props.id || `IMP-P-${Date.now()}-${addedPipes}`);
							f.set("status", props.status || "normal");
							pipelineSource.addFeature(f);
							addedPipes++;
						} else if (geom instanceof Point) {
							const type = props.type === "泵站" ? "泵站" : "检查井";
							f.set("type", type);
							f.set("id", props.id || `IMP-${type === "泵站" ? "PS" : "MH"}-${Date.now()}`);
							f.set("status", props.status || "normal");
							if (type === "泵站") pumpSource.addFeature(f); else wellSource.addFeature(f);
							type === "泵站" ? addedPumps++ : addedWells++;
						} else if (geom instanceof Polygon) {
							f.set("type", "建筑");
							f.set("id", props.id || `IMP-BLD-${Date.now()}`);
							buildingSource.addFeature(f);
							addedBuilds++;
						}
					});
					restyleSource(pipelineSource);
					restyleSource(wellSource);
					restyleSource(pumpSource);
					updateStatusCount();
					updateCharts();
					window.alert(`导入成功：管线${addedPipes}条，检查井${addedWells}个，泵站${addedPumps}个，建筑${addedBuilds}栋。`);
				} catch (err) {
					window.alert("导入失败，请检查文件格式。");
				}
				input.value = "";
			};
			reader.readAsText(file);
		};

		/* ---- 多类型导出 ---- */
		const doExport = (source: VectorSource, filename: string) => {
			const features = source.getFeatures();
			if (features.length === 0) { window.alert("该图层没有可导出的要素。"); return; }
			const geojson = new GeoJSON().writeFeaturesObject(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
			const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		};

		const handleExport = (command: string) => {
			switch (command) {
				case "pipeline": doExport(pipelineSource, "smartpipe_pipelines.geojson"); break;
				case "well": doExport(wellSource, "smartpipe_wells.geojson"); break;
				case "pump": doExport(pumpSource, "smartpipe_pumps.geojson"); break;
				case "building": doExport(buildingSource, "smartpipe_buildings.geojson"); break;
				case "all":
					const allFeatures = [
						...pipelineSource.getFeatures(),
						...wellSource.getFeatures(),
						...pumpSource.getFeatures(),
						...buildingSource.getFeatures(),
					];
					if (allFeatures.length === 0) { window.alert("没有可导出的要素。"); return; }
					const allGeojson = new GeoJSON().writeFeaturesObject(allFeatures, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
					const blob = new Blob([JSON.stringify(allGeojson, null, 2)], { type: "application/json" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url; a.download = "smartpipe_all_layers.geojson"; a.click();
					URL.revokeObjectURL(url);
					break;
			}
		};

		/* ---- 统计与图表 ---- */
		const updateStatusCount = () => {
			statusCount.normal = 0; statusCount.maintenance = 0; statusCount.fault = 0;
			pipelineSource.getFeatures().forEach((feature) => {
				const status = (feature.getProperties() as FeatureProperties).status as string;
				if (status && statusCount[status as "normal" | "maintenance" | "fault"] !== undefined) {
					statusCount[status as "normal" | "maintenance" | "fault"]++;
				}
			});
		};

		const updateRouteSummary = () => {
			const coords = inspectionRoute.map((item) => fromLonLat(item.coordinate));
			if (coords.length < 2) return;
			let total = 0;
			for (let i = 1; i < coords.length; i++) total += getLength(new LineString([coords[i - 1], coords[i]]));
			routeSummary.distance = total;
			routeSummary.duration = Math.max(5, Math.round(total / 120));
			const routeFeature = new Feature({ geometry: new LineString(coords) });
			routeFeature.setStyle(new Style({ stroke: new Stroke({ color: "#722ed1", width: 4, lineDash: [12, 6] }) }));
			routeSource.clear();
			routeSource.addFeature(routeFeature);
		};

		const updateCharts = () => {
			const pipelines = pipelineSource.getFeatures().map((feature) => feature.getProperties() as FeatureProperties);
			const typeCount: Record<string, number> = {};
			pipelines.forEach((item) => { if (item.type) typeCount[item.type] = (typeCount[item.type] || 0) + 1; });
			const pieData = Object.entries(typeCount).map(([name, value]) => ({ name, value }));
			const pieColors = pieData.map((d) => pipelineColors[d.name] || "#faad14");
			typeChartInstance.value?.setOption({
				tooltip: { trigger: "item" }, legend: { bottom: "0", textStyle: { fontSize: 11 } },
				color: pieColors,
				series: [{ name: "管线类型", type: "pie", radius: ["40%", "65%"], label: { formatter: "{b}\n{d}%" }, data: pieData }],
			});
			const sc: Record<string, number> = { normal: 0, maintenance: 0, fault: 0 };
			pipelines.forEach((item) => { if (item.status) sc[item.status] = (sc[item.status] || 0) + 1; });
			statusChartInstance.value?.setOption({
				tooltip: { trigger: "axis" }, xAxis: { type: "category", data: ["正常", "维修中", "故障"] }, yAxis: { type: "value" },
				series: [{ data: [sc.normal, sc.maintenance, sc.fault], type: "bar", itemStyle: { color: "#1890ff", borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top" } }],
			});
		};

		onMounted(() => {
			loadSource();
			vecTileLayer = new TileLayer({ source: new XYZ({ url: tiandituUrl("vec") }), visible: true, properties: { id: "tdt-vec" } });
			cvaTileLayer = new TileLayer({ source: new XYZ({ url: tiandituUrl("cva") }), visible: true, properties: { id: "tdt-cva" } });
			imgTileLayer = new TileLayer({ source: new XYZ({ url: tiandituUrl("img") }), visible: false, properties: { id: "tdt-img" } });
			ciaTileLayer = new TileLayer({ source: new XYZ({ url: tiandituUrl("cia") }), visible: false, properties: { id: "tdt-cia" } });

			const mapObj = new Map({
				target: "map",
				layers: [
					vecTileLayer, cvaTileLayer, imgTileLayer, ciaTileLayer,
					new VectorLayer({ source: buildingSource, properties: { id: "building" } }),
					new VectorLayer({ source: pipelineSource, properties: { id: "pipeline" } }),
					new VectorLayer({ source: wellSource, properties: { id: "well" } }),
					new VectorLayer({ source: pumpSource, properties: { id: "pump" } }),
					new VectorLayer({ source: highlightSource, properties: { id: "highlight" } }),
					new VectorLayer({ source: routeSource, properties: { id: "route" } }),
				],
				view: new View({ center: fromLonLat([116.398, 39.9075]), zoom: 16 }),
			});
			mapObj.on("click", onMapClick);
			map.value = mapObj;
			updateStatusCount();
			updateRouteSummary();
			typeChartInstance.value = echarts.init(document.getElementById("type-chart") as HTMLElement);
			statusChartInstance.value = echarts.init(document.getElementById("status-chart") as HTMLElement);
			updateCharts();
			window.addEventListener("resize", () => {
				typeChartInstance.value?.resize();
				statusChartInstance.value?.resize();
			});
			layerStates.value.forEach((item) => syncLayerVisibility(item.key, item.visible));
		});

		watch(filterForm, applyFilter, { deep: true });

		return {
			layerStates, baseMap, filterForm, editForm, selectedProperties, statusLabels, statusCount,
			inspectionRoute, routeSummary, isEditing,
			switchBaseMap, resetLayers, syncLayerVisibility, resetFilter, clearSelection,
			editSelectedFeature, cancelEdit, saveFeature, deleteFeature,
			onEditTypeChange, runBufferQuery, onUpload, handleExport,
		};
	},
});
</script>

<style scoped>
#map {
	width: 100%; height: 460px; border-radius: 12px;
	overflow: hidden; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}
</style>
