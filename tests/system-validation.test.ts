import { describe, expect, test } from 'vitest';
import { generateId, formatDuration, parseTaskCommand } from '../src/utils/helpers.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../src/types/taskDefaults.js';
import { LINEAR_DELAY_PRINCIPLE, SACRED_SEAT_PRINCIPLE } from '../src/utils/constants.js';

describe('系统基础功能验证', () => {
  test('ID生成功能正常', () => {
    const id = generateId('test');
    expect(id).toBeDefined();
    expect(id).toMatch(/^test_/);
  });

  test('时长格式化功能正常', () => {
    expect(formatDuration(30)).toBe('30分钟');
    expect(formatDuration(60)).toBe('1小时');
    expect(formatDuration(90)).toBe('1小时30分钟');
  });

  test('任务命令解析功能正常', () => {
    const result1 = parseTaskCommand('学习编程 30');
    expect(result1.description).toBe('学习编程');
    expect(result1.duration).toBe(30);

    const result2 = parseTaskCommand('写作业');
    expect(result2.description).toBe('写作业');
    expect(result2.duration).toBe(DEFAULT_TASK_DURATION_MINUTES);
  });

  test('统一默认任务时长常量应为60分钟', () => {
    expect(DEFAULT_TASK_DURATION_MINUTES).toBe(60);
  });

  test('神圣座位原理常量验证', () => {
    expect(SACRED_SEAT_PRINCIPLE.RESET_ON_FAILURE).toBe(true);
    expect(LINEAR_DELAY_PRINCIPLE.DEFAULT_DELAY_MINUTES).toBe(15);
  });
});
