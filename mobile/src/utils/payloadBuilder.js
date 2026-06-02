/**
 * payloadBuilder.js
 *
 * Constrói o payload JSON anonimizado de acordo com a política
 * Privacy by Design (LGPD) do ViaGuardian.
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  POLÍTICA DE PRIVACIDADE — O QUE NUNCA DEVE ESTAR AQUI ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  ✗ frames de vídeo ou imagens (qualquer formato)        ║
 * ║  ✗ identificadores pessoais (nome, CPF, e-mail)         ║
 * ║  ✗ placas de veículos (extraídas por OCR ou outro meio) ║
 * ║  ✗ rostos ou biometria                                  ║
 * ║  ✗ IMEI, número de telefone, MAC address bruto          ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * O `device_fingerprint` é um hash SHA-256 one-way derivado de
 * características não-sensíveis do dispositivo, impossibilitando
 * a engenharia reversa para identificação do usuário.
 */

import { Platform } from 'react-native'

// ─────────────────────────────────────────────────────────
// Fingerprint (hash one-way, computado uma vez por sessão)
// ─────────────────────────────────────────────────────────

let _cachedFingerprint = null

/**
 * Deriva um hash SHA-256 a partir de características não-sensíveis.
 * Em produção, substitua pela implementação nativa via expo-crypto.
 *
 * @returns {Promise<string>} hex string de 64 caracteres
 */
async function deriveDeviceFingerprint() {
  if (_cachedFingerprint) return _cachedFingerprint

  // Dados não-identificáveis usados como semente do hash
  const seed = [
    Platform.OS,
    Platform.Version?.toString() ?? 'unknown',
    // Em produção: DeviceInfo.getUniqueIdSync() + sal de instalação
    // Jamais use IMEI, número de telefone ou e-mail
    'viaguardian-sensor-v1',
  ].join('::')

  // Simulação de SHA-256 via Web Crypto API (disponível no Hermes Engine)
  const encoder = new TextEncoder()
  const data = encoder.encode(seed)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  _cachedFingerprint = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return _cachedFingerprint
}

// ─────────────────────────────────────────────────────────
// Construção do Payload
// ─────────────────────────────────────────────────────────

/**
 * Constrói o payload anonimizado para upload ao Intelligence Center.
 *
 * @param {object} params
 * @param {string}  params.anomalyClass   - Classe da anomalia (AnomalyClass enum)
 * @param {number}  params.confidenceScore - Score de confiança do modelo [0.0 – 1.0]
 * @param {object}  params.location        - { latitude, longitude, accuracy }
 * @param {object}  params.bbox            - { x, y, w, h } coordenadas da bounding box (APENAS LOCAL)
 *
 * @returns {Promise<object>} payload pronto para enfileirar no store
 */
export async function buildAnonymizedPayload({ anomalyClass, confidenceScore, location, bbox }) {
  const fingerprint = await deriveDeviceFingerprint()

  return {
    // Campos que SAEM do dispositivo (vão para a API)
    device_fingerprint: fingerprint,
    anomaly_class: anomalyClass,
    confidence_score: parseFloat(confidenceScore.toFixed(4)),
    geo_location: {
      lat: parseFloat(location.latitude.toFixed(6)),
      lon: parseFloat(location.longitude.toFixed(6)),
      // Intencionalmente sem altitude ou accuracy granular para evitar
      // rastreamento de trajetória precisa
    },
    event_timestamp_utc: new Date().toISOString(),

    // Campos que FICAM no dispositivo (somente para renderização local)
    // Serão removidos pelo store antes do upload — vide telemetryStore.js
    _bbox: bbox,
  }
}

/**
 * Sanitiza um lote de payloads removendo campos internos (_bbox, etc.)
 * imediatamente antes do upload. Garante que nenhum dado de localização
 * visual saia do dispositivo.
 *
 * @param {object[]} payloads
 * @returns {object[]}
 */
export function sanitizeBatch(payloads) {
  return payloads.map(({ _bbox, ...clean }) => clean)
}
