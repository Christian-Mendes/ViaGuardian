import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

export function ActiveDrivingScreen() {
  const device = useCameraDevice('back');
  const [detections, setDetections] = useState([]);

  useEffect(() => {
    // Simula múltiplas detecções simultâneas na pista após 3 segundos
    const timer = setTimeout(() => {
      const mockDetections = [
        {
          id: 1,
          label: 'Buraco Profundo - 89%',
          anomaly_class: 'INFRA_BURACO_PROFUNDO',
          confidence_score: 0.8932,
          color: '#FBBF24', // Amarelo (Infraestrutura)
          bgColor: 'rgba(251, 191, 36, 0.15)',
          top: '65%',
          left: '25%',
          width: 200,
          height: 120,
        },
        {
          id: 3,
          label: 'Pedestre - 78%',
          anomaly_class: 'ALVO_NEUTRO_PEDESTRE',
          confidence_score: 0.7850,
          color: '#FFFFFF', // Branco (Neutro)
          bgColor: 'rgba(255, 255, 255, 0.15)',
          top: '40%',
          left: '70%',
          width: 80,
          height: 160,
        }
      ];

      setDetections(mockDetections);
      
      const currentTimestamp = new Date().toISOString();
      const payloadLog = mockDetections.map(det => ({
        device_fingerprint: "hash-criptografico-anonimizado",
        anomaly_class: det.anomaly_class,
        confidence_score: det.confidence_score,
        geo_location: { lat: -23.563099, lon: -46.656571 },
        event_timestamp_utc: currentTimestamp
      }));

      console.log("[ViaGuardian AI Mock] Batch Payload Registrado:", JSON.stringify(payloadLog, null, 2));

    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!device) {
    return (
      <View style={styles.centerMode}>
        <Text style={styles.textWhite}>Câmera traseira indisponível</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} pointerEvents="none">
      {/* ─── Câmera nativa limpa, sem processadores injetados ─── */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={false}
        video={false}
        audio={false}
      />

      {/* ─── Camada Zero-Touch (Sobreposição HUD) ─── */}
      <View style={StyleSheet.absoluteFill}>
        
        {/* Topo: Telemetria Reduzida */}
        <View style={styles.hudTop}>
          <View style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.hudText}>IA Ativa</Text>
          </View>
          <View style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.hudText}>GPS</Text>
          </View>
        </View>

        {/* ─── Renderização Dinâmica de Bounding Boxes ─── */}
        {detections.map((det) => (
          <View 
            key={det.id}
            style={[
              styles.boundingBox,
              {
                top: det.top,
                left: det.left,
                width: det.width,
                height: det.height,
                borderColor: det.color,
                backgroundColor: det.bgColor
              }
            ]}
          >
            <View style={[styles.bboxLabel, { backgroundColor: det.color }]}>
              <Text 
                style={[
                  styles.bboxLabelText, 
                  { color: det.color === '#FFFFFF' ? '#000' : '#000' } // Contraste ajustado para fontes
                ]}
              >
                {det.label}
              </Text>
            </View>
          </View>
        ))}

        {/* Rodapé: Lockdown tracker */}
        <View style={styles.hudBottom}>
          <View style={styles.chipLarge}>
            <Text style={styles.textWhiteBold}>00:01:14</Text>
            <Text style={styles.lockdownText}>🔒 Zero-Touch ativo</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerMode: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudTop: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hudText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  hudBottom: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  chipLarge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  textWhite: {
    color: '#FFF',
  },
  textWhiteBold: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 2,
  },
  lockdownText: {
    color: '#9CA3AF',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // ── Estilização Base da Bounding Box ──
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
  },
  bboxLabel: {
    position: 'absolute',
    top: -22,
    left: -2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  bboxLabelText: {
    fontSize: 11,
    fontWeight: 'bold',
  }
});
