
const API_BASE = "http://127.0.0.1:8000";

// Selectors
const toggleBotBtn = document.getElementById("toggleBot");
const manualScanBtn = document.getElementById("manualScan");
const squareOffBtn = document.getElementById("squareOffAll");
const botStatusDot = document.querySelector("#botStatus .status-dot");
const botStatusLabel = document.querySelector("#botStatus .status-label");
const marketStatusDot = document.querySelector("#marketStatus .status-dot");
const marketStatusLabel = document.querySelector("#marketStatus .status-label");
const totalValueEl = document.getElementById("totalValue");
const cashAvailableEl = document.getElementById("cashAvailable");
const activePositionsEl = document.getElementById("activePositions");
const headerPnl = document.querySelector("#headerPnl .pnl-value");
const toastContainer = document.getElementById("toastContainer");

// Bot state
let botActive = false;
let refreshInterval = 10000;

// ========== Helper Functions ==========
const showToast = (title, message, type = "info") => {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-message">${message}</div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

const updateStatusUI = () => {
  if (botActive) {
    botStatusDot.className = "status-dot status-active";
    botStatusLabel.textContent = "Bot: Active";
    toggleBotBtn.classList.add("active");
    toggleBotBtn.innerHTML = `<span class="btn-toggle-icon">⏹</span><span class="btn-toggle-text">STOP BOT</span>`;
  } else {
    botStatusDot.className = "status-dot status-inactive";
    botStatusLabel.textContent = "Bot: Inactive";
    toggleBotBtn.classList.remove("active");
    toggleBotBtn.innerHTML = `<span class="btn-toggle-icon">▶</span><span class="btn-toggle-text">START BOT</span>`;
  }
};

// ========== Fetch API Wrappers ==========
async function apiCall(endpoint, method = "GET") {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
    });
    return await res.json();
  } catch (err) {
    console.error(err);
    showToast("Error", "Cannot connect to backend!", "error");
  }
}

// ========== Bot Controls with Market Check ==========

toggleBotBtn.addEventListener("click", async () => {
  if (!botActive) {
    // === CHECK MARKET STATUS FIRST ===
    const marketData = await apiCall("/market-status");

    if (!marketData || !marketData.is_open) {
      // Market is closed — show toast notification
      const startTime = marketData?.start_time || "09:15";
      const endTime = marketData?.end_time || "15:25";

      showToast(
        "🚫 Market Closed",
        `The market is currently closed.\nTrading hours: ${startTime} - ${endTime}`,
        "error"
      );

      return; // Exit without starting bot
    }

    // === MARKET IS OPEN - START BOT ===
    await apiCall("/start", "POST");
    botActive = true;
    showToast("✅ Bot Started", "Auto-trading is now active!", "success");

  } else {
    // === STOP BOT ===
    await apiCall("/stop", "POST");
    botActive = false;
    showToast("⏹️ Bot Stopped", "Auto-trading has been stopped.", "warning");
  }

  updateStatusUI();
});


manualScanBtn.addEventListener("click", async () => {
  await apiCall("/scan");
  showToast("Manual Scan", "Triggered live signal scan.", "info");
});

squareOffBtn.addEventListener("click", async () => {
  if (confirm("Are you sure you want to square off all positions?")) {
    await apiCall("/squareoff", "POST");
    showToast("Square Off", "All positions closed.", "warning");
  }
});

// ========== Auto-check Market Status and Stop Bot ==========
setInterval(async () => {
  if (botActive) {
    const marketData = await apiCall("/market-status");
    
    if (!marketData.is_open) {
      // Market closed while bot was running
      await apiCall("/stop", "POST");
      botActive = false;
      updateStatusUI();

      showToast(
        "🚫 Market Closed",
        `Market has closed. Bot stopped automatically.`,
        "warning"
      );
    }
  }
}, 30000); // Check every 30 seconds

// ========== Update Market Status ==========
async function updateMarketStatus() {
  const data = await apiCall("/market-status");
  if (!data) return;
  
  if (data.is_open) {
    marketStatusDot.className = "status-dot status-active";
    marketStatusLabel.textContent = "Market: Open";
  } else {
    marketStatusDot.className = "status-dot status-closed";
    marketStatusLabel.textContent = "Market: Closed";
  }
}

// ========== Fetch Portfolio ==========
async function fetchPortfolio() {
  const data = await apiCall("/portfolio");
  if (!data) return;

  const totalValue = data.value?.toFixed(2) || 0;
  const cash = data.cash?.toFixed(2) || 0;
  const positions = Object.entries(data.positions || {});
  
  // Extract P&L values
  const unrealizedPnl = data.unrealized_pnl || 0;
  const realizedPnl = data.realized_pnl || 0;
  const totalPnl = data.total_pnl || 0;

  totalValueEl.textContent = `₹${totalValue}`;
  cashAvailableEl.textContent = `₹${cash}`;
  activePositionsEl.textContent = positions.length;

  // Update P&L displays
  document.getElementById("unrealizedPnl").textContent = `₹${unrealizedPnl.toFixed(2)}`;
  document.getElementById("realizedPnl").textContent = `₹${realizedPnl.toFixed(2)}`;
  headerPnl.textContent = `₹${totalPnl.toFixed(2)}`;
  
  // Update P&L change percentages
  const unrealizedChange = document.getElementById("unrealizedChange");
  const unrealizedPercent = data.pnl_percent || 0;
  unrealizedChange.textContent = `${unrealizedPercent.toFixed(2)}%`;
  unrealizedChange.className = unrealizedPercent >= 0 ? "metric-change text-profit" : "metric-change text-loss";
  
  // Update header P&L color
  headerPnl.className = totalPnl >= 0 ? "pnl-value text-profit" : "pnl-value text-loss";

  // Update win rate
  const winRate = data.win_rate || 0;
  const totalTrades = data.total_trades || 0;
  document.getElementById("winRate").textContent = `${winRate.toFixed(0)}% Win Rate (${totalTrades} trades)`;

  // Update portfolio table
  const body = document.getElementById("portfolioTableBody");
  const table = document.getElementById("portfolioTable");
  const empty = document.getElementById("emptyPortfolio");
  body.innerHTML = "";

  if (positions.length === 0) {
    table.style.display = "none";
    empty.style.display = "block";
  } else {
    table.style.display = "table";
    empty.style.display = "none";
    positions.forEach(([symbol, pos]) => {
      const buyPrice = pos.buy_price || 0;
      const qty = pos.qty || 0;
      const curr = buyPrice; // Can be enhanced with live price
      const pnl = (curr - buyPrice) * qty;
      const pnlClass = pnl >= 0 ? "text-profit" : "text-loss";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${symbol}</td>
        <td class="text-right">${qty}</td>
        <td class="text-right">₹${buyPrice.toFixed(2)}</td>
        <td class="text-right">₹${curr.toFixed(2)}</td>
        <td class="text-right">₹${(buyPrice * qty).toFixed(2)}</td>
        <td class="text-right">₹${(curr * qty).toFixed(2)}</td>
        <td class="text-right ${pnlClass}">₹${pnl.toFixed(2)}</td>
        <td class="text-right">${((pnl / (buyPrice * qty)) * 100).toFixed(2)}%</td>
        <td class="text-right">₹${pos.stop_loss}</td>
        <td class="text-right">₹${pos.take_profit}</td>
        <td><button class="btn-small" onclick="squareOff('${symbol}')">Sell</button></td>
      `;
      body.appendChild(tr);
    });
  }
}

// ========== Fetch Trade History ==========
async function fetchTrades() {
  const data = await apiCall("/trades");
  if (!data) return;

  const body = document.getElementById("historyTableBody");
  const table = document.getElementById("historyTable");
  const empty = document.getElementById("emptyHistory");
  body.innerHTML = "";

  if (data.length === 0) {
    table.style.display = "none";
    empty.style.display = "block";
    return;
  }

  table.style.display = "table";
  empty.style.display = "none";

  data.forEach((t) => {
    const pnl = t.pnl || 0;
    const pnlClass = pnl >= 0 ? "text-profit" : "text-loss";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(t.timestamp).toLocaleString()}</td>
      <td>${t.symbol}</td>
      <td><span class="action-badge action-${t.action.toLowerCase()}">${t.action}</span></td>
      <td class="text-right">${t.qty || "-"}</td>
      <td class="text-right">${t.price ? "₹" + t.price.toFixed(2) : "-"}</td>
      <td class="text-right ${pnlClass}">${t.pnl ? "₹" + pnl.toFixed(2) : "-"}</td>
      <td class="text-right">${t.score || "-"}</td>
    `;
    body.appendChild(tr);
  });
}

// ========== Fetch Live Signals ==========
async function fetchSignals() {
  const data = await apiCall("/signals");
  if (!data) return;

  const body = document.getElementById("signalsTableBody");
  const badge = document.getElementById("signalCount");
  body.innerHTML = "";

  if (data.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--color-gray-400);">Loading signals...</td></tr>';
    return;
  }

  badge.textContent = `${data.length} stocks`;

  data.forEach((s) => {
    const signalClass = s.signal === 'BUY' ? 'signal-buy' : 'signal-hold';
    const signalIcon = s.signal === 'BUY' ? '🔥' : '⏸️';
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${s.symbol}</strong></td>
      <td class="text-right font-mono">₹${s.price.toFixed(2)}</td>
      <td><span class="signal-badge ${signalClass}">${signalIcon} ${s.signal}</span></td>
      <td class="text-right"><strong>${s.score}/100</strong></td>
      <td class="text-right ${s.momentum > 0 ? 'text-profit' : 'text-loss'}">${s.momentum.toFixed(2)}%</td>
      <td class="text-right">${s.volume_ratio.toFixed(2)}x</td>
      <td class="text-right">₹${s.stop_loss.toFixed(2)}</td>
      <td class="text-right">₹${s.take_profit.toFixed(2)}</td>
      <td style="font-size: 12px; color: var(--color-gray-400);">${s.reasons}</td>
    `;
    body.appendChild(tr);
  });
}

// ========== Update Clock ==========
function updateClock() {
  const now = new Date();
  document.getElementById("currentTime").textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);

// ========== Auto Refresh ==========
async function refreshAll() {
  await fetchPortfolio();
  await fetchTrades();
  await fetchSignals();
  await updateMarketStatus();
  await updatePerformanceChart();
  document.getElementById("lastUpdate").textContent =
    "Last updated: " + new Date().toLocaleTimeString();
}

setInterval(refreshAll, refreshInterval);
refreshAll();

// ========== Portfolio Performance Chart ==========
const ctx = document.getElementById("performanceChart").getContext("2d");

let performanceChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Total Value",
        data: [],
        borderWidth: 3,
        fill: false,
        borderColor: "#32b8c6",
        backgroundColor: "#32b8c6",
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Portfolio",
        data: [],
        borderWidth: 3,
        fill: false,
        borderColor: "#00ff41",
        backgroundColor: "#00ff41",
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Cash",
        data: [],
        borderWidth: 3,
        fill: false,
        borderColor: "#ffaa00",
        backgroundColor: "#ffaa00",
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { 
          color: "#e5e7eb",
          padding: 15,
          font: {
            size: 12,
            weight: '600'
          },
          usePointStyle: true,
          pointStyle: 'circle'
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(26, 29, 36, 0.95)',
        titleColor: '#fff',
        bodyColor: '#e5e7eb',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            label += '₹' + parseFloat(context.parsed.y).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
            return label;
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    scales: {
      x: {
        ticks: { 
          color: "#9ca3af",
          font: {
            size: 11
          }
        },
        grid: { 
          color: "rgba(31, 41, 55, 0.5)",
          drawBorder: false
        },
      },
      y: {
        ticks: { 
          color: "#9ca3af",
          font: {
            size: 11
          },
          callback: function(value) {
            return '₹' + (value/1000).toFixed(0) + 'K';
          }
        },
        grid: { 
          color: "rgba(31, 41, 55, 0.5)",
          drawBorder: false
        },
      },
    },
  },
});

let performanceHistory = [];

async function updatePerformanceChart() {
  const data = await apiCall("/portfolio");
  if (!data) return;

  const totalValue = parseFloat(data.value) || 0;
  const cash = parseFloat(data.cash) || 0;
  const portfolioValue = totalValue - cash; // Value of invested positions
  const timeLabel = new Date().toLocaleTimeString();

  performanceHistory.push({ 
    time: timeLabel, 
    totalValue: totalValue,
    portfolio: portfolioValue,
    cash: cash
  });
  
  if (performanceHistory.length > 30) performanceHistory.shift();

  performanceChart.data.labels = performanceHistory.map(p => p.time);
  performanceChart.data.datasets[0].data = performanceHistory.map(p => p.totalValue);
  performanceChart.data.datasets[1].data = performanceHistory.map(p => p.portfolio);
  performanceChart.data.datasets[2].data = performanceHistory.map(p => p.cash);
  performanceChart.update();
}

// Initial UI
updateStatusUI();
updateClock();
updateMarketStatus();








