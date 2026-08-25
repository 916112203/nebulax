/**
 * 要素路由：管线 / 井 / 泵站 / 建筑 的查询、编辑（增删改）与搜索
 * - 查询返回 GeoJSON FeatureCollection，支持 bbox、类型、状态、关键字过滤与分页
 * - 写操作按角色授权：编辑 operator+，删除 admin
 */
import { Router } from "express";
import { db, featureRowToGeoJSON } from "../db.js";
import { authenticate, requireRole } from "../auth.js";

const router = Router();
const LAYERS = ["pipes", "wells", "pumps", "buildings"];
const LAYER_CN = { pipes: "管线", wells: "检查井", pumps: "泵站", buildings: "建筑" };

const bboxOf = (geom) => {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	const walk = (c) => {
		if (typeof c[0] === "number") {
			minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]);
			miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]);
		} else c.forEach(walk);
	};
	walk(geom.coordinates);
	return { minx, miny, maxx, maxy };
};

/** GET /api/features/:layer?bbox=&type=&status=&q=&page=&pageSize= */
router.get("/:layer", (req, res) => {
	const { layer } = req.params;
	if (!LAYERS.includes(layer)) return res.status(400).json({ error: "未知图层" });

	const conds = ["layer = ?"];
	const args = [layer];
	const { bbox, type, status, q } = req.query;
	if (bbox) {
		const [minx, miny, maxx, maxy] = bbox.split(",").map(Number);
		if (![minx, miny, maxx, maxy].some(Number.isNaN)) {
			conds.push("bbox_minx <= ? AND bbox_maxx >= ? AND bbox_miny <= ? AND bbox_maxy >= ?");
			args.push(maxx, minx, maxy, miny);
		}
	}
	if (type && type !== "all") { conds.push("type = ?"); args.push(type); }
	if (status && status !== "all") { conds.push("status = ?"); args.push(status); }
	if (q) { conds.push("(name LIKE ? OR id LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }

	const total = db.prepare(`SELECT COUNT(*) AS n FROM features WHERE ${conds.join(" AND ")}`).get(...args).n;
	const page = Math.max(1, Number(req.query.page || 1));
	const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 500)));
	const rows = db.prepare(`SELECT * FROM features WHERE ${conds.join(" AND ")} LIMIT ? OFFSET ?`)
		.all(...args, pageSize, (page - 1) * pageSize);

	res.json({
		type: "FeatureCollection",
		features: rows.map(featureRowToGeoJSON),
		total, page, pageSize,
	});
});

/** POST /api/features/:layer — 新增要素（body 为 GeoJSON Feature） */
router.post("/:layer", authenticate, requireRole("operator"), (req, res) => {
	const { layer } = req.params;
	if (!LAYERS.includes(layer)) return res.status(400).json({ error: "未知图层" });
	const feature = req.body;
	if (!feature || !feature.geometry || !feature.properties) return res.status(400).json({ error: "请提交合法的 GeoJSON Feature" });
	const p = feature.properties;
	if (!p.id) return res.status(400).json({ error: "要素必须包含 id 属性" });
	if (db.prepare("SELECT id FROM features WHERE id = ?").get(p.id)) return res.status(409).json({ error: `编号 ${p.id} 已存在` });
	const { minx, miny, maxx, maxy } = bboxOf(feature.geometry);
	db.prepare(`INSERT INTO features (id, layer, geojson, name, type, status, pipe_type, diameter, depth, road, start_well, end_well, wells_json, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
		p.id, layer, JSON.stringify(feature), p.name ?? null, p.type ?? null, p.status ?? null,
		p.type ?? null, p.diameter ?? null, p.depth ?? null, p.road ?? null,
		p.startWell ?? null, p.endWell ?? null, p.wells ? JSON.stringify(p.wells) : null,
		minx, miny, maxx, maxy, new Date().toISOString()
	);
	res.status(201).json({ id: p.id, message: `${LAYER_CN[layer]} ${p.id} 新增成功` });
});

/** PUT /api/features/:layer/:id — 更新要素 */
router.put("/:layer/:id", authenticate, requireRole("operator"), (req, res) => {
	const { layer, id } = req.params;
	if (!LAYERS.includes(layer)) return res.status(400).json({ error: "未知图层" });
	const row = db.prepare("SELECT * FROM features WHERE id = ?").get(id);
	if (!row) return res.status(404).json({ error: `未找到要素 ${id}` });
	const feature = req.body;
	if (!feature || !feature.geometry || !feature.properties) return res.status(400).json({ error: "请提交合法的 GeoJSON Feature" });
	const p = { ...feature.properties, id };
	const { minx, miny, maxx, maxy } = bboxOf(feature.geometry);
	db.prepare(`UPDATE features SET layer=?, geojson=?, name=?, type=?, status=?, pipe_type=?, diameter=?, depth=?, road=?, start_well=?, end_well=?, wells_json=?, bbox_minx=?, bbox_miny=?, bbox_maxx=?, bbox_maxy=?, updated_at=? WHERE id=?`).run(
		layer, JSON.stringify({ ...feature, properties: p }), p.name ?? null, p.type ?? null, p.status ?? null,
		p.type ?? null, p.diameter ?? null, p.depth ?? null, p.road ?? null,
		p.startWell ?? null, p.endWell ?? null, p.wells ? JSON.stringify(p.wells) : null,
		minx, miny, maxx, maxy, new Date().toISOString(), id
	);
	res.json({ id, message: `${LAYER_CN[layer]} ${id} 更新成功` });
});

/** DELETE /api/features/:layer/:id — 删除要素 */
router.delete("/:layer/:id", authenticate, requireRole("admin"), (req, res) => {
	const { layer, id } = req.params;
	const row = db.prepare("SELECT * FROM features WHERE id = ?").get(id);
	if (!row) return res.status(404).json({ error: `未找到要素 ${id}` });
	db.prepare("DELETE FROM features WHERE id = ?").run(id);
	res.json({ id, message: `${LAYER_CN[layer] || ""} ${id} 删除成功` });
});

/** GET /api/features/search/all?q= — 全局搜索（编号/名称） */
router.get("/search/all", (req, res) => {
	const q = (req.query.q || "").trim();
	if (!q) return res.json({ features: [] });
	const rows = db.prepare("SELECT * FROM features WHERE name LIKE ? OR id LIKE ? LIMIT 20").all(`%${q}%`, `%${q}%`);
	res.json({ features: rows.map(featureRowToGeoJSON) });
});

export default router;
