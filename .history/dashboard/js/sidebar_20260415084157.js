const chartData = {
  7: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    data:   [11200, 11450, 11380, 11700, 11900, 12100, 12500]
  },
  30: {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    data:   [10000, 10800, 11400, 12500]
  },
  90: {
    labels: ['Jan', 'Feb', 'Mar'],
    data:   [8000, 10000, 12500]
  }
};

const ctx = document.getElementById('growthChart');
if (!ctx) return;

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: chartData[7].labels,
    datasets: [{
      label: 'Balance (GHS)',
      data: chartData[7].data,
      borderColor: '#c9a84c',
      backgroundColor: 'rgba(201,168,76,0.08)',
      borderWidth: 2.5,
      pointBackgroundColor: '#c9a84c',
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.4,
      fill: true,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d1f13',
        titleColor: 'rgba(255,255,255,0.6)',
        bodyColor: '#ffffff',
        padding: 10,
        callbacks: {
          label: ctx => ` GHS ${ctx.parsed.y.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#a8bcb0' }
      },
      y: {
        grid: { color: '#f0f4f0' },
        ticks: {
          font: { family: 'Inter', size: 11 },
          color: '#a8bcb0',
          callback: val => 'GHS ' + val.toLocaleString()
        }
      }
    }
  }
});

window.updateChart = function(period) {
  chart.data.labels   = chartData[period].labels;
  chart.data.datasets[0].data = chartData[period].data;
  chart.update();
};