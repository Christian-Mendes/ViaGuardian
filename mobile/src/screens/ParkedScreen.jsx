/**
 * ParkedScreen.jsx
 *
 * Tela de Veículo Parado — Estado PARKED da FSM.
 *
 * Responsabilidades:
 *   • Exibir métricas da sessão de condução encerrada (KPIs + gamificação)
 *   • Permitir ao usuário revisar os alertas detectados
 *   • Enviar lote de payloads anonimizados ao Intelligence Center via HTTPS
 *   • Limpar a sessão local após upload bem-sucedido
 *
 * Todos os event listeners de UI estão ATIVOS neste estado.
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import axios from 'axios'

import { useTelemetryStore, AnomalyClass } from '../store/telemetryStore'
import { sanitizeBatch } from '../utils/payloadBuilder'

// ─────────────────────────────────────────────────────────
// Configuração da API
// ─────────────────────────────────────────────────────────
const API_BASE_URL = 'https://api.viaguardian.app/v1'  // substituir pela URL de produção
const UPLOAD_TIMEOUT_MS = 15_000

// ─────────────────────────────────────────────────────────
// Labels de classe para exibição
// ─────────────────────────────────────────────────────────
const CLASS_LABELS = {
  [AnomalyClass.POTHOLE]:       { label: 'Buracos / Depressões',   icon: '⚠', xp: 20 },
  [AnomalyClass.FADED_LANE]:    { label: 'Sinalização Apagada',    icon: '🚧', xp: 15 },
  [AnomalyClass.NEAR_MISS]:     { label: 'Quase-Acidentes',        icon: '🔴', xp: 50 },
  [AnomalyClass.RISK_BEHAVIOR]: { label: 'Comportamentos de Risco',icon: '⚡', xp: 30 },
  [AnomalyClass.OBSTRUCTION]:   { label: 'Obstruções de Via',      icon: '🚫', xp: 25 },
}

// ─────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────

function KpiCard({ value, label, sublabel, accentColor = '#2563EB' }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sublabel && <Text style={styles.kpiSublabel}>{sublabel}</Text>}
    </View>
  )
}

function AlertRow({ anomalyClass, count }) {
  if (count === 0) return null
  const meta = CLASS_LABELS[anomalyClass]
  return (
    <View style={styles.alertRow}>
      <Text style={styles.alertIcon}>{meta.icon}</Text>
      <View style={styles.alertInfo}>
        <Text style={styles.alertLabel}>{meta.label}</Text>
        <Text style={styles.alertXp}>+{meta.xp * count} XP</Text>
      </View>
      <View style={styles.alertBadge}>
        <Text style={styles.alertBadgeText}>{count}</Text>
      </View>
    </View>
  )
}

function UploadButton({ onPress, status }) {
  const isUploading = status === 'uploading'
  const isSuccess   = status === 'success'
  const isError     = status === 'error'

  const bgColor = isSuccess ? '#059669' : isError ? '#DC2626' : '#2563EB'
  const label   = isSuccess ? 'Enviado ✓' : isError ? 'Tentar Novamente' : 'Enviar Dados ao Centro'

  return (
    <TouchableOpacity
      style={[styles.uploadBtn, { backgroundColor: bgColor }, isUploading && { opacity: 0.75 }]}
      onPress={onPress}
      disabled={isUploading || isSuccess}
      activeOpacity={0.85}
    >
      {isUploading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.uploadBtnText}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────
// Tela Principal
// ─────────────────────────────────────────────────────────
export function ParkedScreen() {
  const session       = useTelemetryStore((s) => s.session)
  const uploadStatus  = useTelemetryStore((s) => s.uploadStatus)
  const uploadError   = useTelemetryStore((s) => s.uploadError)
  const setUploadStatus = useTelemetryStore((s) => s.setUploadStatus)
  const clearSession  = useTelemetryStore((s) => s.clearSession)

  const totalAlerts = Object.values(session.alertCounts).reduce((a, b) => a + b, 0)

  /**
   * Envia o lote de payloads anonimizados ao Intelligence Center.
   *
   * Segurança:
   *   • Sempre usa HTTPS (verificado pelo axios interceptor de produção)
   *   • Payload sanitizado: nenhum frame ou dado visual incluído
   *   • Authorization via Bearer token (recuperado do SecureStore em produção)
   */
  const handleUpload = useCallback(async () => {
    if (session.pendingPayloads.length === 0) {
      Alert.alert('Nada a enviar', 'Nenhuma detecção foi registrada nesta sessão.')
      return
    }

    setUploadStatus('uploading')

    // Sanitização final: garante remoção de campos internos (_bbox, etc.)
    const cleanBatch = sanitizeBatch(session.pendingPayloads)

    const requestBody = {
      session_started_at: session.sessionStartedAt,
      distance_km: session.distanceKm,
      total_xp_earned: session.sessionXp,
      payloads: cleanBatch,
    }

    try {
      // Em produção: adicione Authorization header via interceptor do axios
      // e valide o certificado TLS do servidor (certificate pinning)
      await axios.post(`${API_BASE_URL}/telemetry/batch`, requestBody, {
        timeout: UPLOAD_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          // Authorization: `Bearer ${await SecureStore.getItemAsync('access_token')}`,
        },
      })

      setUploadStatus('success')

      // Limpa sessão local após confirmação do servidor
      setTimeout(clearSession, 2000)
    } catch (err) {
      const message = err?.response?.data?.message ?? err.message ?? 'Erro desconhecido'
      setUploadStatus('error', message)
      Alert.alert(
        'Falha no envio',
        `Não foi possível enviar os dados.\n\n${message}\n\nOs dados serão reenvidos na próxima sessão.`,
      )
    }
  }, [session, setUploadStatus, clearSession])

  const sessionDurationLabel =
    session.sessionStartedAt
      ? `${Math.round((Date.now() - new Date(session.sessionStartedAt).getTime()) / 60000)} min`
      : '—'

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      {/* Cabeçalho */}
      <View style={styles.header}>
        <Text style={styles.brand}>ViaGuardian</Text>
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: '#9CA3AF' }]} />
          <Text style={styles.statusText}>PARADO</Text>
        </View>
      </View>

      {/* Gamificação */}
      <View style={styles.xpBanner}>
        <Text style={styles.xpValue}>+{session.sessionXp}</Text>
        <Text style={styles.xpLabel}>XP ganhos nesta sessão</Text>
        <Text style={styles.xpSub}>Contribuindo para a segurança de motociclistas</Text>
      </View>

      {/* KPIs da Sessão */}
      <Text style={styles.sectionTitle}>Resumo da Sessão</Text>
      <View style={styles.kpiGrid}>
        <KpiCard value={totalAlerts} label="Detecções" sublabel="total validadas" />
        <KpiCard
          value={sessionDurationLabel}
          label="Duração"
          sublabel="de condução"
          accentColor="#059669"
        />
        <KpiCard
          value={session.pendingPayloads.length}
          label="Payloads"
          sublabel="prontos para envio"
          accentColor="#D97706"
        />
        <KpiCard
          value={`${session.distanceKm.toFixed(1)} km`}
          label="Distância"
          sublabel="percorrida"
          accentColor="#7C3AED"
        />
      </View>

      {/* Detalhamento de alertas */}
      {totalAlerts > 0 && (
        <>
          <Text style={styles.sectionTitle}>Anomalias Detectadas</Text>
          <View style={styles.alertList}>
            {Object.entries(session.alertCounts).map(([cls, count]) => (
              <AlertRow key={cls} anomalyClass={cls} count={count} />
            ))}
          </View>
        </>
      )}

      {/* Privacidade */}
      <View style={styles.privacyNote}>
        <Text style={styles.privacyTitle}>🔒 Privacy by Design (LGPD)</Text>
        <Text style={styles.privacyText}>
          Nenhuma imagem ou vídeo foi armazenado ou será enviado. Os dados contêm
          apenas classe da anomalia, confiança numérica, coordenada GPS e
          identificador de dispositivo anonimizado (hash SHA-256).
        </Text>
      </View>

      {/* Botão de upload */}
      <UploadButton onPress={handleUpload} status={uploadStatus} />

      {uploadError && (
        <Text style={styles.errorText}>Último erro: {uploadError}</Text>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // ── Cabeçalho ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },

  // ── XP Banner ──────────────────────────────────────────
  xpBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  xpValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: -1,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D4ED8',
    marginTop: 4,
  },
  xpSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Seções ─────────────────────────────────────────────
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // ── KPI Grid ───────────────────────────────────────────
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
    color: '#2563EB',
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  kpiSublabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // ── Alertas ────────────────────────────────────────────
  alertList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 24,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  alertIcon: { fontSize: 20 },
  alertInfo: { flex: 1 },
  alertLabel: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  alertXp: { fontSize: 11, color: '#2563EB', marginTop: 1 },
  alertBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  alertBadgeText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },

  // ── Nota de Privacidade ────────────────────────────────
  privacyNote: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  privacyTitle: { fontSize: 12, fontWeight: '700', color: '#065F46', marginBottom: 6 },
  privacyText: { fontSize: 12, color: '#047857', lineHeight: 18 },

  // ── Upload ─────────────────────────────────────────────
  uploadBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorText: {
    marginTop: 10,
    fontSize: 11,
    color: '#EF4444',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
})
