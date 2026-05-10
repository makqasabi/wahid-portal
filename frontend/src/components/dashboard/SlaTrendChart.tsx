import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface SlaTrendRow {
  month: string;
  entityName: string;
  onTimeRate: number;
}

interface SlaTrendChartProps {
  data: SlaTrendRow[];
}

const TWN_COLOR = '#2563eb';
const MEENA_COLOR = '#059669';

export function SlaTrendChart({ data }: SlaTrendChartProps) {
  // Pivot: one row per month with TWN and Meena on-time rates
  const monthMap = new Map<string, { month: string; التعاونية: number; مينا: number }>();

  data.forEach(({ month, entityName, onTimeRate }) => {
    if (!monthMap.has(month)) {
      monthMap.set(month, { month, التعاونية: 0, مينا: 0 });
    }
    const row = monthMap.get(month)!;
    if (entityName.includes('التعاونية') || entityName.toLowerCase().includes('twn') || entityName.toLowerCase().includes('tawuniya')) {
      row.التعاونية = onTimeRate;
    } else {
      row.مينا = onTimeRate;
    }
  });

  const chartData = Array.from(monthMap.values());

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: number) => `${value}%`} />
        <Legend />
        <Line
          type="monotone"
          dataKey="التعاونية"
          stroke={TWN_COLOR}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="مينا"
          stroke={MEENA_COLOR}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
