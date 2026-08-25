<template>
	<el-drawer v-model="visible" :title="drawerTitle" size="420px" destroy-on-close>
		<div v-if="!form.id && mode === 'view'" class="empty-tip">请先在地图上点击一个要素</div>
		<template v-else>
			<!-- 属性详情（查看模式） -->
			<template v-if="mode === 'view'">
				<el-descriptions :column="1" border size="small">
					<el-descriptions-item v-for="item in descItems" :key="item[0]" :label="item[0]">
						<span v-if="item[0] === '状态'">
							<el-tag :type="statusTagType(form.status)" size="small">{{ statusLabel(form.status) }}</el-tag>
						</span>
						<span v-else>{{ item[1] }}</span>
					</el-descriptions-item>
				</el-descriptions>
				<div class="drawer-actions">
					<el-button v-if="canEdit" type="primary" size="small" @click="startEdit">编辑此要素</el-button>
					<el-button size="small" @click="$emit('locate')">地图定位</el-button>
					<el-dropdown style="margin-left: 8px" @command="runAnalysis">
						<el-button size="small" type="success" plain>空间分析 ▾</el-button>
						<template #dropdown>
							<el-dropdown-menu>
								<el-dropdown-item command="buffer">500m 缓冲查询</el-dropdown-item>
								<template v-if="form.type && pipeTypes.includes(form.type)">
									<el-dropdown-item command="trace-up" divided>上游追踪</el-dropdown-item>
									<el-dropdown-item command="trace-down">下游追踪</el-dropdown-item>
									<el-dropdown-item command="isolation" divided>爆管关阀分析</el-dropdown-item>
									<el-dropdown-item command="profile">管线纵剖面</el-dropdown-item>
								</template>
							</el-dropdown-menu>
						</template>
					</el-dropdown>
				</div>
			</template>

			<!-- 编辑/新增表单 -->
			<template v-else>
				<el-form label-position="top" :model="form" size="small">
					<el-form-item label="要素类别">
						<el-select v-model="form.type" :disabled="mode === 'edit'" @change="onTypeChange">
							<el-option label="检查井" value="检查井" />
							<el-option label="泵站" value="泵站" />
							<el-option label="管线" :value="pipeTypes[0]" />
							<el-option label="建筑" value="建筑" />
						</el-select>
					</el-form-item>

					<template v-if="isPointType">
						<el-form-item label="名称">
							<el-input v-model="form.name" placeholder="例如 中山大道3#污水检查井" />
						</el-form-item>
						<el-form-item label="编号">
							<el-input v-model="form.id" :disabled="mode === 'edit'" placeholder="例如 MH-WS-888" />
						</el-form-item>
						<el-form-item v-if="form.type === '检查井'" label="井深 (m)">
							<el-input-number v-model="form.depth" :min="0" :step="0.1" style="width: 100%" />
						</el-form-item>
						<el-form-item v-if="form.type === '泵站'" label="容量">
							<el-input v-model="form.capacity" placeholder="例如 3.2 m³/s" />
						</el-form-item>
						<el-form-item v-if="form.type === '泵站'" label="功率">
							<el-input v-model="form.power" placeholder="例如 180 kW" />
						</el-form-item>
					</template>

					<template v-else-if="pipeTypes.includes(form.type)">
						<el-form-item label="编号">
							<el-input v-model="form.id" :disabled="mode === 'edit'" placeholder="例如 WS-DN800-99" />
						</el-form-item>
						<el-form-item label="名称">
							<el-input v-model="form.name" placeholder="例如 世纪大道污水干管" />
						</el-form-item>
						<el-form-item label="管线类型">
							<el-select v-model="form.type" :disabled="mode === 'edit'">
								<el-option v-for="t in pipeTypes" :key="t" :label="t" :value="t" />
							</el-select>
						</el-form-item>
						<el-row :gutter="10">
							<el-col :span="12"><el-form-item label="管径 (mm)"><el-input-number v-model="form.diameter" :min="50" :step="50" style="width: 100%" /></el-form-item></el-col>
							<el-col :span="12"><el-form-item label="埋深 (m)"><el-input-number v-model="form.depth" :min="0" :step="0.1" style="width: 100%" /></el-form-item></el-col>
						</el-row>
						<el-row :gutter="10">
							<el-col :span="12"><el-form-item label="敷设年份"><el-input-number v-model="form.installYear" :min="1980" :max="2030" style="width: 100%" /></el-form-item></el-col>
							<el-col :span="12"><el-form-item label="长度 (m)"><el-input-number v-model="form.length" :min="10" :step="10" style="width: 100%" /></el-form-item></el-col>
						</el-row>
						<el-form-item label="材质">
							<el-select v-model="form.material" allow-create filterable placeholder="选择或输入材质">
								<el-option v-for="m in materials" :key="m" :label="m" :value="m" />
							</el-select>
						</el-form-item>
						<el-form-item label="所属道路">
							<el-input v-model="form.road" placeholder="例如 世纪大道" />
						</el-form-item>
						<el-form-item label="起点坐标（经度 / 纬度）">
							<div class="coord-row">
								<el-input-number v-model="form.startLon" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-input-number v-model="form.startLat" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-button size="small" @click="$emit('pick-point', 'start')">图上取点</el-button>
							</div>
						</el-form-item>
						<el-form-item label="终点坐标（经度 / 纬度）">
							<div class="coord-row">
								<el-input-number v-model="form.endLon" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-input-number v-model="form.endLat" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-button size="small" @click="$emit('pick-point', 'end')">图上取点</el-button>
							</div>
						</el-form-item>
					</template>

					<template v-else>
						<el-form-item label="建筑名称">
							<el-input v-model="form.name" placeholder="例如 市政管网管理中心" />
						</el-form-item>
						<el-row :gutter="10">
							<el-col :span="12"><el-form-item label="面积 (m²)"><el-input-number v-model="form.area" :min="100" :step="100" style="width: 100%" /></el-form-item></el-col>
							<el-col :span="12"><el-form-item label="层数"><el-input-number v-model="form.floors" :min="1" :max="100" style="width: 100%" /></el-form-item></el-col>
						</el-row>
						<el-form-item label="西南角（经度 / 纬度）">
							<div class="coord-row">
								<el-input-number v-model="form.swLon" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-input-number v-model="form.swLat" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-button size="small" @click="$emit('pick-point', 'sw')">图上取点</el-button>
							</div>
						</el-form-item>
						<el-form-item label="东北角（经度 / 纬度）">
							<div class="coord-row">
								<el-input-number v-model="form.neLon" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-input-number v-model="form.neLat" :precision="6" :step="0.0001" :controls="false" style="width: 100%" />
								<el-button size="small" @click="$emit('pick-point', 'ne')">图上取点</el-button>
							</div>
						</el-form-item>
					</template>

					<el-form-item label="状态">
						<el-select v-model="form.status">
							<el-option label="正常" value="normal" />
							<el-option label="维修中" value="maintenance" />
							<el-option label="故障" value="fault" />
						</el-select>
					</el-form-item>
				</el-form>
				<div class="drawer-actions">
					<el-button type="primary" size="small" style="flex: 1" :loading="saving" @click="save">
						{{ mode === "edit" ? "保存修改" : "新增要素" }}
					</el-button>
					<el-button v-if="mode === 'edit'" type="danger" size="small" @click="remove">删除要素</el-button>
					<el-button size="small" @click="cancel">取消</el-button>
				</div>
			</template>
		</template>
	</el-drawer>
</template>

<script lang="ts">
import { computed, defineComponent, PropType, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiFeatures } from "../../api";
import { authStore } from "../../store/auth";
import { PIPE_COLORS, STATUS_LABELS } from "../../types";
import type { FeatureProperties, GeoJSONFeature, LayerName } from "../../types";

const pipeTypes = Object.keys(PIPE_COLORS);
const materials = ["HDPE双壁波纹管", "钢筋混凝土管", "球墨铸铁管", "PE管", "钢管（3PE防腐）", "预制保温钢管", "PVC-U", "玻璃钢夹砂管", "灰口铸铁管"];

interface EditForm {
	id: string; name: string; type: string; status: string;
	depth: number; diameter: number; length: number; installYear: number;
	material: string; road: string; capacity: string; power: string;
	area: number; floors: number;
	startLon: number; startLat: number; endLon: number; endLat: number;
	swLon: number; swLat: number; neLon: number; neLat: number;
	lon: number; lat: number;
}

const emptyForm = (): EditForm => ({
	id: "", name: "", type: "检查井", status: "normal",
	depth: 2, diameter: 500, length: 500, installYear: 2024,
	material: "HDPE双壁波纹管", road: "", capacity: "", power: "",
	area: 5000, floors: 5,
	startLon: 116.5, startLat: 39.795, endLon: 116.502, endLat: 39.795,
	swLon: 116.499, swLat: 39.794, neLon: 116.501, neLat: 39.796,
	lon: 116.5, lat: 39.795,
});

export default defineComponent({
	name: "FeatureDrawer",
	props: {
		modelValue: { type: Boolean, default: false },
		mode: { type: String as PropType<"view" | "edit" | "create">, default: "view" },
		layer: { type: String as PropType<LayerName>, default: "wells" },
		feature: { type: Object as PropType<GeoJSONFeature | null>, default: null },
	},
	emits: ["update:modelValue", "saved", "deleted", "locate", "analysis", "pick-point", "start-edit"],
	setup(props, { emit }) {
		const visible = computed({
			get: () => props.modelValue,
			set: (v) => emit("update:modelValue", v),
		});
		const form = reactive(emptyForm());
		const saving = ref(false);
		const canEdit = computed(() => authStore.hasRole("operator"));

		const drawerTitle = computed(() => (props.mode === "view" ? "要素属性" : props.mode === "edit" ? "编辑要素" : "新增要素"));
		const isPointType = computed(() => form.type === "检查井" || form.type === "泵站");

		const statusTagType = (s: string) => (s === "normal" ? "success" : s === "maintenance" ? "warning" : "danger");
		const statusLabel = (s: string) => STATUS_LABELS[s] || s;

		const descItems = computed<[string, string][]>(() => {
			const p: Record<string, unknown> = (props.feature?.properties || {}) as Record<string, unknown>;
			const items: [string, string][] = [
				["名称", String(p.name ?? "-")],
				["编号", String(p.id ?? "-")],
			];
			if (p.type) items.push(["类型", String(p.type)]);
			if (p.status !== undefined) items.push(["状态", String(p.status)]);
			if (p.diameter !== undefined) items.push(["管径", `${p.diameter} mm`]);
			if (p.depth !== undefined) items.push(["埋深/井深", `${p.depth} m`]);
			if (p.material) items.push(["材质", String(p.material)]);
			if (p.installYear) items.push(["敷设年份", String(p.installYear)]);
			if (p.length) items.push(["长度", `${p.length} m`]);
			if (p.road) items.push(["所属道路", String(p.road)]);
			if (p.capacity) items.push(["容量", String(p.capacity)]);
			if (p.power) items.push(["功率", String(p.power)]);
			if (p.area) items.push(["面积", `${p.area} m²`]);
			if (p.floors) items.push(["层数", `${p.floors} 层`]);
			if (p.households) items.push(["户数", `${p.households} 户`]);
			if (p.address) items.push(["地址", String(p.address)]);
			if (p.maintainUnit) items.push(["养护单位", String(p.maintainUnit)]);
			return items;
		});

		/** 从要素填充表单 */
		const fillFromFeature = (f: GeoJSONFeature) => {
			const p = f.properties as FeatureProperties & Record<string, any>;
			Object.assign(form, emptyForm());
			form.id = p.id || "";
			form.name = p.name || "";
			form.status = (p.status as string) || "normal";
			form.type = p.type || "检查井";
			const geom: any = f.geometry;
			if (geom.type === "Point") {
				form.lon = geom.coordinates[0];
				form.lat = geom.coordinates[1];
				form.depth = p.depth || 2;
				form.capacity = p.capacity || "";
				form.power = p.power || "";
			} else if (geom.type === "LineString") {
				const c = geom.coordinates;
				form.startLon = c[0][0]; form.startLat = c[0][1];
				form.endLon = c[c.length - 1][0]; form.endLat = c[c.length - 1][1];
				form.diameter = p.diameter || 500;
				form.depth = p.depth || 2;
				form.length = p.length || 500;
				form.installYear = p.installYear || 2024;
				form.material = p.material || "HDPE双壁波纹管";
				form.road = p.road || "";
			} else {
				const c = geom.coordinates[0];
				form.swLon = c[0][0]; form.swLat = c[0][1];
				form.neLon = c[2][0]; form.neLat = c[2][1];
				form.area = p.area || 5000;
				form.floors = p.floors || 5;
			}
		};

		watch(
			() => [props.feature, props.mode],
			() => {
				if (props.feature && props.mode !== "create") fillFromFeature(props.feature);
				if (props.mode === "create") {
					Object.assign(form, emptyForm());
					form.type = props.layer === "pipes" ? pipeTypes[0] : props.layer === "wells" ? "检查井" : props.layer === "pumps" ? "泵站" : "建筑";
				}
			},
			{ immediate: true },
		);

		const startEdit = () => emit("start-edit");
		const cancel = () => emit("update:modelValue", false);
		/** 图上取点回填坐标（由 MapView 调用） */
		const setPoint = (target: string, lon: number, lat: number) => {
			if (target === "point") { form.lon = lon; form.lat = lat; }
			else if (target === "start") { form.startLon = lon; form.startLat = lat; }
			else if (target === "end") { form.endLon = lon; form.endLat = lat; }
			else if (target === "sw") { form.swLon = lon; form.swLat = lat; }
			else if (target === "ne") { form.neLon = lon; form.neLat = lat; }
			ElMessage.success(`已取点 (${lon.toFixed(6)}, ${lat.toFixed(6)})`);
		};
		const onTypeChange = () => { /* 类型切换保留通用字段 */ };
		const runAnalysis = (cmd: string) => emit("analysis", cmd);

		const buildFeature = (): GeoJSONFeature => {
			const p: FeatureProperties & Record<string, any> = {
				id: form.id, name: form.name, status: form.status,
			};
			let geometry: any;
			if (isPointType.value) {
				p.type = form.type;
				p.depth = form.depth;
				if (form.type === "泵站") { p.capacity = form.capacity; p.power = form.power; }
				geometry = { type: "Point", coordinates: [form.lon, form.lat] };
			} else if (pipeTypes.includes(form.type)) {
				p.type = form.type;
				p.diameter = form.diameter; p.depth = form.depth;
				p.material = form.material; p.installYear = form.installYear;
				p.length = form.length; p.road = form.road;
				geometry = { type: "LineString", coordinates: [[form.startLon, form.startLat], [form.endLon, form.endLat]] };
			} else {
				p.type = "建筑";
				p.area = form.area; p.floors = form.floors;
				const ring = [[form.swLon, form.swLat], [form.neLon, form.swLat], [form.neLon, form.neLat], [form.swLon, form.neLat], [form.swLon, form.swLat]];
				geometry = { type: "Polygon", coordinates: [ring] };
			}
			return { type: "Feature", properties: p, geometry };
		};

		const save = async () => {
			if (!form.name) { ElMessage.warning("请输入名称"); return; }
			if (!form.id) { ElMessage.warning("请输入编号"); return; }
			saving.value = true;
			try {
				const feature = buildFeature();
				if (props.mode === "edit") {
					await apiFeatures.update(props.layer, form.id, feature);
				} else {
					await apiFeatures.create(props.layer, feature);
				}
				ElMessage.success(props.mode === "edit" ? "要素已更新" : "要素已新增");
				emit("saved");
				emit("update:modelValue", false);
			} catch (e: any) {
				ElMessage.error(e.message || "保存失败");
			} finally {
				saving.value = false;
			}
		};

		const remove = async () => {
			try {
				await ElMessageBox.confirm("确定要删除此要素吗？此操作不可撤销。", "删除确认", { type: "warning" });
			} catch { return; }
			try {
				await apiFeatures.remove(props.layer, form.id);
				ElMessage.success("要素已删除");
				emit("deleted");
				emit("update:modelValue", false);
			} catch (e: any) {
				ElMessage.error(e.message || "删除失败");
			}
		};

		return { visible, form, saving, canEdit, drawerTitle, isPointType, pipeTypes, materials, descItems, statusTagType, statusLabel, startEdit, cancel, onTypeChange, runAnalysis, save, remove, setPoint };
	},
});
</script>

<style scoped>
.drawer-actions {
	display: flex;
	gap: 8px;
	margin-top: 14px;
	flex-wrap: wrap;
}
.coord-row {
	display: flex;
	gap: 6px;
	align-items: center;
	width: 100%;
}
.empty-tip {
	color: var(--sp-text-2);
	text-align: center;
	padding: 40px 0;
}
</style>
