import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import { useMemo } from 'react'

function intensityColor(intensity) {
  if (intensity >= 0.8) return '#dc2626' // vermelho - crítico
  if (intensity >= 0.6) return '#f97316' // laranja - alto
  if (intensity >= 0.4) return '#f59e0b' // âmbar - moderado
  return '#2563eb' // azul - baixo
}

export function HeatmapPanel({ points }) {
  // Centro geográfico de São Paulo para focar a câmera inicial do mapa
  const position = [-23.5505, -46.6333]

  // Key estável para evitar remontagem desnecessária do MapContainer
  const mapKey = useMemo(() => `map-${points.length}`, [points.length])

  // Filtra pontos válidos uma única vez
  const validPoints = useMemo(
    () =>
      points.filter(
        (p) =>
          p.lat &&
          p.lon &&
          typeof p.lat === 'number' &&
          typeof p.lon === 'number' &&
          !isNaN(p.lat) &&
          !isNaN(p.lon)
      ),
    [points]
  )

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-gray-100">
            Mapa de Calor Preditivo
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            Concentração de risco interativa — navegue pelas vias para analisar os focos de anomalia.
          </p>
        </div>

        <div className="hidden items-center gap-3 text-[11px] text-gray-400 sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            Baixo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Moderado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            Alto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
            Crítico
          </span>
        </div>
      </div>

      <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-700 z-0">
        <MapContainer
          key={mapKey}
          center={position}
          zoom={11}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', zIndex: 0, backgroundColor: '#0f172a' }}
          whenReady={(map) => {
            // Aguarda o mapa estar pronto antes de adicionar marcadores
            setTimeout(() => map.target.invalidateSize(), 100)
          }}
        >
          {/* TileLayer com tema escuro (Dark Matter) perfeito para dashboards */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Renderiza apenas pontos válidos */}
          {validPoints.map((p) => (
            <CircleMarker
              key={`marker-${p.id}`}
              center={[p.lat, p.lon]}
              pathOptions={{
                color: intensityColor(p.intensity),
                fillColor: intensityColor(p.intensity),
                fillOpacity: 0.5,
                weight: 1,
              }}
              radius={8 + p.intensity * 14}
            >
              {/* Tooltip interativo nativo do Leaflet que aparece ao passar o mouse */}
              <Tooltip className="dark:bg-gray-800 dark:text-white dark:border-gray-700">
                <div className="text-xs">
                  <strong className="block text-sm">{p.label}</strong>
                  <span className="text-gray-400 mt-1 block">
                    IRV Score: {(p.intensity * 100).toFixed(1)}
                  </span>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="absolute bottom-5 right-3 rounded-md bg-white/90 px-2.5 py-1 font-mono text-[10px] text-gray-500 shadow-sm backdrop-blur dark:bg-gray-800/90 dark:text-gray-400" style={{ zIndex: 400 }}>
          PostGIS · React Leaflet
        </div>
      </div>
    </section>
  )
}