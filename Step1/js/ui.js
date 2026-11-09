(function (App) {
    const $ = (id) => document.getElementById(id);
    const el = {};

    /* ---------- 初始化 DOM 引用 ---------- */
    function cacheDom() {
        [
            "clockTime", "clockDate", "kpiRms", "kpiScore", "kpiStatus", "kpiStatusFoot",
            "kpiOnline", "kpiTotal", "kpiAlarm", "kpiUptime", "stateDot",
            "kpiRmsFoot", "kpiScoreFoot", "kpiAlarmFoot",
            "deviceSelect", "deviceList", "alarmTbody", "connDot", "connText",
            "settingsForm", "rmsThreshold", "scoreThreshold", "mqttBroker", "mqttTopic",
            "waveOkLabel", "waveBadLabel", "toast"
        ].forEach((id) => { el[id] = $(id); });
    }

    /* ---------- Toast 轻提示 ---------- */
    let toastTimer = null;
    function toast(msg) {
        el.toast.textContent = msg;
        el.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
    }

    /* ---------- 数字滚动动画 ---------- */
    function animateNumber(node, from, to, decimals) {
        const duration = 260;
        const start = performance.now();
        function frame(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const value = from + (to - from) * eased;
            node.textContent = value.toFixed(decimals);
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    /* ---------- 时钟 ---------- */
    const WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    function updateClock() {
        const d = new Date();
        el.clockTime.textContent = App.Storage.formatClock(d.getTime());
        el.clockDate.textContent =
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
    }

    /* ---------- 设备选择器 ---------- */
    function renderDeviceSelect(devices, selectedId) {
        el.deviceSelect.innerHTML = "";
        devices.forEach((d) => {
            const opt = document.createElement("option");
            opt.value = d.id;
            opt.textContent = `${d.id} · ${d.label}`;
            if (d.id === selectedId) opt.selected = true;
            el.deviceSelect.appendChild(opt);
        });
    }

    /* ---------- 状态工具 ---------- */
    function statusClass(status) {
        return status === App.config.status.ABNORMAL ? "danger" : "ok";
    }

    function statusText(status) {
        return status === App.config.status.ABNORMAL ? "异常告警" : "正常运行";
    }

    /* ---------- KPI 指标卡 ---------- */
    function renderKpi(data) {
        const s = data.sample;
        const th = App.config.thresholds;

        // RMS
        if (s) {
            animateNumber(el.kpiRms, parseFloat(el.kpiRms.textContent) || 0, s.rms, 3);
            el.kpiRms.parentElement.classList.toggle("hot", s.rms >= th.rms);
            el.kpiRms.parentElement.classList.toggle("cool", s.rms < th.rms);
            el.kpiRmsFoot.textContent = `阈值 ${th.rms.toFixed(3)}`;
        }

        // 异常评分
        if (s) {
            animateNumber(el.kpiScore, parseFloat(el.kpiScore.textContent) || 0, s.anomaly_score, 2);
            el.kpiScore.parentElement.classList.toggle("hot", s.anomaly_score >= th.score);
            el.kpiScore.parentElement.classList.toggle("cool", s.anomaly_score < th.score);
            el.kpiScoreFoot.textContent = `阈值 ${th.score.toFixed(2)}`;
        }

        // 设备状态
        if (s) {
            el.stateDot.className = "status-dot " + statusClass(s.status);
            el.kpiStatus.textContent = statusText(s.status);
            el.kpiStatusFoot.textContent = `设备 ${s.device_id} · 最新上报 ${App.Storage.formatClock(s.t)}`;
        }

        el.kpiOnline.textContent = data.onlineCount;
        el.kpiTotal.textContent = data.totalCount;
        el.kpiAlarm.textContent = data.alarmCount;
        el.kpiAlarmFoot.textContent = `本地已保存 ${data.alarmCount} 条报警`;

        // 监测时长
        el.kpiUptime.textContent = formatDuration(data.uptimeSeconds);
    }

    function formatDuration(sec) {
        const h = String(Math.floor(sec / 3600)).padStart(2, "0");
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        return `${h}:${m}:${s}`;
    }

    /* ---------- 设备列表 ---------- */
    function renderDevices(deviceMap, selectedId) {
        el.deviceList.innerHTML = "";
        const devices = App.config.devices;
        devices.forEach((meta) => {
            const state = deviceMap[meta.id];
            const row = document.createElement("div");
            row.className = "device-row" + (meta.id === selectedId ? " device-row-active" : "");
            const online = !!state;
            const status = state?.sample?.status;

            row.innerHTML = `
        <span class="status-dot ${online ? statusClass(status) : "idle"}"></span>
        <div class="device-main">
          <div class="device-id">${meta.id}</div>
          <div class="device-meta">${meta.label} · ${online ? "在线" : "等待上报"}</div>
        </div>
        <div class="device-stats">
          <div class="device-stat">
            <b style="color:${status === App.config.status.ABNORMAL ? "var(--danger)" : "var(--text-1)"}">
              ${state ? state.sample.rms.toFixed(3) : "—"}
            </b><span>RMS</span>
          </div>
          <div class="device-stat">
            <b style="color:${status === App.config.status.ABNORMAL ? "var(--orange)" : "var(--text-1)"}">
              ${state ? state.sample.anomaly_score.toFixed(2) : "—"}
            </b><span>评分</span>
          </div>
          <div class="device-stat">
            <b>${online ? App.Storage.formatClock(state.lastTime) : "—"}</b><span>最后上报</span>
          </div>
        </div>`;
            el.deviceList.appendChild(row);
        });
    }

    /* ---------- 报警表格 ---------- */
    function renderAlarms(alarms) {
        el.alarmTbody.innerHTML = "";
        if (!alarms.length) {
            el.alarmTbody.innerHTML =
                `<tr class="empty-row"><td colspan="6">暂无报警记录，数据将在本地持久化保存</td></tr>`;
            return;
        }
        alarms.forEach((a, idx) => {
            const tr = document.createElement("tr");
            if (idx === 0) tr.classList.add("row-new");
            const levelBadge = a.level === "severe"
                ? `<span class="badge danger">严重</span>`
                : `<span class="badge warn">一般</span>`;
            tr.innerHTML = `
        <td>${App.Storage.formatTime(a.t)}</td>
        <td><code>${a.device_id}</code></td>
        <td>${a.rms.toFixed(4)}</td>
        <td>${a.anomaly_score.toFixed(3)}</td>
        <td><span class="badge ${statusClass(a.status)}">${statusText(a.status)}</span></td>
        <td>${levelBadge}<div class="device-meta">${a.reason || ""}</div></td>`;
            el.alarmTbody.appendChild(tr);
        });
    }

    /* ---------- 设置表单回填 ---------- */
    function fillSettings(settings) {
        el.rmsThreshold.value = settings.thresholds.rms;
        el.scoreThreshold.value = settings.thresholds.score;
        el.mqttBroker.value = settings.mqtt.broker;
        el.mqttTopic.value = settings.mqtt.topic;
    }

    /* ---------- 连接状态指示 ---------- */
    function renderConn(state, text) {
        const map = {
            connected: "ok", connecting: "warn", offline: "idle",
            error: "danger", sim: "idle"
        };
        el.connDot.className = "status-dot " + (map[state] || "idle");
        el.connText.textContent = text;
    }

    const Wave = {
        ctxOk: null,
        ctxBad: null,
        phase: 0,
        status: "normal",
        raf: 0,

        init() {
            const cOk = document.getElementById("waveOk");
            const cBad = document.getElementById("waveBad");
            this.ctxOk = cOk?.getContext("2d");
            this.ctxBad = cBad?.getContext("2d");
            this.start();
        },

        setStatus(status) {
            this.status = status;
            el.waveOkLabel.textContent = status === App.config.status.ABNORMAL ? "正常基线对照" : "正常";
            el.waveBadLabel.textContent = status === App.config.status.ABNORMAL ? "异常提醒" : "正常";
        },

        drawGrid(ctx, w, h) {
            ctx.strokeStyle = "rgba(148,184,230,0.08)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
        },

        drawOk(ctx, w, h) {
            const mid = h / 2;
            ctx.clearRect(0, 0, w, h);
            this.drawGrid(ctx, w, h);
            ctx.strokeStyle = "#34d399";
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 3) {
                const y = mid + Math.sin((x / w) * Math.PI * 6 + this.phase) * 22
                    + Math.sin((x / w) * Math.PI * 12) * 3;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        },

        drawBad(ctx, w, h) {
            const mid = h / 2;
            const abnormal = this.status === App.config.status.ABNORMAL;
            ctx.clearRect(0, 0, w, h);
            this.drawGrid(ctx, w, h);
            ctx.strokeStyle = abnormal ? "#fb923c" : "#fbbf24";
            ctx.lineWidth = 2;
            ctx.beginPath();
            const amplitude = abnormal ? 52 : 16;
            for (let x = 0; x <= w; x += 3) {
                const noise = abnormal ? (Math.random() - 0.5) * amplitude : 0;
                const y = mid + Math.sin((x / w) * Math.PI * 9 + this.phase * 1.4) * (amplitude * 0.5) + noise;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        },

        loop() {
            this.phase += 0.08;
            const ok = this.ctxOk, bad = this.ctxBad;
            if (ok) this.drawOk(ok, ok.canvas.width, ok.canvas.height);
            if (bad) this.drawBad(bad, bad.canvas.width, bad.canvas.height);
            this.raf = requestAnimationFrame(() => this.loop());
        },

        start() {
            cancelAnimationFrame(this.raf);
            this.loop();
        }
    };

    App.UI = {
        el,
        cacheDom, toast, updateClock, renderDeviceSelect, renderKpi,
        renderDevices, renderAlarms, fillSettings, renderConn,
        statusText, statusClass, Wave
    };
})(window.Acoustic);
