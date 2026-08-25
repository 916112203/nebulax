/**
 * 实时遥测模拟器
 * ============================================================
 * - 每个周期（默认 3s）为所有在线传感器生成新读数并写入 SQLite
 * - 随机注入异常：传感器持续越限 2~4 分钟，首次触发时自动生成告警
 * - 通过 WebSocket 向所有客户端广播：遥测批量数据、告警事件
 * - 异常自然恢复后，未处理的告警自动关闭（模拟自愈/远程处置）
 * ============================================================
 */
import { db, simValue } from "./db.js";
import { config } from "./config.js";

const fmtTime = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

export class TelemetrySimulator {
	constructor(broadcast) {
		this.broadcast = broadcast; // (payload) => void
		this.timer = null;
		this.anomalies = new Map(); // sensorId -> {until, alarmId}
		this.phaseBySensor = new Map();
	}

	start() {
		const sensors = db.prepare("SELECT * FROM sensors").all();
		sensors.forEach((s) => this.phaseBySensor.set(s.id, ((s.id.charCodeAt(s.id.length - 1) % 10) / 10) * Math.PI * 2));
		this.timer = setInterval(() => this.tick(), config.telemetry.intervalMs);
		console.log(`[sim] 遥测模拟器已启动：${sensors.length} 个传感器，周期 ${config.telemetry.intervalMs}ms`);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
	}

	tick() {
		const now = Date.now();
		const sensors = db.prepare("SELECT * FROM sensors WHERE status='online'").all();
		const upd = db.prepare("UPDATE sensors SET last_value=?, last_ts=? WHERE id=?");
		const ins = db.prepare("INSERT INTO telemetry (sensor_id, value, ts) VALUES (?,?,?)");
		const batch = [];

		// 全局异常注入：每个周期小概率随机选一个传感器越限（约 2~3 分钟一次）
		const inject = Math.random() < config.telemetry.anomalyChance
			? sensors[Math.floor(Math.random() * sensors.length)]
			: null;
		if (inject && !this.anomalies.has(inject.id)) {
			const until = now + (120 + Math.random() * 180) * 1000;
			const alarmId = this.createAnomalyAlarm(inject, now);
			this.anomalies.set(inject.id, { until, alarmId });
			console.log(`[sim] 注入异常：${inject.name}(${inject.id}) 越限，生成告警 ${alarmId}`);
		}

		sensors.forEach((s) => {
			let value = simValue(s, now, this.phaseBySensor.get(s.id) || 0);

			// 异常持续与恢复
			const anom = this.anomalies.get(s.id);
			if (anom && now > anom.until) {
				this.anomalies.delete(s.id);
				this.resolveAnomalyAlarm(anom.alarmId);
				console.log(`[sim] 传感器 ${s.id} 异常恢复，告警 ${anom.alarmId} 自动关闭`);
			} else if (anom) {
				value = s.threshold * (1.25 + Math.random() * 0.4); // 持续越限
			}

			const v = Math.round(value * 1000) / 1000;
			upd.run(v, now, s.id);
			ins.run(s.id, v, now);
			batch.push({ sensorId: s.id, value: v, ts: now });
		});

		this.broadcast({ type: "telemetry", data: batch });
	}

	/** 异常首次触发：生成 pending 告警并广播 */
	createAnomalyAlarm(s, now) {
		const id = `AL-SIM-${Date.now().toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`;
		const code = `ALM-SIM-${String(Date.now() % 1000000)}`;
		const title = `${s.alarmType || "监测数据异常"}告警`;
		const descMap = {
			flow: "流量监测值持续超出正常范围，疑似管网破损或异常排放",
			pressure: "压力监测值异常，疑似爆管或阀门误操作",
			level: "液位超过警戒值，存在溢流风险，请立即核查",
			gas: "燃气浓度超过报警阈值，请立即组织排查",
		};
		db.prepare(`INSERT INTO alarms (id,code,type,level,title,description,source_type,source_id,source_name,status,assignee,created_at,resolved_at,resolution)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
			id, code, s.alarmType || "监测数据异常", s.type === "gas" ? "critical" : "major",
			title, descMap[s.type] || `${s.name}监测值异常，请核查`,
			"sensors", s.id, s.name, "pending", null, fmtTime(now), null, null,
		);
		const alarm = db.get("SELECT * FROM alarms WHERE id = ?", id);
		this.broadcast({ type: "alarm", alarm });
		return id;
	}

	/** 异常恢复：未受理的告警自动关闭（模拟远程自动处置） */
	resolveAnomalyAlarm(alarmId) {
		const alarm = db.get("SELECT * FROM alarms WHERE id = ?", alarmId);
		if (!alarm || alarm.status === "resolved") return;
		const now = new Date().toISOString().slice(0, 16).replace("T", " ");
		db.run("UPDATE alarms SET status='resolved', resolved_at=?, resolution=?, assignee=? WHERE id=?",
			now, "监测值恢复正常，系统自动关闭告警", "系统", alarmId);
		this.broadcast({ type: "alarm-update", alarm: db.get("SELECT * FROM alarms WHERE id = ?", alarmId) });
	}

	/** 外部（工单关闭等）触发的手动关闭由 routes 层处理 */
}
