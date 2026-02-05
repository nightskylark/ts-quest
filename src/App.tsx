import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { courseData, isStepCorrect, type Level, type Step } from "./data/course";

const STORAGE_KEY = "ts-quest-progress-v1";
const THEME_KEY = "ts-quest-theme";
const REVIEW_INTERVAL = 3;
type Theme = "light" | "dark";

type LevelProgress = {
  completed: boolean;
  stars: number;
  xp: number;
  lastPlayed: string;
};

type ProgressState = Record<string, LevelProgress>;

type ReviewSource = {
  step: Step;
  levelId: string;
  levelTitle: string;
};

type SessionStep = Step & {
  sessionId: string;
  isReview?: boolean;
  sourceLevelId?: string;
  sourceLevelTitle?: string;
  sessionOptions?: string[];
  sessionTokens?: string[];
  sessionLeft?: string[];
  sessionRight?: string[];
};

const loadProgress = (): ProgressState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProgressState;
  } catch {
    return {};
  }
};

const saveProgress = (progress: ProgressState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
};

const getLevelById = (levels: Level[], id: string | null) => {
  if (!id) return null;
  return levels.find((level) => level.id === id) ?? null;
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore storage errors
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
};

const getTotalXp = (progress: ProgressState) =>
  Object.values(progress).reduce((acc, level) => acc + level.xp, 0);

const starsToLabel = (stars: number) => "★".repeat(stars) + "☆".repeat(3 - stars);

const getDefaultAnswer = (step: Step): unknown => {
  switch (step.type) {
    case "choice":
      return "";
    case "fill":
      return "";
    case "order":
      return [] as string[];
    case "match":
      return {} as Record<string, string>;
    case "select-line":
      return 0;
    default:
      return "";
  }
};

const shuffle = <T,>(items: T[]) =>
  items
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

const toSessionStep = (step: Step, sessionId: string): SessionStep => {
  switch (step.type) {
    case "choice":
      return {
        ...step,
        sessionId,
        sessionOptions: shuffle(step.options),
      };
    case "order":
      return {
        ...step,
        sessionId,
        sessionTokens: shuffle(step.tokens),
      };
    case "match":
      return {
        ...step,
        sessionId,
        sessionLeft: shuffle(step.left),
        sessionRight: shuffle(step.right),
      };
    default:
      return { ...step, sessionId };
  }
};

const buildSessionSteps = (
  level: Level,
  reviewPool: ReviewSource[]
): SessionStep[] => {
  const baseSteps = shuffle(level.steps).map((step, index) =>
    toSessionStep(step, `base-${level.id}-${step.id}-${index}`)
  );

  if (reviewPool.length === 0) return baseSteps;

  const reviewSlots = Math.floor(baseSteps.length / REVIEW_INTERVAL);
  if (reviewSlots === 0) return baseSteps;

  const pickedReviews = shuffle(reviewPool).slice(0, reviewSlots);
  const result: SessionStep[] = [];
  let reviewIndex = 0;

  baseSteps.forEach((step, index) => {
    result.push(step);
    if ((index + 1) % REVIEW_INTERVAL === 0 && reviewIndex < pickedReviews.length) {
      const review = pickedReviews[reviewIndex];
      const reviewStep = toSessionStep(
        review.step,
        `review-${level.id}-${review.step.id}-${reviewIndex}`
      );
      result.push({
        ...reviewStep,
        isReview: true,
        sourceLevelId: review.levelId,
        sourceLevelTitle: review.levelTitle,
      });
      reviewIndex += 1;
    }
  });

  return result;
};

const renderCorrectAnswer = (step: Step) => {
  switch (step.type) {
    case "choice":
      return (
        <div className="correct-answer">
          <div>Правильный вариант:</div>
          <code>{step.answer}</code>
        </div>
      );
    case "fill":
      return (
        <div className="correct-answer">
          <div>
            {step.answers.length > 1 ? "Возможные ответы:" : "Правильный ответ:"}
          </div>
          <div className="answer-list">
            {step.answers.map((option) => (
              <code key={option}>{option}</code>
            ))}
          </div>
        </div>
      );
    case "order":
      return (
        <div className="correct-answer">
          <div>Правильная последовательность:</div>
          <code>{step.solution.join(" ")}</code>
        </div>
      );
    case "match":
      return (
        <div className="correct-answer">
          {step.pairs.map((pair) => (
            <div key={`${pair.left}-${pair.right}`}>
              <code>{pair.left}</code> → <code>{pair.right}</code>
            </div>
          ))}
        </div>
      );
    case "select-line": {
      const line = step.lines[step.answerLine - 1] ?? "";
      return (
        <div className="correct-answer">
          <div>Строка {step.answerLine}:</div>
          <code>{line}</code>
        </div>
      );
    }
    default:
      return null;
  }
};

export default function App() {
  const [progress, setProgress] = useState<ProgressState>(loadProgress);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const levels = useMemo(
    () => courseData.units.flatMap((unit) => unit.levels),
    []
  );

  const activeLevelIndex = useMemo(
    () => levels.findIndex((level) => level.id === activeLevelId),
    [levels, activeLevelId]
  );

  const reviewPool = useMemo(() => {
    if (activeLevelIndex <= 0) return [] as ReviewSource[];
    return levels.slice(0, activeLevelIndex).flatMap((level) =>
      level.steps.map((step) => ({
        step,
        levelId: level.id,
        levelTitle: level.title,
      }))
    );
  }, [levels, activeLevelIndex]);

  const totalXp = useMemo(() => getTotalXp(progress), [progress]);
  const activeLevel = getLevelById(levels, activeLevelId);

  const handleComplete = (level: Level, stars: number, earnedXp: number) => {
    const updated = {
      ...progress,
      [level.id]: {
        completed: true,
        stars,
        xp: earnedXp,
        lastPlayed: new Date().toISOString(),
      },
    };
    setProgress(updated);
    saveProgress(updated);
    setActiveLevelId(null);
  };

  const handleStart = (levelId: string) => setActiveLevelId(levelId);
  const toggleTheme = () =>
    setTheme((current) => (current === "light" ? "dark" : "light"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">TS</div>
          <div>
            <div className="title">{courseData.meta.title}</div>
            <div className="subtitle">{courseData.meta.subtitle}</div>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
          >
            <span className="theme-dot" />
            <span className="theme-label">
              {theme === "dark" ? "Темная тема" : "Светлая тема"}
            </span>
          </button>
          <div className="stats">
            <div className="stat-card">
              <span>XP</span>
              <strong>{totalXp}</strong>
            </div>
            <div className="stat-card">
              <span>Уроки</span>
              <strong>
                {Object.values(progress).filter((item) => item.completed).length}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <main className="content">
        {activeLevel ? (
          <LessonView
            level={activeLevel}
            reviewPool={reviewPool}
            onExit={() => setActiveLevelId(null)}
            onComplete={(stars, xp) => handleComplete(activeLevel, stars, xp)}
          />
        ) : (
          <MapView progress={progress} onStart={handleStart} />
        )}
      </main>
    </div>
  );
}

function MapView({
  progress,
  onStart,
}: {
  progress: ProgressState;
  onStart: (levelId: string) => void;
}) {
  return (
    <div className="map">
      <div className="map-header">
        <h1>Трасса обучения</h1>
        <p>
          Изучай TypeScript короткими спринтами. Каждая сессия — 3–5 минут.
        </p>
      </div>
      <div className="units">
        {courseData.units.map((unit, index) => (
          <section
            className="unit-card"
            key={unit.id}
            style={{ "--accent": unit.accent } as CSSProperties}
          >
            <div className="unit-header">
              <div>
                <span className="unit-index">Модуль {index + 1}</span>
                <h2>{unit.title}</h2>
                <p>{unit.description}</p>
              </div>
              <div className="unit-progress">
                <span>
                  {unit.levels.filter((level) => progress[level.id]?.completed)
                    .length}
                  /{unit.levels.length}
                </span>
                <small>уроков пройдено</small>
              </div>
            </div>
            <div className="level-grid">
              {unit.levels.map((level) => {
                const state = progress[level.id];
                return (
                  <article className="level-card" key={level.id}>
                    <div className="level-top">
                      <h3>{level.title}</h3>
                      <span className="goal">{level.goal}</span>
                    </div>
                    <div className="level-meta">
                      <span>{level.steps.length} заданий</span>
                      <span>
                        {state?.completed ? starsToLabel(state.stars) : "☆☆☆"}
                      </span>
                    </div>
                    <button className="primary" onClick={() => onStart(level.id)}>
                      {state?.completed ? "Повторить" : "Начать"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function LessonView({
  level,
  reviewPool,
  onExit,
  onComplete,
}: {
  level: Level;
  reviewPool: ReviewSource[];
  onExit: () => void;
  onComplete: (stars: number, xp: number) => void;
}) {
  const [stepsQueue, setStepsQueue] = useState<SessionStep[]>(() =>
    buildSessionSteps(level, reviewPool)
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [answer, setAnswer] = useState<unknown>(() =>
    getDefaultAnswer(stepsQueue[0] ?? level.steps[0])
  );
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  const [mistakes, setMistakes] = useState<SessionStep[]>([]);
  const [isRemedial, setIsRemedial] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const freshSteps = buildSessionSteps(level, reviewPool);
    setStepsQueue(freshSteps);
    setStepIndex(0);
    setAnswer(getDefaultAnswer(freshSteps[0] ?? level.steps[0]));
    setChecked(false);
    setCorrect(false);
    setMistakeCount(0);
    setEarnedXp(0);
    setMistakes([]);
    setIsRemedial(false);
    setShowTip(false);
  }, [level, reviewPool]);

  const step = stepsQueue[stepIndex];
  const progress = stepsQueue.length
    ? Math.round(((stepIndex + 1) / stepsQueue.length) * 100)
    : 0;

  const resetForStep = (nextStep: Step) => {
    setAnswer(getDefaultAnswer(nextStep));
    setChecked(false);
    setCorrect(false);
    setShowTip(false);
  };

  const handleCheck = () => {
    if (!step) return;
    const isCorrect = isStepCorrect(step, answer);
    setChecked(true);
    setCorrect(isCorrect);
    if (isCorrect) {
      setEarnedXp((prev) => prev + step.xp);
      return;
    }

    setMistakeCount((prev) => prev + 1);
    setMistakes((prev) =>
      prev.some((item) => item.sessionId === step.sessionId)
        ? prev
        : [...prev, step]
    );
  };

  const handleContinue = () => {
    if (!step) return;
    if (stepIndex + 1 >= stepsQueue.length) {
      if (!isRemedial && mistakes.length > 0) {
        const nextQueue = shuffle([...mistakes]);
        setStepsQueue(nextQueue);
        setStepIndex(0);
        setMistakes([]);
        setIsRemedial(true);
        resetForStep(nextQueue[0]);
        return;
      }
      const stars =
        mistakeCount === 0 ? 3 : mistakeCount <= 2 ? 2 : 1;
      onComplete(stars, earnedXp);
      return;
    }

    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    resetForStep(stepsQueue[nextIndex]);
  };

  if (!step) {
    return (
      <section className="lesson-card">
        <div className="lesson-header">
          <button className="ghost" onClick={onExit}>
            Вернуться
          </button>
          <div className="lesson-title">
            <h2>{level.title}</h2>
            <span>Нет заданий</span>
          </div>
        </div>
        <div className="lesson-body">
          <p>Этот урок пока пуст. Добавьте задания в JSON.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="lesson-card">
      <div className="lesson-header">
        <button className="ghost" onClick={onExit}>
          Вернуться
        </button>
        <div className="lesson-title">
          {(isRemedial || step.isReview) && (
            <div className="lesson-tags">
              {isRemedial && <span className="badge warn">Повтор ошибок</span>}
              {step.isReview && <span className="badge">Повтор</span>}
            </div>
          )}
          <h2>{level.title}</h2>
          <span>
            Шаг {stepIndex + 1} из {stepsQueue.length}
          </span>
        </div>
        <div className="lesson-status">
          <div className="mistakes">Ошибок: {mistakeCount}</div>
          <div className="xp">+{earnedXp} XP</div>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>

      <div className="lesson-body">
        <h3>{step.prompt}</h3>
        {step.isReview && step.sourceLevelTitle && (
          <div className="review-note">
            Повторяем тему из урока: {step.sourceLevelTitle}
          </div>
        )}
        <StepView step={step} answer={answer} onAnswer={setAnswer} />

        {step.tip && !checked && (
          <div className="tip-block">
            {!showTip ? (
              <button
                className="ghost tip-toggle"
                onClick={() => setShowTip(true)}
              >
                Показать подсказку
              </button>
            ) : (
              <div className="tip">{step.tip}</div>
            )}
          </div>
        )}

        {checked && (
          <div className={`result ${correct ? "ok" : "bad"}`}>
            {correct ? "Отлично!" : "Неправильно"}
            {step.explanation && <p>{step.explanation}</p>}
            {!correct && renderCorrectAnswer(step)}
          </div>
        )}
      </div>

      <div className="lesson-footer">
        {!checked ? (
          <button className="primary" onClick={handleCheck}>
            Проверить
          </button>
        ) : (
          <button className="primary" onClick={handleContinue}>
            Продолжить
          </button>
        )}
      </div>
    </section>
  );
}

function StepView({
  step,
  answer,
  onAnswer,
}: {
  step: SessionStep;
  answer: unknown;
  onAnswer: (value: unknown) => void;
}) {
  switch (step.type) {
    case "choice": {
      const choiceOptions = step.sessionOptions ?? step.options;
      return (
        <div className="choices">
          {choiceOptions.map((option) => (
            <button
              key={option}
              className={`choice ${answer === option ? "selected" : ""}`}
              onClick={() => onAnswer(option)}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }
    case "fill":
      return (
        <div className="fill">
          <input
            type="text"
            placeholder="Ответ"
            value={typeof answer === "string" ? answer : ""}
            onChange={(event) => onAnswer(event.target.value)}
          />
          <div className="hint">Подсказка: формат ввода не важен.</div>
        </div>
      );
    case "order": {
      const selected = Array.isArray(answer) ? answer : [];
      const tokens = step.sessionTokens ?? step.tokens;
      const counts = new Map<string, number>();
      selected.forEach((token) =>
        counts.set(token, (counts.get(token) ?? 0) + 1)
      );
      const pool = tokens.filter((token) => {
        const count = counts.get(token) ?? 0;
        if (count > 0) {
          counts.set(token, count - 1);
          return false;
        }
        return true;
      });

      return (
        <div className="order">
          <div className="order-target">
            {selected.length === 0 && <span>Собери строку</span>}
            {selected.map((token, index) => (
              <button
                key={`${token}-${index}`}
                className="token selected"
                onClick={() => {
                  const copy = [...selected];
                  copy.splice(index, 1);
                  onAnswer(copy);
                }}
              >
                {token}
              </button>
            ))}
          </div>
          <div className="order-pool">
            {pool.map((token, index) => (
              <button
                key={`${token}-pool-${index}`}
                className="token"
                onClick={() => onAnswer([...selected, token])}
              >
                {token}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "match": {
      const value =
        answer && typeof answer === "object"
          ? (answer as Record<string, string>)
          : {};
      const leftOptions = step.sessionLeft ?? step.left;
      const rightOptions = step.sessionRight ?? step.right;

      return (
        <div className="match">
          {leftOptions.map((left) => (
            <div className="match-row" key={left}>
              <span>{left}</span>
              <select
                value={value[left] ?? ""}
                onChange={(event) =>
                  onAnswer({
                    ...value,
                    [left]: event.target.value,
                  })
                }
              >
                <option value="">Выбери</option>
                {rightOptions.map((right) => (
                  <option key={right} value={right}>
                    {right}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case "select-line": {
      const selectedLine = typeof answer === "number" ? answer : 0;
      return (
        <div className="code-lines">
          {step.lines.map((line, index) => {
            const lineNumber = index + 1;
            return (
              <button
                key={`${step.id}-${lineNumber}`}
                className={`code-line ${
                  selectedLine === lineNumber ? "selected" : ""
                }`}
                onClick={() => onAnswer(lineNumber)}
              >
                <span>{lineNumber}</span>
                <code>{line}</code>
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
