/**
 * Gesture Recognition Web Worker - MediaPipe Tasks Vision HandLandmarker
 * Modern API (2024+) - Works reliably in Web Workers with WASM
 * Replaces legacy @mediapipe/hands
 */

// Configuration
let config = {
  maxNumHands: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.5,
  cameraWidth: 640,
  cameraHeight: 480,
  mirrorHorizontal: true,
  controlRegionRatio: 0.8,
  fingerExtensionThreshold: 0.035,
  thumbExtensionThreshold: 0.035,
  pinchThreshold: 0.08,
  gestureHoldFrames: 2,
  gestureTransitionDelay: 3,
};

// Diagnostics
let diagState = {
  workerLoaded: false,
  visionLoaded: false,
  landmarkerCreated: false,
  landmarkerInitialized: false,
  framesReceived: 0,
  framesProcessed: 0,
  resultsReceived: 0,
  lastError: null,
  lastTimestamp: 0,
};

// Landmark indices (21 landmarks)
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];

const GestureType = {
  NEUTRAL: 0, CURSOR: 1, SCROLL: 2, CLICK: 3, STOP: 4
};
const GestureNames = ['NEUTRAL', 'CURSOR', 'SCROLL', 'CLICK', 'STOP'];

let gestureState = {
  currentGesture: GestureType.NEUTRAL,
  previousGesture: GestureType.NEUTRAL,
  holdFrames: 0,
  transitionDelay: 0,
  fingerStates: [false, false, false, false, false],
  pinchDistance: 1.0,
  handCenter: { x: 0.5, y: 0.5 },
  indexTip: { x: 0.5, y: 0.5 },
  scrollVelocity: 0,
  prevHandCenter: { x: 0.5, y: 0.5 },
  timestamp: 0,
  handedness: 'Right',
};

let handLandmarker = null;
let vision = null;

async function initHandLandmarker() {
  try {
    console.log('[Worker] Loading MediaPipe Tasks Vision...');
    diagState.visionLoaded = true;
    sendDiagUpdate();

    // Use the vision_bundle.mjs ES module bundle
    const visionModule = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs'
    );
    const { HandLandmarker, FilesetResolver } = visionModule;
    vision = { HandLandmarker, FilesetResolver };

    console.log('[Worker] Initializing HandLandmarker...');
    diagState.landmarkerCreated = true;
    sendDiagUpdate();

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: config.maxNumHands,
      minHandDetectionConfidence: config.minDetectionConfidence,
      minHandPresenceConfidence: config.minTrackingConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    });

    console.log('[Worker] HandLandmarker ready');
    diagState.landmarkerInitialized = true;
    sendDiagUpdate();
    postMessage({ type: 'READY', data: {} });
  } catch (error) {
    console.error('[Worker] Init error:', error);
    diagState.lastError = error.message;
    sendDiagUpdate();
    postMessage({ type: 'ERROR', data: { error: error.message, stack: error.stack } });
  }
}

function sendDiagUpdate() {
  postMessage({ type: 'DIAG_UPDATE', data: { ...diagState } });
}

function onResults(results, timestamp) {
  diagState.resultsReceived++;
  diagState.lastTimestamp = timestamp;
  sendDiagUpdate();

  console.log('[Worker] Results:', { hands: results.landmarks?.length || 0, timestamp });

  if (results.landmarks && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];
    const handedness = results.handedness?.[0]?.[0]?.categoryName || 'Right';
    const correctedHandedness = handedness === 'Left' ? 'Right' : 'Left';

    const formattedLandmarks = landmarks.map(lm => ({
      x: lm.x, y: lm.y, z: lm.z
    }));

    gestureState.handedness = correctedHandedness;
    const fingerStates = getFingerStates(formattedLandmarks, correctedHandedness);
    const extendedCount = fingerStates.filter(s => s).length;
    const pinchDistance = getPinchDistance(formattedLandmarks);
    const rawGesture = classifyRawGesture(fingerStates, extendedCount, pinchDistance);
    const finalGesture = applyPriorityAndHysteresis(rawGesture, pinchDistance);
    const gestureInfo = updateGestureState(finalGesture, formattedLandmarks, fingerStates, pinchDistance);

    console.log('[Worker] Gesture:', GestureNames[finalGesture], '| Extended:', extendedCount, '| Pinch:', pinchDistance.toFixed(3));

    postMessage({
      type: 'RESULTS',
      data: { timestamp, landmarks: formattedLandmarks, handedness: correctedHandedness, gestureInfo }
    });
  } else {
    postMessage({ type: 'NO_HAND', data: { timestamp } });
  }
}

function getFingerStates(landmarks, handedness) {
  if (!landmarks || landmarks.length !== 21) return [false, false, false, false, false];

  const fingerStates = [];
  const thumbTip = landmarks[4], thumbIP = landmarks[3], indexMCP = landmarks[5];
  const isRightHand = handedness === 'Right';

  const thumbExtended = isRightHand
    ? (thumbTip.x < thumbIP.x - config.thumbExtensionThreshold)
    : (thumbTip.x > thumbIP.x + config.thumbExtensionThreshold);
  const thumbAwayFromPalm = isRightHand
    ? (thumbTip.x < indexMCP.x - 0.02)
    : (thumbTip.x > indexMCP.x + 0.02);
  fingerStates.push(thumbExtended && thumbAwayFromPalm);

  for (let i = 1; i < 5; i++) {
    const tip = landmarks[FINGER_TIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];
    const mcp = landmarks[FINGER_MCPS[i]];
    fingerStates.push((tip.y < pip.y - config.fingerExtensionThreshold) &&
                      (tip.y < mcp.y - config.fingerExtensionThreshold * 0.5));
  }
  return fingerStates;
}

function getPinchDistance(landmarks) {
  if (!landmarks || landmarks.length !== 21) return 1.0;
  const pinchDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
  const handSize = Math.hypot(landmarks[9].x - landmarks[0].x, landmarks[9].y - landmarks[0].y) + 1e-6;
  return pinchDist / handSize;
}

function getHandCenter(landmarks) {
  if (!landmarks || landmarks.length !== 21) return { x: 0.5, y: 0.5 };
  return { x: (landmarks[0].x + landmarks[9].x) / 2, y: (landmarks[0].y + landmarks[9].y) / 2 };
}

function getIndexTip(landmarks) {
  if (!landmarks || landmarks.length !== 21) return { x: 0.5, y: 0.5 };
  return { x: landmarks[8].x, y: landmarks[8].y };
}

function classifyRawGesture(fingerStates, extendedCount, pinchDistance) {
  const isPinch = pinchDistance < config.pinchThreshold;
  if (extendedCount >= 5) return GestureType.STOP;
  if (isPinch && fingerStates[1]) return GestureType.CLICK;
  if (extendedCount === 2 && fingerStates[1] && fingerStates[2] && !fingerStates[0] && !fingerStates[3] && !fingerStates[4]) return GestureType.SCROLL;
  if (extendedCount === 1 && fingerStates[1]) return GestureType.CURSOR;
  return GestureType.NEUTRAL;
}

function applyPriorityAndHysteresis(rawGesture, pinchDistance) {
  if (rawGesture === GestureType.STOP) return GestureType.STOP;
  if (gestureState.currentGesture === GestureType.STOP) {
    if (rawGesture !== GestureType.STOP) {
      gestureState.transitionDelay++;
      if (gestureState.transitionDelay >= config.gestureTransitionDelay) { gestureState.transitionDelay = 0; return rawGesture; }
    } else gestureState.transitionDelay = 0;
    return GestureType.STOP;
  }
  if (rawGesture === GestureType.CLICK) {
    if ([GestureType.SCROLL, GestureType.CURSOR].includes(gestureState.currentGesture)) return GestureType.CLICK;
    return checkHold(GestureType.CLICK);
  }
  if (rawGesture === GestureType.SCROLL) {
    if ([GestureType.CURSOR, GestureType.NEUTRAL].includes(gestureState.currentGesture)) return GestureType.SCROLL;
    return gestureState.currentGesture;
  }
  if (rawGesture === GestureType.CURSOR) {
    if (gestureState.currentGesture === GestureType.NEUTRAL) return checkHold(GestureType.CURSOR);
    return gestureState.currentGesture;
  }
  return checkHold(GestureType.NEUTRAL);
}

function checkHold(targetGesture) {
  if (targetGesture === gestureState.currentGesture) { gestureState.holdFrames++; gestureState.transitionDelay = 0; return targetGesture; }
  gestureState.holdFrames++;
  if (gestureState.holdFrames >= config.gestureHoldFrames) { gestureState.holdFrames = 0; gestureState.transitionDelay = 0; return targetGesture; }
  return gestureState.currentGesture;
}

function updateGestureState(gesture, landmarks, fingerStates, pinchDistance) {
  const prevGesture = gestureState.currentGesture;
  if (gesture !== gestureState.currentGesture) { gestureState.previousGesture = gestureState.currentGesture; gestureState.holdFrames = 0; gestureState.transitionDelay = 0; }
  gestureState.currentGesture = gesture;

  if (landmarks) {
    gestureState.fingerStates = fingerStates;
    gestureState.pinchDistance = pinchDistance;
    gestureState.handCenter = getHandCenter(landmarks);
    gestureState.indexTip = getIndexTip(landmarks);
    if (gesture === GestureType.SCROLL) {
      const dy = gestureState.handCenter.y - gestureState.prevHandCenter.y;
      gestureState.scrollVelocity = dy * 3.0;
      gestureState.scrollVelocity = gestureState.scrollVelocity * 0.7 + gestureState.scrollVelocity * 0.3;
    }
    gestureState.prevHandCenter = { ...gestureState.handCenter };
  }
  return {
    gesture: GestureNames[gesture], previousGesture: GestureNames[gestureState.previousGesture],
    fingerStates: gestureState.fingerStates, extendedCount: gestureState.fingerStates.filter(s => s).length,
    pinchDistance: gestureState.pinchDistance, handCenter: gestureState.handCenter,
    indexTip: gestureState.indexTip, scrollVelocity: gestureState.scrollVelocity,
    isClickTriggered: gesture === GestureType.CLICK && prevGesture !== GestureType.CLICK,
    isClickReleased: gesture !== GestureType.CLICK && prevGesture === GestureType.CLICK,
    isStopTriggered: gesture === GestureType.STOP && prevGesture !== GestureType.STOP,
    handedness: gestureState.handedness,
  };
}

async function processFrame(imageData, timestamp) {
  diagState.framesReceived++; sendDiagUpdate();
  if (!handLandmarker) { postMessage({ type: 'ERROR', data: { error: 'Not initialized' } }); return; }

  try {
    const imageBitmap = await createImageBitmap(imageData);
    const results = handLandmarker.detectForVideo(imageBitmap, timestamp);
    imageBitmap.close();
    onResults(results, timestamp);
    diagState.framesProcessed++; sendDiagUpdate();
  } catch (error) {
    console.error('[Worker] Error:', error);
    diagState.lastError = error.message; sendDiagUpdate();
    postMessage({ type: 'ERROR', data: { error: error.message, stack: error.stack } });
  }
}

self.onmessage = async (event) => {
  const { type, data } = event.data;
  switch (type) {
    case 'INIT': config = { ...config, ...data.config }; await initHandLandmarker(); break;
    case 'PROCESS_FRAME': await processFrame(data.imageData, data.timestamp); break;
    case 'UPDATE_CONFIG': config = { ...config, ...data.config }; break;
    case 'RESET': gestureState = { currentGesture: GestureType.NEUTRAL, previousGesture: GestureType.NEUTRAL, holdFrames: 0, transitionDelay: 0, fingerStates: [false, false, false, false, false], pinchDistance: 1.0, handCenter: { x: 0.5, y: 0.5 }, indexTip: { x: 0.5, y: 0.5 }, scrollVelocity: 0, prevHandCenter: { x: 0.5, y: 0.5 }, timestamp: 0, handedness: 'Right' }; break;
    case 'STOP': if (handLandmarker) { handLandmarker.close(); handLandmarker = null; } self.close(); break;
    case 'GET_DIAG': sendDiagUpdate(); break;
  }
};

postMessage({ type: 'WORKER_LOADED', data: {} });