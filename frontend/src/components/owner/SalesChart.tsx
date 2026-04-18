import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SalesChartProps {
  data: Array<{ date: string; revenue: number }>;
  period: '7days' | '30days' | '90days';
  onPeriodChange: (period: '7days' | '30days' | '90days') => void;
}

const periodLabels: Record<'7days' | '30days' | '90days', string> = {
  '7days': '7 Days',
  '30days': '30 Days',
  '90days': '90 Days',
};

const SalesChart: React.FC<SalesChartProps> = ({ data, period, onPeriodChange }) => {
  const chartData = {
    labels: data.map((d) => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }),
    datasets: [
      {
        label: 'Revenue (₹)',
        data: data.map((d) => d.revenue),
        borderColor: '#00f5ff',
        backgroundColor: (context: any) => {
          const canvas = context.chart.ctx;
          const gradient = canvas.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0,245,255,0.3)');
          gradient.addColorStop(1, 'rgba(0,245,255,0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: '#00f5ff',
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#ff00ff',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(26,10,46,0.95)',
        borderColor: 'rgba(0,245,255,0.3)',
        borderWidth: 1,
        titleColor: '#00f5ff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label: (ctx: any) => ' ₹' + Number(ctx.raw).toLocaleString('en-IN'),
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(255,255,255,0.6)',
          font: { family: 'Rajdhani', size: 12 },
          maxRotation: 45,
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { color: 'rgba(255,255,255,0.1)' },
      },
      y: {
        ticks: {
          color: 'rgba(255,255,255,0.6)',
          font: { family: 'Rajdhani', size: 12 },
          callback: (v: any) => '₹' + Number(v).toLocaleString('en-IN'),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { color: 'rgba(255,255,255,0.1)' },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  const periods: Array<'7days' | '30days' | '90days'> = ['7days', '30days', '90days'];

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const avgRevenue = data.length > 0 ? totalRevenue / data.length : 0;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 30,
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 25,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <h2
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#00f5ff',
            margin: 0,
          }}
        >
          📈 Revenue Chart
        </h2>

        {/* Period Selector Pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {periods.map((p) => {
            const isActive = period === p;
            return (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                style={{
                  padding: '7px 18px',
                  borderRadius: 25,
                  border: `1px solid ${isActive ? '#00f5ff' : 'rgba(255,255,255,0.15)'}`,
                  background: isActive
                    ? 'rgba(0,245,255,0.2)'
                    : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#00f5ff' : 'rgba(255,255,255,0.55)',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.25s',
                  backdropFilter: 'blur(10px)',
                  letterSpacing: 0.5,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(0,245,255,0.08)';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      'rgba(0,245,255,0.8)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(255,255,255,0.03)';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      'rgba(255,255,255,0.55)';
                  }
                }}
              >
                {periodLabels[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Stats */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginBottom: 25,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            background: 'rgba(0,245,255,0.06)',
            border: '1px solid rgba(0,245,255,0.2)',
            borderRadius: 12,
            padding: '12px 20px',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Total Revenue
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 900,
              color: '#ffed4e',
              fontFamily: 'Orbitron, sans-serif',
            }}
          >
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>
        </div>
        <div
          style={{
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: 12,
            padding: '12px 20px',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Daily Average
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 900,
              color: '#00ff88',
              fontFamily: 'Orbitron, sans-serif',
            }}
          >
            ₹{Math.round(avgRevenue).toLocaleString('en-IN')}
          </div>
        </div>
        <div
          style={{
            background: 'rgba(255,0,255,0.06)',
            border: '1px solid rgba(255,0,255,0.2)',
            borderRadius: 12,
            padding: '12px 20px',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Data Points
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 900,
              color: '#ff00ff',
              fontFamily: 'Orbitron, sans-serif',
            }}
          >
            {data.length}
          </div>
        </div>
      </div>

      {/* Chart */}
      {data.length > 0 ? (
        <div style={{ height: 320, position: 'relative' }}>
          <Line data={chartData} options={options} />
        </div>
      ) : (
        <div
          style={{
            height: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: '3rem' }}>📊</div>
          <div
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '1rem',
            }}
          >
            No revenue data for this period
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesChart;
