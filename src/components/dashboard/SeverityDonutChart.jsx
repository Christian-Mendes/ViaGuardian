import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#3b82f6', '#0ea5e9', '#14b8a6', '#64748b']

export function SeverityDonutChart({ data }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h3 className="text-base font-bold text-gray-100">Distribuição de Severidade</h3>
      <p className="mt-1 text-sm text-gray-400">
        Classificação acumulada na fila operacional.
      </p>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={data} 
              dataKey="value" 
              nameKey="name" 
              innerRadius={70} 
              outerRadius={110}
              stroke="#0f172a"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #334155', 
                borderRadius: '8px',
                color: '#e2e8f0'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
