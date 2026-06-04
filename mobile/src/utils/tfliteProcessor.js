/**
 * tfliteProcessor.js
 *
 * Abstração de inferência YOLOv8 Nano via TensorFlow Lite.
 * 
 * Este módulo encapsula a execução do modelo quantizado na borda (dispositivo local),
 * garantindo que frames de vídeo NUNCA sejam persistidos ou transmitidos.
 *
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  POLÍTICA DE PRIVACIDADE — FLUXO DE PROCESSAMENTO            ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  1. Frame entra na memória volátil (RAM)                     ║
 * ║  2. Redimensionamento para tensor 320×320 (in-place)         ║
 * ║  3. Inferência TFLite (CPU/NPU/GPU delegate)                 ║
 * ║  4. Extração de detecções (classes + bbox + scores)          ║
 * ║  5. Frame sai do escopo → GC libera memória                  ║
 * ║  6. Apenas array numérico retorna para JS thread             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Em produção, este módulo deve usar:
 *   - vision-camera-plugin-tflite (plugin nativo Turbo Module)
 *   - Modelo YOLOv8n.tflite quantizado INT8 (~6 MB)
 *   - Delegates: NNAPI (Android) / CoreML (iOS) para aceleração
 */

// ─────────────────────────────────────────────────────────
// Configuração do Modelo
// ─────────────────────────────────────────────────────────

const MODEL_CONFIG = {
  inputWidth: 320,        // Resolução otimizada para mobile
  inputHeight: 320,
  numClasses: 5,          // Quantidade de classes treinadas
  confidenceThreshold: 0.70,  // Limiar alto para reduzir falsos positivos
  iouThreshold: 0.45,     // Non-Maximum Suppression
  maxDetections: 10,      // Máximo de detecções por frame
}

// Mapeamento de índice do modelo → classe semântica
const CLASS_MAP = [
  'pothole',          // 0
  'faded_lane',       // 1
  'near_miss',        // 2
  'risk_behavior',    // 3
  'obstruction',      // 4
]

// ─────────────────────────────────────────────────────────
// Interface de Inferência (Produção)
// ─────────────────────────────────────────────────────────

/**
 * Executa inferência TFLite em um frame de vídeo.
 * 
 * IMPORTANTE: Esta função deve ser chamada APENAS dentro de um frameProcessor
 * (worklet do Reanimated), garantindo execução na thread nativa.
 * 
 * @param {Frame} frame - Frame nativo da vision-camera
 * @returns {Detection[]} Array de detecções [{class, confidence, bbox}]
 * 
 * @example
 * const frameProcessor = useFrameProcessor((frame) => {
 *   'worklet'
 *   const detections = runYOLOInference(frame)
 *   runOnJS(handleDetections)(detections)
 * }, [])
 */
export function runYOLOInference(frame) {
  'worklet'
  
  // ── PRODUÇÃO: Integração com Plugin Nativo ─────────────────────
  // 
  // import { runTFLiteModel } from 'vision-camera-plugin-tflite'
  // 
  // const rawOutputs = runTFLiteModel(frame, {
  //   model: 'yolov8n_320_int8.tflite',
  //   delegate: 'nnapi',  // Android: NNAPI | iOS: CoreML
  // })
  // 
  // const detections = parseYOLOOutput(rawOutputs)
  // return detections.filter(d => d.confidence >= MODEL_CONFIG.confidenceThreshold)
  // ───────────────────────────────────────────────────────────────

  // ── DESENVOLVIMENTO: Simulação de Inferência ───────────────────
  // 
  // Este código simula o comportamento do modelo para testes locais
  // sem necessidade do plugin nativo instalado.
  // 
  // Em produção, REMOVA este bloco e use o código acima.
  // ───────────────────────────────────────────────────────────────

  // Simula latência de inferência (~30-80ms em hardware real)
  const inferenceLatencyMs = 40 + Math.random() * 40

  // Simula probabilidade de detecção (3% de chance por frame)
  if (Math.random() > 0.97) {
    const classIdx = Math.floor(Math.random() * CLASS_MAP.length)
    const confidence = 0.70 + Math.random() * 0.28  // 0.70 - 0.98

    return [{
      class: CLASS_MAP[classIdx],
      confidence: parseFloat(confidence.toFixed(4)),
      bbox: {
        x: 10 + Math.random() * 50,   // % do frame
        y: 15 + Math.random() * 50,
        w: 15 + Math.random() * 30,
        h: 10 + Math.random() * 25,
      },
      timestamp: Date.now(),
    }]
  }

  return []  // Nenhuma detecção neste frame
}

// ─────────────────────────────────────────────────────────
// Parsing de Saída do YOLOv8 (Produção)
// ─────────────────────────────────────────────────────────

/**
 * Converte a saída bruta do TFLite (tensores) em detecções estruturadas.
 * 
 * O YOLOv8 retorna um tensor de forma [1, 8400, 85] onde:
 *   - 8400: quantidade de âncoras (grid cells)
 *   - 85: [x, y, w, h, objectness, class_0...class_79]
 * 
 * @param {Float32Array} rawOutput - Tensor de saída do modelo
 * @returns {Detection[]} Detecções filtradas e processadas
 */
function parseYOLOOutput(rawOutput) {
  'worklet'
  
  const detections = []
  const numAnchors = 8400
  const numVals = MODEL_CONFIG.numClasses + 5  // x,y,w,h,obj + classes

  for (let i = 0; i < numAnchors; i++) {
    const offset = i * numVals
    const objectness = rawOutput[offset + 4]

    if (objectness < MODEL_CONFIG.confidenceThreshold) continue

    // Encontra classe com maior probabilidade
    let maxClassProb = 0
    let maxClassIdx = 0
    for (let c = 0; c < MODEL_CONFIG.numClasses; c++) {
      const prob = rawOutput[offset + 5 + c]
      if (prob > maxClassProb) {
        maxClassProb = prob
        maxClassIdx = c
      }
    }

    const confidence = objectness * maxClassProb

    if (confidence < MODEL_CONFIG.confidenceThreshold) continue

    detections.push({
      class: CLASS_MAP[maxClassIdx],
      confidence,
      bbox: {
        x: rawOutput[offset + 0] * 100,  // normaliza para %
        y: rawOutput[offset + 1] * 100,
        w: rawOutput[offset + 2] * 100,
        h: rawOutput[offset + 3] * 100,
      },
      timestamp: Date.now(),
    })
  }

  // Non-Maximum Suppression (remove detecções duplicadas)
  return applyNMS(detections, MODEL_CONFIG.iouThreshold)
}

/**
 * Aplica Non-Maximum Suppression para remover bounding boxes sobrepostas.
 * 
 * @param {Detection[]} detections - Array de detecções
 * @param {number} iouThreshold - Limiar de IoU (Intersection over Union)
 * @returns {Detection[]} Detecções filtradas
 */
function applyNMS(detections, iouThreshold) {
  'worklet'
  
  if (detections.length === 0) return []

  // Ordena por confiança (maior → menor)
  const sorted = detections.sort((a, b) => b.confidence - a.confidence)
  const keep = []

  while (sorted.length > 0) {
    const current = sorted.shift()
    keep.push(current)

    // Remove detecções com alta sobreposição
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (calculateIoU(current.bbox, sorted[i].bbox) > iouThreshold) {
        sorted.splice(i, 1)
      }
    }
  }

  return keep.slice(0, MODEL_CONFIG.maxDetections)
}

/**
 * Calcula Intersection over Union entre duas bounding boxes.
 */
function calculateIoU(box1, box2) {
  'worklet'
  
  const x1 = Math.max(box1.x, box2.x)
  const y1 = Math.max(box1.y, box2.y)
  const x2 = Math.min(box1.x + box1.w, box2.x + box2.w)
  const y2 = Math.min(box1.y + box1.h, box2.y + box2.h)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const area1 = box1.w * box1.h
  const area2 = box2.w * box2.h
  const union = area1 + area2 - intersection

  return intersection / union
}

// ─────────────────────────────────────────────────────────
// Exportações
// ─────────────────────────────────────────────────────────

export { MODEL_CONFIG, CLASS_MAP }
