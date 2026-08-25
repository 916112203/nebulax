/**
 * 空间分析算法库
 * ============================================================
 * - buildNetwork(type)：以"井"为节点、"管线"为边的拓扑图
 * - traceUpstream/traceDownstream：上下游追踪（BFS 沿流向）
 * - isolationAnalysis：爆管关阀分析（经典供水管网 GIS 功能）
 * - bufferQuery：缓冲区空间查询
 * - pipeProfile：管线纵剖面（地面线 + 管底高程）
 * ============================================================
 */
import { db } from "./db.js";

export const toRad = (d) => (d * Math.PI) / 180;
/** 球面距离（米），使用 Haversine 公式 */
export function distM(a, b) {
	const R = 6371000;
	const dLat = toRad(b[1] - a[1]);
	const dLon = toRad(b[0] - a[0]);
	const la1 = toRad(a[1]), la2 = toRad(b[1]);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 点到线段最短距离（米） */
export function pointSegDistM(pt, a, b) {
	const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
	if (L2 === 0) return distM(pt, a);
	const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1])) / L2));
	return distM(pt, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

const geomDistM = (geom, pt) => {
	const c = geom.coordinates;
	if (geom.type === "Point") return distM(c, pt);
	if (geom.type === "LineString" || geom.type === "MultiLineString") {
		const lines = geom.type === "LineString" ? [c] : c;
		let m = Infinity;
		lines.forEach((line) => { for (let i = 1; i < line.length; i++) m = Math.min(m, pointSegDistM(pt, line[i - 1], line[i])); });
		return m;
	}
	if (geom.type === "Polygon") return pointSegDistM(pt, c[0][0], c[0][2]); // 矩形建筑近似
	return Infinity;
};

/* ---------------- 拓扑网络 ---------------- */
const getPipes = (type) =>
	db.prepare("SELECT geojson FROM features WHERE layer='pipes' AND pipe_type = ?").all(type)
		.map((r) => JSON.parse(r.geojson));

/**
 * 构建某类管网的拓扑图
 * @returns {{pipes: Map<id,{start,end,feature}>, wellPipes: Map<wellId, Set<pipeId>>}}
 */
export function buildNetwork(type) {
	const pipes = new Map();
	const wellPipes = new Map();
	getPipes(type).forEach((f) => {
		const p = f.properties;
		pipes.set(p.id, { start: p.startWell, end: p.endWell, feature: f });
		(p.wells || [p.startWell, p.endWell]).filter(Boolean).forEach((wid) => {
			if (!wellPipes.has(wid)) wellPipes.set(wid, new Set());
			wellPipes.get(wid).add(p.id);
		});
	});
	return { pipes, wellPipes };
}

/** 从目标管线出发 BFS，返回可达管线集合（stopAt(井, 深度) 谓词阻断扩散） */
const bfs = (network, startPipe, opts = {}) => {
	const { stopAt = () => false, collectStops = () => {} } = opts;
	const visited = new Set([startPipe]);
	const stops = new Set();
	const queue = [{ pid: startPipe, depth: 0 }];
	while (queue.length) {
		const { pid, depth } = queue.shift();
		const { start, end } = network.pipes.get(pid);
		for (const wid of [start, end]) {
			if (!wid) continue;
			if (stopAt(wid, depth)) { stops.add(wid); collectStops(wid, pid); continue; }
			for (const next of network.wellPipes.get(wid) || []) {
				if (visited.has(next)) continue;
				visited.add(next);
				queue.push({ pid: next, depth: depth + 1 });
			}
		}
	}
	return { pipes: visited, stops };
};

/**
 * 上下游追踪：沿流向 BFS。
 * 流向约定：管线方向为 startWell → endWell。
 * 下游：从当前管线 end 井出发，排除"以该井为终点（逆流进入）"的管线；
 * 上游：从当前管线 start 井出发，排除"以该井为起点（顺流离开）"的管线。
 * 交叉口中部连接（共享井位于管线中间）视为可通行。
 */
export function traceAnalysis(type, pipeId, direction) {
	const net = buildNetwork(type);
	const target = net.pipes.get(pipeId);
	if (!target) throw new Error(`未找到管线 ${pipeId}`);
	const visited = new Set([pipeId]);
	const queue = [{ pid: pipeId }];
	const order = [pipeId];
	while (queue.length) {
		const { pid } = queue.shift();
		const { start, end } = net.pipes.get(pid);
		const fromWell = direction === "downstream" ? end : start;
		if (!fromWell) continue;
		for (const next of net.wellPipes.get(fromWell) || []) {
			if (visited.has(next)) continue;
			const np = net.pipes.get(next);
			// 下游禁止从 next 的终点逆流进入；上游禁止从 next 的起点顺流进入
			const blocked = direction === "downstream" ? np.end === fromWell : np.start === fromWell;
			if (blocked) continue;
			visited.add(next);
			order.push(next);
			queue.push({ pid: next });
		}
	}
	const features = order.map((pid) => net.pipes.get(pid).feature);
	const totalLength = features.reduce((s, f) => s + (f.properties.length || 0), 0);
	return { type, direction, pipeId, features: { type: "FeatureCollection", features }, order, totalLength: Math.round(totalLength) };
}

/**
 * 爆管关阀分析（隔离方案）：
 * 1. 在爆管本身上定位爆点两侧最近的阀门/封堵点（沿管线上下游各 1 处）
 * 2. 从爆管两端 BFS 扩展隔离区：给水/燃气管网在第 1 跳及以后的阀门井处关闭；
 *    无阀门类型（污水/雨水/热力）在 3 跳边界封堵
 * 3. 输出关阀清单 + 受影响管段 + 影响范围（受影响建筑/户数）+ 处置流程
 */
export function isolationAnalysis(pipeId) {
	const row = db.prepare("SELECT * FROM features WHERE id = ?").get(pipeId);
	if (!row || row.layer !== "pipes") throw new Error(`未找到管线 ${pipeId}`);
	const burst = JSON.parse(row.geojson);
	const type = burst.properties.type;
	const net = buildNetwork(type);

	const valves = []; // {wellId, name, dist, pt, role}
	const wellRows = db.prepare("SELECT geojson FROM features WHERE layer='wells'").all().map((r) => JSON.parse(r.geojson));
	const wellById = new Map(wellRows.map((f) => [f.properties.id, f]));
	const burstMid = burst.geometry.coordinates[Math.floor(burst.geometry.coordinates.length / 2)];

	const hasValves = type === "给水管" || type === "燃气管";
	const isValve = (wid) => wellById.get(wid)?.properties.type === "阀门井";
	const addValve = (wid, role) => {
		if (valves.some((v) => v.wellId === wid)) return;
		const w = wellById.get(wid);
		if (!w) return;
		valves.push({ wellId: wid, name: w.properties.name, pt: w.geometry.coordinates, dist: Math.round(distM(burstMid, w.geometry.coordinates)), role });
	};

	// ① 爆管段自身：沿管线定位爆点两侧最近的隔离点
	const burstWells = (burst.properties.wells || []).map((wid) => wellById.get(wid)).filter(Boolean);
	if (burstWells.length) {
		// 计算每个井沿管线的累计距离，爆点取管线中点
		const cum = [0];
		for (let i = 1; i < burstWells.length; i++) cum.push(cum[i - 1] + distM(burstWells[i - 1].geometry.coordinates, burstWells[i].geometry.coordinates));
		const burstCum = cum[cum.length - 1] / 2;
		let upValve = null, downValve = null;
		burstWells.forEach((w, i) => {
			if (cum[i] <= burstCum) upValve = w; else if (!downValve) downValve = w;
		});
		if (upValve) addValve(upValve.properties.id, hasValves ? "上游阀门" : "上游封堵点");
		if (downValve) addValve(downValve.properties.id, hasValves ? "下游阀门" : "下游封堵点");
	}

	// ② 从爆管两端扩展隔离区
	const { pipes: affected } = bfs(net, pipeId, {
		stopAt: (wid, depth) => (hasValves ? isValve(wid) && depth >= 1 : depth >= 3),
		collectStops: (wid) => addValve(wid, hasValves ? "隔离边界阀门" : "隔离边界封堵点"),
	});

	const affectedFeatures = [...affected].map((pid) => net.pipes.get(pid).feature);
	const affectedLength = affectedFeatures.reduce((s, f) => s + (f.properties.length || 0), 0);

	// 影响范围：受影响管段 120m 缓冲内的建筑
	const buildings = db.prepare("SELECT geojson FROM features WHERE layer='buildings'").all().map((r) => JSON.parse(r.geojson));
	const affectedBuildings = buildings.filter((b) => {
		const geom = b.geometry;
		const center = [((geom.coordinates[0][0][0] + geom.coordinates[0][2][0]) / 2), ((geom.coordinates[0][0][1] + geom.coordinates[0][2][1]) / 2)];
		return affectedFeatures.some((f) => {
			const c = f.geometry.coordinates;
			for (let i = 1; i < c.length; i++) if (pointSegDistM(center, c[i - 1], c[i]) < 120) return true;
			return false;
		});
	}).map((b) => ({ id: b.properties.id, name: b.properties.name, usage: b.properties.usage, households: b.properties.households || 0 }));
	const affectedHouseholds = affectedBuildings.reduce((s, b) => s + b.households, 0);

	const strategy = hasValves ? "关阀隔离" : "封堵隔离";
	const actionName = hasValves ? "阀门" : "封堵点";

	// 处置流程
	const steps = [
		`定位爆管位置：${burst.properties.name}（${pipeId}），${burst.properties.road || ""}，管径 DN${burst.properties.diameter}，材质 ${burst.properties.material}`,
		`调度抢修班组赶赴现场，同步联系交警部门对 ${burst.properties.road || "事发路段"} 实施交通疏导`,
		`按方案关闭${actionName} ${valves.map((v) => v.wellId).join("、") || "无（管网末端）"}，隔离爆管段`,
		hasValves
			? "启动应急供水/导流预案，通知受影响小区物业与重点单位"
			: "启动应急导流与临时抽排预案，通知受影响小区物业与重点单位",
		"开挖修复受损管段，回填并恢复路面，逐步恢复管网运行",
		"恢复后开展水质监测与压力测试，确认无异常后关闭工单",
	];

	return {
		burstPipe: burst,
		strategy,
		valvesToClose: valves,
		affectedPipes: { type: "FeatureCollection", features: affectedFeatures },
		affectedPipeIds: [...affected],
		affectedLength: Math.round(affectedLength),
		affectedBuildings,
		affectedHouseholds,
		steps,
	};
}

/** 缓冲区查询：支持 Point / LineString / Polygon 缓冲 */
export function bufferQuery({ geometry, radius = 500, layers = ["pipes", "wells", "pumps", "buildings"] }) {
	const features = [];
	layers.forEach((layer) => {
		db.prepare("SELECT geojson FROM features WHERE layer = ?").all(layer).forEach((r) => {
			const f = JSON.parse(r.geojson);
			if (geomDistM(f.geometry, geometry.coordinates) <= radius) features.push(f);
		});
	});
	return { type: "FeatureCollection", features, radius, layers };
}

/** 管线纵剖面：沿线井的地面高程与管底高程 */
export function pipeProfile(pipeId) {
	const row = db.prepare("SELECT * FROM features WHERE id = ?").get(pipeId);
	if (!row || row.layer !== "pipes") throw new Error(`未找到管线 ${pipeId}`);
	const pipe = JSON.parse(row.geojson);
	const wells = pipe.properties.wells || [pipe.properties.startWell, pipe.properties.endWell].filter(Boolean);
	const wellRows = db.prepare("SELECT geojson FROM features WHERE layer='wells'").all().map((r) => JSON.parse(r.geojson));
	const byId = new Map(wellRows.map((f) => [f.properties.id, f]));

	let acc = 0;
	const points = [];
	wells.forEach((wid, i) => {
		const w = byId.get(wid);
		if (!w) return;
		const pt = w.geometry.coordinates;
		if (i > 0) acc += distM(points[i - 1].pt, pt);
		const ground = w.properties.elevation ?? 24;
		points.push({ wellId: wid, pt, dist: Math.round(acc), ground, invert: +(ground - (pipe.properties.depth || 2)).toFixed(2), depth: pipe.properties.depth || 2 });
	});
	const diameter = pipe.properties.diameter || 0;
	return { pipe: pipe.properties, diameter, totalLength: Math.round(acc), points };
}
