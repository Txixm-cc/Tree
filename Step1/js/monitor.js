(function (App) {
    const state = {
        source: "sim",
        selectedDevice: App.config.devices[0].id,
        deviceMap: {},          // device_id -> { sample, lastTime }
        startTime: Date.now(),
        uptimeSeconds: 0,
        timers: {}
    };

    /* ---------- 阈值交叉判定（算法结果 + 本地阈值双重校验） ---------- */
    function evaluate(msg) {
        const th = App.config.thresholds;
        const reasons = [];
        let status = msg.status;

        if (msg.rms >= th.rms) reasons.push("RMS 超限");
        if (msg.anomaly_score >= th.score) reasons.push("异常评分超限");
        if (reasons.length) status = App.config.status.ABNORMAL;

        const severe = msg.anomaly_score >= th.severeScore || msg.rms >= th.severeRms;
        const reason = reasons.length
            ? reasons.join("、")
            : status === App.config.status.ABNORMAL ? "算法模型判定异常" : "";

        return { status, level: severe ? "severe" : "common", reason };
    }

    /* ---------- 动态注册新接入设备（MQTT / 导入文件中出现未知 device_id 时自动加入） ---------- */
    function ensureDevice(deviceId) {
        const exists = App.config.devices.some((d) => d.id === deviceId);
        if (!exists) {
            App.config.devices.push({
                id: deviceId,
                label: "接入设备 · " + deviceId,
                baseRms: 0.1,
                volatility: 0.03
            });
            App.UI.renderDeviceSelect(App.config.devices, state.selectedDevice);
        }
        refreshQueryDeviceOptions();
    }

    /* ---------- 消息统一入口 ----------
       msg.ts 为消息自带时间戳（MQTT / 历史文件）；缺失时用接收时间 ts。
       notify=false 时不弹 Toast（批量导入历史时避免刷屏）。 */
    function handleMessage(msg, ts, source, notify = true) {
        const judged = evaluate(msg);
        const sample = {
            t: msg.ts || ts,
            device_id: msg.device_id,
            rms: msg.rms,
            status: judged.status,
            anomaly_score: msg.anomaly_score,
            source
        };

        ensureDevice(msg.device_id);

        // 1. 历史采样落库
        App.Storage.appendSample(sample);

        // 2. 更新设备在线状态
        state.deviceMap[msg.device_id] = { sample, lastTime: sample.t };

        // 3. 异常 → 生成报警记录
        if (judged.status === App.config.status.ABNORMAL) {
            App.Storage.appendAlarm({
                t: sample.t,
                device_id: msg.device_id,
                rms: sample.rms,
                anomaly_score: sample.anomaly_score,
                status: judged.status,
                level: judged.level,
                reason: judged.reason
            });
            if (notify && msg.device_id === state.selectedDevice) {
                App.UI.toast(`[${msg.device_id}] ${judged.level === "severe" ? "严重" : "一般"}报警：${judged.reason}`);
            }
        }

        refreshAll();
    }

    /* ---------- 批量导入历史 JSON：一次性落库，最后统一刷新 ---------- */
    function importBatch(messages) {
        App.Simulator.stop();
        messages.forEach((msg) => {
            const judged = evaluate(msg);
            ensureDevice(msg.device_id);
            const sample = {
                t: msg.ts || Date.now(),
                device_id: msg.device_id,
                rms: msg.rms,
                status: judged.status,
                anomaly_score: msg.anomaly_score,
                source: "import"
            };
            App.Storage.appendSample(sample);
            state.deviceMap[msg.device_id] = { sample, lastTime: sample.t };
            if (judged.status === App.config.status.ABNORMAL) {
                App.Storage.appendAlarm({
                    t: sample.t,
                    device_id: msg.device_id,
                    rms: sample.rms,
                    anomaly_score: sample.anomaly_score,
                    status: judged.status,
                    level: judged.level,
                    reason: judged.reason
                });
            }
        });
        if (messages[0]) {
            state.selectedDevice = messages[0].device_id;
            App.UI.renderDeviceSelect(App.config.devices, state.selectedDevice);
        }
        refreshAll();
    }

    /* ---------- 逐条实时回放：按采样间隔把消息送入实时链路 ---------- */
    let replayTimer = null;
    function stopReplay() {
        if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    }

    function replayMessages(messages) {
        stopReplay();
        App.Simulator.stop();
        let i = 0;
        App.UI.toast(`开始逐条回放 ${messages.length} 条数据…`);
        replayTimer = setInterval(() => {
            if (i >= messages.length) {
                stopReplay();
                App.UI.toast("回放完成");
                refreshAll();
                return;
            }
            const msg = messages[i++];
            handleMessage(msg, msg.ts || Date.now(), "replay", true);
        }, App.config.sampling.intervalMs);
    }

    /* ---------- 刷新界面与图表 ---------- */
    function refreshAll() {
        const history = App.Storage.getHistoryByDevice(state.selectedDevice);
        const windowSize = App.config.sampling.chartWindow;
        const recent = history.slice(-windowSize);

        App.Charts.updateRms(
            recent.map((p) => ({ time: App.Storage.formatClock(p.t), value: p.rms })),
            App.config.thresholds.rms
        );
        App.Charts.updateScore(
            recent.map((p) => ({ time: App.Storage.formatClock(p.t), value: p.anomaly_score })),
            App.config.thresholds.score
        );

        const alarms = App.Storage.getAlarms();
        App.Charts.updateAlarmBar(alarms);
        App.Charts.updateStatusPie(App.Storage.getHistory());

        App.UI.renderKpi({
            sample: state.deviceMap[state.selectedDevice]?.sample || null,
            onlineCount: Object.keys(state.deviceMap).length,
            totalCount: App.config.devices.length,
            alarmCount: alarms.length,
            uptimeSeconds: state.uptimeSeconds
        });

        App.UI.renderDevices(state.deviceMap, state.selectedDevice);
        App.UI.renderAlarms(alarms);

        const current = state.deviceMap[state.selectedDevice]?.sample;
        App.UI.Wave.setStatus(current ? current.status : App.config.status.NORMAL);

        // 异常时给报警面板加告警闪烁
        document.querySelector(".panel-alarm")?.classList.toggle(
            "alarming",
            current?.status === App.config.status.ABNORMAL
        );
    }

    /* ---------- 数据源切换 ---------- */
    function switchSource(mode) {
        state.source = mode;
        const simBtn = document.getElementById("btnSourceSim");
        const mqttBtn = document.getElementById("btnSourceMqtt");
        simBtn.classList.toggle("active", mode === "sim");
        mqttBtn.classList.toggle("active", mode === "mqtt");
        simBtn.setAttribute("aria-selected", mode === "sim");
        mqttBtn.setAttribute("aria-selected", mode === "mqtt");

        // 数据源选择持久化，下次打开自动恢复
        const settings = App.Storage.loadSettings();
        settings.source = mode;
        App.Storage.saveSettings(settings);

        stopReplay();
        if (mode === "sim") {
            App.Mqtt.disconnect();
            App.Simulator.start();
            App.UI.renderConn("sim", "演示模式 · 模拟上报");
        } else {
            App.Simulator.stop();
            App.Mqtt.connect(
                settings.mqtt.broker,
                settings.mqtt.topic,
                (st, text) => App.UI.renderConn(st, text),
                handleMessage
            );
        }
    }

    /* ---------- 页面事件绑定 ---------- */
    function bindEvents() {
        document.getElementById("btnSourceSim").addEventListener("click", () => switchSource("sim"));
        document.getElementById("btnSourceMqtt").addEventListener("click", () => switchSource("mqtt"));

        document.getElementById("deviceSelect").addEventListener("change", (e) => {
            state.selectedDevice = e.target.value;
            refreshAll();
        });

        document.getElementById("btnExportCsv").addEventListener("click", () => {
            const alarms = App.Storage.getAlarms();
            if (!alarms.length) { App.UI.toast("当前没有可导出的报警记录"); return; }
            const stamp = App.Storage.formatTime(Date.now()).replace(/[-: ]/g, "");
            App.Storage.downloadCSV(`声学监测报警记录_${stamp}.csv`, App.Storage.toCSV(alarms));
            App.UI.toast("报警记录已导出 CSV");
        });

        document.getElementById("btnClearAlarm").addEventListener("click", () => {
            if (!confirm("确定清空全部本地报警记录吗？该操作不可恢复。")) return;
            App.Storage.clearAlarms();
            refreshAll();
            App.UI.toast("报警记录已清空");
        });

        document.getElementById("btnClearHistory").addEventListener("click", () => {
            if (!confirm("确定清空本地历史采样曲线数据吗？")) return;
            App.Storage.clearHistory();
            refreshAll();
            App.UI.toast("历史曲线数据已清空");
        });

        App.UI.el.settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const settings = App.Storage.loadSettings();
            settings.thresholds.rms = Number(App.UI.el.rmsThreshold.value);
            settings.thresholds.score = Number(App.UI.el.scoreThreshold.value);
            settings.mqtt.broker = App.UI.el.mqttBroker.value.trim();
            settings.mqtt.topic = App.UI.el.mqttTopic.value.trim();
            App.Storage.saveSettings(settings);
            App.UI.toast("设置已保存到本地");
            refreshAll();
            if (state.source === "mqtt") switchSource("mqtt"); // 保存后按新参数重连
        });

        /* ---------- 本地 JSON 文件导入 / 回放 ---------- */
        const fileInput = document.getElementById("jsonFileInput");
        let importMode = "batch";
        document.getElementById("btnImportBatch").addEventListener("click", () => {
            importMode = "batch";
            fileInput.click();
        });
        document.getElementById("btnImportReplay").addEventListener("click", () => {
            importMode = "replay";
            fileInput.click();
        });
        fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const { messages, invalid } = App.Importer.parseText(String(reader.result));
                if (!messages.length) {
                    App.UI.toast("未解析到有效消息，请检查 JSON 字段与格式");
                    fileInput.value = "";
                    return;
                }
                if (importMode === "batch") {
                    importBatch(messages);
                    App.UI.toast(
                        `已批量导入 ${messages.length} 条` +
                        (invalid.length ? `，跳过 ${invalid.length} 条无效记录` : "")
                    );
                } else {
                    replayMessages(messages);
                }
                fileInput.value = "";
            };
            reader.onerror = () => App.UI.toast("文件读取失败，请重试");
            reader.readAsText(file, "utf-8");
        });

        /* ---------- 历史声音状态查询 ---------- */
        refreshQueryDeviceOptions();
        document.getElementById("btnQueryHistory").addEventListener("click", doQueryHistory);
        document.getElementById("btnQueryReset").addEventListener("click", resetQueryHistory);
    }

    /* ---------- 历史声音状态查询 ---------- */
    function refreshQueryDeviceOptions() {
        const sel = document.getElementById("queryDevice");
        if (!sel) return;
        const current = sel.value;
        const ids = Object.keys(state.deviceMap);
        sel.innerHTML = '<option value="">全部设备</option>' +
            ids.map((id) => `<option value="${id}">${id}</option>`).join("");
        if (ids.includes(current)) sel.value = current;
    }

    function doQueryHistory() {
        const deviceId = document.getElementById("queryDevice").value;
        const status = document.getElementById("queryStatus").value;
        const startVal = document.getElementById("queryStart").value;
        const endVal = document.getElementById("queryEnd").value;
        const startTs = startVal ? new Date(startVal).getTime() : null;
        const endTs = endVal ? new Date(endVal).getTime() : null;

        const history = App.Storage.getHistory() || [];
        const matched = history.filter((s) => {
            if (deviceId && s.device_id !== deviceId) return false;
            if (status) {
                const isAbnormal = s.status === App.config.status.ABNORMAL;
                if (status === "abnormal" && !isAbnormal) return false;
                if (status === "normal" && isAbnormal) return false;
            }
            if (startTs && s.t < startTs) return false;
            if (endTs && s.t > endTs) return false;
            return true;
        });

        const limit = 100;
        const shown = matched.slice(-limit).reverse();
        const tbody = document.getElementById("queryHistoryTbody");
        const count = document.getElementById("queryHistoryCount");

        if (!shown.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">该条件下暂无历史声音记录</td></tr>';
            count.textContent = "共 0 条匹配记录";
            return;
        }

        tbody.innerHTML = shown.map((s) => {
            const isAbnormal = s.status === App.config.status.ABNORMAL;
            return `
        <tr>
          <td>${App.Storage.formatTime(s.t)}</td>
          <td><span class="device-chip">${s.device_id}</span></td>
          <td>${Number(s.rms).toFixed(3)}</td>
          <td>${Number(s.anomaly_score).toFixed(3)}</td>
          <td><span class="badge ${isAbnormal ? "danger" : "ok"}">${isAbnormal ? "异常" : "正常"}</span></td>
        </tr>`;
        }).join("");

        count.textContent = matched.length > limit
            ? `共 ${matched.length} 条匹配记录，仅展示最新 ${limit} 条`
            : `共 ${matched.length} 条匹配记录`;
    }

    function resetQueryHistory() {
        document.getElementById("queryDevice").value = "";
        document.getElementById("queryStatus").value = "";
        document.getElementById("queryStart").value = "";
        document.getElementById("queryEnd").value = "";
        document.getElementById("queryHistoryTbody").innerHTML =
            '<tr class="empty-row"><td colspan="5">暂无查询结果</td></tr>';
        document.getElementById("queryHistoryCount").textContent = "请设置筛选条件后点击「查询」";
    }

    /* ---------- 周期任务 ---------- */
    function startTimers() {
        state.timers.clock = setInterval(App.UI.updateClock, 1000);
        state.timers.uptime = setInterval(() => {
            state.uptimeSeconds = Math.floor((Date.now() - state.startTime) / 1000);
            refreshAll();
        }, 1000);
    }

    /* ---------- 首次启动：预置一段历史基线，让曲线首屏即有形状 ---------- */
    function seedHistory() {
        if (App.Storage.getHistory().length > 0) return;
        const interval = App.config.sampling.intervalMs;
        const now = Date.now();
        App.config.devices.forEach((meta) => {
            let rms = meta.baseRms;
            for (let i = 40; i >= 1; i--) {
                rms = Math.max(0.02, rms + (meta.baseRms - rms) * 0.2 +
                    (Math.random() - 0.5) * meta.volatility);
                const score = Number((0.05 + Math.random() * 0.28).toFixed(3));
                App.Storage.appendSample({
                    t: now - i * interval,
                    device_id: meta.id,
                    rms: Number(rms.toFixed(4)),
                    status: App.config.status.NORMAL,
                    anomaly_score: score,
                    source: "seed"
                });
            }
        });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        App.UI.cacheDom();
        const settings = App.Storage.loadSettings();
        App.Storage.saveSettings(settings);
        App.UI.fillSettings(settings);
        App.UI.renderDeviceSelect(App.config.devices, state.selectedDevice);
        App.Charts.initAll();
        App.UI.Wave.init();
        bindEvents();
        App.UI.updateClock();
        startTimers();

        seedHistory();

        // 注册模拟器消息回调后按保存的数据源启动
        App.Simulator.onMessage(handleMessage);
        switchSource(settings.source || "sim");
        refreshAll();
    }

    App.Monitor = { init, handleMessage, refreshAll, state };
})(window.Acoustic);
