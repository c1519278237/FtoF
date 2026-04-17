import {AnimatePresence, motion} from 'framer-motion';
import {
  Calendar,
  ChevronRight,
  Database,
  FileStack,
  Home,
  Menu,
  MessageSquare,
  Moon,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {type ComponentType, useEffect, useState} from 'react';
import {Link, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {useTheme} from '../hooks/useTheme';
import UnifiedInterviewModal, {type UnifiedInterviewConfig} from './UnifiedInterviewModal';

interface NavItem {
  description?: string;
  icon: ComponentType<{ className?: string }>;
  id: string;
  label: string;
  path: string;
}

interface NavGroup {
  id: string;
  items: NavItem[];
  title: string;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const {theme, toggleTheme} = useTheme();
  const currentPath = location.pathname;
  const isHomePage = currentPath === '/';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [interviewModalPreset, setInterviewModalPreset] = useState<{
    defaultMode: 'text' | 'voice' | 'video';
    defaultResumeId?: number;
    startButtonText: string;
    subtitle: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [currentPath]);

  const openInterviewModalWithResume = (resumeId: number) => {
    setInterviewModalPreset({
      defaultMode: 'text',
      defaultResumeId: resumeId,
      title: '开始模拟面试',
      subtitle: '配置面试参数，快速进入本次练习。',
      startButtonText: '开始面试',
    });
  };

  const handleInterviewStart = (config: UnifiedInterviewConfig) => {
    setInterviewModalPreset(null);

    if (config.mode === 'text') {
      navigate('/interview', {
        state: {
          resumeId: config.resumeId,
          interviewConfig: {
            customCategories: config.customCategories,
            difficulty: config.difficulty,
            jdText: config.customJdText,
            llmProvider: config.llmProvider,
            questionCount: config.questionCount,
            skillId: config.skillId,
          },
        },
      });
      return;
    }

    if (config.mode === 'video') {
      const params = new URLSearchParams({
        difficulty: config.difficulty,
        skillId: config.skillId,
      });
      navigate(`/video-interview?${params.toString()}`, {
        state: {
          videoConfig: {
            difficulty: config.difficulty,
            llmProvider: config.llmProvider,
            plannedDuration: config.plannedDuration,
            resumeId: config.resumeId,
            skillId: config.skillId,
          },
        },
      });
      return;
    }

    const params = new URLSearchParams({
      difficulty: config.difficulty,
      skillId: config.skillId,
    });
    navigate(`/voice-interview?${params.toString()}`, {
      state: {
        voiceConfig: {
          difficulty: config.difficulty,
          hrEnabled: true,
          llmProvider: config.llmProvider,
          plannedDuration: config.plannedDuration,
          projectEnabled: true,
          resumeId: config.resumeId,
          skillId: config.skillId,
          techEnabled: true,
        },
      },
    });
  };

  const navGroups: NavGroup[] = [
    {
      id: 'home',
      title: '工作台',
      items: [
        {
          id: 'home',
          path: '/',
          label: '首页',
          icon: Home,
          description: '训练概览与快捷入口',
        },
      ],
    },
    {
      id: 'interview',
      title: '面试准备',
      items: [
        {
          id: 'resumes',
          path: '/history',
          label: '简历管理',
          icon: FileStack,
          description: '管理简历与 AI 分析',
        },
        {
          id: 'interview-hub',
          path: '/interview-hub',
          label: '模拟面试',
          icon: Sparkles,
          description: '文本、语音和视频训练',
        },
        {
          id: 'interviews',
          path: '/interviews',
          label: '面试记录',
          icon: Users,
          description: '查看历史报告与成绩',
        },
        {
          id: 'interview-schedule',
          path: '/interview-schedule',
          label: '面试日程',
          icon: Calendar,
          description: '安排与管理面试计划',
        },
      ],
    },
    {
      id: 'knowledge',
      title: '知识增强',
      items: [
        {
          id: 'kb-manage',
          path: '/knowledgebase',
          label: '知识库管理',
          icon: Database,
          description: '维护文档与向量化数据',
        },
        {
          id: 'kb-chat',
          path: '/knowledgebase/chat',
          label: '问答助手',
          icon: MessageSquare,
          description: '基于知识库进行问答',
        },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return currentPath === '/';
    }
    if (path === '/history') {
      return currentPath === '/history'
        || currentPath === '/upload'
        || currentPath.startsWith('/history/');
    }
    if (path === '/interview-hub') {
      return currentPath === '/interview-hub'
        || currentPath === '/interview'
        || currentPath.startsWith('/interview/')
        || currentPath.startsWith('/voice-interview')
        || currentPath.startsWith('/video-interview');
    }
    if (path === '/interviews') {
      return currentPath === '/interviews' || currentPath.startsWith('/interviews/');
    }
    if (path === '/knowledgebase') {
      return currentPath === '/knowledgebase' || currentPath === '/knowledgebase/upload';
    }
    return currentPath.startsWith(path);
  };

  const renderNav = (onItemClick?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-5 dark:border-slate-800">
        <Link to="/" className="flex items-center gap-3" onClick={onItemClick}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-500 to-emerald-400 text-white shadow-lg shadow-cyan-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
              AI Interview
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              智能面试训练台
            </span>
          </div>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 lg:inline-flex"
          aria-label="切换主题"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-5 pt-4 lg:hidden">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-4 w-4" />
              切换浅色模式
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              切换深色模式
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          {navGroups.map((group) => (
            <div key={group.id}>
              <div className="mb-3 px-3">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </span>
              </div>

              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const active = isActive(item.path);

                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={onItemClick}
                      className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 ${
                        active
                          ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/10 dark:bg-white dark:text-slate-950'
                          : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                        active
                          ? 'bg-white/10 text-white dark:bg-slate-200 dark:text-slate-950'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-800 dark:group-hover:text-white'
                      }`}>
                        <item.icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className={`block text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
                          {item.label}
                        </span>
                        {item.description && (
                          <span className={`mt-0.5 block truncate text-xs ${
                            active
                              ? 'text-white/75 dark:text-slate-600'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}>
                            {item.description}
                          </span>
                        )}
                      </div>

                      <ChevronRight className={`h-4 w-4 transition-transform ${
                        active
                          ? 'translate-x-0 text-white/80 dark:text-slate-700'
                          : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600'
                      }`} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-200/80 p-4 dark:border-slate-800">
        <div className="rounded-[24px] bg-gradient-to-br from-cyan-500 via-sky-500 to-emerald-400 p-4 text-white shadow-lg shadow-cyan-500/25">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-50/80">AI Training</p>
          <p className="mt-2 text-sm font-semibold">从首页开始，快速进入当天的训练主线。</p>
          <p className="mt-1 text-xs text-cyan-50/80">支持简历、面试、知识库三条路径联动。</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-100 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-120px] top-[-60px] h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute bottom-[-120px] right-[-60px] h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-slate-200/70 lg:bg-slate-50/80 lg:backdrop-blur-xl dark:lg:border-slate-800 dark:lg:bg-slate-950/65">
        {renderNav()}
      </aside>

      <div className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-500 to-emerald-400 text-white shadow-lg shadow-cyan-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">
                AI Interview
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                智能面试训练台
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="打开导航"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              type="button"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
              aria-label="关闭导航遮罩"
            />

            <motion.aside
              initial={{x: -320}}
              animate={{x: 0}}
              exit={{x: -320}}
              transition={{type: 'spring', stiffness: 280, damping: 28}}
              className="fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  aria-label="关闭导航"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {renderNav(() => setMobileNavOpen(false))}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative min-h-screen px-4 pb-8 pt-4 sm:px-6 lg:ml-72 lg:px-8 lg:py-8">
        <motion.div
          key={currentPath}
          initial={{opacity: 0, y: 18}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.28}}
          className={isHomePage ? '' : 'mx-auto max-w-7xl'}
        >
          <Outlet context={{openInterviewModalWithResume}} />
        </motion.div>
      </main>

      <UnifiedInterviewModal
        isOpen={interviewModalPreset !== null}
        onClose={() => setInterviewModalPreset(null)}
        onStart={handleInterviewStart}
        defaultMode={interviewModalPreset?.defaultMode ?? 'text'}
        defaultResumeId={interviewModalPreset?.defaultResumeId}
        hideModeSwitch={interviewModalPreset?.defaultResumeId == null}
        title={interviewModalPreset?.title ?? '开始模拟面试'}
        subtitle={interviewModalPreset?.subtitle ?? '选择面试模式与主题，快速开始今天的训练。'}
        startButtonText={interviewModalPreset?.startButtonText ?? '开始面试'}
      />
    </div>
  );
}
