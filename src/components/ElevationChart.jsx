import { useMemo, useRef, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, zoomPlugin);

export default function ElevationChart({ points, highlightIndex, onHover, onClick }) {
  const chartRef = useRef(null);

  const trackData = useMemo(
    () => points.map((p) => ({
      x: +(p.dist / 1000).toFixed(2),
      y: Math.round(p.ele),
    })),
    [points]
  );

  const highlightPoint = highlightIndex != null && trackData[highlightIndex]
    ? [{ x: trackData[highlightIndex].x, y: trackData[highlightIndex].y }]
    : [];

  const data = {
    datasets: [
      {
        data: trackData,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(147, 197, 253, 0.4)',
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.1,
      },
      {
        data: highlightPoint,
        borderColor: '#dc2626',
        backgroundColor: '#dc2626',
        pointRadius: 6,
        pointHoverRadius: 6,
        showLine: false,
      },
    ],
  };

  const findClosestIndex = useCallback((distKm) => {
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < trackData.length; i++) {
      const diff = Math.abs(trackData[i].x - distKm);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    return closest;
  }, [trackData]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        type: 'linear',
        ticks: {
          callback: (v) => `${Math.round(v)} km`,
          maxTicksLimit: 8,
          stepSize: undefined,
          autoSkip: true,
        },
        afterBuildTicks: (axis) => {
          const { min, max } = axis;
          const range = max - min;
          const step = range <= 5 ? 1 : range <= 20 ? 2 : range <= 50 ? 5 : 10;
          const ticks = [];
          const start = Math.ceil(min / step) * step;
          for (let v = start; v <= max; v += step) {
            ticks.push({ value: v });
          }
          axis.ticks = ticks;
        },
      },
      y: {
        ticks: {
          callback: (v) => `${v} m`,
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => `${items[0]?.parsed?.x ?? ''} km`,
          label: (item) => `${item.parsed.y} m`,
        },
        filter: (item) => item.datasetIndex === 0,
      },
      zoom: {
        zoom: {
          drag: {
            enabled: true,
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            borderColor: 'rgba(37, 99, 235, 0.4)',
            borderWidth: 1,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
        },
        pan: {
          enabled: true,
          mode: 'x',
        },
      },
    },
    onHover: (_event, _elements, chart) => {
      const tooltip = chart.tooltip;
      if (tooltip?.dataPoints?.length && tooltip.dataPoints[0].datasetIndex === 0) {
        const distKm = tooltip.dataPoints[0].parsed.x;
        onHover(findClosestIndex(distKm));
      }
    },
    onClick: (_event, elements, chart) => {
      // Don't fire click if we just finished a drag-zoom
      if (chart.isZoomingOrPanning?.()) return;
      const tooltip = chart.tooltip;
      if (tooltip?.dataPoints?.length && tooltip.dataPoints[0].datasetIndex === 0) {
        const distKm = tooltip.dataPoints[0].parsed.x;
        onClick(findClosestIndex(distKm));
      }
    },
  }), [onHover, onClick, findClosestIndex]);

  const handleReset = () => {
    chartRef.current?.resetZoom();
  };

  const containerRef = useRef(null);

  const setContainerRef = useCallback((node) => {
    if (containerRef.current) {
      containerRef.current.removeEventListener('touchstart', containerRef._handler);
      containerRef.current.removeEventListener('touchmove', containerRef._handler);
    }
    if (node) {
      const handler = (e) => e.preventDefault();
      node.addEventListener('touchstart', handler, { passive: false });
      node.addEventListener('touchmove', handler, { passive: false });
      containerRef.current = node;
      containerRef._handler = handler;
    }
  }, []);

  return (
    <div ref={setContainerRef} style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}>
      <button onClick={handleReset} className="chart-reset-btn">
        Reset
      </button>
      <Line ref={chartRef} data={data} options={options} />
    </div>
  );
}
