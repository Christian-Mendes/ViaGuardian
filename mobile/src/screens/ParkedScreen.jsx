/**
 * ParkedScreen.jsx — v2
 *
 * Tela de Veículo Parado (Estado PARKED da FSM).
 *
 * ── Responsabilidades ───────────────────────────────────────────────────────
 *   • Liberação total de interações táteis (oposto ao Zero-Touch do DRIVING)
 *   • Painel de gamificação cívica: XP, nível, badges e barra de progresso
 *   • Relatório de inferências anonimizadas (lista expansível por categoria)
 *   • CTA "Enviar Dados": despacha batch para POST /ingress/event (por evento)
 *   • Sanitização LGPD: sanitizeBatch() antes do upload (remove _bbox)
 *   • Limpeza da sessão local (clearSession) após confirmação de sucesso
 *
 * ── Esquema de Gamificação ──────────────────────────────────────────────────
 *   Nível 1 "Viajante":  0 – 199 XP
 *   Nível 2 "Protetor":  200 – 499 XP
 *   Nível 3 "Sentinela": 500+ XP
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import axios from 'axios'

import { useTelemetryStore, AnomalyClass } from '../store/telemetryStore'
import { sanitizeBatch } from '../utils/payloadBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// Configuração da API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Endpoint de ingestão individual de eventos anonimizados.
 * Recebe um objeto com os campos: device_fingerprint, anomaly_class,
 * confidence_score, geo_location, event_timestamp_utc.
 */
const API_BASE_URL     = 'https://api.viaguardian.app/v1'
const INGRESS_ENDPOINT = `${API_BASE_URL}/ingress/event`
const UPLOAD_TIMEOUT_MS = 20_000

// ─────────────────────────────────────────────────────────────────────────────
// Metadados de Classe de Anomalia
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_META = {
  [AnomalyClass.POTHOLE]: {
    label:    'Anomalias Geológicas',
    sublabel: 'Buracos e Depressões de Pavimento',
    icon:     '⚠️',
    xpPerHit: 20,
    category: 'infrastructure',
    color:    '#F59E0B',
  },
  [AnomalyClass.FADED_LANE]: {
    label:    'Sinalização Comprometida',
    sublabel: 'Faixas e Marcações Apagadas',
    icon:     '🚧',
    xpPerHit: 15,
    category: 'infrastructure',
    color:    '#F59E0B',
  },
  [AnomalyClass.OBSTRUCTION]: {
    label:    'Obstrução de Via',
    sublabel: 'Bloqueios e Detritos na Pista',
    icon:     '🚫',
    xpPerHit: 25,
    category: 'infrastructure',
    color:    '#F59E0B',
  },
  [AnomalyClass.NEAR_MISS]: {
    label:    'Eventos Críticos',
    sublabel: 'Quase-Colisões Detectadas',
    icon:     '🔴',
    xpPerHit: 50,
    category: 'critical',
    color:    '#EF4444',
  },
  [AnomalyClass.RISK_BEHAVIOR]: {
    label:    'Comportamento de Risco',
    sublabel: 'Manobras Perigosas Identificadas',
    icon:     '⚡',
    xpPerHit: 30,
    category: 'critical',
    color:    '#EF4444',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sistema de Níveis de Gamificação
// ─────────────────────────────────────────────────────────────────────────────

const LEVELS = [
  {
    id:      'viajante',
    title:   'Viajante',
    icon:    '🗺️',
    minXp:   0,
    maxXp:   199,
    color:   '#3B82F6',
    desc:    'Iniciando a jornada cívica',
  },
  {
    id:      'protetor',
    title:   'Protetor',
    icon:    '🛡️',
    minXp:   200,
    maxXp:   499,
    color:   '#10B981',
    desc:    'Guardião ativo das vias',
  },
  {
    id:      'sentinela',
    title:   'Sentinela',
    icon:    '👁️',
    minXp:   500,
    maxXp:   Infinity,
    color:   '#8B5CF6',
    desc:    'Sentinela de elite do tráfego',
  },
]

/**
 * Calcula o nível atual baseado no XP acumulado da sessão.
 * Retorna o objeto do nível e a porcentagem de progresso dentro do nível.
 */
function computeLevel(xp) {
  const level   = LEVELS.findLast((l) => xp >= l.minXp) ?? LEVELS[0]
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1]

  if (!nextLevel) return { level, progressPct: 100 }

  const rangeXp   = nextLevel.minXp - level.minXp
  const earnedInRange = xp - level.minXp
  const progressPct = Math.min(100, Math.floor((earnedInRange / rangeXp) * 100))

  return { level, nextLevel, progressPct }
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges de Conquista (desbloqueiam ao atingir requirements da sessão)
// ─────────────────────────────────────────────────────────────────────────────

const BADGES = [
  {
    id:          'viajante',
    title:       'Viajante',
    icon:        '🗺️',
    description: 'Completou uma sessão',
    color:       '#3B82F6',
    requirement: (session) => !!session.sessionStartedAt,
  },
  {
    id:          'protetor',
    title:       'Protetor',
    icon:        '🛡️',
    description: 'Detectou 10+ anomalias',
    color:       '#10B981',
    requirement: (session) =>
      (session.alertCounts[AnomalyClass.POTHOLE]      ?? 0) +
      (session.alertCounts[AnomalyClass.FADED_LANE]   ?? 0) +
      (session.alertCounts[AnomalyClass.OBSTRUCTION]  ?? 0) >= 10,
  },
  {
    id:          'sentinela',
    title:       'Sentinela',
    icon:        '👁️',
    description: 'Registrou evento crítico',
    color:       '#8B5CF6',
    requirement: (session) =>
      (session.alertCounts[AnomalyClass.NEAR_MISS]     ?? 0) +
      (session.alertCounts[AnomalyClass.RISK_BEHAVIOR] ?? 0) >= 1,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: formata duração de sessão
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(startedAt) {
  if (!startedAt) return '—'
  const ms  = Date.now() - new Date(startedAt).getTime()
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1_000)
  if (min === 0) return `${sec}s`
  return `${min}m ${String(sec).padStart(2, '0')}s`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Barra de Progresso Animada (XP)
// ─────────────────────────────────────────────────────────────────────────────

function XpProgressBar({ progressPct, color }) {
  const widthAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progressPct,
      duration: 900,
      delay: 400,
      useNativeDriver: false, // largura não suporta native driver
      easing: Easing.out(Easing.cubic),
    }).start()
  }, [progressPct, widthAnim])

  const widthInterpolated = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[styles.progressFill, { width: widthInterpolated, backgroundColor: color }]}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Banner XP com animação de entrada
// ─────────────────────────────────────────────────────────────────────────────

function XpBanner({ xp, session }) {
  const scaleAnim   = useRef(new Animated.Value(0.85)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  const { level, nextLevel, progressPct } = computeLevel(xp)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacityAnim, scaleAnim])

  return (
    <Animated.View
      style={[styles.xpBanner, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
    >
      {/* Badge de nível atual */}
      <View style={[styles.levelBadge, { borderColor: level.color }]}>
        <Text style={styles.levelBadgeIcon}>{level.icon}</Text>
        <Text style={[styles.levelBadgeTitle, { color: level.color }]}>{level.title}</Text>
      </View>

      {/* Valor de XP em destaque */}
      <Text style={[styles.xpValue, { color: level.color }]}>+{xp}</Text>
      <Text style={styles.xpLabel}>XP ganhos nesta sessão</Text>
      <Text style={styles.xpDesc}>{level.desc}</Text>

      {/* Barra de progresso para o próximo nível */}
      {nextLevel && (
        <View style={styles.xpProgressWrapper}>
          <View style={styles.xpProgressHeader}>
            <Text style={styles.xpProgressLabel}>Progresso até {nextLevel.title}</Text>
            <Text style={[styles.xpProgressPct, { color: level.color }]}>{progressPct}%</Text>
          </View>
          <XpProgressBar progressPct={progressPct} color={level.color} />
          <Text style={styles.xpProgressXpLeft}>
            {Math.max(0, nextLevel.minXp - xp)} XP para o próximo nível
          </Text>
        </View>
      )}
      {!nextLevel && (
        <View style={styles.xpProgressWrapper}>
          <Text style={[styles.xpProgressLabel, { color: '#8B5CF6', textAlign: 'center' }]}>
            ✦ Nível Máximo Atingido ✦
          </Text>
        </View>
      )}
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ value, label, sublabel, accentColor = '#3B82F6' }) {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: 200,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  return (
    <Animated.View style={[styles.kpiCard, { opacity: fadeAnim }]}>
      <Text style={[styles.kpiValue, { color: accentColor }]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sublabel ? <Text style={styles.kpiSublabel}>{sublabel}</Text> : null}
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Badge Card (conquista)
// ─────────────────────────────────────────────────────────────────────────────

function BadgeCard({ badge, isUnlocked }) {
  return (
    <View
      style={[
        styles.badgeCard,
        isUnlocked
          ? { borderColor: badge.color }
          : styles.badgeCardLocked,
      ]}
    >
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
        <View style={[styles.badgeCheckmark, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeCheckmarkText}>✓</Text>
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Seção de Relatório de Alertas (lista expansível)
// ─────────────────────────────────────────────────────────────────────────────

function AlertReportSection({ alertCounts, totalAlerts }) {
  const [expanded, setExpanded] = useState(true)
  const expandAnim  = useRef(new Animated.Value(1)).current
  const rotateAnim  = useRef(new Animated.Value(1)).current

  const toggle = useCallback(() => {
    const toValue = expanded ? 0 : 1
    setExpanded(!expanded)
    Animated.parallel([
      Animated.timing(expandAnim, {
        toValue,
        duration: 250,
        useNativeDriver: false,
        easing: Easing.inOut(Easing.quad),
      }),
      Animated.timing(rotateAnim, {
        toValue,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.quad),
      }),
    ]).start()
  }, [expanded, expandAnim, rotateAnim])

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '0deg'],
  })

  // Categoriza alertas em infra e críticos
  const infraEntries    = [AnomalyClass.POTHOLE, AnomalyClass.FADED_LANE, AnomalyClass.OBSTRUCTION]
  const criticalEntries = [AnomalyClass.NEAR_MISS, AnomalyClass.RISK_BEHAVIOR]

  const totalInfra    = infraEntries.reduce((s, k)    => s + (alertCounts[k] ?? 0), 0)
  const totalCritical = criticalEntries.reduce((s, k) => s + (alertCounts[k] ?? 0), 0)

  return (
    <View style={styles.alertSection}>
      {/* Cabeçalho expansível */}
      <TouchableOpacity
        style={styles.alertSectionHeader}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={styles.alertSectionTitle}>
          <Text style={styles.sectionTitle}>RELATÓRIO DE INFERÊNCIAS</Text>
          <View style={styles.alertSummaryChips}>
            {totalInfra > 0 && (
              <View style={[styles.chip, { borderColor: '#F59E0B' }]}>
                <Text style={[styles.chipText, { color: '#F59E0B' }]}>
                  {totalInfra} Estruturais
                </Text>
              </View>
            )}
            {totalCritical > 0 && (
              <View style={[styles.chip, { borderColor: '#EF4444' }]}>
                <Text style={[styles.chipText, { color: '#EF4444' }]}>
                  {totalCritical} Críticos
                </Text>
              </View>
            )}
            {totalAlerts === 0 && (
              <View style={[styles.chip, { borderColor: '#6B7280' }]}>
                <Text style={[styles.chipText, { color: '#6B7280' }]}>Sem detecções</Text>
              </View>
            )}
          </View>
        </View>
        <Animated.Text
          style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}
        >
          ▲
        </Animated.Text>
      </TouchableOpacity>

      {/* Corpo expansível */}
      <Animated.View
        style={[
          styles.alertBody,
          {
            maxHeight: expandAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 600],
            }),
            opacity: expandAnim,
          },
        ]}
      >
        {totalAlerts === 0 ? (
          <View style={styles.alertEmptyState}>
            <Text style={styles.alertEmptyIcon}>🛡️</Text>
            <Text style={styles.alertEmptyTitle}>Nenhuma anomalia detectada</Text>
            <Text style={styles.alertEmptyDesc}>
              Condições favoráveis na via durante esta sessão.
            </Text>
          </View>
        ) : (
          <>
            {/* Grupo: Infraestrutura */}
            {totalInfra > 0 && (
              <>
                <View style={styles.alertGroupHeader}>
                  <View style={[styles.alertGroupLine, { backgroundColor: '#F59E0B' }]} />
                  <Text style={[styles.alertGroupLabel, { color: '#F59E0B' }]}>
                    ANOMALIAS DE INFRAESTRUTURA
                  </Text>
                </View>
                {infraEntries.map((cls) => {
                  const count = alertCounts[cls] ?? 0
                  if (count === 0) return null
                  const meta = CLASS_META[cls]
                  return (
                    <AlertRow
                      key={cls}
                      meta={meta}
                      count={count}
                      isCritical={false}
                    />
                  )
                })}
              </>
            )}

            {/* Grupo: Críticos */}
            {totalCritical > 0 && (
              <>
                <View style={styles.alertGroupHeader}>
                  <View style={[styles.alertGroupLine, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.alertGroupLabel, { color: '#EF4444' }]}>
                    EVENTOS CRÍTICOS DE SEGURANÇA
                  </Text>
                </View>
                {criticalEntries.map((cls) => {
                  const count = alertCounts[cls] ?? 0
                  if (count === 0) return null
                  const meta = CLASS_META[cls]
                  return (
                    <AlertRow
                      key={cls}
                      meta={meta}
                      count={count}
                      isCritical={true}
                    />
                  )
                })}
              </>
            )}
          </>
        )}
      </Animated.View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Linha de alerta individual
// ─────────────────────────────────────────────────────────────────────────────

function AlertRow({ meta, count, isCritical }) {
  const totalXp = meta.xpPerHit * count

  return (
    <View style={[styles.alertRow, isCritical && styles.alertRowCritical]}>
      <View style={[styles.alertIconWrapper, { backgroundColor: `${meta.color}18` }]}>
        <Text style={styles.alertIcon}>{meta.icon}</Text>
      </View>

      <View style={styles.alertInfo}>
        <Text style={[styles.alertLabel, { color: isCritical ? '#F87171' : '#F9FAFB' }]}>
          {meta.label}
        </Text>
        <Text style={styles.alertSublabel}>{meta.sublabel}</Text>
      </View>

      <View style={styles.alertRightCol}>
        <View style={[styles.alertCountBadge, { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}50` }]}>
          <Text style={[styles.alertCountText, { color: meta.color }]}>{count}</Text>
        </View>
        <Text style={[styles.alertXpText, { color: isCritical ? '#F59E0B' : '#10B981' }]}>
          +{totalXp} XP
        </Text>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Botão de Upload (CTA)
// ─────────────────────────────────────────────────────────────────────────────

function UploadButton({ onPress, status, pendingCount }) {
  const isUploading = status === 'uploading'
  const isSuccess   = status === 'success'
  const isError     = status === 'error'

  let bgColor, label
  if (isSuccess) { bgColor = '#10B981'; label = '✓  Envio Realizado' }
  else if (isError) { bgColor = '#EF4444'; label = 'Tentar Novamente' }
  else { bgColor = '#3B82F6'; label = `ENVIAR ${pendingCount} DETECÇÕES` }

  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (isUploading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.92, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ]),
      ).start()
    } else {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(1)
    }
  }, [isUploading, pulseAnim])

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <TouchableOpacity
        style={[
          styles.uploadBtn,
          { backgroundColor: bgColor },
          (isUploading || isSuccess) && styles.uploadBtnDisabled,
        ]}
        onPress={onPress}
        disabled={isUploading || isSuccess}
        activeOpacity={0.85}
      >
        {isUploading ? (
          <View style={styles.uploadBtnInner}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.uploadBtnText}>Enviando…</Text>
          </View>
        ) : (
          <Text style={styles.uploadBtnText}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Modal de Sucesso Premium
// ─────────────────────────────────────────────────────────────────────────────

function SuccessModal({ visible, onClose, xpEarned, detectionsCount }) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }).start()
    } else {
      scaleAnim.setValue(0.8)
    }
  }, [visible, scaleAnim])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[styles.modalContent, { transform: [{ scale: scaleAnim }] }]}
        >
          {/* Ícone de confirmação */}
          <View style={styles.modalCheckCircle}>
            <Text style={styles.modalCheckText}>✓</Text>
          </View>

          <Text style={styles.modalTitle}>DADOS ENVIADOS</Text>
          <Text style={styles.modalSubtitle}>
            Contribuição registrada com sucesso no ViaGuardian Intelligence Center
          </Text>

          {/* Stats: detecções e XP */}
          <View style={styles.modalStats}>
            <View style={styles.modalStatItem}>
              <Text style={[styles.modalStatValue, { color: '#3B82F6' }]}>{detectionsCount}</Text>
              <Text style={styles.modalStatLabel}>Detecções</Text>
            </View>
            <View style={styles.modalStatDivider} />
            <View style={styles.modalStatItem}>
              <Text style={[styles.modalStatValue, { color: '#10B981' }]}>+{xpEarned}</Text>
              <Text style={styles.modalStatLabel}>XP Ganhos</Text>
            </View>
          </View>

          {/* Nota de privacidade inline */}
          <View style={styles.modalPrivacyRow}>
            <Text style={styles.modalPrivacyText}>
              🔒 Dados anonimizados · Hash SHA-256 · Sem imagens
            </Text>
          </View>

          <TouchableOpacity
            style={styles.modalBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.modalBtnText}>Continuar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela Principal
// ─────────────────────────────────────────────────────────────────────────────

export function ParkedScreen() {
  const session         = useTelemetryStore((s) => s.session)
  const uploadStatus    = useTelemetryStore((s) => s.uploadStatus)
  const uploadError     = useTelemetryStore((s) => s.uploadError)
  const setUploadStatus = useTelemetryStore((s) => s.setUploadStatus)
  const clearSession    = useTelemetryStore((s) => s.clearSession)

  const [showSuccessModal, setShowSuccessModal] = useState(false)

  const totalAlerts   = Object.values(session.alertCounts).reduce((a, b) => a + b, 0)
  const pendingCount  = session.pendingPayloads.length
  const sessionDur    = formatDuration(session.sessionStartedAt)

  // Score de segurança (50 base + distância + alertas, capped em 100)
  const safetyScore = session.distanceKm === 0
    ? 0
    : Math.min(100, Math.floor(50 + Math.min(30, session.distanceKm) + Math.min(20, totalAlerts)))

  // Badges desbloqueadas
  const unlockedBadges = BADGES.filter((b) => b.requirement(session))

  // ─────────────────────────────────────────────────────────────────────────
  // handleUpload: despacha cada evento individualmente ao endpoint /ingress/event
  //
  // ╔══════════════════════════════════════════════════════════════════╗
  // ║  FLUXO DE PRIVACIDADE (LGPD)                                    ║
  // ╠══════════════════════════════════════════════════════════════════╣
  // ║  1. sanitizeBatch() remove _bbox e campos internos              ║
  // ║  2. Cada evento é despachado individualmente para /ingress/event ║
  // ║  3. O campo device_fingerprint (SHA-256) é o único identificador║
  // ║  4. Campos transmitidos: fingerprint, class, score, geo, ts      ║
  // ║  5. clearSession() apaga a fila local após confirmação de sucesso║
  // ╚══════════════════════════════════════════════════════════════════╝
  // ─────────────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (pendingCount === 0) {
      Alert.alert(
        'Nada a enviar',
        'Nenhuma detecção foi registrada nesta sessão.',
        [{ text: 'OK' }],
      )
      return
    }

    setUploadStatus('uploading')

    // ── Sanitização obrigatória LGPD ──────────────────────────────────────
    // Remove _bbox e qualquer campo interno antes de qualquer transmissão.
    const cleanBatch = sanitizeBatch(session.pendingPayloads)

    // ── Enriquece com metadados da sessão ───────────────────────────────
    // Estes campos não identificam o usuário — apenas contextualizam a sessão.
    const enrichedBatch = cleanBatch.map((payload) => ({
      ...payload,
      session_started_at: session.sessionStartedAt,
      distance_km:        parseFloat((session.distanceKm ?? 0).toFixed(3)),
      session_xp:         session.sessionXp,
    }))

    try {
      // ── Despacho sequencial por evento para /ingress/event ──────────────
      // A spec define ingestão individual. Fazemos Promise.all para
      // maior throughput, mas mantendo atomicidade por evento.
      const requests = enrichedBatch.map((event) =>
        axios.post(INGRESS_ENDPOINT, event, {
          timeout: UPLOAD_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await Promise.all(requests)

      setUploadStatus('success')
      setShowSuccessModal(true)

      // ── Limpeza da fila local após confirmação ───────────────────────
      // clearSession() apaga pendingPayloads, alertCounts, sessionXp, etc.
      // Aguarda 2.5s para o usuário ver o modal antes de limpar.
      setTimeout(() => {
        clearSession()
        setShowSuccessModal(false)
      }, 2500)
    } catch (err) {
      const serverMsg = err?.response?.data?.detail ?? err?.response?.data?.message
      const message   = serverMsg ?? err?.message ?? 'Erro de conexão desconhecido'
      setUploadStatus('error', message)

      Alert.alert(
        'Falha no Envio',
        `Não foi possível enviar os dados ao Intelligence Center.\n\n${message}\n\nOs dados permanecem armazenados localmente e serão reenviados na próxima oportunidade.`,
        [{ text: 'Entendido' }],
      )
    }
  }, [session, pendingCount, setUploadStatus, clearSession])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Cabeçalho ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ViaGuardian</Text>
            <Text style={styles.brandSub}>Intelligence Center</Text>
          </View>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.statusText}>PARADO</Text>
          </View>
        </View>

        {/* ── Banner de XP e Nível (gamificação) ───────────────────────── */}
        <XpBanner xp={session.sessionXp} session={session} />

        {/* ── KPIs da sessão ───────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>RESUMO DA VIAGEM</Text>
        <View style={styles.kpiGrid}>
          <KpiCard
            value={`${(session.distanceKm ?? 0).toFixed(1)} km`}
            label="Distância"
            sublabel="percorrida nesta sessão"
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
            value={sessionDur}
            label="Duração"
            sublabel="tempo de condução"
            accentColor="#3B82F6"
          />
        </View>

        {/* ── Relatório de Inferências (lista expansível) ────────────────── */}
        <AlertReportSection
          alertCounts={session.alertCounts}
          totalAlerts={totalAlerts}
        />

        {/* ── Nota de Privacidade (LGPD) ────────────────────────────────── */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyTitle}>🔒 Privacy by Design · LGPD</Text>
          <Text style={styles.privacyText}>
            Nenhuma imagem ou vídeo foi armazenado ou transmitido. Os dados contêm
            apenas classe da anomalia, score de confiança, coordenada GPS e
            identificador de dispositivo anonimizado via{' '}
            <Text style={{ fontWeight: '700' }}>hash SHA-256</Text>.
          </Text>
          {pendingCount > 0 && (
            <View style={styles.privacyBatchRow}>
              <Text style={styles.privacyBatchText}>
                📦 {pendingCount} evento{pendingCount > 1 ? 's' : ''} aguardando envio
              </Text>
            </View>
          )}
        </View>

        {/* ── CTA: Enviar Dados ─────────────────────────────────────────── */}
        <UploadButton
          onPress={handleUpload}
          status={uploadStatus}
          pendingCount={pendingCount}
        />
        {uploadError ? (
          <Text style={styles.errorText}>Último erro: {uploadError}</Text>
        ) : null}

        {/* ── Badges de Conquista ───────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 36 }]}>CONQUISTAS</Text>
        <Text style={styles.sectionSubtitle}>
          Desbloqueadas nesta sessão de condução
        </Text>
        <View style={styles.badgeGrid}>
          {BADGES.map((badge) => (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isUnlocked={unlockedBadges.some((b) => b.id === badge.id)}
            />
          ))}
        </View>

        <View style={{ height: 56 }} />
      </ScrollView>

      {/* ── Modal de Sucesso ─────────────────────────────────────────────── */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        xpEarned={session.sessionXp}
        detectionsCount={totalAlerts}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos — Dark Mode · Paleta Azul + Verde ViaGuardian
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout Base ──────────────────────────────────────────────────────────
  root: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 48,
  },

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 11,
    color: '#4B5563',
    fontFamily: 'monospace',
    marginTop: 1,
    letterSpacing: 0.5,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(31, 41, 55, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
  },

  // ── XP Banner ─────────────────────────────────────────────────────────
  xpBanner: {
    backgroundColor: '#0F1929',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  levelBadgeIcon: { fontSize: 16 },
  levelBadgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  xpValue: {
    fontSize: 56,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: -2,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#93C5FD',
    marginTop: 4,
  },
  xpDesc: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 4,
    marginBottom: 20,
  },
  xpProgressWrapper: {
    width: '100%',
  },
  xpProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  xpProgressLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  xpProgressPct: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  xpProgressXpLeft: {
    fontSize: 10,
    color: '#4B5563',
    fontFamily: 'monospace',
    marginTop: 6,
    textAlign: 'right',
  },

  // ── Seções ─────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 14,
  },

  // ── KPI Grid ───────────────────────────────────────────────────────────
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
    marginTop: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D1D5DB',
    marginTop: 6,
  },
  kpiSublabel: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },

  // ── Relatório de Alertas (expansível) ─────────────────────────────────
  alertSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#111827',
    overflow: 'hidden',
    marginBottom: 20,
  },
  alertSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  alertSectionTitle: { flex: 1, gap: 8 },
  alertSummaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  chipText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  chevron: { fontSize: 12, color: '#4B5563', paddingLeft: 8 },
  alertBody: { overflow: 'hidden' },

  alertGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0D1524',
  },
  alertGroupLine: { width: 3, height: 14, borderRadius: 2 },
  alertGroupLabel: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  alertRowCritical: {
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  alertIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIcon: { fontSize: 20 },
  alertInfo: { flex: 1 },
  alertLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  alertSublabel: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
    fontStyle: 'italic',
  },
  alertRightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  alertCountBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 32,
    alignItems: 'center',
  },
  alertCountText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  alertXpText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  alertEmptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  alertEmptyIcon: { fontSize: 40, marginBottom: 12 },
  alertEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D1D5DB',
    marginBottom: 6,
  },
  alertEmptyDesc: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Nota de Privacidade ────────────────────────────────────────────────
  privacyNote: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  privacyText: {
    fontSize: 12,
    color: '#6EE7B7',
    lineHeight: 18,
  },
  privacyBatchRow: {
    marginTop: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  privacyBatchText: {
    fontSize: 12,
    color: '#34D399',
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // ── CTA Upload ────────────────────────────────────────────────────────
  uploadBtn: {
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  uploadBtnDisabled: {
    opacity: 0.8,
  },
  uploadBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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

  // ── Badges ────────────────────────────────────────────────────────────
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  badgeCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1F2937',
    position: 'relative',
  },
  badgeCardLocked: {
    borderColor: '#1F2937',
    opacity: 0.45,
  },
  badgeIcon: { fontSize: 30, marginBottom: 8 },
  badgeIconLocked: { opacity: 0.4 },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeTitleLocked: { color: '#4B5563' },
  badgeDesc: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 12,
  },
  badgeDescLocked: { color: '#374151' },
  badgeCheckmark: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0B1120',
  },
  badgeCheckmarkText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  // ── Modal de Sucesso ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#1F2937',
    ...Platform.select({
      ios: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  modalCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalCheckText: {
    fontSize: 32,
    color: '#10B981',
    fontWeight: '700',
    lineHeight: 38,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  modalStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 20,
    paddingVertical: 18,
    paddingHorizontal: 32,
    backgroundColor: '#0B1120',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    width: '100%',
    justifyContent: 'center',
  },
  modalStatItem: { alignItems: 'center' },
  modalStatValue: {
    fontSize: 32,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: -1,
  },
  modalStatLabel: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalStatDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#1F2937',
  },
  modalPrivacyRow: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  modalPrivacyText: {
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  modalBtn: {
    width: '100%',
    height: 50,
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  modalBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
