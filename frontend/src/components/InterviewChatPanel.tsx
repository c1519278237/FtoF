import {useMemo, useRef} from 'react';
import {motion} from 'framer-motion';
import {Virtuoso, type VirtuosoHandle} from 'react-virtuoso';
import type {InterviewQuestion, InterviewRound, InterviewSession} from '../types/interview';
import {Send} from 'lucide-react';
import InterviewMessageBubble, {type InterviewMessageTone} from './InterviewMessageBubble';

const DIGITAL_INTERVIEWER_SCENE = '/blue-ai-interviewer-seated.png';

interface Message {
  type: 'interviewer' | 'user';
  content: string;
  category?: string;
  questionIndex?: number;
  roundCode?: string | null;
}

interface InterviewChatPanelProps {
  session: InterviewSession;
  rounds: InterviewRound[];
  currentQuestion: InterviewQuestion | null;
  messages: Message[];
  answer: string;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  onCompleteEarly: () => void;
  isSubmitting: boolean;
  showCompleteConfirm: boolean;
  onShowCompleteConfirm: (show: boolean) => void;
}

/**
 * 面试聊天面板组件
 */
export default function InterviewChatPanel({
  session,
  rounds,
  currentQuestion,
  messages,
  answer,
  onAnswerChange,
  onSubmit,
  // onCompleteEarly, // 暂时未使用
  isSubmitting,
  // showCompleteConfirm, // 暂时未使用
  onShowCompleteConfirm
}: InterviewChatPanelProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const currentRound = rounds.find(round => round.roundCode === currentQuestion?.roundCode);
  const tone = (roundCode?: string | null): InterviewMessageTone => {
    if (roundCode === 'screening' || roundCode === 'technical'
      || roundCode === 'project' || roundCode === 'final') {
      return roundCode;
    }
    return 'default';
  };
  const roundQuestions = currentQuestion?.roundCode
    ? session.questions.filter(question => question.roundCode === currentQuestion.roundCode)
    : session.questions;
  const roundQuestionIndex = currentQuestion
    ? roundQuestions.findIndex(question => question.questionIndex === currentQuestion.questionIndex) + 1
    : 0;
  const currentTone = tone(currentQuestion?.roundCode);
  const panelTone = {
    screening: 'from-sky-50 to-white dark:from-sky-950/30 dark:to-slate-800 border-sky-200 dark:border-sky-800',
    technical: 'from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-800 border-blue-200 dark:border-blue-800',
    project: 'from-violet-50 to-white dark:from-violet-950/30 dark:to-slate-800 border-violet-200 dark:border-violet-800',
    final: 'from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-800 border-amber-200 dark:border-amber-800',
    default: 'from-white to-white dark:from-slate-800 dark:to-slate-800 border-slate-100 dark:border-slate-700',
  }[currentTone];

  const progress = useMemo(() => {
    if (!currentQuestion || roundQuestions.length === 0) return 0;
    return (roundQuestionIndex / roundQuestions.length) * 100;
  }, [currentQuestion, roundQuestionIndex, roundQuestions.length]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-6xl mx-auto">
      {currentRound && (
        <div className={`rounded-2xl border mb-4 bg-gradient-to-r ${panelTone} overflow-hidden`}>
          <div className="flex flex-col sm:flex-row items-stretch">
            <div className="relative w-full sm:w-44 h-52 sm:h-56 shrink-0 overflow-hidden bg-sky-100/70 dark:bg-slate-900/40">
              <img
                src={DIGITAL_INTERVIEWER_SCENE}
                alt="坐在面试桌前的 AI 数字人面试官"
                className="h-full w-full object-contain"
              />
              <div className="absolute bottom-3 left-3 rounded-full bg-slate-950/65 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                AI 数字面试官
              </div>
            </div>
            <div className="flex flex-1 items-start justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  当前面试官
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                  {currentRound.name} · {currentRound.interviewerRole}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  本轮目标：{currentRound.objective}
                </div>
              </div>
              <div className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                只考察本轮职责
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 进度条 */}
        <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 mb-4 shadow-sm dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            题目 {currentQuestion ? currentQuestion.questionIndex + 1 : 0} / {session.totalQuestions}
          </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
            {Math.round(progress)}%
          </span>
        </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${currentTone === 'final'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500'
              : currentTone === 'project'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                : currentTone === 'technical'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                  : 'bg-gradient-to-r from-sky-500 to-blue-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 聊天区域 */}
        <div
            className={`flex-1 bg-gradient-to-br rounded-2xl shadow-sm dark:shadow-slate-900/50 overflow-hidden flex flex-col min-h-0 border ${panelTone}`}>
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          initialTopMostItemIndex={messages.length - 1}
          followOutput="smooth"
          className="flex-1"
          itemContent={(_index, msg) => (
            <div className="pb-4 px-6 first:pt-6">
              <InterviewMessageBubble
                role={msg.type === 'interviewer' ? 'interviewer' : 'user'}
                text={msg.content}
                category={msg.category}
                interviewerName={rounds.find(round => round.roundCode === msg.roundCode)?.interviewerRole}
                tone={tone(msg.roundCode)}
              />
            </div>
          )}
        />

        {/* 输入区域 */}
            <div className="border-t border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-700/50">
          <div className="flex gap-3">
            <textarea
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="输入你的回答... (Ctrl/Cmd + Enter 提交)"
              className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              rows={3}
              disabled={isSubmitting}
            />
            <div className="flex flex-col gap-2">
              <motion.button
                onClick={onSubmit}
                disabled={!answer.trim() || isSubmitting}
                className="px-6 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                whileHover={{ scale: isSubmitting || !answer.trim() ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting || !answer.trim() ? 1 : 0.98 }}
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    提交中
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    提交
                  </>
                )}
              </motion.button>
              <motion.button
                onClick={() => onShowCompleteConfirm(true)}
                disabled={isSubmitting}
                className="px-6 py-3 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
              >
                提前交卷
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
