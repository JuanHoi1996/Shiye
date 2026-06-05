import React, { MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  BookCopy,
  Disc3,
  Volume2,
  StopCircle,
  Layers3,
  Plus,
  CornerDownRight,
  Pencil,
  Check,
  X,
  Copy as CopyIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Markdown, { MarkdownToJSX, RuleType } from 'markdown-to-jsx';
import Copy from './MessageActions/Copy';
import Rewrite from './MessageActions/Rewrite';
import Fork from './MessageActions/Fork';
import MessageSources from './MessageSources';
import SearchImages from './SearchImages';
import SearchVideos from './SearchVideos';
import { useSpeech } from 'react-text-to-speech';
import ThinkBox from './ThinkBox';
import { useChat, Section } from '@/lib/hooks/useChat';
import Citation from './MessageRenderer/Citation';
import AssistantSteps from './AssistantSteps';
import { ResearchBlock } from '@/lib/types';
import Renderer from './Widgets/Renderer';
import CodeBlock from './MessageRenderer/CodeBlock';
import TextareaAutosize from 'react-textarea-autosize';
import { getEnableTts } from '@/lib/config/clientRegistry';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const LatexRenderer = ({ children, inline }: { children: string; inline?: boolean }) => {
  const containerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (containerRef.current && typeof window !== 'undefined') {
      const render = async () => {
        if (!(window as any).katex) {
          if (!document.getElementById('katex-css')) {
            const link = document.createElement('link');
            link.id = 'katex-css';
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
            document.head.appendChild(link);
          }

          if (!document.getElementById('katex-js')) {
            const script = document.createElement('script');
            script.id = 'katex-js';
            script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
            script.async = true;
            document.head.appendChild(script);
            await new Promise((resolve) => { script.onload = resolve; });
          }
        }
        
        const katex = (window as any).katex;
        if (katex) {
          try {
            katex.render(children, containerRef.current, {
              throwOnError: false,
              displayMode: !inline,
            });
          } catch (err) {
            console.error('KaTeX render error:', err);
          }
        }
      };
      render();
    }
  }, [children, inline]);

  return <span ref={containerRef}>{children}</span>;
};

const ThinkTagProcessor = ({
  children,
  thinkingEnded,
}: {
  children: React.ReactNode;
  thinkingEnded: boolean;
}) => {
  return (
    <ThinkBox content={children as string} thinkingEnded={thinkingEnded} />
  );
};

const MessageBox = ({
  section,
  sectionIndex,
  dividerRef,
  isLast,
}: {
  section: Section;
  sectionIndex: number;
  dividerRef?: MutableRefObject<HTMLDivElement | null>;
  isLast: boolean;
}) => {
  const { t } = useTranslation();
  const {
    loading,
    sendMessage,
    rewrite,
    forkFromMessage,
    researchEnded,
    chatHistory,
    stopGeneration,
  } = useChat();

  const [ttsEnabled, setTtsEnabled] = React.useState(() =>
    typeof window !== 'undefined' ? getEnableTts() : false,
  );

  React.useEffect(() => {
    const sync = () => setTtsEnabled(getEnableTts());
    sync();
    window.addEventListener('client-config-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('client-config-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editQuery, setEditQuery] = React.useState(section.message.query);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const query = section.message.query;
  const queryLines = query.split('\n');
  // Fold if more than 200 characters OR more than 4 explicit lines
  const shouldFold = query.length > 200 || queryLines.length > 4;

  const displayQuery = isExpanded || !shouldFold
    ? query
    : query.slice(0, 180) + '...';

  const parsedMessage = section.parsedTextBlocks.join('\n\n');
  const speechMessage = section.speechMessage || '';
  const thinkingEnded = section.thinkingEnded;

  const sourceBlocks = section.message.responseBlocks.filter(
    (block): block is typeof block & { type: 'source' } =>
      block.type === 'source',
  );

  const sources = sourceBlocks.flatMap((block) => block.data);

  const hasContent = section.parsedTextBlocks.length > 0;

  const { speechStatus, start, stop } = useSpeech({ text: speechMessage });

  const markdownOverrides: MarkdownToJSX.Options = {
    renderRule(next, node, renderChildren, state) {
      if (node.type === RuleType.codeInline) {
        return `\`${node.text}\``;
      }

      if (node.type === RuleType.codeBlock) {
        return (
          <CodeBlock key={state.key} language={node.lang || ''}>
            {node.text}
          </CodeBlock>
        );
      }

      return next();
    },
    overrides: {
      think: {
        component: ThinkTagProcessor,
        props: {
          thinkingEnded: thinkingEnded,
        },
      },
      citation: {
        component: Citation,
      },
      latex: {
        component: LatexRenderer,
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className={'w-full pt-8 break-words'}>
        {isEditing ? (
          <div className="flex flex-col space-y-4 lg:w-9/12">
            <TextareaAutosize
              value={editQuery}
              onChange={(e) => setEditQuery(e.target.value)}
              className="p-4 bg-light-secondary dark:bg-dark-secondary text-black dark:text-white border border-light-200 dark:border-dark-200 rounded-xl focus:outline-none focus:border-sky-500 transition-colors duration-200 text-xl font-medium resize-none"
              autoFocus
            />
            <div className="flex flex-row items-center space-x-2">
              <button
                onClick={() => {
                  rewrite(section.message.messageId, editQuery);
                  setIsEditing(false);
                }}
                className="flex flex-row items-center space-x-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-full transition-colors duration-200"
              >
                <Check size={16} />
                <span className="text-sm font-medium">{t('messageBox.saveAndSubmit')}</span>
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditQuery(section.message.query);
                }}
                className="flex flex-row items-center space-x-2 bg-light-secondary dark:bg-dark-secondary hover:bg-light-300 dark:hover:bg-dark-300 text-black/70 dark:text-white/70 px-4 py-2 rounded-full transition-colors duration-200"
              >
                <X size={16} />
                <span className="text-sm font-medium">{t('common.cancel')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-row items-start justify-between group lg:w-9/12">
            <div className="flex flex-col items-start w-full">
              <h2 className="text-black dark:text-white font-medium text-2xl whitespace-pre-wrap break-words">
                {displayQuery}
              </h2>
              {shouldFold && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-2 flex items-center gap-1 text-sky-500 hover:text-sky-600 text-sm font-medium transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp size={14} />
                      {t('messageBox.showLess')}
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      {t('messageBox.showMore')}
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 ml-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(section.message.query);
                  toast.success(t('messageBox.promptCopied'));
                }}
                className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                title={t('messageBox.copyPrompt')}
              >
                <CopyIcon size={18} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                title={t('messageBox.editPrompt')}
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-9 lg:space-y-0 lg:flex-row lg:justify-between lg:space-x-9">
        <div
          ref={dividerRef}
          className="flex flex-col space-y-6 w-full lg:w-9/12"
        >
          {sources.length > 0 && (
            <div className="flex flex-col space-y-2">
              <div className="flex flex-row items-center space-x-2">
                <BookCopy className="text-black dark:text-white" size={20} />
                <h3 className="text-black dark:text-white font-medium text-xl">
                  {t('messageBox.sources')}
                </h3>
              </div>
              <MessageSources sources={sources} />
            </div>
          )}

          {section.message.responseBlocks
            .filter(
              (block): block is ResearchBlock =>
                block.type === 'research' && block.data.subSteps.length > 0,
            )
            .map((researchBlock) => (
              <div key={researchBlock.id} className="flex flex-col space-y-2">
                <AssistantSteps
                  block={researchBlock}
                  status={section.message.status}
                  isLast={isLast}
                />
              </div>
            ))}

          {isLast &&
            loading &&
            !researchEnded &&
            !section.message.responseBlocks.some(
              (b) => b.type === 'research' && b.data.subSteps.length > 0,
            ) && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Disc3 className="w-4 h-4 text-black dark:text-white animate-spin flex-shrink-0" />
                  <span className="text-sm text-black/70 dark:text-white/70">
                    {t('messageBox.brainstorming')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="p-2 text-red-500 rounded-full hover:bg-red-500/10 transition flex-shrink-0"
                  title={t('messageBox.stopGeneration')}
                >
                  <StopCircle size={16} />
                </button>
              </div>
            )}

          {section.widgets.length > 0 && <Renderer widgets={section.widgets} />}

          <div className="flex flex-col space-y-2">
            {sources.length > 0 && (
              <div className="flex flex-row items-center space-x-2">
                <Disc3
                  className={cn(
                    'text-black dark:text-white',
                    isLast && loading ? 'animate-spin' : 'animate-none',
                  )}
                  size={20}
                />
                <h3 className="text-black dark:text-white font-medium text-xl">
                  {t('messageBox.answer')}
                </h3>
              </div>
            )}

            {hasContent && (
              <>
                <Markdown
                  className={cn(
                    'prose prose-h1:mb-3 prose-h2:mb-2 prose-h2:mt-6 prose-h2:font-[800] prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:font-[600] dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 font-[400]',
                    'max-w-none break-words text-black dark:text-white',
                  )}
                  options={markdownOverrides}
                >
                  {parsedMessage}
                </Markdown>

                {isLast && loading ? (
                  <div className="flex flex-row items-center justify-between w-full text-black dark:text-white py-4">
                    <div className="flex flex-row items-center -ml-2">
                      <button
                        onClick={stopGeneration}
                        className="p-2 text-red-500 rounded-full hover:bg-red-500/10 transition duration-200 flex flex-row items-center space-x-1"
                        title={t('messageBox.stopGeneration')}
                      >
                        <StopCircle size={16} />
                        <span className="text-xs font-medium uppercase">
                          {t('common.stop')}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2 py-4">
                    <div className="flex flex-row items-center justify-between w-full text-black dark:text-white">
                      <div className="flex flex-row items-center -ml-2 gap-0.5">
                        <Rewrite
                          rewrite={rewrite}
                          messageId={section.message.messageId}
                        />
                        <Fork
                          forkFromMessage={forkFromMessage}
                          messageId={section.message.messageId}
                          disabled={section.message.status === 'answering'}
                        />
                      </div>
                      <div className="flex flex-row items-center -mr-2">
                        <Copy initialMessage={parsedMessage} section={section} />
                        {ttsEnabled && (
                          <button
                            onClick={() => {
                              if (speechStatus === 'started') {
                                stop();
                              } else {
                                start();
                              }
                            }}
                            className="p-2 text-black/70 dark:text-white/70 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary transition duration-200 hover:text-black dark:hover:text-white"
                          >
                            {speechStatus === 'started' ? (
                              <StopCircle size={16} />
                            ) : (
                              <Volume2 size={16} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {(section.message.modelKey ||
                      section.message.reasoningPreset ||
                      section.message.optimizationMode ||
                      section.message.branchMeta?.forkTargets?.length ||
                      section.message.branchMeta?.forkParentChatId) && (
                      <div className="flex flex-col gap-1">
                        {(section.message.branchMeta?.forkTargets?.length ||
                          section.message.branchMeta?.forkParentChatId) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/35 dark:text-white/35 font-normal normal-case tracking-normal">
                            {section.message.branchMeta?.forkParentChatId && (
                              <span>
                                {t('messageBox.forkFrom')}{' '}
                                <Link
                                  to={`/c/${section.message.branchMeta.forkParentChatId}`}
                                  className="text-sky-500 hover:text-sky-600 underline-offset-2 hover:underline"
                                  title={section.message.branchMeta.forkParentChatId}
                                >
                                  {t('messageBox.parentChat')}
                                </Link>
                              </span>
                            )}
                            {section.message.branchMeta?.forkTargets &&
                              section.message.branchMeta.forkTargets.length > 0 && (
                                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  <span>{t('messageBox.forkedTo')}</span>
                                  {section.message.branchMeta.forkTargets.map(
                                    (target, i) => (
                                      <Link
                                        key={target.chatId}
                                        to={`/c/${target.chatId}`}
                                        className="text-sky-500 hover:text-sky-600 underline-offset-2 hover:underline"
                                        title={target.chatId}
                                      >
                                        {t('messageBox.branch', { index: i + 1 })}
                                      </Link>
                                    ),
                                  )}
                                </span>
                              )}
                          </div>
                        )}
                        {(section.message.modelKey ||
                          section.message.reasoningPreset ||
                          section.message.optimizationMode) && (
                          <div className="flex items-center gap-2 text-[10px] text-black/30 dark:text-white/30 font-medium uppercase tracking-wider">
                            <span>
                              {t('messageBox.generatedWith', {
                                model:
                                  section.message.modelKey ||
                                  t('messageBox.unknownModel'),
                              })}
                            </span>
                            {section.message.reasoningPreset &&
                              section.message.reasoningPreset !== 'off' && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                                  <span>
                                    {t('messageBox.reasoning', {
                                      preset: section.message.reasoningPreset,
                                    })}
                                  </span>
                                </>
                              )}
                            {section.message.optimizationMode && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                                <span>
                                  {t('messageBox.searchMode', {
                                    mode: t(
                                      `optimization.${section.message.optimizationMode}.title`,
                                      {
                                        defaultValue:
                                          section.message.optimizationMode,
                                      },
                                    ),
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isLast &&
                  section.suggestions &&
                  section.suggestions.length > 0 &&
                  hasContent &&
                  !loading && (
                    <div className="mt-6">
                      <div className="flex flex-row items-center space-x-2 mb-4">
                        <Layers3
                          className="text-black dark:text-white"
                          size={20}
                        />
                        <h3 className="text-black dark:text-white font-medium text-xl">
                          {t('messageBox.related')}
                        </h3>
                      </div>
                      <div className="space-y-0">
                        {section.suggestions.map(
                          (suggestion: string, i: number) => (
                            <div key={i}>
                              <div className="h-px bg-light-200/40 dark:bg-dark-200/40" />
                              <button
                                onClick={() => sendMessage(suggestion)}
                                className="group w-full py-4 text-left transition-colors duration-200"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex flex-row space-x-3 items-center">
                                    <CornerDownRight
                                      size={15}
                                      className="group-hover:text-sky-400 transition-colors duration-200 flex-shrink-0"
                                    />
                                    <p className="text-sm text-black/70 dark:text-white/70 group-hover:text-sky-400 transition-colors duration-200 leading-relaxed">
                                      {suggestion}
                                    </p>
                                  </div>
                                  <Plus
                                    size={16}
                                    className="text-black/40 dark:text-white/40 group-hover:text-sky-400 transition-colors duration-200 flex-shrink-0"
                                  />
                                </div>
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {hasContent && (
          <div className="lg:sticky lg:top-20 flex flex-col items-center space-y-3 w-full lg:w-3/12 z-30 h-full pb-4">
            <SearchImages
              query={section.message.query}
              chatHistory={chatHistory}
              messageId={section.message.messageId}
            />
            <SearchVideos
              chatHistory={chatHistory}
              query={section.message.query}
              messageId={section.message.messageId}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBox;
