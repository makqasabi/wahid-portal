import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface EntitySplitRow {
  entityName: string;
  status: string;
  count: number;
}

interface EntitySplitChartProps {
  data: EntitySplitRow[];
}

// Colors aligned with tailwind twn-600 and meena-600
const TWN_COLOR = '#2563eb'; // blue-600
const MEENA_COLOR = '#059669'; // emerald-600

export function EntitySplitChart({ data }: EntitySplitChartProps) {
  // Pivot data: one row per status, with TWN and Meena counts
  const statusMap = new Map<string, { status: string; التعاونية: number; مينا: number }>();

  data.forEach(({ entityName, status, count }) => {
    if (!statusMap.has(status)) {
      statusMap.set(status, { status, التعاونية: 0, مينا: 0 });
    }
    const row = statusMap.get(status)!;
    if (entityName.includes('التعاونية') || entityName.toLowerCase().includes('twn') || entityName.toLowerCase().includes('tawuniya')) {
      row.التعاونية += count;
    } else {
      row.مينا += count;
    }
  });

  const chartData = Array.from(statusMap.values());

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="status" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="التعاونية" fill={TWN_COLOR} radius={[4, 4, 0, 0]} />
        <Bar dataKey="مينا" fill={MEENA_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
