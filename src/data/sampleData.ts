export interface PipelineFeature {
	id: string;
	type: string;
	diameter: number;
	depth: number;
	status: "normal" | "maintenance" | "fault";
	name: string;
	length: number;
	material?: string;
	installYear?: number;
	geometry: any;
}

export const pipelineTypeMap: Record<string, string> = {
	sewage: "污水管",
	storm: "雨水管",
	supply: "给水管",
	gas: "燃气管",
	heating: "热力管",
};

export const statusLabels: Record<string, string> = {
	normal: "正常",
	maintenance: "维修中",
	fault: "故障",
};

export const pipelineColors: Record<string, string> = {
	污水管: "#ff7f50",
	雨水管: "#40a9ff",
	给水管: "#73d13d",
	燃气管: "#ffa940",
	热力管: "#eb2f96",
};

/* ================================================================
   建筑图层（6 栋建筑，模拟真实城市功能分区）
   ================================================================ */
export const sampleBuildings = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { name: "智慧城市指挥中心", area: 12000, floors: 12 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.3978, 39.9074],
					[116.3984, 39.9074],
					[116.3984, 39.9079],
					[116.3978, 39.9079],
					[116.3978, 39.9074],
				]],
			},
		},
		{
			type: "Feature",
			properties: { name: "地下管网监测站", area: 6800, floors: 5 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.3958, 39.9068],
					[116.3964, 39.9068],
					[116.3964, 39.9073],
					[116.3958, 39.9073],
					[116.3958, 39.9068],
				]],
			},
		},
		{
			type: "Feature",
			properties: { name: "市政污水处理厂", area: 25000, floors: 3 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.3992, 39.9060],
					[116.4000, 39.9060],
					[116.4000, 39.9065],
					[116.3992, 39.9065],
					[116.3992, 39.9060],
				]],
			},
		},
		{
			type: "Feature",
			properties: { name: "城北供水加压站", area: 4800, floors: 2 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.3960, 39.9085],
					[116.3965, 39.9085],
					[116.3965, 39.9090],
					[116.3960, 39.9090],
					[116.3960, 39.9085],
				]],
			},
		},
		{
			type: "Feature",
			properties: { name: "居民小区-翠微嘉园", area: 42000, floors: 18 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.3980, 39.9082],
					[116.3990, 39.9082],
					[116.3990, 39.9088],
					[116.3980, 39.9088],
					[116.3980, 39.9082],
				]],
			},
		},
		{
			type: "Feature",
			properties: { name: "商业综合体-万都广场", area: 68000, floors: 28 },
			geometry: {
				type: "Polygon",
				coordinates: [[
					[116.4005, 39.9070],
					[116.4012, 39.9070],
					[116.4012, 39.9076],
					[116.4005, 39.9076],
					[116.4005, 39.9070],
				]],
			},
		},
	],
};

/* ================================================================
   管线图层（12 条管线，模拟城市主干/支线管网）
   ================================================================ */
export const samplePipelines = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: {
				id: "WS-DN800-01",
				type: "污水管",
				diameter: 800,
				depth: 3.2,
				status: "normal",
				name: "世纪大道污水干管",
				length: 1250,
				material: "HDPE双壁波纹管",
				installYear: 2019,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3955, 39.9078],
					[116.3965, 39.9075],
					[116.3973, 39.9072],
					[116.3980, 39.9068],
					[116.3988, 39.9063],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "WS-DN600-02",
				type: "污水管",
				diameter: 600,
				depth: 2.5,
				status: "normal",
				name: "学府路污水支管",
				length: 680,
				material: "HDPE双壁波纹管",
				installYear: 2020,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3970, 39.9084],
					[116.3973, 39.9080],
					[116.3973, 39.9072],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "WS-DN500-03",
				type: "污水管",
				diameter: 500,
				depth: 2.2,
				status: "maintenance",
				name: "滨河路污水管",
				length: 520,
				material: "钢筋混凝土管",
				installYear: 2016,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3983, 39.9085],
					[116.3986, 39.9080],
					[116.3990, 39.9075],
					[116.3995, 39.9070],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "YS-DN1000-01",
				type: "雨水管",
				diameter: 1000,
				depth: 3.8,
				status: "normal",
				name: "中山路雨水主干管",
				length: 1580,
				material: "钢筋混凝土管",
				installYear: 2018,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3952, 39.9070],
					[116.3960, 39.9072],
					[116.3968, 39.9074],
					[116.3978, 39.9074],
					[116.3988, 39.9072],
					[116.4000, 39.9070],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "YS-DN600-02",
				type: "雨水管",
				diameter: 600,
				depth: 2.6,
				status: "normal",
				name: "翠微路雨水支管",
				length: 450,
				material: "HDPE双壁波纹管",
				installYear: 2021,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3978, 39.9074],
					[116.3982, 39.9078],
					[116.3985, 39.9084],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "YS-DN500-03",
				type: "雨水管",
				diameter: 500,
				depth: 2.3,
				status: "fault",
				name: "万都路雨水管",
				length: 380,
				material: "PVC-U",
				installYear: 2015,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.4000, 39.9070],
					[116.4005, 39.9070],
					[116.4010, 39.9074],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "GS-DN600-01",
				type: "给水管",
				diameter: 600,
				depth: 2.0,
				status: "normal",
				name: "人民路给水主干管",
				length: 1100,
				material: "球墨铸铁管",
				installYear: 2017,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3960, 39.9087],
					[116.3965, 39.9084],
					[116.3970, 39.9080],
					[116.3975, 39.9075],
					[116.3980, 39.9069],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "GS-DN400-02",
				type: "给水管",
				diameter: 400,
				depth: 1.6,
				status: "normal",
				name: "翠微小区给水支管",
				length: 620,
				material: "PE管",
				installYear: 2022,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3975, 39.9075],
					[116.3980, 39.9080],
					[116.3985, 39.9085],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "GS-DN300-03",
				type: "给水管",
				diameter: 300,
				depth: 1.4,
				status: "fault",
				name: "滨河路给水支管",
				length: 340,
				material: "PE管",
				installYear: 2014,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3980, 39.9069],
					[116.3988, 39.9066],
					[116.3995, 39.9063],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "RQ-DN300-01",
				type: "燃气管",
				diameter: 300,
				depth: 1.8,
				status: "normal",
				name: "中山路燃气管",
				length: 850,
				material: "钢管（3PE防腐）",
				installYear: 2020,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3955, 39.9076],
					[116.3965, 39.9074],
					[116.3975, 39.9072],
					[116.3985, 39.9070],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "RQ-DN200-02",
				type: "燃气管",
				diameter: 200,
				depth: 1.5,
				status: "maintenance",
				name: "翠微路燃气支管",
				length: 420,
				material: "PE管",
				installYear: 2021,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3975, 39.9072],
					[116.3980, 39.9078],
					[116.3983, 39.9085],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "RL-DN400-01",
				type: "热力管",
				diameter: 400,
				depth: 2.0,
				status: "normal",
				name: "人民路热力主管",
				length: 720,
				material: "预制保温钢管",
				installYear: 2019,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3963, 39.9082],
					[116.3970, 39.9078],
					[116.3975, 39.9075],
					[116.3983, 39.9070],
				],
			},
		},
	],
};

/* ================================================================
   检查井图层（12 个检查井，沿管线关键节点分布）
   ================================================================ */
export const sampleWells = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { id: "MH-WS-01", type: "检查井", status: "normal", name: "世纪大道1#污水井", depth: 3.2 },
			geometry: { type: "Point", coordinates: [116.3965, 39.9075] },
		},
		{
			type: "Feature",
			properties: { id: "MH-WS-02", type: "检查井", status: "normal", name: "世纪大道2#污水井", depth: 2.8 },
			geometry: { type: "Point", coordinates: [116.3973, 39.9072] },
		},
		{
			type: "Feature",
			properties: { id: "MH-WS-03", type: "检查井", status: "maintenance", name: "滨河路污水井", depth: 2.2 },
			geometry: { type: "Point", coordinates: [116.3990, 39.9075] },
		},
		{
			type: "Feature",
			properties: { id: "MH-YS-01", type: "检查井", status: "normal", name: "中山路1#雨水井", depth: 3.8 },
			geometry: { type: "Point", coordinates: [116.3960, 39.9072] },
		},
		{
			type: "Feature",
			properties: { id: "MH-YS-02", type: "检查井", status: "normal", name: "中山路2#雨水井", depth: 3.5 },
			geometry: { type: "Point", coordinates: [116.3968, 39.9074] },
		},
		{
			type: "Feature",
			properties: { id: "MH-YS-03", type: "检查井", status: "normal", name: "中山路3#雨水井", depth: 3.2 },
			geometry: { type: "Point", coordinates: [116.3978, 39.9074] },
		},
		{
			type: "Feature",
			properties: { id: "MH-YS-04", type: "检查井", status: "fault", name: "中山路4#雨水井", depth: 3.0 },
			geometry: { type: "Point", coordinates: [116.3988, 39.9072] },
		},
		{
			type: "Feature",
			properties: { id: "MH-GS-01", type: "检查井", status: "normal", name: "人民路1#给水井", depth: 2.0 },
			geometry: { type: "Point", coordinates: [116.3965, 39.9084] },
		},
		{
			type: "Feature",
			properties: { id: "MH-GS-02", type: "检查井", status: "normal", name: "人民路2#给水井", depth: 1.8 },
			geometry: { type: "Point", coordinates: [116.3970, 39.9080] },
		},
		{
			type: "Feature",
			properties: { id: "MH-GS-03", type: "检查井", status: "fault", name: "滨河路给水井", depth: 1.6 },
			geometry: { type: "Point", coordinates: [116.3988, 39.9066] },
		},
		{
			type: "Feature",
			properties: { id: "MH-RQ-01", type: "检查井", status: "normal", name: "中山路燃气阀井", depth: 1.8 },
			geometry: { type: "Point", coordinates: [116.3965, 39.9074] },
		},
		{
			type: "Feature",
			properties: { id: "MH-RQ-02", type: "检查井", status: "normal", name: "翠微路燃气阀井", depth: 1.6 },
			geometry: { type: "Point", coordinates: [116.3980, 39.9078] },
		},
	],
};

/* ================================================================
   泵站图层（4 个泵站）
   ================================================================ */
export const samplePumps = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { id: "PS-WS-01", type: "泵站", status: "normal", name: "城北污水提升泵站", capacity: "3.2 m³/s", power: "180 kW" },
			geometry: { type: "Point", coordinates: [116.3980, 39.9068] },
		},
		{
			type: "Feature",
			properties: { id: "PS-YS-01", type: "泵站", status: "normal", name: "中山路雨水泵站", capacity: "5.0 m³/s", power: "280 kW" },
			geometry: { type: "Point", coordinates: [116.4000, 39.9070] },
		},
		{
			type: "Feature",
			properties: { id: "PS-GS-01", type: "泵站", status: "normal", name: "人民路供水加压泵站", capacity: "2.5 m³/s", power: "132 kW" },
			geometry: { type: "Point", coordinates: [116.3960, 39.9085] },
		},
		{
			type: "Feature",
			properties: { id: "PS-WS-02", type: "泵站", status: "maintenance", name: "滨河路污水泵站", capacity: "2.8 m³/s", power: "160 kW" },
			geometry: { type: "Point", coordinates: [116.3995, 39.9063] },
		},
	],
};

/* ================================================================
   巡检路线（8 个巡检点位，模拟真实巡检路径）
   ================================================================ */
export const inspectionRoute = [
	{ id: "MH-WS-01", name: "世纪大道1#污水井", coordinate: [116.3965, 39.9075] },
	{ id: "MH-WS-02", name: "世纪大道2#污水井", coordinate: [116.3973, 39.9072] },
	{ id: "PS-WS-01", name: "城北污水提升泵站", coordinate: [116.3980, 39.9068] },
	{ id: "MH-WS-03", name: "滨河路污水井", coordinate: [116.3990, 39.9075] },
	{ id: "MH-YS-04", name: "中山路4#雨水井", coordinate: [116.3988, 39.9072] },
	{ id: "PS-YS-01", name: "中山路雨水泵站", coordinate: [116.4000, 39.9070] },
	{ id: "MH-GS-03", name: "滨河路给水井", coordinate: [116.3988, 39.9066] },
	{ id: "PS-WS-02", name: "滨河路污水泵站", coordinate: [116.3995, 39.9063] },
];

/* ================================================================
   图层定义（含天地图底图）
   ================================================================ */
export const layerDefinitions = [
	{ key: "building", name: "建筑图层", visible: true },
	{ key: "pipeline", name: "管线图层", visible: true },
	{ key: "well", name: "检查井图层", visible: true },
	{ key: "pump", name: "泵站图层", visible: true },
];

export type StatusKey = "normal" | "maintenance" | "fault";
