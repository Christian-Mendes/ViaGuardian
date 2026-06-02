/**
 * useGpsWatcher.js
 *
 * Hook que assina atualizações de localização nativas e aciona
 * a transição de estado da FSM (PARKED ↔ DRIVING) no store Zustand.
 *
 * Frequência de polling: 1Hz (1000ms). Suficiente para detectar
 * movimento sem drenar excessivamente a bateria.
 */

import { useEffect } from 'react'
import Geolocation from '@react-native-community/geolocation'
import { useTelemetryStore } from '../store/telemetryStore'

const POLL_INTERVAL_MS = 1000
const DISTANCE_FILTER_M = 2 // atualiza apenas se mover > 2 metros

export function useGpsWatcher() {
  const updateLocation = useTelemetryStore((s) => s.updateLocation)

  useEffect(() => {
    const watchId = Geolocation.watchPosition(
      (position) => {
        updateLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed ?? 0,
        })
      },
      (error) => {
        console.warn('[ViaGuardian GPS] Erro de localização:', error.message)
      },
      {
        enableHighAccuracy: true,
        distanceFilter: DISTANCE_FILTER_M,
        interval: POLL_INTERVAL_MS,
        fastestInterval: POLL_INTERVAL_MS,
      },
    )

    return () => Geolocation.clearWatch(watchId)
  }, [updateLocation])
}
