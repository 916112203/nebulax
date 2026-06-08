export interface PipelineFeature {
	id: string;
	type: string;
	diameter: number;
	depth: number;
	status: "normal" | "maintenance" | "fault";
	name: string;
	length: number;
	geometry: any;
}

export const pipelineTypeMap = {
	sewage: "污水管",
	storm: "雨水管",
	supply: "给水管",
};

export const statusLabels = {
	normal: "正常",
	maintenance: "维修中",
	fault: "故障",
};

export const sampleBuildings = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { name: "智慧城市指挥中心" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[116.3978, 39.9074],
						[116.3984, 39.9074],
						[116.3984, 39.9079],
						[116.3978, 39.9079],
						[116.3978, 39.9074],
					],
				],
			},
		},
		{
			type: "Feature",
			properties: { name: "地下管网监测站" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[116.3958, 39.9068],
						[116.3964, 39.9068],
						[116.3964, 39.9073],
						[116.3958, 39.9073],
						[116.3958, 39.9068],
					],
				],
			},
		},
	],
};

export const samplePipelines = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: {
				id: "WS001",
				type: "污水管",
				diameter: 600,
				depth: 2.3,
				status: "normal",
				name: "污水干管A",
				length: 820,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.396, 39.9075],
					[116.3971, 39.9073],
					[116.398, 39.907],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "RS002",
				type: "雨水管",
				diameter: 500,
				depth: 2.8,
				status: "fault",
				name: "雨水排水管B",
				length: 610,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3968, 39.9076],
					[116.3976, 39.907],
					[116.3986, 39.9067],
				],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "GS003",
				type: "给水管",
				diameter: 400,
				depth: 1.9,
				status: "maintenance",
				name: "给水管C",
				length: 720,
			},
			geometry: {
				type: "LineString",
				coordinates: [
					[116.3963, 39.9066],
					[116.3971, 39.9062],
					[116.3982, 39.9059],
				],
			},
		},
	],
};

export const sampleWells = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: {
				id: "MH001",
				type: "检查井",
				status: "normal",
				name: "检查井A",
			},
			geometry: {
				type: "Point",
				coordinates: [116.397, 39.9071],
			},
		},
		{
			type: "Feature",
			properties: {
				id: "MH002",
				type: "检查井",
				status: "fault",
				name: "检查井B",
			},
			geometry: {
				type: "Point",
				coordinates: [116.3978, 39.9072],
			},
		},
	],
};

export const samplePumps = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: {
				id: "PS001",
				type: "泵站",
				status: "normal",
				name: "泵站A",
			},
			geometry: {
				type: "Point",
				coordinates: [116.3981, 39.9068],
			},
		},
	],
};

export const inspectionRoute = [
	{ id: "MH001", name: "检查井A", coordinate: [116.397, 39.9071] },
	{ id: "MH002", name: "检查井B", coordinate: [116.3978, 39.9072] },
	{ id: "PS001", name: "泵站A", coordinate: [116.3981, 39.9068] },
];

export const layerDefinitions = [
	{ key: "building", name: "建筑图层", visible: true },
	{ key: "pipeline", name: "管线图层", visible: true },
	{ key: "well", name: "检查井图层", visible: true },
	{ key: "pump", name: "泵站图层", visible: true },
];

export type StatusKey = "normal" | "maintenance" | "fault";
