//MQTT通信接入层
(function (App){
    let client = null;
    let statusHandler = null;
    let messageHandler = null;
    let topic = "";
    
    function setStatus(state, text) {
        statusHandler && statusHandler(state,text);
    }

    //从多个可能字段名中取第一个非空值
    function pick(data,keys) {
        for(const k of keys) {
            if (data[k] !== undefined && data[k] !== null && data[k] !== "") return data[k];
        }
        return undefined;
    }

    //解析时间戳
    function parseTime(value) {
        if (value === undefined || value === null) return null;
        if (typeof value === "number") {
            const ms = value < 1e12 ? value * 1000 : value;
            return Number.isFinite(ms) ? ms : null;
        }
        const t = new Date(String(value)).getTime();
        return Number.isFinite(t) ? t : null;
    }

    //校验并规范
    function parsePayload(raw) {
        let data;
        try {
            data = typeof raw === "string" ? JSON.parse(raw) : raw;
        }catch(err){
            console.warn("[mqtt] 消息不是合法 JSON:",raw);
            return null;
        }
        if(!data) return null;

        const deviceId = pick(data, ["device_id", "deviceId", "device", "id"]);
        if (typeof deviceId !== "string") return null;

        const rms = Number(pick(data, ["rms", "rms_value", "rmsValue"]));
        const score = Number(pick(data,["anomaly_score", "anomalyScore", "score"]));
        if (!Number.isFinite(rms) || !Number.isFinite(score)) return null;

        const rawStatus = pick(data,["status","state"]);
        return {
            device_id: deviceId,
            rms: Number(rms.toFixed(4)),
            status: rawStatus === App.config.status.ABNORMAL
                ? App.config.status.ABNORMAL
                : App.config.status.NORMAL,
            anomaly_score: Number(score.toFixed(3)),
            ts: parseTime(pick(data, ["ts", "timestamp", "time", "t", "timeMs"]))
        };
    }

    function connect(broker,topicFilter,onStatus,onMessage){
        statusHandler = onStatus;
        messageHandler = onMessage;
        topic = topicFilter;

        if(typeof mqtt === "undefined"){
            setStatus("error", "MQTT.js 库未加载，请检查网络或 CDN");
            return;
        }
        disconnect();

        setStatus("connecting", "正在连接 MQTT Broker…");

        try {
            client = mqtt.connect(broker,{
                clientId: App.config.mqtt.clientID,
                keepalive: App.config.mqtt.keepalive,
                reconnectPeriod: App.config.mqtt.reconnectPeriod,
                clean: true 
            });
        } catch(err) {
            setStatus("error","连接参数错误：" + err.message);
            return;
        }

        client.on("connect", () => {
            setStatus("connected","MQTT 已连接");
            client.subscribe(topic, { qos:0},(err)=>{
                if(err) setStatus("error", "订阅失败：" + err.message);
                else setStatus("connected","已订阅" + topic);
            });
        });

        client.on("message",(_,payload) =>{
            const message =  parsePayload(payload.toString());
            if (message) {
                messageHandler(message,Date.now(),"mqtt");
            }
        });

        client.on("reconnect", () => setStatus("connecting", "正在重连…"));
        client.on("close", () => setStatus("offline", "连接已断开"));
        client.on("error", (err) => setStatus("error", "MQTT 错误：" + err.message));
    }

    function disconnect() {
        if(client) {
            try { client.end(true);} catch (e){}
            client = null;
        }
    }

    function isConnected() {
        return !!(client && client.connected);
    }

    App.Mqtt = { connect, disconnect, isConnected };
})(window.Acoustic);