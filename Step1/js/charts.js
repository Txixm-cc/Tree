(function (App) {
    const C = {
        rms: "#38bdf8",
        score: "#fb923c",
        ok: "#34d399",
        danger: "#f87171",
        purple: "#a78bfa",
        axis: "#607998",
        split: "rgba(148,184,230,0.10)",
        tooltipBg: "#152134"
    };

    let charts = {};
    let initialized = false;

    function init(id) {
        if (typeof echarts === "undefined") {
            console.error("[charts] ECharts 未加载");
            return null;
        }
        const el = document.getElementById(id);
        if (!el) return null;
        const chart = echarts.init(el, null, { renderer: "canvas" });
        charts[id] = chart;
        return chart;
    }

    /* ---------- 公共坐标轴样式 ---------- */
    function baseAxis() {
        return {
            axisLine: { lineStyle: { color: C.axis } },
            axisLabel: { color: C.axis, fontSize: 11, fontFamily: "monospace" },
            splitLine: { lineStyle: { color: C.split } },
            axisTick: { show: false }
        };
    }

    function baseTooltip(unit) {
        return {
            trigger: "axis",
            confine: true,
            backgroundColor: C.tooltipBg,
            borderColor: "rgba(126,172,232,.2)",
            textStyle: { color: "#e9f1fd", fontSize: 12 },
            valueFormatter: (v) => (v == null ? "—" : Number(v).toFixed(3) + (unit || ""))
        };
    }

    function markLine(threshold, label) {
        return {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#fbbf24", type: "dashed", width: 1 },
            data: [{ yAxis: threshold, name: label }],
            label: {
                color: "#fbbf24",
                fontSize: 10,
                position: "insideStartTop",
                formatter: `${label} ${threshold}`
            }
        };
    }

    /* ---------- 初始化全部图表 ---------- */
    function initAll() {
        if (initialized || typeof echarts === "undefined") return;
        initialized = true;

        init("rmsChart");
        init("scoreChart");
        init("alarmBar");
        init("statusPie");

        window.addEventListener("resize", resizeAll);
    }

    function resizeAll() {
        Object.values(charts).forEach((c) => c && c.resize());
    }

    /* ---------- RMS 实时趋势 ---------- */
    function updateRms(points, threshold) {
        const chart = charts.rmsChart;
        if (!chart) return;
        chart.setOption({
            grid: { left: 52, right: 18, top: 28, bottom: 30 },
            tooltip: baseTooltip(" rms"),
            xAxis: {
                type: "category",
                boundaryGap: false,
                data: points.map((p) => p.time),
                ...baseAxis(),
                splitLine: { show: false }
            },
            yAxis: {
                type: "value",
                min: 0,
                max: 1,
                ...baseAxis()
            },
            series: [{
                name: "RMS",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: points.map((p) => p.value),
                lineStyle: { color: C.rms, width: 2 },
                itemStyle: { color: C.rms },
                areaStyle: {
                    color: {
                        type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: "rgba(56,189,248,0.28)" },
                            { offset: 1, color: "rgba(56,189,248,0)" }
                        ]
                    }
                },
                markLine: markLine(threshold, "RMS 上限")
            }]
        });
    }

    /* ---------- 异常评分趋势 ---------- */
    function updateScore(points, threshold) {
        const chart = charts.scoreChart;
        if (!chart) return;
        chart.setOption({
            grid: { left: 48, right: 18, top: 28, bottom: 30 },
            tooltip: baseTooltip(" 分"),
            xAxis: {
                type: "category",
                boundaryGap: false,
                data: points.map((p) => p.time),
                ...baseAxis(),
                splitLine: { show: false }
            },
            yAxis: {
                type: "value",
                min: 0,
                max: 1,
                ...baseAxis()
            },
            series: [{
                name: "异常评分",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: points.map((p) => p.value),
                lineStyle: { color: C.score, width: 2 },
                itemStyle: { color: C.score },
                areaStyle: {
                    color: {
                        type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: "rgba(251,146,60,0.26)" },
                            { offset: 1, color: "rgba(251,146,60,0)" }
                        ]
                    }
                },
                markLine: markLine(threshold, "评分阈值")
            }]
        });
    }

    /* ---------- 报警分布（按小时，最近 24 小时桶） ---------- */
    function updateAlarmBar(alarms) {
        const chart = charts.alarmBar;
        if (!chart) return;
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const counts = new Array(24).fill(0);
        alarms.forEach((a) => {
            const d = new Date(a.t);
            counts[d.getHours()] += 1;
        });
        chart.setOption({
            grid: { left: 38, right: 12, top: 18, bottom: 28 },
            tooltip: {
                trigger: "axis",
                confine: true,
                backgroundColor: C.tooltipBg,
                borderColor: "rgba(126,172,232,.2)",
                textStyle: { color: "#e9f1fd", fontSize: 12 },
                formatter: (p) => `${p[0].axisValue}:00　${p[0].data} 次`
            },
            xAxis: {
                type: "category",
                data: hours.map((h) => `${h}`),
                ...baseAxis(),
                splitLine: { show: false },
                axisLabel: { color: C.axis, fontSize: 10, interval: 3 }
            },
            yAxis: { type: "value", minInterval: 1, ...baseAxis() },
            series: [{
                type: "bar",
                data: counts,
                barWidth: "55%",
                itemStyle: {
                    color: {
                        type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: C.rms },
                            { offset: 1, color: "rgba(56,189,248,0.25)" }
                        ]
                    },
                    borderRadius: [4, 4, 0, 0]
                }
            }]
        });
    }

    /* ---------- 近期状态占比 ---------- */
    function updateStatusPie(history) {
        const chart = charts.statusPie;
        if (!chart) return;
        let ok = 0, bad = 0;
        history.forEach((h) => (h.status === App.config.status.ABNORMAL ? bad++ : ok++));
        chart.setOption({
            tooltip: {
                trigger: "item",
                confine: true,
                backgroundColor: C.tooltipBg,
                borderColor: "rgba(126,172,232,.2)",
                textStyle: { color: "#e9f1fd", fontSize: 12 }
            },
            legend: {
                bottom: 0,
                textStyle: { color: "#9db4d4", fontSize: 11 },
                icon: "circle"
            },
            series: [{
                type: "pie",
                radius: ["48%", "72%"],
                center: ["50%", "44%"],
                avoidLabelOverlap: true,
                label: { show: false },
                itemStyle: { borderColor: "#0d1523", borderWidth: 3 },
                data: [
                    { name: "正常", value: ok, itemStyle: { color: C.ok } },
                    { name: "异常", value: bad, itemStyle: { color: C.danger } }
                ]
            }]
        });
    }

    App.Charts = { initAll, resizeAll, updateRms, updateScore, updateAlarmBar, updateStatusPie };
})(window.Acoustic);
