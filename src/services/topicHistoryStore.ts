/**
 * 盲盒题目历史存储服务
 * 记录用户抽到并看过的 AI / 内置盲盒题目，支持随时调出历史选题。
 */
import { useSyncExternalStore } from 'react';
import type { TopicHistoryItem } from '../types';

const STORAGE_KEY = 'writing_master_topic_history';
const MAX_HISTORY = 80;

type Listener = () => void;
const listeners = new Set<Listener>();

function load(): TopicHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TopicHistoryItem[];
  } catch (e) {
    console.warn('读取盲盒题目历史失败', e);
  }
  return [];
}

let historyCache: TopicHistoryItem[] = load();

function notify() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyCache));
  } catch (e) {
    console.error('保存盲盒题目历史失败', e);
  }
  listeners.forEach((l) => l());
}

export function getTopicHistory(): TopicHistoryItem[] {
  return historyCache;
}

export function addTopicHistory(input: {
  topic: string;
  genre: string;
  tip: string;
  gradeName: string;
  source: 'ai' | 'builtin';
}): TopicHistoryItem {
  const cleanTopic = input.topic.trim();
  // 查找是否已存在相同题目
  const existingIndex = historyCache.findIndex(
    (item) => item.topic.trim() === cleanTopic && item.gradeName === input.gradeName
  );

  const item: TopicHistoryItem = {
    id: existingIndex >= 0 ? historyCache[existingIndex].id : `th-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    topic: cleanTopic,
    genre: input.genre,
    tip: input.tip,
    gradeName: input.gradeName,
    source: input.source,
    createdAt: new Date().toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  const next = historyCache.filter((_, idx) => idx !== existingIndex);
  next.unshift(item);
  historyCache = next.slice(0, MAX_HISTORY);
  notify();
  return item;
}

export function removeTopicHistory(id: string): void {
  historyCache = historyCache.filter((item) => item.id !== id);
  notify();
}

export function clearTopicHistory(): void {
  historyCache = [];
  notify();
}

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTopicHistory(): TopicHistoryItem[] {
  return useSyncExternalStore(subscribe, getTopicHistory, getTopicHistory);
}

