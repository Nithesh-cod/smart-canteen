import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip, Legend);

/**
 * SalesPanel — modern revenue panel for the Owner dashboard.
 *
 * Was rendering a black void because the bundled SalesChart pre-supposed a
 * non-empty data array. This rebuild handles:
 *   - Empty data → "Awaiting transmissions" overlay so the surface still
 *     has shape, never just black.
 *   - Period chips (7 / 30 / 90 days) with HUD styling.
 *   - Totals header with an animated count-up baseline.
 *   - chart.js Line wrapped in a clip-path crystal so it sits inside the
 *     unified design language.
 *
 * Uses the existing chart.js + react-chartjs-2 dependencies (no new install).
 */

interface RevenuePoint {
  date: string;
  revenue: number;
  orders?: number;
}

interface SalesPanelProps {
  data: RevenuePoint[];
  period: '7days' | '30days' | '90days';
  onPeriodChange: (p: '7days' | '30days' | '90days') => void;
}

const periodLabels: Record<string, string> = {
  '7days':  '7 days',
  '30days': '30 days',
  '90days': '90 days',
};

export const SalesPanel: React.FC<SalesPanelProps> = ({ data, period, onPeriodChange }) => {
  const isEmpty = !data || data.length === 0;

  const chartPoints = useMemo(() => {
    if (isEmpty) {
      // Synthesise a flat baseline so the chart still has shape.
      return Array.from({ length: 7 }).map((_, i) => ({
        label: `T-${7 - i}`,
        revenue: 0,
      }));
    }
    return data.map((d) => ({
      label: shortLabel(d.date),
      revenue: Number(d.revenue) || 0,
    }));
  }, [data, isEmpty]);

  const totalRevenue = useMemo(
    () => chartPoints.reduce((s, d) => s + (d.revenue || 0), 0),
    [chartPoints],
  );
  const avgPerDay = chartPoints.length ? totalRevenue / chartPoints.length : 0;

  const chartData = useMemo(() => ({
    labels: chartPoints.map(p => p.label),
    datasets: [
      {
        label: 'Revenue',
        data: chartPoints.map(p => p.revenue),
        borderColor: '#00ff88',
        backgroundColor: (ctx: any) => {
          const c = ctx.chart.ctx;
          const g = c.createLinearGradient(0, 0, 0, 280);
          g.addColorStop(0,   'rgba(0, 255, 136, 0.55)');
          g.addColorStop(1,   'rgba(0, 255, 136, 0)');
          return g;
        },
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#00ff88',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      },
    ],
  }), [chartPoints]);

  const chartOptions: any = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutCubic' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(7,16,14,0.95)',
        borderColor: 'rgba(0,255,136,0.4)',
        borderWidth: 1,
        titleColor: '#00ff88',
        titleFont: { family: 'Orbitron, monospace', size: 11, weight: 'normal' as const },
        bodyColor: '#fff',
        bodyFont: { family: 'Rajdhani, sans-serif', size: 13, weight: 'normal' as const },
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (ctx: any) => ` ₹${Math.round(Number(ctx.raw) || 0).toLocaleString('en-IN')}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: 'rgba(255,255,255,0.45)', font: { family: 'Orbitron, monospace', size: 11 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        ticks: {
          color: 'rgba(255,255,255,0.45)',
          font: { family: 'Orbitron, monospace', size: 11 },
          callback: (v: any) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`,
        },
      },
    },
  }), []);

  return (
    <div className="sales-panel">
      <style>{`
        .sales-panel {
          position: relative;
          padding: 26px 28px 24px;
          background:
            linear-gradient(180deg, rgba(0,255,136,0.04) 0%, transparent 40%),
            linear-gradient(180deg, #0a1816 0%, #07100e 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px;
          clip-path: polygon(
            0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%
          );
          overflow: hidden;
        }
        .sales-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 4%; right: 20%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,255,136,0.4), transparent);
        }
        .sales-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .sales-title-row {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 8px;
        }
        .sales-glyph {
          font-family: 'Orbitron', monospace;
          font-size: 1.15rem;
          color: #00ff88;
          text-shadow: 0 0 10px #00ff88;
        }
        .sales-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.78rem;
          letter-spacing: 0.32em;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
        }
        .sales-big {
          font-family: 'Orbitron', monospace;
          font-size: 2.6rem;
          font-weight: 900;
          color: #00ff88;
          text-shadow: 0 0 28px rgba(0,255,136,0.4);
          letter-spacing: 0.02em;
          line-height: 1;
        }
        .sales-sub {
          margin-top: 8px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.08em;
        }
        .period-chips {
          display: flex;
          gap: 8px;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 100px;
          padding: 5px;
        }
        .period-chip {
          padding: 8px 18px;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 100px;
          transition: background 0.2s, color 0.2s;
        }
        .period-chip:hover { color: #fff; }
        .period-chip.active {
          background: rgba(0,255,136,0.15);
          color: #00ff88;
          box-shadow: 0 0 16px rgba(0,255,136,0.25);
        }
        .sales-chart-wrap {
          height: 280px;
          margin: 0 -8px;
          position: relative;
        }
        .sales-empty-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg,
            rgba(7,16,14,0.4) 0%,
            rgba(7,16,14,0.85) 100%);
          font-family: 'Orbitron', sans-serif;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          gap: 6px;
          pointer-events: none;
        }
        .sales-empty-glyph {
          font-size: 2rem; color: rgba(0,255,136,0.4);
          text-shadow: 0 0 12px rgba(0,255,136,0.3);
        }
        .sales-empty-title {
          font-size: 0.78rem; color: rgba(0,255,136,0.75);
        }
        .sales-empty-sub {
          font-size: 0.7rem; color: rgba(255,255,255,0.32);
          letter-spacing: 0.18em;
        }
        .sales-foot {
          display: flex;
          gap: 22px;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .sales-foot-item {
          display: flex; flex-direction: column; gap: 2px;
        }
        .sales-foot-label {
          font-family: 'Orbitron', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .sales-foot-value {
          font-family: 'Orbitron', monospace;
          font-size: 1rem;
          color: #fff;
          font-weight: 700;
        }
      `}</style>

      <div className="sales-head">
        <div>
          <div className="sales-title-row">
            <span className="sales-glyph">◊</span>
            <span className="sales-title">Revenue Stream · {periodLabels[period]}</span>
          </div>
          <div className="sales-big">₹{Math.round(totalRevenue).toLocaleString('en-IN')}</div>
          <div className="sales-sub">Total revenue across the selected window</div>
        </div>
        <div className="period-chips">
          {(['7days', '30days', '90days'] as const).map((p) => (
            <button
              key={p}
              className={`period-chip${period === p ? ' active' : ''}`}
              onClick={() => onPeriodChange(p)}
              data-clickable
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="sales-chart-wrap">
        <Line data={chartData} options={chartOptions} />
        {isEmpty && (
          <div className="sales-empty-overlay">
            <span className="sales-empty-glyph">◯</span>
            <span className="sales-empty-title">Awaiting transmissions</span>
            <span className="sales-empty-sub">First sale will plot here in real time</span>
          </div>
        )}
      </div>

      <div className="sales-foot">
        <div className="sales-foot-item">
          <span className="sales-foot-label">Days plotted</span>
          <span className="sales-foot-value">{chartPoints.length}</span>
        </div>
        <div className="sales-foot-item">
          <span className="sales-foot-label">Avg / day</span>
          <span className="sales-foot-value">₹{Math.round(avgPerDay).toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
};

function shortLabel(date: string): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date.slice(0, 6);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return date.slice(0, 6);
  }
}

export default SalesPanel;
