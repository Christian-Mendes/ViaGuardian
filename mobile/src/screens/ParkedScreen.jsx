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

import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
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
// Labels de classe para exibição (categorização amigável)
// ─────────────────────────────────────────────────────────
const CLASS_LABELS = {
  [AnomalyClass.POTHOLE]:       { 
    label: 'Anomalias Geológicas', 
    sublabel: 'Buracos e Depressões',
    icon: '⚠️', 
    xp: 20,
    category: 'infrastructure' 
  },
  [AnomalyClass.FADED_LANE]:    { 
    label: 'Rastreamento Fixo',
    sublabel: 'Sinalização Comprometida',
    icon: '🚧', 
    xp: 15,
    category: 'infrastructure'
  },
  [AnomalyClass.OBSTRUCTION]:   { 
    label: 'Anomalias Geológicas',
    sublabel: 'Obstruções de Via',
    icon: '🚫', 
    xp: 25,
    category: 'infrastructure'
  },
  [AnomalyClass.NEAR_MISS]:     { 
    label: 'Eventos Críticos',
    sublabel: 'Quase-Acidentes',
    icon: '🔴', 
    xp: 50,
    category: 'critical'
  },
  [AnomalyClass.RISK_BEHAVIOR]: { 
    label: 'Eventos Críticos',
    sublabel: 'Comportamentos de Risco',
    icon: '⚡', 
    xp: 30,
    category: 'critical'
  },
}

// ─────────────────────────────────────────────────────────
// Sistema de Badges (Gamificação)
// ─────────────────────────────────────────────────────────
const BADGES = [
  {
    id: 'viajante',
    title: 'Viajante',
    icon: '🗺️',
    description: 'Completou uma sessão de condução',
    requirement: (session) => session.sessionStartedAt !== null,
  },
  {
    id: 'protetor',
    title: 'Protetor',
    icon: '🛡️',
    description: 'Detectou 10+ anomalias de infraestrutura',
    requirement: (session) => 
      (session.alertCounts[AnomalyClass.POTHOLE] || 0) +
      (session.alertCounts[AnomalyClass.FADED_LANE] || 0) +
      (session.alertCounts[AnomalyClass.OBSTRUCTION] || 0) >= 10,
  },
  {
    id: 'sentinela',
    title: 'Sentinela',
    icon: '👁️',
    description: 'Detectou eventos críticos de segurança',
    requirement: (session) =>
      (session.alertCounts[AnomalyClass.NEAR_MISS] || 0) +
      (session.alertCounts[AnomalyClass.RISK_BEHAVIOR] || 0) >= 1,
  },
]

// ─────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────

function KpiCard({ value, label, sublabel, accentColor = '#3B82F6' }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sublabel && <Text style={styles.kpiSublabel}>{sublabel}</Text>}
    </View>
  )
}

function BadgeCard({ badge, isUnlocked }) {
  return (
    <View style={[styles.badgeCard, !isUnlocked && styles.badgeCardLocked]}>
      <Text style={[styles.badgeIcon, !isUnlocked && styles.badgeIconLocked]}>
        {badge.icon}
      </Text>
      <Text style={[styles.badgeTitle, !isUnlocked && styles.badgeTitleLocked]}>
        {badge.title}
      </Text>
      <Text style={[styles.badgeDesc, !isUnlocked && styles.badgeDescLocked]}>
        {badge.description}
      </Text>
      {isUnlocked && (
        <View style={styles.badgeCheckmark}>
          <Text style={styles.badgeCheckmarkText}>✓</Text>
        </View>
      )}
    </View>
  )
}

function AlertRow({ anomalyClass, count }) {
  if (count === 0) return null
  const meta = CLASS_LABELS[anomalyClass]
  const isCritical = meta.category === 'critical'
  
  return (
    <View style={styles.alertRow}>
      <Text style={styles.alertIcon}>{meta.icon}</Text>
      <View style={styles.alertInfo}>
        <Text style={[styles.alertLabel, isCritical && { color: '#F87171' }]}>
          {meta.label}
        </Text>
        <Text style={styles.alertSublabel}>{meta.sublabel}</Text>
        <Text style={[styles.alertXp, isCritical && { color: '#F59E0B' }]}>
          +{meta.xp * count} XP
        </Text>
      </View>
      <View style={[styles.alertBadge, isCritical && styles.alertBadgeCritical]}>
        <Text style={[styles.alertBadgeText, isCritical && { color: '#F87171' }]}>
          {count}
        </Text>
      </View>
    </View>
  )
}

function UploadButton({ onPress, status }) {
  const isUploading = status === 'uploading'
  const isSuccess   = status === 'success'
  const isError     = status === 'error'

  const bgColor = isSuccess ? '#10B981' : isError ? '#EF4444' : '#3B82F6'
  const label   = isSuccess ? 'Enviado ✓' : isError ? 'Tentar Novamente' : 'ENVIAR DADOS'

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

function SuccessModal({ visible, onClose, xpEarned, detectionsCount }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalIcon}>✓</Text>
          <Text style={styles.modalTitle}>ENVIO REALIZADO COM SUCESSO!</Text>
          <Text style={styles.modalMessage}>
            Seus dados foram enviados ao Intelligence Center de forma segura e anonimizada.
          </Text>
          <View style={styles.modalStats}>
            <View style={styles.modalStatItem}>
              <Text style={styles.modalStatValue}>{detectionsCount}</Text>
              <Text style={styles.modalStatLabel}>Detecções</Text>
            </View>
            <View style={styles.modalStatDivider} />
            <View style={styles.modalStatItem}>
              <Text style={styles.modalStatValue}>+{xpEarned}</Text>
              <Text style={styles.modalStatLabel}>XP Ganhos</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.modalBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalBtnText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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

  const [showSuccessModal, setShowSuccessModal] = useState(false)

  const totalAlerts = Object.values(session.alertCounts).reduce((a, b) => a + b, 0)
  
  // Calcula Score de Segurança: fórmula baseada em km x alertas
  // Score máximo de 100, onde maior distância e mais alertas = maior score
  const calculateSafetyScore = () => {
    if (session.distanceKm === 0) return 0
    
    // Base: 50 pontos por completar a viagem
    let score = 50
    
    // +30 pontos por distância (máx 30km = 30 pontos)
    score += Math.min(30, session.distanceKm)
    
    // +20 pontos por alertas detectados (máx 20 alertas = 20 pontos)
    score += Math.min(20, totalAlerts)
    
    return Math.min(100, Math.floor(score))
  }
  
  const safetyScore = calculateSafetyScore()

  // Verifica quais badges foram desbloqueadas
  const unlockedBadges = BADGES.filter(badge => badge.requirement(session))

  /**
   * Envia o lote de payloads anonimizados ao Intelligence Center.
   *
   * ╔═══════════════════════════════════════════════════════════╗
   * ║  REGRA CRÍTICA DE PRIVACIDADE (LGPD)                     ║
   * ╠═══════════════════════════════════════════════════════════╣
   * ║  ANTES de enviar, o array pendingPayloads DEVE passar    ║
   * ║  pela função sanitizeBatch() que EXPURGA permanentemente ║
   * ║  o campo _bbox e qualquer resquício visual.              ║
   * ║                                                           ║
   * ║  O payload final contém APENAS:                          ║
   * ║    • device_fingerprint (hash SHA-256)                   ║
   * ║    • anomaly_class (string)                              ║
   * ║    • confidence_score (float)                            ║
   * ║    • geo_location (lat/lon)                              ║
   * ║    • event_timestamp_utc (ISO string)                    ║
   * ╚═══════════════════════════════════════════════════════════╝
   */
  const handleUpload = useCallback(async () => {
    if (session.pendingPayloads.length === 0) {
      Alert.alert('Nada a enviar', 'Nenhuma detecção foi registrada nesta sessão.')
      return
    }

    setUploadStatus('uploading')

    // ╔═══════════════════════════════════════════════════════════╗
    // ║  SANITIZAÇÃO OBRIGATÓRIA (LGPD)                          ║
    // ║  Remove campos internos (_bbox, etc.) antes do upload    ║
    // ╚═══════════════════════════════════════════════════════════╝
    const cleanBatch = sanitizeBatch(session.pendingPayloads)

    const requestBody = {
      session_started_at: session.sessionStartedAt,
      distance_km: session.distanceKm,
      total_xp_earned: session.sessionXp,
      payloads: cleanBatch,  // ← Array sanitizado (sem dados visuais)
    }

    try {
      // Endpoint de ingresso de dados anonimizados
      await axios.post(`${API_BASE_URL}/ingress/batch`, requestBody, {
        timeout: UPLOAD_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          // Authorization: `Bearer ${await SecureStore.getItemAsync('access_token')}`,
        },
      })

      setUploadStatus('success')
      
      // Mostra modal de sucesso
      setShowSuccessModal(true)

      // Aguarda 2 segundos e limpa a sessão local
      setTimeout(() => {
        clearSession()
        setShowSuccessModal(false)
      }, 2000)
    } catch (err) {
      const message = err?.response?.data?.message ?? err.message ?? 'Erro desconhecido'
      setUploadStatus('error', message)
      Alert.alert(
        'Falha no envio',
        `Não foi possível enviar os dados.\n\n${message}\n\nOs dados serão reenviados na próxima sessão.`,
      )
    }
  }, [session, setUploadStatus, clearSession])

  const sessionDurationLabel =
    session.sessionStartedAt
      ? `${Math.round((Date.now() - new Date(session.sessionStartedAt).getTime()) / 60000)} min`
      : '—'

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>

        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.brand}>ViaGuardian</Text>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.statusText}>PARADO</Text>
          </View>
        </View>

        {/* Banner XP */}
        <View style={styles.xpBanner}>
          <Text style={styles.xpValue}>+{session.sessionXp}</Text>
          <Text style={styles.xpLabel}>XP ganhos nesta sessão</Text>
          <Text style={styles.xpSub}>Contribuindo para a segurança de motociclistas</Text>
        </View>

        {/* KPIs da Sessão - RESUMO DA VIAGEM */}
        <Text style={styles.sectionTitle}>RESUMO DA VIAGEM</Text>
        <View style={styles.kpiGrid}>
          <KpiCard 
            value={`${session.distanceKm.toFixed(1)} km`}
            label="Distância" 
            sublabel="percorrida" 
            accentColor="#10B981" 
          />
          <KpiCard
            value={`${safetyScore}%`}
            label="Score de Segurança"
            sublabel="baseado em detecções"
            accentColor="#F59E0B"
          />
          <KpiCard
            value={session.sessionXp}
            label="XP Ganho"
            sublabel="pontos de experiência"
            accentColor="#8B5CF6"
          />
          <KpiCard
            value={sessionDurationLabel}
            label="Duração"
            sublabel="de condução"
            accentColor="#3B82F6"
          />
        </View>

        {/* Histórico de Alertas - Categorizado */}
        {totalAlerts > 0 && (
          <>
            <Text style={styles.sectionTitle}>HISTÓRICO DE ALERTAS</Text>
            <View style={styles.alertList}>
              {Object.entries(session.alertCounts).map(([cls, count]) => (
                <AlertRow key={cls} anomalyClass={cls} count={count} />
              ))}
            </View>
          </>
        )}

        {/* Nota de Privacidade LGPD */}
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

        {/* Badges de Conquista (Rodapé) */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>CONQUISTAS DESBLOQUEADAS</Text>
        <View style={styles.badgeGrid}>
          {BADGES.map(badge => (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isUnlocked={unlockedBadges.some(b => b.id === badge.id)}
            />
          ))}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Modal de Sucesso */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        xpEarned={session.sessionXp}
        detectionsCount={totalAlerts}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────
// Estilos — Dark Mode
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111827',
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
    color: '#F9FAFB',
    letterSpacing: -0.3,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(75, 85, 99, 0.8)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
  },

  // ── XP Banner ──────────────────────────────────────────
  xpBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  xpValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: -1,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
    marginTop: 4,
  },
  xpSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Seções ─────────────────────────────────────────────
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
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
    backgroundColor: '#1F2937',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
    color: '#3B82F6',
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 4,
  },
  kpiSublabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Badges ─────────────────────────────────────────────
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
  },
  badgeCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    position: 'relative',
  },
  badgeCardLocked: {
    borderColor: '#374151',
    opacity: 0.5,
  },
  badgeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeTitleLocked: {
    color: '#6B7280',
  },
  badgeDesc: {
    fontSize: 9,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 12,
  },
  badgeDescLocked: {
    color: '#4B5563',
  },
  badgeCheckmark: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCheckmarkText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Alertas ────────────────────────────────────────────
  alertList: {
    backgroundColor: '#1F2937',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
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
    borderBottomColor: '#374151',
  },
  alertIcon: { fontSize: 20 },
  alertInfo: { flex: 1 },
  alertLabel: { fontSize: 14, fontWeight: '500', color: '#F9FAFB' },
  alertSublabel: { 
    fontSize: 11, 
    color: '#6B7280', 
    marginTop: 2,
    fontStyle: 'italic',
  },
  alertXp: { fontSize: 11, color: '#10B981', marginTop: 4, fontWeight: '600' },
  alertBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  alertBadgeCritical: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  alertBadgeText: { fontSize: 13, fontWeight: '700', color: '#3B82F6' },

  // ── Nota de Privacidade ────────────────────────────────
  privacyNote: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  privacyTitle: { fontSize: 12, fontWeight: '700', color: '#10B981', marginBottom: 6 },
  privacyText: { fontSize: 12, color: '#6EE7B7', lineHeight: 18 },

  // ── Upload ─────────────────────────────────────────────
  uploadBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  uploadBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorText: {
    marginTop: 10,
    fontSize: 11,
    color: '#F87171',
    textAlign: 'center',
    fontFamily: 'monospace',
  },

  // ── Modal de Sucesso ───────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalIcon: {
    fontSize: 64,
    color: '#10B981',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F9FAFB',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  modalMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 28,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalStatItem: {
    alignItems: 'center',
  },
  modalStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#3B82F6',
    fontFamily: 'monospace',
  },
  modalStatLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#374151',
  },
  modalBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
