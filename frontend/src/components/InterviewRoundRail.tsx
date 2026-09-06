import type {InterviewRound} from '../types/interview';

interface InterviewRoundRailProps {
  rounds: InterviewRound[];
  currentRoundCode?: string | null;
}

const statusLabel: Record<string, string> = {
  LOCKED: '未解锁',
  READY: '待开始',
  IN_PROGRESS: '进行中',
  EVALUATING: '评估中',
  PASSED: '已通过',
  NEEDS_REVIEW: '待复核',
  COMPLETED: '已完成',
};

export default function InterviewRoundRail({rounds, currentRoundCode}: InterviewRoundRailProps) {
  if (!rounds.length) return null;

  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {rounds.map((round) => {
        const active = round.roundCode === currentRoundCode;
        const completed = ['PASSED', 'COMPLETED'].includes(round.status);
        return (
          <div
            key={round.roundCode}
            className={`rounded-xl border p-3 transition-colors ${active
              ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                第 {round.roundNumber} 轮
              </span>
              <span className={`text-xs ${completed ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>
                {statusLabel[round.status] ?? round.status}
              </span>
            </div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{round.name}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{round.interviewerRole}</div>
            {round.score !== null && (
              <div className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-300">{round.score} 分</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
