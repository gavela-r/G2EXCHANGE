// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidget({ symbol = 'NASDAQ:NVDA', range = '12M' }) {
  const container = useRef();

  useEffect(
    () => {
      // El componente padre usa `key` para remontarlo cuando cambia el símbolo o el rango
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        allow_symbol_change: false,
        calendar: false,
        details: false,
        hide_side_toolbar: true,
        hide_top_toolbar: true,
        hide_legend: true,
        hide_volume: true,
        hotlist: false,
        interval: range === '1D' ? '5' : 'D',
        range,
        locale: "es",
        save_image: false,
        style: "3",
        symbol,
        theme: "dark",
        timezone: "Etc/UTC",
        backgroundColor: "#111D2F",
        gridColor: "rgba(37, 51, 74, 0.6)",
        watchlist: [],
        withdateranges: false,
        compareSymbols: [],
        support_host: "https://www.tradingview.com",
        studies: [],
        autosize: true
      });
      container.current.appendChild(script);
    },
    [symbol, range]
  );

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "calc(100% - 20px)", width: "100%" }}></div>
      <div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">Gráfico por TradingView</a></div>
    </div>
  );
}

export default memo(TradingViewWidget);
