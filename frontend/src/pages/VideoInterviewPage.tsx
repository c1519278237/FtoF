import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, PhoneOff, AlertCircle, Camera, ArrowLeft, SendHorizonal, Video, VideoOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AudioRecorder from '../components/AudioRecorder';
import InterviewPageHeader from '../components/InterviewPageHeader';
import RealtimeSubtitle from '../components/RealtimeSubtitle';
import VideoInterviewLiveScorePanel from '../components/VideoInterviewLiveScorePanel';
import { skillApi, type SkillDTO } from '../api/skill';
import { getTemplateName } from '../utils/voiceInterview';
import {
  voiceInterviewApi,
  connectWebSocket,
  VoiceInterviewWebSocket,
  type LiveEvaluationSnapshot,
} from '../api/voiceInterview';

interface VideoInterviewEntryState {
  videoConfig?: {
    skillId: string;
    difficulty?: string;
    plannedDuration: number;
    resumeId?: number;
    llmProvider?: string;
  };
}

export default function VideoInterviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const entryState = (location.state as VideoInterviewEntryState | null) || {};
  const presetVideoConfig = entryState.videoConfig;
  const queryParams = new URLSearchParams(location.search);
  const urlSkillId = queryParams.get('skillId') || undefined;
  const effectiveSkillId = presetVideoConfig?.skillId ?? urlSkillId ?? 'java-backend';

  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('INTRO');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; id: string }[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [aiAudio, setAiAudio] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveEvaluation, setLiveEvaluation] = useState<LiveEvaluationSnapshot | null>(null);
  const [liveEvaluationLoading, setLiveEvaluationLoading] = useState(false);
  const [liveEvaluationRefreshing, setLiveEvaluationRefreshing] = useState(false);

  const [skills, setSkills] = useState<SkillDTO[]>([]);

  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<VoiceInterviewWebSocket | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const endedByUserRef = useRef(false);
  const autoStartRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const lastAiCommittedTextRef = useRef('');
  const pendingAiTextCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunkQueueRef = useRef<AudioBuffer[]>([]);
  const isChunkPlayingRef = useRef(false);
  const chunkPlaybackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const drainCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTextRef = useRef('');
  const liveEvaluationRequestSeqRef = useRef(0);
  const pendingEvaluationRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveEvaluationAwaitingTurnRef = useRef(false);

  useEffect(() => {
    aiTextRef.current = aiText;
  }, [aiText]);

  const setAiSpeaking = useCallback((value: boolean) => {
    isAiSpeakingRef.current = value;
    setIsAiSpeaking(value);
  }, []);

  const clearPendingAiTextCommit = useCallback(() => {
    if (pendingAiTextCommitRef.current) {
      clearTimeout(pendingAiTextCommitRef.current);
      pendingAiTextCommitRef.current = null;
    }
  }, []);

  const clearPendingEvaluationRefresh = useCallback(() => {
    if (pendingEvaluationRefreshRef.current) {
      clearTimeout(pendingEvaluationRefreshRef.current);
      pendingEvaluationRefreshRef.current = null;
    }
  }, []);

  const appendMessage = useCallback((role: 'user' | 'ai', rawText: string, idPrefix: string) => {
    const normalized = (rawText || '').trim();
    if (!normalized) {
      return;
    }
    setMessages(prev => {
      const lastSameRole = [...prev].reverse().find(msg => msg.role === role);
      if (lastSameRole?.text.trim() === normalized) {
        return prev;
      }
      return [
        ...prev,
        { role, text: normalized, id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
      ];
    });
  }, []);

  const fetchLiveEvaluation = useCallback(async (targetSessionId: number, mode: 'initial' | 'refresh' = 'refresh') => {
    const requestSeq = ++liveEvaluationRequestSeqRef.current;
    if (mode === 'initial') {
      setLiveEvaluationLoading(true);
    } else {
      setLiveEvaluationRefreshing(true);
    }

    try {
      const snapshot = await voiceInterviewApi.getLiveEvaluation(targetSessionId);
      if (liveEvaluationRequestSeqRef.current !== requestSeq) {
        return;
      }
      setLiveEvaluation(snapshot);
    } catch (evaluationError) {
      console.error('Failed to load live evaluation snapshot:', evaluationError);
    } finally {
      if (liveEvaluationRequestSeqRef.current === requestSeq) {
        if (mode === 'initial') {
          setLiveEvaluationLoading(false);
        }
        setLiveEvaluationRefreshing(false);
      }
    }
  }, []);

  const scheduleLiveEvaluationRefresh = useCallback((targetSessionId: number, delayMs = 1600) => {
    clearPendingEvaluationRefresh();
    pendingEvaluationRefreshRef.current = setTimeout(() => {
      pendingEvaluationRefreshRef.current = null;
      fetchLiveEvaluation(targetSessionId, 'refresh');
    }, delayMs);
  }, [clearPendingEvaluationRefresh, fetchLiveEvaluation]);

  const commitAiMessage = useCallback((rawText: string) => {
    const normalized = (rawText || '').trim();
    if (!normalized || normalized === lastAiCommittedTextRef.current) {
      return;
    }
    appendMessage('ai', normalized, 'ai');
    lastAiCommittedTextRef.current = normalized;
    setAiText(prev => prev?.trim() === normalized ? '' : prev);
    if (liveEvaluationAwaitingTurnRef.current && sessionId) {
      liveEvaluationAwaitingTurnRef.current = false;
      scheduleLiveEvaluationRefresh(sessionId);
    }
  }, [appendMessage, scheduleLiveEvaluationRefresh, sessionId]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback(() => {
    if (chunkQueueRef.current.length === 0) {
      isChunkPlayingRef.current = false;
      return;
    }
    isChunkPlayingRef.current = true;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const buffer = chunkQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    chunkPlaybackSourceRef.current = source;
    source.onended = () => {
      chunkPlaybackSourceRef.current = null;
      playNextChunk();
    };
    source.start(0);
  }, [getAudioContext]);

  const handleAudioChunk = useCallback((base64Wav: string, _index: number, isLast: boolean) => {
    try {
      const binaryStr = atob(base64Wav);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const pcmOffset = 44;
      const pcmData = new Int16Array(bytes.buffer, pcmOffset, (bytes.length - pcmOffset) / 2);
      const float32 = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32[i] = pcmData[i] / 32768.0;
      }

      const ctx = getAudioContext();
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      chunkQueueRef.current.push(audioBuffer);
      if (!isChunkPlayingRef.current) {
        playNextChunk();
      }

      setAiSpeaking(true);

      if (isLast) {
        const startedAt = Date.now();
        const MAX_DRAIN_WAIT_MS = 30_000;
        if (drainCheckRef.current) {
          clearInterval(drainCheckRef.current);
        }
        drainCheckRef.current = setInterval(() => {
          if (chunkQueueRef.current.length === 0 && !isChunkPlayingRef.current) {
            clearInterval(drainCheckRef.current!);
            drainCheckRef.current = null;
            setAiSpeaking(false);
            setIsSubmitting(false);
            clearPendingAiTextCommit();
            commitAiMessage(aiTextRef.current.trim());
            setAiText('');
          } else if (Date.now() - startedAt > MAX_DRAIN_WAIT_MS) {
            clearInterval(drainCheckRef.current!);
            drainCheckRef.current = null;
            setAiSpeaking(false);
            setIsSubmitting(false);
          }
        }, 100);
      }
    } catch (e) {
      console.error('[ChunkAudio] Decode/play error:', e);
    }
  }, [getAudioContext, playNextChunk, clearPendingAiTextCommit, commitAiMessage, setAiSpeaking]);

  useEffect(() => {
    skillApi.listSkills().then(setSkills).catch(console.error);
  }, []);

  useEffect(() => {
    if (skills.length > 0 && effectiveSkillId) {
      setTemplateName(getTemplateName(effectiveSkillId, skills));
    }
  }, [skills, effectiveSkillId]);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraState('active');
    } catch (cameraOpenError) {
      setCameraState('error');
      setCameraError(cameraOpenError instanceof Error ? cameraOpenError.message : '摄像头打开失败');
    }
  }, []);

  useEffect(() => {
    if (presetVideoConfig && cameraState === 'idle') {
      startCamera().catch(() => {});
    }
  }, [cameraState, presetVideoConfig, startCamera]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      chunkPlaybackSourceRef.current?.stop();
      audioContextRef.current?.close();
      if (drainCheckRef.current) {
        clearInterval(drainCheckRef.current);
        drainCheckRef.current = null;
      }
      clearPendingAiTextCommit();
      clearPendingEvaluationRefresh();
      stopCamera();
      const currentSessionId = sessionId;
      if (currentSessionId && !endedByUserRef.current) {
        voiceInterviewApi.pauseSession(currentSessionId).catch(() => {});
      }
    };
  }, [clearPendingAiTextCommit, clearPendingEvaluationRefresh, sessionId, stopCamera]);

  useEffect(() => {
    if (!sessionId) {
      setLiveEvaluation(null);
      setLiveEvaluationLoading(false);
      setLiveEvaluationRefreshing(false);
      return;
    }

    fetchLiveEvaluation(sessionId, 'initial');
  }, [fetchLiveEvaluation, sessionId]);

  useEffect(() => {
    if (sessionId && connectionStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [sessionId, connectionStatus]);

  useEffect(() => {
    if (aiAudio && audioPlayerRef.current) {
      const playPromise = audioPlayerRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          setError('请先点击页面任意位置，允许浏览器播放语音');
          setAiSpeaking(false);
          setIsSubmitting(false);
        });
      }
    }
  }, [aiAudio, setAiSpeaking]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase: string) => {
    const phaseMap: Record<string, string> = {
      INTRO: '自我介绍',
      TECH: '技术问题',
      PROJECT: '项目深挖',
      HR: 'HR 问题',
    };
    return phaseMap[phase] || phase;
  };

  const handleSubmitAnswer = useCallback(() => {
    if (!wsRef.current || !wsRef.current.isConnected()) {
      return;
    }
    if (!userText.trim() || isAiSpeakingRef.current || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    const text = userText.trim();
    appendMessage('user', text, 'user');
    setUserText('');
    liveEvaluationAwaitingTurnRef.current = true;
    setLiveEvaluationRefreshing(true);
    wsRef.current.sendControl('submit', { text });
  }, [appendMessage, userText, isSubmitting]);

  const createWebSocketHandlers = useCallback(() => ({
    onOpen: () => {
      setConnectionStatus('connected');
    },
    onMessage: () => {},
    onSubtitle: (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        appendMessage('user', text.trim(), 'user');
        setUserText('');
      } else {
        setUserText(text);
      }
    },
    onAudioResponse: (audioData: string, text: string) => {
      const hasAudio = !!(audioData && audioData.length > 0);
      const normalized = (text || '').trim();
      if (hasAudio) {
        clearPendingAiTextCommit();
        setAiAudio(audioData);
        setAiText(text);
        setAiSpeaking(true);
        return;
      }
      setAiAudio('');
      setAiText(text);
      setAiSpeaking(false);
      if (!normalized) {
        setIsSubmitting(false);
        return;
      }
      clearPendingAiTextCommit();
      pendingAiTextCommitRef.current = setTimeout(() => {
        commitAiMessage(normalized);
        setIsSubmitting(false);
        pendingAiTextCommitRef.current = null;
      }, 2500);
    },
    onClose: (event: { code: number }) => {
      setConnectionStatus('disconnected');
      clearPendingAiTextCommit();
      clearPendingEvaluationRefresh();
      liveEvaluationAwaitingTurnRef.current = false;
      setLiveEvaluationRefreshing(false);
      if (event.code !== 1000) {
        setError('连接已断开，请刷新页面后重试');
      }
    },
    onError: () => {
      clearPendingAiTextCommit();
      clearPendingEvaluationRefresh();
      liveEvaluationAwaitingTurnRef.current = false;
      setLiveEvaluationRefreshing(false);
      setError('WebSocket 连接错误，请检查网络后重试');
      setConnectionStatus('disconnected');
    },
    onAudioChunk: (data: string, index: number, isLast: boolean) => {
      handleAudioChunk(data, index, isLast);
    },
    onRealtimeEvaluation: (snapshot: LiveEvaluationSnapshot) => {
      liveEvaluationRequestSeqRef.current += 1;
      clearPendingEvaluationRefresh();
      liveEvaluationAwaitingTurnRef.current = false;
      setLiveEvaluation(snapshot);
      setLiveEvaluationLoading(false);
      setLiveEvaluationRefreshing(false);
    },
  }), [
    appendMessage,
    clearPendingAiTextCommit,
    clearPendingEvaluationRefresh,
    commitAiMessage,
    handleAudioChunk,
    setAiSpeaking,
  ]);

  const connectWithHandlers = useCallback((nextSessionId: number, wsUrl: string) => {
    setTimeout(() => {
      try {
        wsRef.current = connectWebSocket(nextSessionId, wsUrl, createWebSocketHandlers());
      } catch (connectError) {
        setError('无法建立 WebSocket 连接: ' + (connectError instanceof Error ? connectError.message : '未知错误'));
        setConnectionStatus('disconnected');
      }
    }, 500);
  }, [createWebSocketHandlers]);

  const resolveWebSocketUrl = useCallback((nextSessionId: number, serverUrl?: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackUrl = `${protocol}//${window.location.host}/ws/voice-interview/${nextSessionId}`;

    if (!serverUrl || !serverUrl.trim()) {
      return fallbackUrl;
    }

    if (serverUrl.startsWith('/')) {
      return `${protocol}//${window.location.host}${serverUrl}`;
    }

    try {
      const parsed = new URL(serverUrl);
      const isLocalhostUrl = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      const isCurrentHostLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (isLocalhostUrl && !isCurrentHostLocal) {
        parsed.protocol = protocol;
        parsed.host = window.location.host;
        return parsed.toString();
      }
      return parsed.toString();
    } catch {
      return fallbackUrl;
    }
  }, []);

  const handlePhaseConfig = useCallback(async (config: NonNullable<VideoInterviewEntryState['videoConfig']>) => {
    setError(null);
    setConnectionStatus('connecting');
    clearPendingEvaluationRefresh();
    liveEvaluationAwaitingTurnRef.current = false;

    try {
      const session = await voiceInterviewApi.createSession({
        skillId: config.skillId,
        difficulty: config.difficulty,
        introEnabled: false,
        techEnabled: true,
        projectEnabled: true,
        hrEnabled: true,
        plannedDuration: config.plannedDuration,
        resumeId: config.resumeId,
        llmProvider: config.llmProvider,
        liveEvaluationEnabled: true,
      });

      setLiveEvaluation(null);
      setLiveEvaluationLoading(true);
      setLiveEvaluationRefreshing(false);
      liveEvaluationAwaitingTurnRef.current = false;
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);

      const wsUrl = resolveWebSocketUrl(session.sessionId, session.webSocketUrl);
      connectWithHandlers(session.sessionId, wsUrl);
    } catch (createError) {
      const errorMessage = createError instanceof Error ? createError.message : '创建视频面试会话失败，请重试';
      setError(errorMessage);
      setConnectionStatus('disconnected');
      alert('创建会话失败：' + errorMessage);
    }
  }, [clearPendingEvaluationRefresh, connectWithHandlers, resolveWebSocketUrl]);

  useEffect(() => {
    if (autoStartRef.current) return;

    if (presetVideoConfig) {
      autoStartRef.current = true;
      handlePhaseConfig(presetVideoConfig);
    }
  }, [handlePhaseConfig, presetVideoConfig]);

  const handleAudioData = (audioData: string) => {
    if (wsRef.current && wsRef.current.isConnected()) {
      wsRef.current.sendAudio(audioData);
    } else {
      setError('还没有连接到面试服务，请稍后重试');
    }
  };

  const handleEndInterview = async () => {
    endedByUserRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
    clearPendingEvaluationRefresh();
    stopCamera();
    if (sessionId) {
      try {
        await voiceInterviewApi.endSession(sessionId);
      } catch (endError) {
        console.error('Failed to end session:', endError);
      }
    }
    navigate('/interviews');
  };

  const handleLeavePage = async () => {
    endedByUserRef.current = true;
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
    clearPendingEvaluationRefresh();
    stopCamera();
    if (sessionId) {
      await voiceInterviewApi.pauseSession(sessionId).catch(() => {});
    }
    navigate('/interview-hub');
  };

  const canSubmit = isRecording && !!userText.trim() && !isAiSpeaking && !isSubmitting && connectionStatus === 'connected';

  if (!presetVideoConfig) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-8 text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-800 dark:text-white text-lg font-semibold mb-2">未检测到视频面试配置</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">请从模拟面试入口重新进入视频面试窗口。</p>
          <button
            onClick={() => navigate('/interview-hub')}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            返回模拟面试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="max-w-7xl mx-auto">
        <InterviewPageHeader
          title="视频面试"
          subtitle="摄像头面对面预览 + 现有语音面试链路，先实现真实沟通感"
          icon={<Video className="w-6 h-6 text-white" />}
        />

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleLeavePage}
                    className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
                    title="返回模拟面试"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{templateName || effectiveSkillId}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 rounded-full">
                        {getPhaseLabel(currentPhase)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {connectionStatus === 'connected' ? '连接正常' : connectionStatus === 'connecting' ? '连接中' : '连接断开'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono text-sm tabular-nums">{formatTime(currentTime)}</span>
                </div>
              </div>

              <div className="p-6">
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  {cameraState !== 'active' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                        <Video className="w-8 h-8" />
                      </div>
                      <p className="text-sm">
                        {cameraState === 'requesting' ? '正在打开摄像头...' : '点击下方按钮打开摄像头，进入面对面语音面试'}
                      </p>
                    </div>
                  )}

                  <div className="absolute left-4 bottom-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs backdrop-blur">
                    <span className={`w-2 h-2 rounded-full ${cameraState === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                    {cameraState === 'active' ? '摄像头已开启' : '摄像头未开启'}
                  </div>
                </div>

                {cameraError && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{cameraError}</span>
                  </div>
                )}

                <div className="mt-6 w-full rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-6 py-5 text-center flex items-center justify-center min-h-[130px]">
                  <AnimatePresence mode="wait">
                    {isAiSpeaking || aiText ? (
                      <motion.p
                        key="ai-active"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-lg md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed"
                      >
                        {aiText || '面试官正在思考...'}
                      </motion.p>
                    ) : userText ? (
                      <motion.p
                        key="user-active"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-lg md:text-xl font-medium text-primary-600 dark:text-primary-300 italic leading-relaxed"
                      >
                        {userText}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-slate-500 dark:text-slate-400"
                      >
                        {isRecording ? '正在听你说话，说完后点击“提交回答”' : '打开摄像头后点击麦克风，就可以开始面对面语音面试'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {cameraState === 'active' ? (
                  <button
                    onClick={stopCamera}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    <span className="inline-flex items-center gap-2">
                      <VideoOff className="w-4 h-4" />
                      关闭摄像头
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => startCamera()}
                    disabled={cameraState === 'requesting'}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      {cameraState === 'requesting' ? '打开中...' : '打开摄像头'}
                    </span>
                  </button>
                )}

                <AudioRecorder
                  isRecording={isRecording}
                  onRecordingChange={setIsRecording}
                  onAudioData={handleAudioData}
                />

                <button
                  onClick={handleSubmitAnswer}
                  disabled={!canSubmit}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    canSubmit
                      ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-md shadow-primary-500/30'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <SendHorizonal className="w-4 h-4" />
                    提交回答
                  </span>
                </button>

                <button
                  onClick={handleEndInterview}
                  disabled={connectionStatus !== 'connected'}
                  className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-1">
                    <PhoneOff className="w-4 h-4" />
                    结束面试
                  </span>
                </button>
              </div>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-3">
                {isAiSpeaking ? '面试官正在回答...' : isSubmitting ? '正在思考...' : isRecording ? '说完后点击“提交回答”' : '先看镜头，再开始语音沟通'}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <VideoInterviewLiveScorePanel
              evaluation={liveEvaluation}
              loading={liveEvaluationLoading}
              refreshing={liveEvaluationRefreshing}
            />

            <div className="h-[420px] md:h-[480px] xl:h-[calc(100vh-520px)] xl:min-h-[320px] bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
              <RealtimeSubtitle
                messages={messages}
                userText={userText}
                aiText={aiText}
                isAiSpeaking={isAiSpeaking}
              />
            </div>
          </div>
        </div>
      </div>

      {aiAudio && (
        <audio
          ref={audioPlayerRef}
          src={`data:audio/wav;base64,${aiAudio}`}
          onEnded={() => {
            setAiSpeaking(false);
            setIsSubmitting(false);
            clearPendingAiTextCommit();
            commitAiMessage(aiText.trim());
            setAiText('');
            setAiAudio('');
          }}
          onPlay={() => setAiSpeaking(true)}
          autoPlay
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
