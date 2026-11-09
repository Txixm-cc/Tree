(function (App) {
    function boot() {
        if (typeof echarts === "undefined") {
            console.error("ECharts 加载失败，请检查网络或 CDN 地址");
        }
        App.Monitor.init();
        console.info("[声学监测平台] 初始化完成 · 数据源：" + App.Monitor.state.source);
    }

    window.addEventListener("DOMContentLoaded", boot);

    // 未捕获错误统一记录，避免静默失败
    window.addEventListener("error", (event) => {
        console.error("[运行错误]", event.message, event.filename);
    });
})(window.Acoustic);
