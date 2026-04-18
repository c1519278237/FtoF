import { useState } from 'react';
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Gauge,
  Sparkles,
  UserRound,
} from 'lucide-react';
import {
  type LiveEvaluationSnapshot,
  type LiveEvaluatorScore,
} from '../api/voiceInterview';
import {
  getScoreColor,
  getScoreProgressColor,
  getScoreTextColor,
} from '../utils/score';

interface VideoInterviewLiveScorePanelProps {
  evaluation: LiveEvaluationSnapshot | null;
  loading: boolean;
  refreshing: boolean;
}

const DEFAULT_JUDGES = [
  { id: 'tech_depth', name: '技术深挖官', role: '技术正确性与实现细节' },
  { id: 'system_design', name: '系统设计官', role: '结构化表达与方案取舍' },
  { id: 'hr_signal', name: '沟通表现官', role: '表达状态与职业化沟通' },
  { id: 'hiring_manager', name: '业务结果官', role: '业务理解与责任意识' },
  { id: 'peer_engineer', name: '协作配合官', role: '团队协作与共事成本' },
  { id: 'growth_coach', name: '成长潜力官', role: '反思能力与成长速度' },
] as const;

function levelLabel(level: string | undefined) {
  switch (level) {
    case 'junior':
      return '初级';
    case 'senior':
      return '高级';
    case 'mid':
    default:
      return '中级';
  }
}

function renderTagList(tags: string[], emptyText: string, tone: 'positive' | 'risk' | 'focus') {
  if (tags.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">{emptyText}</p>;
  }

  const toneClass =
    tone === 'positive'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : tone === 'risk'
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <span
          key={tag}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${toneClass}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function EvaluatorCard({ evaluator }: { evaluator: LiveEvaluatorScore }) {
  const [expanded, setExpanded] = useState(false);
  const score = evaluator.score ?? 0;
  const scoreText = evaluator.score == null ? '待评分' : `${evaluator.score}`;
  const scoreBadgeClass = evaluator.score == null
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    : getScoreColor(score);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{evaluator.evaluatorName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{evaluator.role}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            评分模型：{evaluator.providerId || '默认通道'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`px-2.5 py-1 rounded-lg text-sm font-bold ${scoreBadgeClass}`}>
            <span>{scoreText}</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            title={expanded ? '收起评语' : '展开评语'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500">当前亮点</p>
        <p className="text-xs text-slate-700 dark:text-slate-200 mt-1">{evaluator.highlight}</p>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500">当前风险</p>
            <p className="text-xs text-slate-700 dark:text-slate-200 mt-1">{evaluator.concern}</p>
          </div>

          {evaluator.evidence.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {evaluator.evidence.map(item => (
                <span
                  key={item}
                  className="px-2 py-1 rounded-md text-[11px] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">这一轮还没有返回更细的证据标签。</p>
          )}
        </div>
      )}
    </div>
  );
}

function renderScoreValue(score: number | null, pendingText: string = '待评分') {
  if (score == null) {
    return pendingText;
  }
  return `${score}`;
}

function JudgeSkeletonCard({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{role}</p>
        </div>
        <div className="px-2.5 py-1 rounded-lg text-sm font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500">
          待评分
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        你每提交一轮回答，六位评审官都会并发刷新分数、亮点和风险判断。
      </p>
    </div>
  );
}

function EmptyPanel({
  expanded,
  onToggleExpanded,
  judgesExpanded,
  onToggleJudgesExpanded,
  title,
  description,
  loading,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  judgesExpanded: boolean;
  onToggleJudgesExpanded: () => void;
  title: string;
  description: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{description}</p>
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 transition-colors flex-shrink-0"
          >
            {expanded ? '收起面板' : '展开面板'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {loading ? '六位评审官面板正在初始化...' : '现在还没有生成首个评分快照。'}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={onToggleJudgesExpanded}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">六位评审官列表</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">展开后可逐个查看每位评审官的意见</p>
              </div>
              {judgesExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {judgesExpanded && (
              <div className="mt-3 grid grid-cols-1 gap-3 max-h-[24rem] overflow-y-auto pr-1">
                {DEFAULT_JUDGES.map(judge => (
                  <JudgeSkeletonCard key={judge.id} name={judge.name} role={judge.role} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VideoInterviewLiveScorePanel({
  evaluation,
  loading,
  refreshing,
}: VideoInterviewLiveScorePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [judgesExpanded, setJudgesExpanded] = useState(false);
  const overallScoreText = renderScoreValue(evaluation?.overallScore ?? null, '生成中');

  if (loading && !evaluation) {
    return (
      <EmptyPanel
        expanded={expanded}
        onToggleExpanded={() => setExpanded(prev => !prev)}
        judgesExpanded={judgesExpanded}
        onToggleJudgesExpanded={() => setJudgesExpanded(prev => !prev)}
        title="六评审官实时评分"
        description="顶部保持精简，你可以随时展开查看六位评审官的详细意见。"
        loading
      />
    );
  }

  if (!evaluation) {
    return (
      <EmptyPanel
        expanded={expanded}
        onToggleExpanded={() => setExpanded(prev => !prev)}
        judgesExpanded={judgesExpanded}
        onToggleJudgesExpanded={() => setJudgesExpanded(prev => !prev)}
        title="六评审官实时评分"
        description="完成第一轮有效作答后，系统会开始生成实时分数和候选人画像。"
        loading={false}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">六评审官实时评分</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              点击展开后可查看维度分、六位评审官意见和当前用户画像。
            </p>
          </div>

          <div className="flex items-start gap-3 flex-shrink-0">
            <div className="text-right">
              <p
                className={`text-3xl font-bold ${
                  evaluation.overallScore == null
                    ? 'text-slate-400 dark:text-slate-500'
                    : getScoreTextColor(evaluation.overallScore)
                }`}
              >
                {overallScoreText}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                置信度 {evaluation.confidence}% · 已评估 {evaluation.turnCount} 轮
              </p>
              {refreshing && (
                <p className="text-[11px] text-primary-500 mt-1">正在刷新评分...</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              {expanded ? '收起面板' : '展开面板'}
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mt-4">{evaluation.summary}</p>
      </div>

      {expanded && (
        <div className="p-5 space-y-5 max-h-[34rem] overflow-y-auto">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">多维度得分</h4>
            </div>
            <div className="space-y-3">
              {evaluation.dimensions.map(dimension => (
                <div key={dimension.key}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {dimension.label}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        dimension.score == null
                          ? 'text-slate-400 dark:text-slate-500'
                          : getScoreTextColor(dimension.score)
                      }`}
                    >
                      {renderScoreValue(dimension.score)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        dimension.score == null
                          ? 'bg-slate-300 dark:bg-slate-600'
                          : getScoreProgressColor(dimension.score)
                      }`}
                      style={{
                        width: `${dimension.score == null ? 12 : Math.max(6, dimension.score)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    {dimension.rationale}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setJudgesExpanded(prev => !prev)}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-500" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">六位评审官意见</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    共 {evaluation.evaluators.length} 位，展开后可逐个查看详细意见
                  </p>
                </div>
              </div>
              {judgesExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {judgesExpanded && (
              <div className="grid grid-cols-1 gap-3 max-h-[24rem] overflow-y-auto pr-1 mt-3">
                {evaluation.evaluators.map(evaluator => (
                  <EvaluatorCard key={evaluator.evaluatorId} evaluator={evaluator} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <UserRound className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">当前候选人画像</h4>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500">当前能力段位</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {levelLabel(evaluation.candidateProfile.estimatedLevel)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500">表达风格</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {evaluation.candidateProfile.communicationStyle}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500">当前状态</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {evaluation.candidateProfile.currentState}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500 mb-2">优势信号</p>
                {renderTagList(
                  evaluation.candidateProfile.strengths,
                  '暂时还没有形成稳定优势信号。',
                  'positive'
                )}
              </div>

              <div>
                <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500 mb-2">风险信号</p>
                {renderTagList(
                  evaluation.candidateProfile.risks,
                  '暂时还没有形成稳定风险信号。',
                  'risk'
                )}
              </div>

              <div>
                <p className="text-[11px] tracking-wide text-slate-400 dark:text-slate-500 mb-2">建议强化方向</p>
                {renderTagList(
                  evaluation.candidateProfile.coachingFocus,
                  '暂时还没有明确的强化方向。',
                  'focus'
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
