/**
 * SmartPipe GIS 模拟数据生成器
 * ============================================================
 * 设计目标：以确定性种子（PRNG）生成一套"接近真实管网普查成果"的数据，
 * 供后端 SQLite 种子导入与前端演示模式共用，保证前后端数据完全一致。
 *
 * 案例设定：滨江市·高新开发区（虚构），面积约 4.2km × 3.1km，
 * 参考国内经开区路网格局：5 纵 4 横主干路网 + 4 条支路。
 *
 * 数据规模：
 *   - 管线  90+ 条（污水/雨水/给水/燃气/热力 5 类）
 *   - 井   160+ 个（检查井/阀门井，交叉口共享 → 真实拓扑）
 *   - 泵站   6 座、建筑 40 栋、传感器 28 个
 *   - 告警 45 条、工单 38 条、巡检计划 5 个
 *   - 用户   4 个（admin/operator/inspector/viewer）
 *
 * 运行：node scripts/generate-mock-data.mjs
 * 输出：server/data/*.json 与 src/data/mock/*.json（内容一致）
 * ============================================================
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- 确定性伪随机数 ---------------- */
function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(20260825); // 固定种子 → 每次生成结果一致
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const randF = (min, max) => min + rand() * (max - min);
const chance = (p) => rand() < p;

/* ---------------- 基础常量 ---------------- */
const CENTER = { x: 116.505, y: 39.795 }; // 案例区中心（参考北京亦庄格局）
const NOW = Date.now();
const DAY = 86400000;
const fmtTime = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);

const AREA = {
	name: "滨江市·高新开发区",
	org: "滨江市城市管理局",
	operator: "滨江市水务集团高新分公司",
	desc: "本数据为演示用途的模拟管网普查成果，案例区域参考国内典型经开区路网格局设计，不代表任何真实行政区。",
};

/* ---------------- 管线类型配置 ---------------- */
const PIPE_TYPES = {
	污水管: { prefix: "WS", diameters: [300, 400, 500, 600, 800, 1000], depth: [2.5, 4.5], materials: ["HDPE双壁波纹管", "钢筋混凝土管", "玻璃钢夹砂管"], wellType: "检查井" },
	雨水管: { prefix: "YS", diameters: [400, 600, 800, 1000, 1200], depth: [2.0, 3.8], materials: ["钢筋混凝土管", "HDPE双壁波纹管", "PVC-U"], wellType: "检查井" },
	给水管: { prefix: "GS", diameters: [200, 300, 400, 600, 800], depth: [1.2, 2.0], materials: ["球墨铸铁管", "PE管", "灰口铸铁管"], wellType: "阀门井" },
	燃气管: { prefix: "RQ", diameters: [150, 200, 300, 400], depth: [1.2, 1.8], materials: ["钢管（3PE防腐）", "PE管"], wellType: "阀门井" },
	热力管: { prefix: "RL", diameters: [200, 300, 400, 500], depth: [1.5, 2.5], materials: ["预制保温钢管"], wellType: "检查井" },
};
const TYPE_KEYS = Object.keys(PIPE_TYPES);
// 主干道敷设管线种类（不同道路侧重不同，避免同质化）
const TRUNK_TYPE_SETS = [
	["污水管", "雨水管", "给水管", "燃气管", "热力管"],
	["污水管", "雨水管", "给水管", "燃气管"],
	["污水管", "雨水管", "给水管", "热力管"],
	["雨水管", "给水管", "燃气管", "热力管"],
	["污水管", "给水管", "燃气管"],
];
const BRANCH_TYPE_SETS = [
	["污水管", "雨水管"], ["给水管", "燃气管"], ["污水管", "给水管"],
	["雨水管", "热力管"], ["污水管", "热力管"],
];

/* ---------------- 道路网络（5纵4横主干 + 4支路） ---------------- */
const ROADS = [
	// 纵向主干道
	{ name: "滨河大道", dir: "v", c: -0.02, y1: -0.014, y2: 0.014, rank: "trunk" },
	{ name: "中山大道", dir: "v", c: -0.01, y1: -0.014, y2: 0.014, rank: "trunk" },
	{ name: "世纪大道", dir: "v", c: 0.0, y1: -0.014, y2: 0.014, rank: "trunk" },
	{ name: "科技大道", dir: "v", c: 0.01, y1: -0.014, y2: 0.014, rank: "trunk" },
	{ name: "经海路", dir: "v", c: 0.02, y1: -0.014, y2: 0.014, rank: "trunk" },
	// 横向主干道
	{ name: "建设路", dir: "h", c: -0.014, x1: -0.02, x2: 0.02, rank: "trunk" },
	{ name: "人民路", dir: "h", c: -0.005, x1: -0.02, x2: 0.02, rank: "trunk" },
	{ name: "万都路", dir: "h", c: 0.005, x1: -0.02, x2: 0.02, rank: "trunk" },
	{ name: "学府路", dir: "h", c: 0.014, x1: -0.02, x2: 0.02, rank: "trunk" },
	// 支路
	{ name: "翠微路", dir: "v", c: -0.015, y1: 0.005, y2: 0.014, rank: "branch" },
	{ name: "荣华街", dir: "v", c: 0.015, y1: -0.014, y2: -0.005, rank: "branch" },
	{ name: "康庄路", dir: "h", c: -0.009, x1: -0.01, x2: 0.0, rank: "branch" },
	{ name: "北环路", dir: "h", c: 0.009, x1: 0.0, x2: 0.02, rank: "branch" },
];

const roadSegments = (road) => {
	if (road.dir === "v") return { from: [road.c, road.y1], to: [road.c, road.y2], lenDeg: road.y2 - road.y1 };
	return { from: [road.x1, road.c], to: [road.x2, road.c], lenDeg: road.x2 - road.x1 };
};
const distDeg = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const toMeters = (deg) => deg * 111000; // 纬度方向近似
const segLenM = (road) => toMeters(roadSegments(road).lenDeg);

/* ---------------- 生成管线 ---------------- */
const pipes = []; // {id,name,type,diameter,depth,material,installYear,length,status,road,usage,points:[...]}
let typeSeq = {};
const nextSeq = (prefix) => (typeSeq[prefix] = (typeSeq[prefix] || 0) + 1);

ROADS.forEach((road, roadIdx) => {
	const { from, to, lenDeg } = roadSegments(road);
	const lenM = toMeters(lenDeg);
	const typeSets = road.rank === "trunk" ? TRUNK_TYPE_SETS[roadIdx % TRUNK_TYPE_SETS.length] : BRANCH_TYPE_SETS[roadIdx % BRANCH_TYPE_SETS.length];

	typeSets.forEach((pt, i) => {
		const conf = PIPE_TYPES[pt];
		// 与道路中心线的偏移（平行敷设，间距约 6m）
		const perp = road.dir === "v" ? [1, 0] : [0, 1];
		const offsetM = (i - (typeSets.length - 1) / 2) * 6;
		const offsetDeg = offsetM / 111000;
		// 折点：长路中间加 1~2 个微弯点，模拟实际敷设
		const nMid = lenM > 1500 ? 2 : lenM > 600 ? 1 : 0;
		const pts = [from];
		for (let k = 1; k <= nMid; k++) {
			const t = k / (nMid + 1);
			const base = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
			pts.push([base[0] + randF(-0.00002, 0.00002), base[1] + randF(-0.00002, 0.00002)]);
		}
		pts.push(to);
		// 统一转为绝对经纬度（与泵站/建筑/传感器一致）
		const points = pts.map((p) => [CENTER.x + p[0] + perp[0] * offsetDeg, CENTER.y + p[1] + perp[1] * offsetDeg]);

		// 管径：主干道取大管径，支路取小管径
		const diams = conf.diameters;
		const dIdx = road.rank === "trunk" ? randInt(diams.length - 3, diams.length - 1) : randInt(0, diams.length - 3);
		const diameter = diams[Math.max(0, Math.min(dIdx, diams.length - 1))];
		const installYear = randInt(1996, 2025);
		const age = 2026 - installYear;
		// 老管故障/维修概率更高
		const statusRoll = rand();
		const status = age > 22 ? (statusRoll < 0.28 ? "fault" : statusRoll < 0.5 ? "maintenance" : "normal")
			: age > 12 ? (statusRoll < 0.08 ? "fault" : statusRoll < 0.2 ? "maintenance" : "normal")
				: statusRoll < 0.03 ? "fault" : statusRoll < 0.08 ? "maintenance" : "normal";
		// 灰口铸铁管只用于老给水管
		let material = pick(conf.materials);
		if (pt === "给水管" && installYear < 2005 && chance(0.6)) material = "灰口铸铁管";

		const seq = nextSeq(conf.prefix);
		const id = `${conf.prefix}-DN${diameter}-${String(seq).padStart(2, "0")}`;
		pipes.push({
			id, name: `${road.name}${pt.replace("管", "")}${road.rank === "trunk" ? diameter >= 600 ? "干管" : "次干管" : "支管"}`,
			type: pt, diameter, depth: +randF(conf.depth[0], conf.depth[1]).toFixed(1),
			material, installYear, length: Math.round(lenM), status,
			road: road.name, usage: road.rank === "trunk" ? (diameter >= 600 ? "干管" : "次干管") : "支管",
			maintainUnit: AREA.operator, points,
		});
	});
});

/* ---------------- 沿管线生成井（端点 + 间隔 + 交叉口强制布井，交叉口合并） ---------------- */
const wellCands = []; // {pipeId, pipeType, wellType, pts:[...], seqNo}
let wellSeq = {};
pipes.forEach((p) => {
	const conf = PIPE_TYPES[p.type];
	const intervalM = randInt(150, 240);
	// 沿折线插值取井位
	const segs = [];
	let acc = 0;
	for (let i = 1; i < p.points.length; i++) {
		const lenM = toMeters(distDeg(p.points[i - 1], p.points[i]));
		segs.push({ from: p.points[i - 1], to: p.points[i], lenM, acc });
		acc += lenM;
	}
	const totalM = acc;
	const locateOn = (target) => {
		let seg = segs[segs.length - 1], tt = 1;
		for (const s of segs) {
			if (target <= s.acc + s.lenM) { seg = s; tt = (target - s.acc) / s.lenM; break; }
		}
		return [seg.from[0] + (seg.to[0] - seg.from[0]) * tt, seg.from[1] + (seg.to[1] - seg.from[1]) * tt];
	};
	// 井位弧长列表 [{t, isCross}]，随后按 t 排序保证沿线顺序
	const tList = [];
	const nInter = Math.max(1, Math.floor(totalM / intervalM));
	for (let k = 0; k <= nInter; k++) tList.push({ t: (k / nInter) * totalM, isCross: false });
	// 道路交叉口强制布井：与垂直方向道路的交叉点处必设井（管网拓扑真实性关键）
	const rd = ROADS.find((r) => r.name === p.road);
	if (rd) {
		ROADS.filter((r) => r.dir !== rd.dir).forEach((cr) => {
			const cross = cr.c;
			for (const s of segs) {
				const a = rd.dir === "v" ? s.from[1] : s.from[0];
				const b = rd.dir === "v" ? s.to[1] : s.to[0];
				if ((cross - a) * (cross - b) > 0) continue; // 不跨越该段
				const denom = b - a;
				if (Math.abs(denom) < 1e-12) break;
				const tt = (cross - a) / denom;
				if (tt < 0 || tt > 1) break;
				tList.push({ t: s.acc + tt * s.lenM, isCross: true });
				break;
			}
		});
	}
	tList.sort((a, b) => a.t - b.t);
	// 相邻井距过近时去重（<40m 时优先保留交叉口井）
	const wellTs = [];
	tList.forEach((item) => {
		const last = wellTs[wellTs.length - 1];
		if (last && item.t - last.t < 40) {
			if (item.isCross && !last.isCross) wellTs[wellTs.length - 1] = item;
			return;
		}
		wellTs.push(item);
	});
	wellTs.forEach((item) => {
		wellCands.push({
			pipeId: p.id, pipeType: p.type, wellType: conf.wellType, pt: locateOn(item.t),
			seqNo: (wellSeq[p.type] = (wellSeq[p.type] || 0) + 1),
		});
	});
});

// 并查集合并 30m 内同类型井（交叉口共享井 → 拓扑连通）
const W_MERGE_M = 30, W_MERGE_DEG = W_MERGE_M / 111000;
const parent = wellCands.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < wellCands.length; i++) {
	for (let j = i + 1; j < wellCands.length; j++) {
		if (wellCands[i].wellType !== wellCands[j].wellType || wellCands[i].pipeType !== wellCands[j].pipeType) continue;
		if (distDeg(wellCands[i].pt, wellCands[j].pt) < W_MERGE_DEG) parent[find(i)] = find(j);
	}
}
const wellGroups = new Map();
wellCands.forEach((w, i) => {
	const r = find(i);
	if (!wellGroups.has(r)) wellGroups.set(r, []);
	wellGroups.get(r).push(i);
});

const wells = []; // {id,name,type,pipeType,status,depth,elevation,road,installYear,pt,pipeIds}
const wellIdxByCand = new Map(); // candIndex -> well id
let elevBase = 24;
wellGroups.forEach((idxs) => {
	const c0 = wellCands[idxs[0]];
	const cMin = idxs.reduce((a, b) => (wellCands[a].seqNo < wellCands[b].seqNo ? a : b));
	const seq = wellCands[cMin].seqNo;
	const id = `${c0.wellType === "阀门井" ? "VF" : "MH"}-${PIPE_TYPES[c0.pipeType].prefix}-${String(seq).padStart(3, "0")}`;
	const roadName = pipes.find((pp) => pp.id === c0.pipeId)?.road || "";
	const well = {
		id, name: `${roadName}${PIPE_TYPES[c0.pipeType].prefix === "WS" ? "污水" : PIPE_TYPES[c0.pipeType].prefix === "YS" ? "雨水" : PIPE_TYPES[c0.pipeType].prefix === "GS" ? "给水" : PIPE_TYPES[c0.pipeType].prefix === "RQ" ? "燃气" : "热力"}${seq}${c0.wellType === "阀门井" ? "阀井" : "检查井"}`,
		type: c0.wellType, pipeType: c0.pipeType,
		status: chance(0.06) ? (chance(0.5) ? "fault" : "maintenance") : "normal",
		depth: +randF(1.2, 4.8).toFixed(1),
		elevation: +(elevBase + randF(-1.5, 1.5)).toFixed(1),
		road: pipes.find((p) => p.id === c0.pipeId)?.road || "",
		installYear: randInt(2005, 2025),
		pt: c0.pt,
	};
	wells.push(well);
	idxs.forEach((i) => wellIdxByCand.set(i, id));
});
elevBase = 0;

// 管线起止井回填
const pipeWellMap = new Map(); // pipeId -> [candIdx...] 按管线顺序
wellCands.forEach((w, i) => {
	if (!pipeWellMap.has(w.pipeId)) pipeWellMap.set(w.pipeId, []);
	pipeWellMap.get(w.pipeId).push(i);
});
pipes.forEach((p) => {
	const idxs = pipeWellMap.get(p.id) || [];
	idxs.sort((a, b) => wellCands[a].seqNo - wellCands[b].seqNo);
	// 沿线全部井（含交叉口共享井，拓扑关系核心）——去重并保持沿线顺序
	const ws = [];
	idxs.forEach((i) => {
		const wid = wellIdxByCand.get(i);
		if (ws[ws.length - 1] !== wid) ws.push(wid);
	});
	p.wells = ws;
	p.startWell = ws[0] || null;
	p.endWell = ws[ws.length - 1] || null;
});

/* ---------------- 泵站 ---------------- */
const pumpDefs = [
	{ id: "PS-WS-01", name: "滨河大道污水提升泵站", subType: "污水提升泵站", pt: [-0.02, -0.014], capacity: "3.2 m³/s", power: "180 kW" },
	{ id: "PS-WS-02", name: "开发区污水处理厂泵站", subType: "污水处理泵站", pt: [0.02, 0.014], capacity: "6.5 m³/s", power: "450 kW" },
	{ id: "PS-YS-01", name: "中山大道雨水泵站", subType: "雨水泵站", pt: [-0.01, 0.008], capacity: "5.0 m³/s", power: "280 kW" },
	{ id: "PS-YS-02", name: "学府路雨水泵站", subType: "雨水泵站", pt: [0.005, 0.014], capacity: "4.2 m³/s", power: "220 kW" },
	{ id: "PS-GS-01", name: "人民路供水加压泵站", subType: "供水加压泵站", pt: [-0.005, -0.005], capacity: "2.5 m³/s", power: "132 kW" },
	{ id: "PS-RQ-01", name: "世纪大道燃气调压站", subType: "燃气调压站", pt: [0.0, -0.008], capacity: "2.0 万m³/h", power: "30 kW" },
];
const pumps = pumpDefs.map((d) => ({
	id: d.id, name: d.name, type: "泵站", subType: d.subType, capacity: d.capacity, power: d.power,
	status: chance(0.15) ? "maintenance" : "normal", runtimeHours: randInt(800, 42000),
	installYear: randInt(2012, 2024), pt: [CENTER.x + d.pt[0], CENTER.y + d.pt[1]],
}));

/* ---------------- 建筑 ---------------- */
const bUsage = [
	{ u: "居住", names: ["翠微嘉园", "滨江花园", "世纪华府", "万都公寓", "锦绣名邸", "康庄家园", "荣华里", "学府苑", "北环新城", "科技公馆"], floors: [6, 26] },
	{ u: "办公", names: ["智慧城市指挥中心", "水务集团大厦", "市政管网监测站", "科技创新中心", "开发区管委会", "综合服务中心"], floors: [5, 18] },
	{ u: "商业", names: ["万都广场", "滨江购物中心", "世纪金源商城", "翠微商业街", "北环商业广场"], floors: [3, 10] },
	{ u: "教育", names: ["滨江市第一中学", "开发区实验小学", "高新幼儿园", "滨江职业技术学院"], floors: [3, 8] },
	{ u: "医疗", names: ["滨江新区医院", "开发区社区卫生服务中心"], floors: [4, 12] },
	{ u: "工业", names: ["高新电子产业园", "滨江装备制造基地", "污水处理厂", "热力中心", "燃气储备站", "供水加压站"], floors: [1, 6] },
];
const buildings = [];
let bSeq = 0;
// 在网格街区（道路围合区域）内撒建筑
const cells = [];
for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 3; cy++) cells.push({ cx, cy });
cells.forEach((cell) => {
	const n = randInt(2, 4);
	const x0 = CENTER.x - 0.02 + cell.cx * 0.01 + 0.0015, x1 = CENTER.x - 0.02 + (cell.cx + 1) * 0.01 - 0.0015;
	const y0 = CENTER.y - 0.014 + cell.cy * 0.0095 + 0.0015, y1 = CENTER.y - 0.014 + (cell.cy + 1) * 0.0095 - 0.0015;
	for (let k = 0; k < n; k++) {
		const cat = pick(bUsage);
		const w = randF(0.0008, 0.0022), h = randF(0.0008, 0.0018);
		const bx = randF(x0, x1 - w), by = randF(y0, y1 - h);
		const floors = randInt(cat.floors[0], cat.floors[1]);
		const area = Math.round(w * 85000 * h * 111000 * randF(0.6, 0.85));
		bSeq++;
		buildings.push({
			id: `BLD-${String(bSeq).padStart(3, "0")}`, name: cat.names[bSeq % cat.names.length],
			usage: cat.u, area, floors, households: cat.u === "居住" ? floors * randInt(2, 8) : 0,
			address: `${pick(["滨河大道", "中山大道", "世纪大道", "科技大道", "人民路", "万都路", "学府路", "翠微路", "荣华街", "北环路"])}${randInt(1, 88)}号`,
			ring: [[bx, by], [bx + w, by], [bx + w, by + h], [bx, by + h], [bx, by]],
		});
	}
});

/* ---------------- 传感器 ---------------- */
const sensors = [];
let sSeq = 0;
const addSensor = (def) => {
	sSeq++;
	sensors.push({ id: `SEN-${String(sSeq).padStart(3, "0")}`, status: "online", lastValue: null, ...def });
};
// 流量计：主干污水/雨水/给水管（固定 9 个）
pipes.filter((p) => p.usage === "干管" && ["污水管", "雨水管", "给水管"].includes(p.type)).slice(0, 9).forEach((p) => {
	const mid = p.points[Math.floor(p.points.length / 2)];
	addSensor({
		name: `${p.road}${p.type.replace("管", "")}流量监测点`, type: "flow", unit: "m³/h",
		sourceType: "pipes", sourceId: p.id, sourceName: p.name,
		baseline: p.diameter >= 800 ? randF(900, 1400) : randF(350, 700), amplitude: 80, period: 3600, threshold: 2000,
		alarmType: "流量异常", x: mid[0], y: mid[1],
	});
});
// 压力计：给水/燃气主干管（固定 8 个）
pipes.filter((p) => p.usage !== "支管" && ["给水管", "燃气管"].includes(p.type)).slice(0, 8).forEach((p) => {
	const mid = p.points[Math.floor(p.points.length / 2)];
	addSensor({
		name: `${p.road}${p.type.replace("管", "")}压力监测点`, type: "pressure", unit: "MPa",
		sourceType: "pipes", sourceId: p.id, sourceName: p.name,
		baseline: p.type === "给水管" ? randF(0.32, 0.45) : randF(0.18, 0.3), amplitude: 0.05, period: 5400, threshold: p.type === "给水管" ? 0.6 : 0.4,
		alarmType: "压力异常", x: mid[0], y: mid[1],
	});
});
// 液位计：污水/雨水检查井（固定 10 个）
wells.filter((w) => w.type === "检查井" && ["污水管", "雨水管"].includes(w.pipeType)).slice(0, 10).forEach((w) => {
	addSensor({
		name: `${w.road || ""}${w.type}液位监测点`, type: "level", unit: "m",
		sourceType: "wells", sourceId: w.id, sourceName: w.id,
		baseline: randF(0.8, 1.6), amplitude: 0.35, period: 7200, threshold: w.depth || 2.8,
		alarmType: "液位超限", x: w.pt[0], y: w.pt[1],
	});
});
// 燃气泄漏检测：燃气阀井（固定 4 个）
wells.filter((w) => w.type === "阀门井" && w.pipeType === "燃气管").slice(0, 4).forEach((w) => {
	addSensor({
		name: `${w.road || ""}燃气泄漏检测点`, type: "gas", unit: "%LEL",
		sourceType: "wells", sourceId: w.id, sourceName: w.id,
		baseline: 1.5, amplitude: 0.8, period: 9000, threshold: 20,
		alarmType: "燃气浓度超标", x: w.pt[0], y: w.pt[1],
	});
});

/* ---------------- 用户 ---------------- */
const users = [
	{ id: "U-001", username: "admin", password: "admin123", name: "陈国栋", role: "admin", dept: "系统管理部", phone: "13800000001" },
	{ id: "U-002", username: "zhangwei", password: "zhang123", name: "张伟", role: "operator", dept: "运行调度中心", phone: "13800000002" },
	{ id: "U-003", username: "lina", password: "lina123", name: "李娜", role: "inspector", dept: "管网巡检队", phone: "13800000003" },
	{ id: "U-004", username: "wangfang", password: "wang123", name: "王芳", role: "viewer", dept: "综合办公室", phone: "13800000004" },
];

/* ---------------- 告警 ---------------- */
const ALARM_DEFS = [
	{ type: "爆管", level: "critical", tpl: (s) => `${s}发生爆管事故，路面出现冒水，需立即抢修` },
	{ type: "渗漏", level: "major", tpl: (s) => `${s}监测到持续渗漏，水量损失超出正常范围` },
	{ type: "压力异常", level: "major", tpl: (s) => `${s}压力值异常波动，疑似管网破损` },
	{ type: "液位超限", level: "major", tpl: (s) => `${s}液位超过警戒值，存在溢流风险` },
	{ type: "燃气浓度超标", level: "critical", tpl: (s) => `${s}检测到燃气浓度超标，请立即排查` },
	{ type: "井盖位移", level: "minor", tpl: (s) => `${s}井盖发生位移，存在安全隐患` },
	{ type: "水质异常", level: "warning", tpl: (s) => `${s}水质监测数据异常，建议取样复检` },
];
const activeSources = [
	...pipes.filter((p) => p.status === "fault").map((p) => ({ st: "pipes", id: p.id, name: p.name })),
	...wells.filter((w) => w.status === "fault").map((w) => ({ st: "wells", id: w.id, name: w.name })),
];
const alarms = [];
let aSeq = 0;
for (let i = 0; i < 45; i++) {
	aSeq++;
	const def = pick(ALARM_DEFS);
	const src = activeSources.length ? pick(activeSources) : { st: "pipes", id: pick(pipes).id, name: pick(pipes).name };
	const ts = NOW - randInt(1, 60) * DAY - randInt(0, DAY);
	const recent = NOW - ts < 2 * DAY;
	const status = recent ? (chance(0.55) ? "pending" : chance(0.5) ? "processing" : "resolved") : chance(0.12) ? "pending" : chance(0.2) ? "processing" : "resolved";
	alarms.push({
		id: `AL-${String(aSeq).padStart(3, "0")}`, code: `ALM-2026${String(randInt(1, 12)).padStart(2, "0")}${String(aSeq).padStart(3, "0")}`,
		type: def.type, level: def.level, title: `${def.type}告警`,
		description: def.tpl(src.name), sourceType: src.st, sourceId: src.id, sourceName: src.name,
		status, assignee: status === "pending" ? null : pick(users).name,
		createdAt: fmtTime(ts),
		resolvedAt: status === "resolved" ? fmtTime(ts + randInt(1, 48) * 3600000) : null,
		resolution: status === "resolved" ? pick(["已完成抢修并恢复供水", "已更换受损管段", "已疏通并恢复正常", "已复位井盖并加固", "复检无异常，关闭告警"]) : null,
	});
}
alarms.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

/* ---------------- 工单 ---------------- */
const WO_TYPES = ["抢修", "维修", "保养", "巡检", "投诉处理"];
const WO_STATUS = ["待派单", "已派单", "处理中", "待验收", "已完成"];
const WO_PRIORITY = ["紧急", "高", "中", "低"];
const WO_TITLES = {
	抢修: (s) => `抢修：${s}爆管事故`, 维修: (s) => `维修：${s}修复`, 保养: (s) => `保养：${s}定期保养`,
	巡检: (s) => `巡检：${s}例行检查`, 投诉处理: (s) => `投诉处理：${s}附近异味问题`,
};
const workOrders = [];
for (let i = 0; i < 38; i++) {
	const type = pick(WO_TYPES);
	const feat = pick(pipes);
	const status = WO_STATUS[Math.floor(Math.pow(rand(), 1.5) * WO_STATUS.length)];
	const created = NOW - randInt(1, 45) * DAY;
	const planStart = fmtDate(created + randInt(0, 2) * DAY);
	workOrders.push({
		id: `WO-${String(i + 1).padStart(3, "0")}`, code: `GD-2026${String(i + 1).padStart(3, "0")}`,
		type, title: WO_TITLES[type](feat.name), status, priority: status === "待派单" ? pick(WO_PRIORITY) : pick(WO_PRIORITY.slice(1)),
		assignee: status === "待派单" ? null : pick(users.slice(1)).name,
		relatedAlarm: type === "抢修" && chance(0.8) ? (pick(alarms.filter((a) => a.sourceId === feat.id))?.id ?? null) : null,
		relatedFeatures: [{ layer: "pipes", id: feat.id, name: feat.name }],
		description: `针对${feat.name}（${feat.id}）开展${type}作业，涉及${feat.road}段，施工期间注意交通疏导。`,
		planStart, planEnd: fmtDate(created + randInt(1, 5) * DAY),
		actualStart: ["已派单", "待派单"].includes(status) ? null : fmtDate(created + randInt(0, 2) * DAY),
		actualEnd: status === "已完成" ? fmtDate(created + randInt(2, 5) * DAY) : null,
		result: status === "已完成" ? pick(["作业完成，设施运行正常", "更换管段并恢复供水", "完成保养，记录存档"]) : null,
		createdAt: fmtTime(created),
	});
}
workOrders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

/* ---------------- 巡检计划 ---------------- */
const makeRoute = (typeFilter, roadName, count) => {
	const cand = wells.filter((w) => w.pipeType === typeFilter && w.road === roadName);
	const route = cand.slice(0, count).map((w, i) => ({
		wellId: w.id, name: w.id, order: i + 1, pt: w.pt,
		status: i < count * 0.6 ? "done" : i === Math.floor(count * 0.6) ? "issue" : "pending",
		issue: i === Math.floor(count * 0.6) ? (typeFilter === "污水管" ? "井内淤积约 30cm，建议清淤" : typeFilter === "雨水管" ? "井盖轻微破损" : "阀杆轻微锈蚀") : null,
	}));
	// 加上泵站点
	const pst = pumps.find((p) => (typeFilter === "污水管" ? p.subType.includes("污水") : typeFilter === "雨水管" ? p.subType.includes("雨水") : typeFilter === "给水管" ? p.subType.includes("供水") : null));
	if (pst) route.push({ wellId: pst.id, name: pst.name, order: route.length + 1, pt: pst.pt, status: "done", issue: null });
	return route;
};
const inspections = [
	{
		id: "IN-001", code: "XJ-20260801", name: "2026年8月污水管网日常巡检", type: "日常巡检", inspector: "李娜",
		route: makeRoute("污水管", "中山大道", 8), status: "进行中", planDate: fmtDate(NOW - 1 * DAY),
		startAt: fmtTime(NOW - 1 * DAY + 8 * 3600000), endAt: null,
	},
	{
		id: "IN-002", code: "XJ-20260802", name: "汛期雨水管网专项巡检", type: "专项巡检", inspector: "张伟",
		route: makeRoute("雨水管", "世纪大道", 9), status: "未开始", planDate: fmtDate(NOW + 1 * DAY),
		startAt: null, endAt: null,
	},
	{
		id: "IN-003", code: "XJ-20260720", name: "2026年7月给水管网月度巡检", type: "日常巡检", inspector: "李娜",
		route: makeRoute("给水管", "人民路", 7), status: "已完成", planDate: fmtDate(NOW - 20 * DAY),
		startAt: fmtTime(NOW - 20 * DAY + 8.5 * 3600000), endAt: fmtTime(NOW - 20 * DAY + 13 * 3600000),
	},
	{
		id: "IN-004", code: "XJ-20260715", name: "燃气管网季度安全巡检", type: "专项巡检", inspector: "张伟",
		route: makeRoute("燃气管", "建设路", 8), status: "已完成", planDate: fmtDate(NOW - 32 * DAY),
		startAt: fmtTime(NOW - 32 * DAY + 9 * 3600000), endAt: fmtTime(NOW - 32 * DAY + 15 * 3600000),
	},
	{
		id: "IN-005", code: "XJ-20260710", name: "热力管网检修前专项巡检", type: "专项巡检", inspector: "李娜",
		route: makeRoute("热力管", "滨河大道", 6), status: "已完成", planDate: fmtDate(NOW - 41 * DAY),
		startAt: fmtTime(NOW - 41 * DAY + 9 * 3600000), endAt: fmtTime(NOW - 41 * DAY + 12 * 3600000),
	},
];
inspections.forEach((ins) => {
	const total = ins.route.length;
	const done = ins.route.filter((r) => r.status === "done").length;
	const issues = ins.route.filter((r) => r.issue).length;
	ins.pointCount = total;
	ins.progress = ins.status === "已完成" ? 100 : Math.round((done / total) * 100);
	ins.issueCount = issues;
});

/* ---------------- 输出 GeoJSON ---------------- */
const fc = (features) => ({ type: "FeatureCollection", features });

const pipeFeatures = pipes.map((p) => ({
	type: "Feature",
	properties: { ...p, points: undefined },
	geometry: { type: "LineString", coordinates: p.points },
}));
const wellFeatures = wells.map((w) => ({
	type: "Feature",
	properties: { ...w, pt: undefined },
	geometry: { type: "Point", coordinates: w.pt },
}));
const pumpFeatures = pumps.map((p) => ({
	type: "Feature",
	properties: { ...p, pt: undefined },
	geometry: { type: "Point", coordinates: p.pt },
}));
const buildingFeatures = buildings.map((b) => ({
	type: "Feature",
	properties: { ...b, ring: undefined },
	geometry: { type: "Polygon", coordinates: [b.ring] },
}));

const biz = {
	meta: { ...AREA, generatedAt: new Date().toISOString(), center: CENTER, seed: 20260825,
		stats: { pipes: pipes.length, wells: wells.length, pumps: pumps.length, buildings: buildings.length, sensors: sensors.length, alarms: alarms.length, workOrders: workOrders.length, inspections: inspections.length } },
	users, alarms, workOrders, inspections, sensors,
};

/* ---------------- 写入文件 ---------------- */
// server/data 使用 .geojson（后端直接读取），src/data/mock 使用 .json（Vite 原生 JSON 导入）
const SERVER_DIR = join(ROOT, "server", "data");
const MOCK_DIR = join(ROOT, "src", "data", "mock");
[SERVER_DIR, MOCK_DIR].forEach((dir) => mkdirSync(dir, { recursive: true }));
const writeBoth = (serverName, mockName, obj) => {
	writeFileSync(join(SERVER_DIR, serverName), JSON.stringify(obj, null, "\t"), "utf8");
	writeFileSync(join(MOCK_DIR, mockName), JSON.stringify(obj, null, "\t"), "utf8");
};

writeBoth("pipes.geojson", "pipes.json", fc(pipeFeatures));
writeBoth("wells.geojson", "wells.json", fc(wellFeatures));
writeBoth("pumps.geojson", "pumps.json", fc(pumpFeatures));
writeBoth("buildings.geojson", "buildings.json", fc(buildingFeatures));
writeBoth("biz.json", "biz.json", biz);

console.log("✅ 模拟数据生成完成");
console.log(`   管线 ${pipes.length} 条 | 井 ${wells.length} 个 | 泵站 ${pumps.length} 座 | 建筑 ${buildings.length} 栋`);
console.log(`   传感器 ${sensors.length} 个 | 告警 ${alarms.length} 条 | 工单 ${workOrders.length} 条 | 巡检计划 ${inspections.length} 个`);
console.log(`   输出目录: server/data/ 与 src/data/mock/`);
