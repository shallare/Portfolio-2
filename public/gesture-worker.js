/**
 * Gesture Recognition Web Worker - Using MediaPipe Hands (Legacy)
 * Works reliably with importScripts in Web Workers
 * Provides 21 hand landmarks compatible with HandLandmarker format
 */

// MediaPipe Hands globals (loaded via importScripts)
let Hands = null;

// Configuration
let config = {
  modelComplexity: 1,
  maxNumHands: 1,
  minDetectionConfidence: 0.5,  // Lowered for debugging
  minTrackingConfidence: 0.3,   // Lowered for debugging
  cameraWidth: 640,
  cameraHeight: 480,
  mirrorHorizontal: true,
  controlRegionRatio: 0.8,
  fingerExtensionThreshold: 0.04,
  thumbExtensionThreshold: 0.04,
  pinchThreshold: 0.06,
  gestureHoldFrames: 3,
  gestureTransitionDelay: 5,
};

// Diagnostics state
let diagState = {
  workerLoaded: false,
  mediapipeLoaded: false,
  handsCreated: false,
  handsInitialized: false,
  framesReceived: 0,
  framesProcessed: 0,
  resultsReceived: 0,
  lastError: null,
  lastTimestamp: 0,
};

// Landmark indices (MediaPipe standard - same as HandLandmarker)
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];  // For reference

// Gesture types (priority order)
const GestureType = {
  NEUTRAL: 0,
  CURSOR: 1,    // Index only
  SCROLL: 2,    // Index + Middle
  CLICK: 3,     // Pinch thumb-index
  STOP: 4       // 5 fingers open (highest priority)
};

const GestureNames = ['NEUTRAL', 'CURSOR', 'SCROLL', 'CLICK', 'STOP'];

// State for gesture recognition
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
  handedness: 'Right',  // Track handedness for thumb detection
};

let hands = null;

// Initialize MediaPipe Hands
async function initMediaPipeHands() {
  try {
    console.log('[Worker] Creating Hands instance...');
    diagState.handsCreated = true;
    sendDiagUpdate();

    hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: config.maxNumHands,
      modelComplexity: config.modelComplexity,
      minDetectionConfidence: config.minDetectionConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    });

    hands.onResults(onHandsResults);

    console.log('[Worker] Hands initialized successfully');
    diagState.handsInitialized = true;
    sendDiagUpdate();
    postMessage({ type: 'READY' });
  } catch (error) {
    console.error('[Worker] Hands init error:', error);
    diagState.lastError = error.message;
    sendDiagUpdate();
    postMessage({ type: 'ERROR', error: error.message, stack: error.stack });
  }
}

function sendDiagUpdate() {
  postMessage({
    type: 'DIAG_UPDATE',
    data: { ...diagState }
  });
}

// Process hands results
function onHandsResults(results) {
  const timestamp = results.timestamp || Date.now();
  diagState.resultsReceived++;
  diagState.lastTimestamp = timestamp;
  sendDiagUpdate();

  console.log('[Worker] onHandsResults called', {
    hasLandmarks: !!results.multiHandLandmarks,
    handCount: results.multiHandLandmarks?.length || 0,
    timestamp
  });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0]; // First hand
    let handedness = results.multiHandedness?.[0]?.label || 'Right';

    // CRITICAL FIX: Front camera produces mirrored image
    // MediaPipe sees mirrored image → handedness is swapped, landmarks are mirrored
    // We must flip both to get user's actual perspective
    handedness = handedness === 'Left' ? 'Right' : 'Left';

    // Convert to same format as HandLandmarker, MIRROR X for user perspective
    const formattedLandmarks = landmarks.map(lm => ({
      x: 1 - lm.x,  // Un-mirror: camera is mirrored, so flip x
      y: lm.y,
      z: lm.z
    }));

    // Update handedness for thumb detection
    gestureState.handedness = handedness;

    // Classify gesture
    const fingerStates = getFingerStates(formattedLandmarks, handedness);
    const extendedCount = fingerStates.filter(s => s).length;
    const pinchDistance = getPinchDistance(formattedLandmarks);

    const rawGesture = classifyRawGesture(fingerStates, extendedCount, pinchDistance);
    const finalGesture = applyPriorityAndHysteresis(rawGesture, pinchDistance);

    // Update state and get info
    const gestureInfo = updateGestureState(finalGesture, formattedLandmarks, fingerStates, pinchDistance);

    // Debug logging
    console.log('[Worker] Gesture:', GestureNames[finalGesture], '| Fingers:', fingerStates, '| Extended:', extendedCount, '| Pinch:', pinchDistance.toFixed(3), '| Hand:', handedness);

    // Send results to main thread
    postMessage({
      type: 'RESULTS',
      timestamp,
      landmarks: formattedLandmarks,
      handedness,
      gestureInfo
    });
  } else {
    // No hand detected
    postMessage({
      type: 'NO_HAND',
      timestamp
    });
  }
}

// Calculate finger states from landmarks
function getFingerStates(landmarks, handedness) {
  if (!landmarks || landmarks.length !== 21) {
    return [false, false, false, false, false];
  }

  const fingerStates = [];

  // Thumb detection using handedness
  // For Right hand (facing camera): thumb extended = tip.x < IP.x (points left)
  // For Left hand (facing camera): thumb extended = tip.x > IP.x (points right)
  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const thumbMCP = landmarks[2];
  const wrist = landmarks[0];
  const indexMCP = landmarks[5];

  // Determine thumb extension direction based on handedness
  // MediaPipe Hands returns "Left" or "Right" from camera perspective
  // For a right hand facing camera, thumb extends toward negative x
  // For a left hand facing camera, thumb extends toward positive x
  const isRightHand = handedness === 'Right';
  const thumbExtended = isRightHand
    ? (thumbTip.x < thumbIP.x - config.thumbExtensionThreshold)  // Right hand: tip left of IP
    : (thumbTip.x > thumbIP.x + config.thumbExtensionThreshold); // Left hand: tip right of IP

  // Additional check: thumb should be away from palm (index MCP)
  const thumbAwayFromPalm = isRightHand
    ? (thumbTip.x < indexMCP.x - 0.02)
    : (thumbTip.x > indexMCP.x + 0.02);

  fingerStates.push(thumbExtended && thumbAwayFromPalm);

  // Other fingers: tip higher (smaller y) than PIP by threshold
  // Landmarks are normalized 0-1, y=0 is top
  for (let i = 1; i < 5; i++) {
    const tip = landmarks[FINGER_TIPS[i]];
    const pip = landmarks[FINGER_PIPS[i]];
    const mcp = landmarks[FINGER_MCPS[i]];

    // Finger extended if tip is significantly above PIP
    // Also check tip is above MCP for robustness
    const extended = (tip.y < pip.y - config.fingerExtensionThreshold) &&
                     (tip.y < mcp.y - config.fingerExtensionThreshold * 0.5);
    fingerStates.push(extended);
  }

  return fingerStates;
}

// Calculate pinch distance (normalized)
function getPinchDistance(landmarks) {
  if (!landmarks || landmarks.length !== 21) return 1.0;

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];

  const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

  // Hand size reference: wrist to middle MCP
  const wrist = landmarks[0];
  const middleMCP = landmarks[9];
  const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y) + 1e-6;

  return pinchDist / handSize;
}

// Get hand center (palm)
function getHandCenter(landmarks) {
  if (!landmarks || landmarks.length !== 21) return { x: 0.5, y: 0.5 };

  const wrist = landmarks[0];
  const middleMCP = landmarks[9];

  return {
    x: (wrist.x + middleMCP.x) / 2,
    y: (wrist.y + middleMCP.y) / 2
  };
}

// Get index finger tip
function getIndexTip(landmarks) {
  if (!landmarks || landmarks.length !== 21) return { x: 0.5, y: 0.5 };

  const tip = landmarks[8];
  return { x: tip.x, y: tip.y };
}

// Classify raw gesture (before priority/hysteresis)
function classifyRawGesture(fingerStates, extendedCount, pinchDistance) {
  const isPinch = pinchDistance < config.pinchThreshold;

  // Priority 1: STOP - All 5 fingers open
  if (extendedCount >= 5) {
    return GestureType.STOP;
  }

  // Priority 2: CLICK - Pinch detected with index extended
  if (isPinch && fingerStates[1]) {
    return GestureType.CLICK;
  }

  // Priority 3: SCROLL - Index + Middle extended (only these two)
  if (extendedCount === 2 && fingerStates[1] && fingerStates[2] && !fingerStates[0] && !fingerStates[3] && !fingerStates[4]) {
    return GestureType.SCROLL;
  }

  // Priority 4: CURSOR - Only index extended
  if (extendedCount === 1 && fingerStates[1]) {
    return GestureType.CURSOR;
  }

  return GestureType.NEUTRAL;
}

// Apply priority and hysteresis
function applyPriorityAndHysteresis(rawGesture, pinchDistance) {
  // STOP always wins
  if (rawGesture === GestureType.STOP) {
    return GestureType.STOP;
  }

  // If currently STOP, only exit after transition delay
  if (gestureState.currentGesture === GestureType.STOP) {
    if (rawGesture !== GestureType.STOP) {
      gestureState.transitionDelay++;
      if (gestureState.transitionDelay >= config.gestureTransitionDelay) {
        gestureState.transitionDelay = 0;
        return rawGesture;
      }
    } else {
      gestureState.transitionDelay = 0;
    }
    return GestureType.STOP;
  }

  // CLICK beats SCROLL and CURSOR
  if (rawGesture === GestureType.CLICK) {
    if ([GestureType.SCROLL, GestureType.CURSOR].includes(gestureState.currentGesture)) {
      return GestureType.CLICK;
    }
    return checkHold(GestureType.CLICK);
  }

  // SCROLL beats CURSOR and NEUTRAL
  if (rawGesture === GestureType.SCROLL) {
    if ([GestureType.CURSOR, GestureType.NEUTRAL].includes(gestureState.currentGesture)) {
      return GestureType.SCROLL;
    }
    return gestureState.currentGesture; // Don't interrupt CLICK
  }

  // CURSOR only beats NEUTRAL
  if (rawGesture === GestureType.CURSOR) {
    if (gestureState.currentGesture === GestureType.NEUTRAL) {
      return checkHold(GestureType.CURSOR);
    }
    return gestureState.currentGesture;
  }

  // NEUTRAL - only transition after hold
  return checkHold(GestureType.NEUTRAL);
}

// Check hold frames for gesture transition
function checkHold(targetGesture) {
  if (targetGesture === gestureState.currentGesture) {
    gestureState.holdFrames++;
    gestureState.transitionDelay = 0;
    return targetGesture;
  }

  gestureState.holdFrames++;
  if (gestureState.holdFrames >= config.gestureHoldFrames) {
    gestureState.holdFrames = 0;
    gestureState.transitionDelay = 0;
    return targetGesture;
  }

  return gestureState.currentGesture;
}

// Update gesture state
function updateGestureState(gesture, landmarks, fingerStates, pinchDistance) {
  const prevGesture = gestureState.currentGesture;

  if (gesture !== gestureState.currentGesture) {
    gestureState.previousGesture = gestureState.currentGesture;
    gestureState.holdFrames = 0;
    gestureState.transitionDelay = 0;
  }

  gestureState.currentGesture = gesture;

  if (landmarks) {
    gestureState.fingerStates = fingerStates;
    gestureState.pinchDistance = pinchDistance;
    gestureState.handCenter = getHandCenter(landmarks);
    gestureState.indexTip = getIndexTip(landmarks);

    // Calculate scroll velocity for SCROLL gesture
    if (gesture === GestureType.SCROLL) {
      const dy = gestureState.handCenter.y - gestureState.prevHandCenter.y;
      gestureState.scrollVelocity = -dy * 3.0;
      gestureState.scrollVelocity = gestureState.scrollVelocity * 0.7 + gestureState.scrollVelocity * 0.3;
    }

    gestureState.prevHandCenter = { ...gestureState.handCenter };
  }

  return {
    gesture: GestureNames[gesture],
    previousGesture: GestureNames[gestureState.previousGesture],
    fingerStates: gestureState.fingerStates,
    extendedCount: gestureState.fingerStates.filter(s => s).length,
    pinchDistance: gestureState.pinchDistance,
    handCenter: gestureState.handCenter,
    indexTip: gestureState.indexTip,
    scrollVelocity: gestureState.scrollVelocity,
    isClickTriggered: gesture === GestureType.CLICK && prevGesture !== GestureType.CLICK,
    isClickReleased: gesture !== GestureType.CLICK && prevGesture === GestureType.CLICK,
    isStopTriggered: gesture === GestureType.STOP && prevGesture !== GestureType.STOP,
    handedness: gestureState.handedness,
  };
}

// Process video frame - send to MediaPipe Hands
async function processFrame(imageData, timestamp) {
  diagState.framesReceived++;
  sendDiagUpdate();

  if (!hands) {
    diagState.lastError = 'Hands not initialized';
    sendDiagUpdate();
    postMessage({ type: 'ERROR', error: 'Hands not initialized' });
    return;
  }

  try {
    console.log('[Worker] Sending frame to MediaPipe', { width: imageData.width, height: imageData.height, timestamp });

    // Send ImageData directly to MediaPipe Hands (supports ImageData natively)
    await hands.send({ image: imageData, timestamp });

    diagState.framesProcessed++;
    sendDiagUpdate();
  } catch (error) {
    console.error('[Worker] Processing error:', error);
    diagState.lastError = error.message;
    sendDiagUpdate();
    postMessage({ type: 'ERROR', error: error.message, stack: error.stack });
  }
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'INIT':
      config = { ...config, ...data.config };
      try {
        console.log('[Worker] Loading MediaPipe Hands...');
        importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js');

        Hands = self.Hands;

        if (!Hands) {
          throw new Error('MediaPipe Hands not found after importScripts');
        }

        diagState.mediapipeLoaded = true;
        sendDiagUpdate();

        console.log('[Worker] MediaPipe Hands loaded, initializing...');
        await initMediaPipeHands();
        console.log('[Worker] Hands initialized successfully');
      } catch (error) {
        console.error('[Worker] INIT error:', error);
        diagState.lastError = error.message;
        sendDiagUpdate();
        postMessage({ type: 'ERROR', error: error.message, stack: error.stack });
      }
      break;

    case 'PROCESS_FRAME':
      await processFrame(data.imageData, data.timestamp);
      break;

    case 'UPDATE_CONFIG':
      config = { ...config, ...data.config };
      if (hands) {
        hands.setOptions({
          maxNumHands: config.maxNumHands,
          modelComplexity: config.modelComplexity,
          minDetectionConfidence: config.minDetectionConfidence,
          minTrackingConfidence: config.minTrackingConfidence,
        });
      }
      break;

    case 'RESET':
      gestureState = {
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
      break;

    case 'STOP':
      if (hands) {
        hands.close();
      }
      self.close();
      break;

    case 'GET_DIAG':
      sendDiagUpdate();
      break;
  }
};

// Signal ready
postMessage({ type: 'WORKER_LOADED' });