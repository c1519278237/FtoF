import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface DigitalInterviewerVideoProps {
  isSpeaking: boolean;
  isThinking: boolean;
}

const digitalHumanFrames = {
  idle: '/blue-ai-interviewer-video.png',
  speaking: '/blue-ai-interviewer-video-speaking.png',
  gesture: '/blue-ai-interviewer-video-gesture.png',
} as const;

export default function DigitalInterviewerVideo({
  isSpeaking,
  isThinking,
}: DigitalInterviewerVideoProps) {
  const [showGesture, setShowGesture] = useState(false);
  const frame = isSpeaking ? 'speaking' : showGesture ? 'gesture' : 'idle';
  const status = isSpeaking ? '正在说话' : isThinking ? '正在思考' : '等待你的回答';

  useEffect(() => {
    if (isSpeaking || isThinking) {
      setShowGesture(false);
      return undefined;
    }

    const gestureTimer = window.setInterval(() => {
      setShowGesture(previous => !previous);
    }, 4800);

    return () => window.clearInterval(gestureTimer);
  }, [isSpeaking, isThinking]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-blue-200 bg-blue-950 shadow-inner dark:border-blue-900">
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={frame}
          src={digitalHumanFrames[frame]}
          alt="AI 数字面试官"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{
            opacity: 1,
            scale: isSpeaking ? [1, 1.008, 1] : 1,
            y: isSpeaking ? [0, -1, 0] : 0,
          }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{
            opacity: { duration: 0.2 },
            scale: { duration: 1.2, repeat: isSpeaking ? Infinity : 0, ease: 'easeInOut' },
            y: { duration: 1.2, repeat: isSpeaking ? Infinity : 0, ease: 'easeInOut' },
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
        <span className={`h-2 w-2 rounded-full ${isSpeaking ? 'animate-pulse bg-emerald-400' : 'bg-blue-300'}`} />
        AI 数字面试官
      </div>

      <div className="absolute bottom-4 left-4 rounded-xl bg-slate-950/65 px-3 py-2 text-xs text-white backdrop-blur-sm">
        <div className="font-medium">{status}</div>
        {isSpeaking && (
          <div className="mt-1 flex h-3 items-end gap-0.5" aria-label="数字人正在说话">
            {[1, 2, 3, 2, 1].map((height, index) => (
              <motion.span
                key={index}
                className="w-1 rounded-full bg-cyan-300"
                animate={{ height: [`${height * 3}px`, `${height * 5}px`, `${height * 2}px`] }}
                transition={{ duration: 0.55, repeat: Infinity, delay: index * 0.08 }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
