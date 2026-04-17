import {type ComponentType, startTransition, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'framer-motion';
import {
  ArrowRight,
  BotMessageSquare,
  BrainCircuit,
  BriefcaseBusiness,
  ChartColumnBig,
  CheckCircle2,
  FileUser,
  LibraryBig,
  MicVocal,
  NotebookTabs,
  Search,
  Upload,
} from 'lucide-react';
import {historyApi, type ResumeListItem, type ResumeStats} from '../api/history';
import {interviewApi, type TextSessionMeta} from '../api/interview';
import {knowledgeBaseApi, type KnowledgeBaseStats} from '../api/knowledgebase';
import {skillApi} from '../api/skill';
import {voiceInterviewApi, type SessionMeta} from '../api/voiceInterview';
import {ROUTES} from '../constants/routes';
import {formatDateOnly} from '../utils/date';

interface DashboardData {
  knowledgeStats: KnowledgeBaseStats;
  pendingResumeCount: number;
  recentInterviews: RecentInterviewItem[];
  recentResumes: ResumeListItem[];
  resumeStats: ResumeStats;
  scoredInterviewAverage: number;
  skillsCount: number;
  textSessionCount: number;
  voiceSessionCount: number;
}

interface RecentInterviewItem {
  createdAt: string;
  id: string;
  score: number | null;
  status: string;
  title: string;
  type: 'text' | 'voice';
}

interface ActionCardProps {
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}

interface StatCardProps {
  accent: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}

function emptyResumeStats(): ResumeStats {
  return {
    totalCount: 0,
    totalInterviewCount: 0,
    totalAccessCount: 0,
  };
}

function emptyKnowledgeStats(): KnowledgeBaseStats {
  return {
    totalCount: 0,
    totalQuestionCount: 0,
    totalAccessCount: 0,
    completedCount: 0,
    processingCount: 0,
  };
}

function getResumeStatusLabel(status?: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'AI 已完成分析';
    case 'PROCESSING':
      return '分析进行中';
    case 'PENDING':
      return '等待分析';
    case 'FAILED':
      return '分析失败';
    default:
      return '待处理';
  }
}

function getResumeStatusTone(status?: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'PROCESSING':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300';
    case 'PENDING':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    case 'FAILED':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
    default:
      return 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function getInterviewStatusLabel(item: RecentInterviewItem): string {
  if (item.type === 'text') {
    if (item.status === 'EVALUATED') return '报告已生成';
    if (item.status === 'COMPLETED') return '已提交，待评估';
    if (item.status === 'IN_PROGRESS') return '进行中';
    return '已创建';
  }

  if (item.status === 'COMPLETED') return '语音会话完成';
  if (item.status === 'PAUSED') return '会话已暂停';
  if (item.status === 'IN_PROGRESS') return '实时面试中';
  return '等待开始';
}

function buildRecentInterviews(
  textSessions: TextSessionMeta[],
  voiceSessions: SessionMeta[],
  skillNameMap: Map<string, string>
): RecentInterviewItem[] {
  const textItems: RecentInterviewItem[] = textSessions.map((session) => ({
    createdAt: session.createdAt,
    id: session.sessionId,
    score: session.overallScore,
    status: session.evaluateStatus ?? session.status,
    title: skillNameMap.get(session.skillId) ?? '文本模拟面试',
    type: 'text',
  }));

  const voiceItems: RecentInterviewItem[] = voiceSessions.map((session) => ({
    createdAt: session.createdAt,
    id: `voice-${session.sessionId}`,
    score: null,
    status: session.evaluateStatus ?? session.status,
    title: session.roleType || '语音模拟面试',
    type: 'voice',
  }));

  return [...textItems, ...voiceItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
}

function ActionCard({description, href, icon: Icon, title}: ActionCardProps) {
  return (
    <Link
      to={href}
      className="group relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.5)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-slate-200 dark:border-white/10 dark:bg-slate-900/70 dark:hover:border-slate-700"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400 opacity-80" />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20 dark:bg-slate-100 dark:text-slate-900">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition-transform group-hover:translate-x-1 dark:text-slate-100">
        立即进入
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function StatCard({accent, icon: Icon, label, value}: StatCardProps) {
  return (
    <motion.div
      initial={{opacity: 0, y: 18}}
      animate={{opacity: 1, y: 0}}
      className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_80px_-60px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError('');

      try {
        const [resumeStats, resumes, knowledgeStats, textSessions, voiceSessions, skills] =
          await Promise.all([
            historyApi.getStatistics().catch(() => emptyResumeStats()),
            historyApi.getResumes().catch(() => [] as ResumeListItem[]),
            knowledgeBaseApi.getStatistics().catch(() => emptyKnowledgeStats()),
            interviewApi.listSessions().catch(() => [] as TextSessionMeta[]),
            voiceInterviewApi.getAllSessions().catch(() => [] as SessionMeta[]),
            skillApi.listSkills().catch(() => []),
          ]);

        if (!active) {
          return;
        }

        const skillNameMap = new Map(skills.map((skill) => [skill.id, skill.name]));
        const scoredTextSessions = textSessions.filter(
          (session): session is TextSessionMeta & { overallScore: number } =>
            typeof session.overallScore === 'number'
        );

        const nextDashboard: DashboardData = {
          knowledgeStats,
          pendingResumeCount: resumes.filter((resume) =>
            resume.analyzeStatus === 'PENDING' || resume.analyzeStatus === 'PROCESSING'
          ).length,
          recentInterviews: buildRecentInterviews(textSessions, voiceSessions, skillNameMap),
          recentResumes: [...resumes]
            .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
            .slice(0, 4),
          resumeStats,
          scoredInterviewAverage: scoredTextSessions.length > 0
            ? Math.round(
              scoredTextSessions.reduce((total, session) => total + session.overallScore, 0)
                / scoredTextSessions.length
            )
            : 0,
          skillsCount: skills.length,
          textSessionCount: textSessions.length,
          voiceSessionCount: voiceSessions.length,
        };

        startTransition(() => {
          setDashboard(nextDashboard);
        });
      } catch {
        if (active) {
          setError('首页数据暂时加载失败，请稍后刷新重试。');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const stats = dashboard?.resumeStats ?? emptyResumeStats();
  const knowledgeStats = dashboard?.knowledgeStats ?? emptyKnowledgeStats();
  const recentResumes = dashboard?.recentResumes ?? [];
  const recentInterviews = dashboard?.recentInterviews ?? [];
  const pendingResumeCount = dashboard?.pendingResumeCount ?? 0;
  const suggestedAction = stats.totalCount === 0
    ? '先上传一份简历，系统会自动生成能力画像和模拟面试入口。'
    : dashboard && dashboard.textSessionCount + dashboard.voiceSessionCount === 0
      ? '你的资料已经准备好，下一步建议直接发起一场模拟面试。'
      : knowledgeStats.totalCount === 0
        ? '可以补充岗位资料或题库文档，让问答和面试更贴近目标岗位。'
        : '训练链路已经搭建完成，今天适合继续冲一场更高难度的面试。';

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-gradient-to-br from-cyan-200/55 via-white to-amber-100/70 blur-3xl dark:from-cyan-500/10 dark:via-slate-950 dark:to-amber-400/10" />

      <div className="space-y-6 lg:space-y-8">
        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <motion.div
            initial={{opacity: 0, y: 24}}
            animate={{opacity: 1, y: 0}}
            className="relative overflow-hidden rounded-[36px] border border-slate-200/70 bg-slate-950 px-6 py-7 text-white shadow-[0_30px_100px_-45px_rgba(14,165,233,0.55)] sm:px-8 sm:py-8"
          >
            <div className="absolute -right-16 top-0 h-44 w-44 rounded-full bg-cyan-400/30 blur-3xl" />
            <div className="absolute bottom-0 left-8 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" />

            <div className="relative max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-cyan-100 backdrop-blur">
                <BotMessageSquare className="h-4 w-4" />
                今日训练总览
              </div>

              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                把首页变成你的
                <span className="block bg-gradient-to-r from-cyan-300 via-white to-amber-200 bg-clip-text text-transparent">
                  AI 面试作战台
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                从简历整理、文本面试、语音实战到知识库问答，把训练入口、阶段数据和最近进展集中在一屏里。
                {suggestedAction}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to={ROUTES.resumeUpload}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
                >
                  <Upload className="h-4 w-4" />
                  上传简历
                </Link>
                <Link
                  to="/interview-hub"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-transform hover:-translate-y-0.5"
                >
                  <BriefcaseBusiness className="h-4 w-4" />
                  发起模拟面试
                </Link>
                <Link
                  to="/knowledgebase/chat"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-transparent px-5 py-3 text-sm font-semibold text-cyan-100 transition-transform hover:-translate-y-0.5"
                >
                  <Search className="h-4 w-4" />
                  打开问答助手
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-sm text-slate-300">简历资产</p>
                  <p className="mt-2 text-2xl font-semibold">{stats.totalCount}</p>
                  <p className="mt-1 text-xs text-slate-400">累计建立的训练资料</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-sm text-slate-300">模拟面试</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {dashboard ? dashboard.textSessionCount + dashboard.voiceSessionCount : 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">文本与语音实战总场次</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                  <p className="text-sm text-slate-300">知识文档</p>
                  <p className="mt-2 text-2xl font-semibold">{knowledgeStats.totalCount}</p>
                  <p className="mt-1 text-xs text-slate-400">可用于问答和检索的内容</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{opacity: 0, y: 24}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.08}}
            className="grid gap-6"
          >
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                    Command Center
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    训练节奏
                  </h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/30">
                  <ChartColumnBig className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-slate-100/80 p-4 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">待推进任务</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
                        {pendingResumeCount + knowledgeStats.processingCount}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      处理中
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>知识库向量化完成度</span>
                    <span>
                      {knowledgeStats.completedCount}/{knowledgeStats.totalCount || 0}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                      style={{
                        width: knowledgeStats.totalCount > 0
                          ? `${(knowledgeStats.completedCount / knowledgeStats.totalCount) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>已沉淀技能模板</span>
                    <span>{dashboard?.skillsCount ?? 0}</span>
                  </div>
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      可以直接从技能模板、JD 解析和知识库问答三条链路切入，构造更贴近岗位的训练路径。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <StatCard accent="bg-gradient-to-br from-cyan-500 to-sky-500" icon={FileUser} label="简历访问热度" value={stats.totalAccessCount} />
              <StatCard accent="bg-gradient-to-br from-emerald-500 to-teal-500" icon={BrainCircuit} label="文本面试均分" value={dashboard?.scoredInterviewAverage ?? 0} />
            </div>
          </motion.div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard accent="bg-gradient-to-br from-slate-950 to-slate-700" icon={FileUser} label="简历总数" value={stats.totalCount} />
          <StatCard accent="bg-gradient-to-br from-fuchsia-500 to-rose-500" icon={NotebookTabs} label="文本面试" value={dashboard?.textSessionCount ?? 0} />
          <StatCard accent="bg-gradient-to-br from-cyan-500 to-blue-500" icon={MicVocal} label="语音面试" value={dashboard?.voiceSessionCount ?? 0} />
          <StatCard accent="bg-gradient-to-br from-emerald-500 to-lime-500" icon={LibraryBig} label="知识库文档" value={knowledgeStats.totalCount} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <motion.div
              initial={{opacity: 0, y: 18}}
              animate={{opacity: 1, y: 0}}
              className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Quick Actions
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    你可以从这里开始
                  </h2>
                </div>
                <Link
                  to="/interview-hub"
                  className="hidden items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                >
                  全部训练入口
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <ActionCard
                  description="上传或追加简历，快速建立新的候选人画像和评估起点。"
                  href={ROUTES.resumeUpload}
                  icon={FileUser}
                  title="新增简历"
                />
                <ActionCard
                  description="发起文本、语音或视频模拟，把面试训练直接推进到实战阶段。"
                  href="/interview-hub"
                  icon={BriefcaseBusiness}
                  title="开始面试"
                />
                <ActionCard
                  description="上传岗位资料或项目文档，用知识库补齐回答素材和上下文。"
                  href="/knowledgebase"
                  icon={LibraryBig}
                  title="维护知识库"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{opacity: 0, y: 18}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: 0.08}}
              className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Recent Sessions
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    最近面试动态
                  </h2>
                </div>
                <Link to="/interviews" className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  查看全部
                </Link>
              </div>

              <div className="mt-6 space-y-4">
                {loading && recentInterviews.length === 0 ? (
                  <div className="grid gap-3">
                    {Array.from({length: 3}).map((_, index) => (
                      <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                  </div>
                ) : recentInterviews.length > 0 ? (
                  recentInterviews.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 rounded-[26px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 flex h-12 w-12 items-center justify-center rounded-2xl ${
                          item.type === 'text'
                            ? 'bg-fuchsia-500 text-white'
                            : 'bg-cyan-500 text-white'
                        }`}>
                          {item.type === 'text' ? (
                            <NotebookTabs className="h-5 w-5" />
                          ) : (
                            <MicVocal className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-950 dark:text-white">
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {getInterviewStatusLabel(item)}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            {item.type === 'text' ? 'Text Session' : 'Voice Session'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            创建时间
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                            {formatDateOnly(item.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            得分
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                            {item.score ?? '--'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[26px] border border-dashed border-slate-200 p-6 text-sm leading-7 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    还没有面试记录。可以从首页直接发起文本或语音面试，把训练记录沉淀下来。
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          <div className="grid gap-6">
            <motion.div
              initial={{opacity: 0, y: 18}}
              animate={{opacity: 1, y: 0}}
              className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Resume Feed
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    最新简历状态
                  </h2>
                </div>
                <Link to="/history" className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  进入简历库
                </Link>
              </div>

              <div className="mt-6 space-y-4">
                {loading && recentResumes.length === 0 ? (
                  <div className="grid gap-3">
                    {Array.from({length: 3}).map((_, index) => (
                      <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                  </div>
                ) : recentResumes.length > 0 ? (
                  recentResumes.map((resume) => (
                    <div
                      key={resume.id}
                      className="rounded-[26px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-950 dark:text-white">
                            {resume.filename}
                          </p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            上传于 {formatDateOnly(resume.uploadedAt)}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getResumeStatusTone(resume.analyzeStatus)}`}>
                          {getResumeStatusLabel(resume.analyzeStatus)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            面试次数
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                            {resume.interviewCount}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            最新得分
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                            {resume.latestScore ?? '--'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[26px] border border-dashed border-slate-200 p-6 text-sm leading-7 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    当前还没有简历资产。先上传简历，首页会自动显示最近分析状态和训练记录。
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{opacity: 0, y: 18}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: 0.08}}
              className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-gradient-to-br from-amber-100 via-white to-cyan-100 p-6 shadow-[0_20px_80px_-55px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-amber-500/10 dark:via-slate-900 dark:to-cyan-500/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Practice Signal
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    首页快照
                  </h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-slate-900/70">
                  <p className="text-sm text-slate-500 dark:text-slate-400">知识库问答量</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {knowledgeStats.totalQuestionCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-slate-900/70">
                  <p className="text-sm text-slate-500 dark:text-slate-400">简历关联面试数</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {stats.totalInterviewCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-4 backdrop-blur dark:bg-slate-900/70">
                  <p className="text-sm text-slate-500 dark:text-slate-400">知识内容访问量</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {knowledgeStats.totalAccessCount}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
