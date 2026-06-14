"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const demo = [
  { month: "Jan", income: 4200, expense: 2800 },
  { month: "Feb", income: 4100, expense: 3100 },
  { month: "Mar", income: 4600, expense: 2950 },
];

export function DashboardSpendChart() {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={demo}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
