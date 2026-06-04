import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export function IncidentTrendChart({ data }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <h3 className="text-base font-bold text-gray-100">Tendência Semanal</h3>
      <p className="mt-1 text-sm text-gray-400">
        Evolução de incidentes capturados e triados.
      </p>

      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
            <XAxis dataKey="day" stroke="#64748b" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #334155', 
                borderRadius: '8px',
                color: '#e2e8f0'
              }} 
            />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
            <Line
              type="monotone"
              dataKey="incidents"
              name="Incidentes"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="approved"
              name="Aprovados"
              stroke="#14b8a6"
              strokeWidth={3}
              dot={{ fill: '#14b8a6', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
