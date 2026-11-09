// 有用 无则新建 预防冲突
window.Acoustic = window.Acoustic || {};

Acoustic.config = {
    // 注册设备清单，MQTT接入后按device_id 动态补充）
    devices: [
        { id: "ESP32_001",label: "1 号 · 实验台风扇",baseRms: 0.12, volatility: 0.04 },
        { id: "ESP32_002", label: "2 号 · 驱动电机",   baseRms: 0.18, volatility: 0.05 },
        { id: "ESP32_003", label: "3 号 · 通风设备",   baseRms: 0.09, volatility: 0.03 }
    ],
    // 告警阈值（可在页面设置面板修改并持久化）
    thresholds: {
        rms: 0.35,
        score: 0.55,
        severeScore: 0.80,
        severeRms: 0.50
    },
    // 采样与历史容量
    sampling: {
        intervalMs: 1500,
        chartWindow: 60,
        historyLimit: 2000,
        alarmLimit: 500
    },
    //MQTT接入参数
    mqtt: {
        broker: "wss://broker.emqx.io:8084/mqtt",
        topic: "acoustic/+/status",
        clientID: "web_console_" + Math.random().toString(16).slice(2, 8),
        keepalive: 30,
        reconnectPeriod: 5000
    },
    //localStorage 键名
    storageKeys: {
    history: "acoustic.history.v1",
    alarms: "acoustic.alarms.v1",
    settings: "acoustic.settings.v1"
  },
    //状态
    status: {
    NORMAL: "normal",
    ABNORMAL: "abnormal"
  }
};