//模拟器
(function (App) {
  const cfg = App.config;
  let timer = null;
  let listeners = [];

  /* 每台设备内部状态（随机游走 + 周期性异常发作） */
  const deviceState = cfg.devices.map((d) => ({
    id: d.id,
    label: d.label,
    rms: d.baseRms,
    score: 0.1,
    phase: "normal",
    abnormalUntil: 0,
    tickCount: 0
  }));

  /* 正态近似随机数 */
  function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  /** 生成一条符合统一格式的消息 */
  function buildMessage(dev) {
    const meta = cfg.devices.find((x) => x.id === dev.id) || cfg.devices[0];
    dev.tickCount += 1;

    // 当前时间：决定是否处于异常发作窗口
    const now = Date.now();

    // 正常阶段：随机游走回到基线；随机触发一次异常
    if (dev.phase === "normal") {
      dev.rms += (meta.baseRms - dev.rms) * 0.25 + gauss() * meta.volatility;
      dev.score = Math.min(0.42, Math.max(0.04, dev.score * 0.8 + Math.random() * 0.08));

      // 每 18~32 个采样点随机进入异常
      if (Math.random() < 0.06) {
        dev.phase = "abnormal";
        dev.abnormalUntil = now + (6 + Math.random() * 8) * 1000;
      }
    } else {
      // 异常阶段：RMS 能量抬升、剧烈波动；异常评分升高
      dev.rms = meta.baseRms * (2.4 + Math.random() * 1.6) + Math.abs(gauss()) * meta.volatility * 3;
      dev.score = Math.min(0.97, 0.6 + Math.random() * 0.37);
      if (now > dev.abnormalUntil) {
        dev.phase = "normal";
      }
    }

    dev.rms = Math.max(0.02, dev.rms);
    const status = dev.score >= cfg.thresholds.score || dev.rms >= cfg.thresholds.rms
      ? cfg.status.ABNORMAL
      : cfg.status.NORMAL;

    return {
      device_id: dev.id,
      rms: Number(dev.rms.toFixed(4)),
      status,
      anomaly_score: Number(dev.score.toFixed(3))
    };
  }

  function emit() {
    const ts = Date.now();
    deviceState.forEach((dev) => {
      const message = buildMessage(dev);
      listeners.forEach((fn) => fn(message, ts, "sim"));
    });
  }

  function onMessage(fn) {
    listeners.push(fn);
  }

  function start() {
    stop();
    emit(); // 启动立刻出一条，避免界面空白
    timer = setInterval(emit, cfg.sampling.intervalMs);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  App.Simulator = { start, stop, onMessage };
})(window.Acoustic);

