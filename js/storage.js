//数据存储层
// 后续接入后端数据库时，只需替换文件内部实现，接口不变
(function (App) {
    const KEYS = App.config.storageKeys;
    //底层安全读写
    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (err) {
            console.warn("[storage] 读取失败，使用默认值：", err);
            return fallback;
        }
    }

    function writeJSON(key,value){
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err){
            console.error("[storage] 写入失败（可能超出容量）：", err);
            App.UI && App.UI.toast("本地存储容量不足，旧数据将被淘汰");
            return false;
        }
    }
    //页面设置
    function loadSettings() {
        const saved = readJSON(KEYS.settings, {});
        const cfg = App.config;
    return {
        source: saved.source || "sim",                 // sim | mqtt
        thresholds: {
            rms: saved.thresholds?.rms ?? cfg.thresholds.rms,
            score: saved.thresholds?.score ?? cfg.thresholds.score
        },
        mqtt: {
            broker: saved.mqtt?.broker || cfg.mqtt.broker,
            topic: saved.mqtt?.topic || cfg.mqtt.topic
        }
      };
    }

    function saveSettings(settings) {
        writeJSON(KEYS.settings,settings);
        //同步到全局配置，供阈值判断使用
        App.config.thresholds.rms = settings.thresholds.rms;
        App.config.thresholds.score = settings.thresholds.score;
    }

    //历史采样记录
    function getHistory() {
        return readJSON(KEYS.history,[]);
    }

    /**
     * 追加一条采样记录，超出容量时从最旧一端淘汰
     * @param {object} sample { t, device_id, rms, status, anomaly_score, source }
     */
    function appendSample(sample) {
        const history = getHistory();
        history.push(sample);
        const limit = App.config.sampling.historyLimit;
        if(history.length > limit) history.splice(0,history.length - limit);
        writeJSON(KEYS.history,history);
        return history;
    }

    function clearHistory(){
        localStorage.removeItem(KEYS.history);
    }

    //按设备筛选历史，时间正序，不传 deviceId 返回全部
    function getHistoryByDevice(deviceId) {
        const history = getHistory();
        if(!deviceId || deviceId == "ALL") return history;
        return history.filter((item) => item.device_id === deviceId);
    }
    //报警记录
    function getAlarms(){
        return readJSON(KEYS.alarms,[]);
    }

    //追加报警记录，超出容量淘汰最旧
    function appendAlarm(alarm) {
        const alarms = getAlarms();
        alarms.unshift(alarm); //最新在最前面
        const limit = App.config.sampling.alarmLimit;
        if(alarms.length > limit) alarms.length = limit;
        writeJSON(KEYS.alarms,alarms);
        return alarms;
    }

    function clearAlarms() {
        localStorage.removeItem(KEYS.alarms);
    }

    //CSV导出
    function toCSV(rows){
        const header = ["时间", "设备编号", "RMS", "异常评分", "状态", "报警等级", "触发原因"];
        const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [header.map(escape).join(",")];
        rows.forEach((row) => {
            lines.push([
                formatTime(row.t),
                row.device_id,
                row.rms?.toFixed(4),
                row.anomaly_score?.toFixed(3),
                row.status,
                row.level,
                row.reason || ""
            ].map(escape).join(","));
        });
        return "\uFEFF" + lines.join("\n");
    }

    function downloadCSV(filename,csvText){
        const blob = new Blob([csvText],{ type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    //时间格式化
    function pad(n) { return String(n).padStart(2,"0"); }

    function formatTime(ts) {
        const d = new Date(ts);
        return  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function formatClock(ts) {
        const d = new Date(ts);
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

     App.Storage = {
        loadSettings,
        saveSettings,
        getHistory,
        appendSample,
        clearHistory,
        getHistoryByDevice,
        getAlarms,
        appendAlarm,
        clearAlarms,
        toCSV,
        downloadCSV,
        formatTime,
        formatClock
    };
})(window.Acoustic);