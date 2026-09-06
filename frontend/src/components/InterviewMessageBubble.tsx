import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const DIGITAL_INTERVIEWER_AVATAR = '/blue-ai-interviewer.png';

export type InterviewMessageRole = 'interviewer' | 'user';
export type InterviewMessageTone = 'screening' | 'technical' | 'project' | 'final' | 'default';

const toneStyles: Record<InterviewMessageTone, {
  avatar: string;
  label: string;
  category: string;
  bubble: string;
}> = {
  screening: {
    avatar: 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300',
    label: 'text-sky-700 dark:text-sky-300',
    category: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300',
    bubble: 'bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-slate-800 dark:text-slate-200',
  },
  technical: {
    avatar: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300',
    label: 'text-blue-700 dark:text-blue-300',
    category: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300',
    bubble: 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-slate-800 dark:text-slate-200',
  },
  project: {
    avatar: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300',
    label: 'text-violet-700 dark:text-violet-300',
    category: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300',
    bubble: 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-slate-800 dark:text-slate-200',
  },
  final: {
    avatar: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300',
    label: 'text-amber-700 dark:text-amber-300',
    category: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300',
    bubble: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-slate-800 dark:text-slate-200',
  },
  default: {
    avatar: 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400',
    label: 'text-slate-700 dark:text-slate-300',
    category: 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
    bubble: 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200',
  },
};

interface InterviewMessageBubbleProps {
  role: InterviewMessageRole;
  text: string;
  category?: string;
  highlight?: boolean;
  italic?: boolean;
  suffix?: ReactNode;
  interviewerName?: string;
  tone?: InterviewMessageTone;
}

export default function InterviewMessageBubble({
  role,
  text,
  category,
  highlight = false,
  italic = false,
  suffix,
  interviewerName = '面试官',
  tone = 'default',
}: InterviewMessageBubbleProps) {
  if (role === 'interviewer') {
    const styles = toneStyles[tone];
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-start gap-3"
      >
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/70 shadow-sm ${styles.avatar}`}>
          <img
            src={DIGITAL_INTERVIEWER_AVATAR}
            alt="AI 面试官"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold ${styles.label}`}>{interviewerName}</span>
            {category && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${styles.category}`}>
                {category}
              </span>
            )}
          </div>
          <div
            className={`rounded-2xl rounded-tl-none p-4 leading-relaxed ${
              highlight
                ? 'bg-slate-100 dark:bg-slate-700 border border-primary-300/60 dark:border-primary-700/40 text-slate-700 dark:text-slate-200'
                : styles.bubble
            } ${italic ? 'italic' : ''}`}
          >
            {text}
            {suffix}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 justify-end"
    >
      <div className="flex-1 max-w-[80%]">
        <div
          className={`rounded-2xl rounded-tr-none p-4 leading-relaxed bg-primary-500 text-white ${
            highlight ? 'border border-primary-400/70 bg-primary-500/90' : ''
          } ${italic ? 'italic' : ''}`}
        >
          {text}
          {suffix}
        </div>
      </div>
      <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </motion.div>
  );
}
