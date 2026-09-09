import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertCircle, ScanFace } from 'lucide-react';
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { ExpressionMetricsSummary } from '../api/voiceInterview';

interface FacialExpressionTrackerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  onSummaryChange?: (summary: ExpressionMetricsSummary) => void;
}

type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MetricAccumulator {
  startedAt: number | null;
  lastSampleAt: number | null;
  sampleCount: number;
  trackedSampleCount: number;
  blinkCount: number;
  microExpressionCount: number;
  smileSum: number;
  smilePeak: number;
  mouthMovementSum: number;
  browTensionSum: number;
  gazeAversionSum: number;
  headMovementSum: number;
  intensitySum: number;
  intensitySquareSum: number;
  wasBlinking: boolean;
  previousIntensity: number | null;
  previousNose: { x: number; y: number; z: number } | null;
  lastMicroExpressionAt: number;
}

const MODEL_NAME = 'MediaPipe Face Landmarker (pretrained blendshape model)';
const INFERENCE_INTERVAL_MS = 160;
const SUMMARY_INTERVAL_MS = 5_000;

function createAccumulator(): MetricAccumulator {
  return {
    startedAt: null,
    lastSampleAt: null,
    sampleCount: 0,
    trackedSampleCount: 0,
    blinkCount: 0,
    microExpressionCount: 0,
    smileSum: 0,
    smilePeak: 0,
    mouthMovementSum: 0,
    browTensionSum: 0,
    gazeAversionSum: 0,
    headMovementSum: 0,
    intensitySum: 0,
    intensitySquareSum: 0,
    wasBlinking: false,
    previousIntensity: null,
    previousNose: null,
    lastMicroExpressionAt: 0,
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function score(scores: Map<string, number>, name: string) {
  return scores.get(name) ?? 0;
}

function averageScores(scores: Map<string, number>, names: string[]) {
  return average(names.map(name => score(scores, name)));
}

function extractScores(result: FaceLandmarkerResult) {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  return new Map(categories.map(category => [category.categoryName, category.score]));
}

function classifyFrame(result: FaceLandmarkerResult) {
  if (!result.faceLandmarks[0]) return ['未检测到人脸'];

  const scores = extractScores(result);
  const smile = averageScores(scores, ['mouthSmileLeft', 'mouthSmileRight']);
  const mouthMovement = clamp(
    score(scores, 'jawOpen') * 0.65
      + averageScores(scores, ['mouthFunnel', 'mouthPucker']) * 0.2
      + averageScores(scores, ['mouthStretchLeft', 'mouthStretchRight']) * 0.15
  );
  const browTension = averageScores(scores, ['browDownLeft', 'browDownRight']);
  const gazeAversion = clamp(
    averageScores(scores, [
      'eyeLookUpLeft', 'eyeLookUpRight',
      'eyeLookDownLeft', 'eyeLookDownRight',
      'eyeLookInLeft', 'eyeLookInRight',
      'eyeLookOutLeft', 'eyeLookOutRight',
    ]) * 1.7
  );
  const blink = averageScores(scores, ['eyeBlinkLeft', 'eyeBlinkRight']);
  const labels: string[] = [];

  if (blink >= 0.52) labels.push('眨眼');
  if (smile >= 0.18) labels.push(`微笑相关 ${Math.round(smile * 100)}%`);
  if (mouthMovement >= 0.18) labels.push('张嘴/说话');
  if (browTension >= 0.25) labels.push('眉部下压');
  if (gazeAversion >= 0.28) labels.push('视线偏移');
  if (labels.length === 0) labels.push('表情稳定');

  return labels;
}

const RAW_PREVIEW_NAMES = [
  'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeSquintLeft', 'eyeSquintRight',
  'mouthSmileLeft', 'mouthSmileRight',
  'jawOpen', 'browDownLeft', 'browDownRight',
  'eyeLookOutLeft', 'eyeLookOutRight',
];

function extractRawBlendshapes(result: FaceLandmarkerResult) {
  const scores = extractScores(result);
  return RAW_PREVIEW_NAMES
    .map(name => ({ name, score: score(scores, name) }))
    .sort((left, right) => right.score - left.score);
}

function updateAccumulator(accumulator: MetricAccumulator, result: FaceLandmarkerResult, now: number) {
  accumulator.sampleCount += 1;
  accumulator.startedAt ??= now;
  accumulator.lastSampleAt = now;

  const landmarks = result.faceLandmarks[0];
  if (!landmarks) {
    accumulator.previousNose = null;
    return;
  }

  accumulator.trackedSampleCount += 1;
  const scores = extractScores(result);
  const smile = averageScores(scores, ['mouthSmileLeft', 'mouthSmileRight']);
  const mouthMovement = clamp(
    score(scores, 'jawOpen') * 0.65
      + averageScores(scores, ['mouthFunnel', 'mouthPucker']) * 0.2
      + averageScores(scores, ['mouthStretchLeft', 'mouthStretchRight']) * 0.15
  );
  const browTension = averageScores(scores, ['browDownLeft', 'browDownRight']);
  const gazeAversion = clamp(
    averageScores(scores, [
      'eyeLookUpLeft', 'eyeLookUpRight',
      'eyeLookDownLeft', 'eyeLookDownRight',
      'eyeLookInLeft', 'eyeLookInRight',
      'eyeLookOutLeft', 'eyeLookOutRight',
    ]) * 1.7
  );
  const blink = averageScores(scores, ['eyeBlinkLeft', 'eyeBlinkRight']);
  const isBlinking = blink >= 0.52;

  if (isBlinking && !accumulator.wasBlinking) {
    accumulator.blinkCount += 1;
  }
  accumulator.wasBlinking = isBlinking;

  const intensity = average([smile, mouthMovement, browTension]);
  if (
    accumulator.previousIntensity !== null
    && Math.abs(intensity - accumulator.previousIntensity) >= 0.14
    && now - accumulator.lastMicroExpressionAt >= 350
  ) {
    // This is a temporal event detector over model blendshapes, not an emotion diagnosis.
    accumulator.microExpressionCount += 1;
    accumulator.lastMicroExpressionAt = now;
  }
  accumulator.previousIntensity = intensity;

  const nose = landmarks[1] ?? landmarks[4];
  let headMovement = 0;
  if (nose && accumulator.previousNose) {
    const distance = Math.hypot(
      (nose.x - accumulator.previousNose.x) * 2.4,
      (nose.y - accumulator.previousNose.y) * 2.4,
      (nose.z - accumulator.previousNose.z) * 0.35
    );
    headMovement = clamp(distance * 8);
  }
  accumulator.previousNose = nose ? { x: nose.x, y: nose.y, z: nose.z } : null;

  accumulator.smileSum += smile;
  accumulator.smilePeak = Math.max(accumulator.smilePeak, smile);
  accumulator.mouthMovementSum += mouthMovement;
  accumulator.browTensionSum += browTension;
  accumulator.gazeAversionSum += gazeAversion;
  accumulator.headMovementSum += headMovement;
  accumulator.intensitySum += intensity;
  accumulator.intensitySquareSum += intensity * intensity;
}

function buildSummary(accumulator: MetricAccumulator): ExpressionMetricsSummary {
  const tracked = Math.max(1, accumulator.trackedSampleCount);
  const durationSeconds = Math.max(
    0.1,
    ((accumulator.lastSampleAt ?? accumulator.startedAt ?? performance.now())
      - (accumulator.startedAt ?? performance.now())) / 1000
  );
  const trackingRatio = accumulator.sampleCount > 0
    ? accumulator.trackedSampleCount / accumulator.sampleCount
    : 0;
  const averageSmile = accumulator.smileSum / tracked;
  const averageMouthMovement = accumulator.mouthMovementSum / tracked;
  const averageBrowTension = accumulator.browTensionSum / tracked;
  const averageGazeAversion = accumulator.gazeAversionSum / tracked;
  const averageHeadMovement = accumulator.headMovementSum / tracked;
  const averageIntensity = accumulator.intensitySum / tracked;
  const expressionVariation = clamp(Math.sqrt(
    Math.max(0, accumulator.intensitySquareSum / tracked - averageIntensity * averageIntensity)
  ) * 3.2);
  const blinkRatePerMinute = accumulator.blinkCount / durationSeconds * 60;
  const eyeContactStability = 1 - averageGazeAversion;
  const headStability = 1 - averageHeadMovement;
  const naturalnessScore = Math.round(clamp(
    trackingRatio * 0.45 + eyeContactStability * 0.30 + headStability * 0.25,
    0,
    1
  ) * 100);

  const observedSignals: string[] = [];
  if (averageSmile >= 0.18) observedSignals.push('检测到轻度微笑相关动作');
  if (expressionVariation >= 0.12) observedSignals.push('表情变化较丰富');
  if (averageGazeAversion <= 0.20) observedSignals.push('视线方向相对稳定');
  if (averageGazeAversion >= 0.42) observedSignals.push('视线偏移较多');
  if (averageHeadMovement <= 0.16) observedSignals.push('头部姿态较稳定');
  if (averageHeadMovement >= 0.42) observedSignals.push('头部动作较明显');
  if (accumulator.microExpressionCount > 0) observedSignals.push('检测到短时表情变化事件');
  if (observedSignals.length === 0) observedSignals.push('当前没有形成稳定的视觉表达信号');

  return {
    model: MODEL_NAME,
    sampleCount: accumulator.sampleCount,
    trackedSampleCount: accumulator.trackedSampleCount,
    trackingRatio: Number(trackingRatio.toFixed(4)),
    durationSeconds: Number(durationSeconds.toFixed(2)),
    blinkCount: accumulator.blinkCount,
    blinkRatePerMinute: Number(blinkRatePerMinute.toFixed(2)),
    microExpressionCount: accumulator.microExpressionCount,
    averageSmile: Number(averageSmile.toFixed(4)),
    peakSmile: Number(accumulator.smilePeak.toFixed(4)),
    averageMouthMovement: Number(averageMouthMovement.toFixed(4)),
    averageBrowTension: Number(averageBrowTension.toFixed(4)),
    averageGazeAversion: Number(averageGazeAversion.toFixed(4)),
    averageHeadMovement: Number(averageHeadMovement.toFixed(4)),
    expressionVariation: Number(expressionVariation.toFixed(4)),
    naturalnessScore,
    observedSignals,
  };
}

export default function FacialExpressionTracker({
  videoRef,
  active,
  onSummaryChange,
}: FacialExpressionTrackerProps) {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [frameLabels, setFrameLabels] = useState<string[]>([]);
  const [rawBlendshapes, setRawBlendshapes] = useState<Array<{ name: string; score: number }>>([]);
  const accumulatorRef = useRef<MetricAccumulator>(createAccumulator());
  const callbackRef = useRef(onSummaryChange);

  useEffect(() => {
    callbackRef.current = onSummaryChange;
  }, [onSummaryChange]);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      setFrameLabels([]);
      setRawBlendshapes([]);
      return;
    }

    let cancelled = false;
    let landmarker: FaceLandmarker | null = null;
    let frameRequest: number | null = null;
    let lastInferenceAt = 0;
    let lastLabelUpdateAt = 0;
    const accumulator = accumulatorRef.current;

    const publishSummary = () => {
      if (accumulator.sampleCount > 0) {
        callbackRef.current?.(buildSummary(accumulator));
      }
    };

    const run = async () => {
      setStatus('loading');
      setError(null);
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        if (cancelled) return;

        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputFaceBlendshapes: true,
        });
        if (cancelled) return;

        setStatus('ready');
        const detectFrame = (now: number) => {
          if (cancelled) return;
          const video = videoRef.current;
          if (
            landmarker
            && video
            && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && now - lastInferenceAt >= INFERENCE_INTERVAL_MS
          ) {
            lastInferenceAt = now;
            try {
              const result = landmarker.detectForVideo(video, now);
              updateAccumulator(accumulator, result, now);
              if (now - lastLabelUpdateAt >= 320) {
                setFrameLabels(classifyFrame(result));
                setRawBlendshapes(extractRawBlendshapes(result));
                lastLabelUpdateAt = now;
              }
            } catch (detectionError) {
              console.debug('[FacialExpressionTracker] detection skipped', detectionError);
            }
          }
          frameRequest = requestAnimationFrame(detectFrame);
        };
        frameRequest = requestAnimationFrame(detectFrame);
      } catch (initializationError) {
        if (!cancelled) {
          setStatus('error');
          setError(initializationError instanceof Error ? initializationError.message : '模型加载失败');
        }
      }
    };

    const summaryTimer = window.setInterval(publishSummary, SUMMARY_INTERVAL_MS);
    void run();

    return () => {
      cancelled = true;
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      window.clearInterval(summaryTimer);
      publishSummary();
      landmarker?.close();
    };
  }, [active, videoRef]);

  if (!active || status === 'idle') return null;

  if (status === 'error') {
    return (
      <div className="absolute right-4 top-4 flex max-w-[80%] items-center gap-2 rounded-full bg-amber-950/75 px-3 py-1.5 text-[11px] text-amber-100 backdrop-blur">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>表情感知不可用{error ? `：${error}` : ''}</span>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-4 flex max-w-[calc(100%-2rem)] flex-col items-end gap-2">
      <div className="flex items-center gap-2 rounded-full bg-slate-950/65 px-3 py-1.5 text-[11px] text-white backdrop-blur">
        <ScanFace className={`h-3.5 w-3.5 ${status === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`} />
        <span>{status === 'ready' ? '本地微表情感知已开启' : '正在加载表情模型…'}</span>
      </div>
      {status === 'ready' && frameLabels.length > 0 && (
        <div className="flex max-w-full flex-wrap justify-end gap-1.5 rounded-2xl bg-slate-950/65 px-2.5 py-2 text-[11px] text-white backdrop-blur">
          <span className="font-medium text-cyan-200">实时标签</span>
          {frameLabels.map(label => (
            <span key={label} className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-cyan-50">
              {label}
            </span>
          ))}
        </div>
      )}
      {status === 'ready' && rawBlendshapes.length > 0 && (
        <div className="flex max-w-full flex-wrap justify-end gap-x-2 gap-y-1 rounded-2xl bg-slate-950/65 px-2.5 py-2 text-[10px] text-slate-200 backdrop-blur">
          <span className="font-medium text-amber-200">原始模型输出</span>
          {rawBlendshapes.map(({ name, score: value }) => (
            <span key={name} className="whitespace-nowrap">
              {name}={value.toFixed(2)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
