import React, { useRef, useState } from 'react';
import { ClipboardCheck, HelpCircle, Lightbulb, PenLine, Sparkles, Trash2, X } from 'lucide-react';
import type { EssayDraft } from '../types';
import { resolveGenre, type GradeProfile } from '../data/gradeProfiles';
import { getGenreGuide } from '../services/libraryStore';
import { countChars, hintNext } from '../services/aiService';
import type { IdeaNote } from './IdeaTrainer';
import { inferGenreFromTitle } from '../utils/text';
import {
  Badge,
  Banner,
  Button,
  Card,
  CountChip,
  Field,
  INPUT_CLASS,
  IconButton,
  PageHeader,
  ProgressBar,
  Segmented,
  SpeechBubble, PasteCleanTextarea } from './ui';

interface WritingPadProps {
  profile: GradeProfile;
  draft: EssayDraft;
  onDraftChange: (patch: Partial<EssayDraft>) => void;
  ideaNote: IdeaNote | null;
  onDismissIdeaNote: () => void;
  onGoCoach: () => void;
}

const MIN_CHARS_FOR_HINT = 15;

export const WritingPad: React.FC<WritingPadProps> = ({
  profile,
  draft,
  onDraftChange,
  ideaNote,
  onDismissIdeaNote,
  onGoCoach,
}) => {
  const genre = resolveGenre(profile, draft.genre);
  const count = countChars(draft.content);
  const guide = getGenreGuide(genre);

  const [hint, setHint] = useState('');
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const clearTimer = useRef<number | undefined>(undefined);

  const askHint = async () => {
    setHint('');
    setHintError(null);
    setHintBusy(true);
    try {
      await hintNext({ profile, genre, title: draft.title, draft: draft.content, onText: setHint });
    } catch (e: any) {
      setHintError(e.message || '小导师暂时没听到，请稍后再试。');
    } finally {
      setHintBusy(false);
    }
  };

  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    window.clearTimeout(clearTimer.current);
    setConfirmClear(false);
    onDraftChange({ title: '', content: '' });
    setHint('');
  };

  const canHint = count >= MIN_CHARS_FOR_HINT && !hintBusy;

  return (
    <div className="space-y-6">
      <PageHeader
        accent="coral"
        icon={PenLine}
        title="写一写"
        subtitle={`在稿纸上动手写吧。${profile.name}的作文，${profile.defaultWordCount} 字左右就很棒。`}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        {/* 稿纸 */}
        <Card className="space-y-5">
          <Field label="作文题目">
            {(id) => (
              <input
                id={id}
                value={draft.title}
                onChange={(e) => {
                  const next = e.target.value;
                  const inferred = inferGenreFromTitle(next, profile.genres);
                  onDraftChange({ title: next, ...(inferred ? { genre: inferred } : {}) });
                }}
                placeholder="给你的作文起个好名字"
                className={`${INPUT_CLASS} font-read text-xl font-bold`}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">体裁</p>
            <Segmented value={genre} onChange={(g) => onDraftChange({ genre: g })} options={profile.genres} label="作文体裁" size="sm" />
          </div>

          <Field label="正文">
            {(id) => (
              <PasteCleanTextarea
                id={id}
                indentParagraphs
                value={draft.content}
                onChange={(e) => onDraftChange({ content: e.target.value })}
                placeholder="　　从这里开始写……写不下去的时候，右边有小导师帮你。"
                className="lined-paper min-h-[26rem] w-full resize-y rounded-2xl border-2 border-[#ece4d2] px-5 text-lg text-ink placeholder:text-ink-mute focus:border-coral-500 focus:ring-4 focus:ring-coral-100 focus:outline-none focus-visible:outline-none"
              />
            )}
          </Field>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CountChip count={count} target={profile.defaultWordCount} />
              <span className="text-sm text-ink-mute">内容会自动保存在这台电脑上</span>
            </div>
            <ProgressBar value={count} max={profile.defaultWordCount} accent="coral" label="字数进度" />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button size="lg" icon={ClipboardCheck} disabled={count < 30} onClick={onGoCoach}>
              写好了，去改一改
            </Button>
            <Button
              variant={confirmClear ? 'danger' : 'ghost'}
              icon={Trash2}
              onClick={clearAll}
              disabled={!draft.title && !draft.content}
            >
              {confirmClear ? '再点一次确认清空' : '清空重写'}
            </Button>
            {count < 30 && <span className="text-sm text-ink-mute">至少写够 30 个字，才能请老师批改</span>}
          </div>
        </Card>

        {/* 右侧小帮手 */}
        <aside className="space-y-5 xl:sticky xl:top-6" aria-label="写作小帮手">
          {ideaNote && (
            <Card tone="sun" className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-extrabold">
                  <Lightbulb className="size-5" aria-hidden="true" />
                  我的构思
                </h2>
                <IconButton icon={X} label="关闭构思卡片" onClick={onDismissIdeaNote} className="-mt-1 -mr-2" />
              </div>
              <p className="rounded-xl bg-white/80 p-3 text-sm leading-relaxed text-ink">{ideaNote.outline}</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink marker:font-bold">
                {ideaNote.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </Card>
          )}

          <Card className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <HelpCircle className="size-5 text-coral-700" aria-hidden="true" />
              卡住了？问问小导师
            </h2>
            {hint || hintBusy ? (
              <SpeechBubble mood="think" accent="coral">
                <span className="text-justify-zh whitespace-pre-line">{hint}</span>
                {hintBusy && <span className="caret" aria-hidden="true" />}
              </SpeechBubble>
            ) : (
              <p className="text-base text-ink-soft">
                小导师不会替你写，只会问你几个问题，帮你想到下一句。
              </p>
            )}
            {hintError && <Banner tone="error" title="没问成功">{hintError}</Banner>}
            <Button variant="soft" block icon={Sparkles} loading={hintBusy} disabled={!canHint} onClick={askHint}>
              {hintBusy ? '小导师在想…' : hint ? '再给点提示' : '给我一点提示'}
            </Button>
            {count < MIN_CHARS_FOR_HINT && (
              <p className="text-sm text-ink-mute">先写上几句话（至少 {MIN_CHARS_FOR_HINT} 个字），小导师才能看懂你写到哪儿了。</p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-base font-extrabold text-ink">{profile.name}写作小提醒</h2>
            <ul className="space-y-2">
              {profile.focus.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-base text-ink">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-coral-500" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="rounded-2xl bg-canvas p-3 text-sm leading-relaxed text-ink-soft">
              <Badge accent="coral" className="mb-1.5">
                {genre}怎么写
              </Badge>
              <p>{guide.guide}</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

