//本地JSON数据解析层
(function(App){
    function pick(data,keys){
        for (const k of keys) {
            if (data[k] !== undefined && data[k] !== null && data[k] !== "") return data[k];
        }
        return undefined;
    }

    function parseTime(value) {
        if (value === undefined || value === null) return null;
        if (typeof value === "number") {
            const ms = value < 1e12 ? value * 1000 : value;
            return Number.isFinite(ms) ? ms : null;
        }
        const t = new Date(String(value)).getTime();
        return Number.isFinite(t) ? t : null;
    }

    function normalize(raw,index) {
        if (!raw || typeof raw !== "object") return null;

        const deviceId = pick(raw,["device_id", "deviceId", "device", "id"]);
        if (typeof deviceId !== "string") return null;

        const rms = Number(pick(raw,["rms", "rms_value", "rmsValue"]));
        const score = Number(pick(raw,["anomaly_score", "anomalyScore", "score"]));
        if (!Number.isFinite(rms) || !Number.isFinite(score)) return null;

        const rawStatus = pick(raw,["status","state"]);
        return {
            device_id: deviceId,
            rms: Number(rms.toFixed(4)),
            status: rawStatus === App.config.status.ABNORMAL
                ? App.config.status.ABNORMAL
                : App.config.status.NORMAL,
            anomaly_score: Number(score.toFixed(3)),
            ts: parseTime(pick(raw, ["ts", "timestamp", "time", "t", "timeMs"])),
            _index: index
         };

        }
        /**
        * 解析 JSON 文本
        * @returns {{ messages: Array, invalid: Array<{index, reason}> }}
        */
       function parseText(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch(err) {
            return { messages: [], invalid: [{ index: -1, reason: "不是合法 JSON：" + err.message }] };
        }

        const list = Array.isArray(data) ? data : [data];
        const messages = [];
        const invalid = [];

        list.forEach((raw,i) => {
            const msg = normalize(raw,i);
            if(msg) messages.push(msg);
            else invalid.push({ index: i, reason: "缺少合法 device_id / rms / anomaly_score" });
        });

        return { messages,invalid };

       }

       App.Importer = { parseText };
})(window.Acoustic);