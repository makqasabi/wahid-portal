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

interface CategoryBreakdownRow {
  categoryName: string;
  status: string;
  count: number;
}

interface CategoryBreakdownProps {
  data: CategoryBreakdownRow[];
}

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#3b82f6', // blue-500
  DELAYED: '#ef4444', // red-500
  COMPLETED: '#22c55e', // green-500
  ON_HOLD: '#f59e0b', // amber-500
  DEPENDENT: '#8b5cf6', // violet-500
};

export function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  // Collect all unique statuses
  const statuses = Array.from(new Set(data.map((d) => d.status)));

  // Pivot: one row per category, with a count field per status
  const categoryMap = new Map<string, Record<string, string | number>>();

  data.forEach(({ categoryName, status, count }) => {
    const label = categoryName.length > 20 ? categoryName.slice(0, 18) + '...' : categoryName;
    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, { category: label });
    }
    const row = categoryMap.get(categoryName)!;
    row[status] = ((row[status] as number) || 0) + count;
  });

  const chartData = Array.from(categoryMap.values());

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 48)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="category"
          width={130}
          tick={{ fontSize: 12 }}
        />
        <Tooltip />
        <Legend />
        {statuses.map((status) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="stack"
            fill={STATUS_COLORS[status] ?? '#94a3b8'}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
