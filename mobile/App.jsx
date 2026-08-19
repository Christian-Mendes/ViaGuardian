/**
 * App.jsx — Ponto de entrada da aplicação ViaGuardian Mobile
 *
 * Responsabilidades:
 *   • Inicializar TTS e solicitar permissões de câmera/localização
 *   • Montar o watcher de GPS (useGpsWatcher)
 *   • Selecionar a tela ativa conforme o estado da FSM
 *
 * Não há um stack de navegação tradicional: a transição é controlada
 * exclusivamente pelo estado DRIVING/PARKED do store Zustand,
 * evitando que o usuário possa navegar para fora da câmera durante condução.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, PermissionsAndroid, Platform, StatusBar } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Camera } from 'react-native-vision-camera'

import { useTelemetryStore, AppState } from './src/store/telemetryStore'
import { useGpsWatcher } from './src/hooks/useGpsWatcher'
import { initTts } from './src/utils/multimodalAlert'
import { ActiveDrivingScreen } from './src/screens/ActiveDrivingScreen'
import { ParkedScreen } from './src/screens/ParkedScreen'

// ─────────────────────────────────────────────────────────
// Hook: solicita permissões em runtime (Android)
// ─────────────────────────────────────────────────────────
function usePermissions() {
  const [granted, setGranted] = useState(Platform.OS === 'ios')

  useEffect(() => {
    if (Platform.OS !== 'android') return

    async function checkAndSetupPermissions() {
      // 1. Checa o status atual da câmera
      let camStatus = Camera.getCameraPermissionStatus()
      
      // Se não tiver permissão, solicita
      if (camStatus !== 'granted') {
        camStatus = await Camera.requestCameraPermission()
      }
      
      // 2. Checa o status atual do GPS
      let locGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      
      // Se não tiver permissão, solicita
      if (!locGranted) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        )
        locGranted = result === PermissionsAndroid.RESULTS.GRANTED
      }
      
      // 3. Libera apenas se as strings exatas baterem
      setGranted(camStatus === 'granted' && locGranted)
    }

    checkAndSetupPermissions()
  }, [])

  return granted
}

// ─────────────────────────────────────────────────────────
// Componente Raiz
// ─────────────────────────────────────────────────────────
export default function App() {
  const appState = useTelemetryStore((s) => s.appState)
  const permissionsGranted = usePermissions()

  // Inicia o watcher de GPS (monta uma vez, permanece ativo)
  useGpsWatcher()

  // Inicializa o motor de TTS ao boot
  useEffect(() => {
    initTts()
  }, [])

  if (!permissionsGranted) {
    return (
      <SafeAreaProvider>
        <View style={styles.permissionScreen}>
          <Text style={styles.permissionTitle}>Permissões Necessárias</Text>
          <Text style={styles.permissionText}>
            O ViaGuardian precisa de acesso à câmera e localização para operar
            como sensor de telemetria passiva.{'\n\n'}
            Por favor, conceda as permissões solicitadas e reinicie o aplicativo.
          </Text>
        </View>
      </SafeAreaProvider>
    )
  }

  const FORCE_DRIVING_MODE = true // 🛑 BYPASS PARA TIRAR PRINTS (LEMBRE-SE DE APAGAR DEPOIS!)
  const isDriving = appState === AppState.DRIVING || FORCE_DRIVING_MODE

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDriving ? 'light-content' : 'dark-content'}
        backgroundColor={isDriving ? '#000000' : '#F9FAFB'}
      />

      {isDriving ? (
        // Condução: full-screen sem safe area para maximizar o FOV da câmera
        <View style={styles.fullScreen}>
          <ActiveDrivingScreen />
        </View>
      ) : (
        // Parado: safe area normal para UI de painel
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ParkedScreen />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
  },
})
