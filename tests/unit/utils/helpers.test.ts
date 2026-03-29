import { describe, expect, test } from 'vitest';
import {
  formatDate,
  formatDuration,
  generateId,
  getTodayBounds,
  isToday,
  parseTaskCommand,
  validateTaskDuration,
  validateUserId
} from '../../../src/utils/helpers.js';

describe('Helper Functions', () => {
  describe('generateId', () => {
    test('应该生成带前缀的唯一ID', () => {
      const id1 = generateId('test');
      const id2 = generateId('test');

      expect(id1).toMatch(/^test_/);
      expect(id2).toMatch(/^test_/);
      expect(id1).not.toBe(id2);
    });

    test('默认前缀应该是id', () => {
      const id = generateId();
      expect(id).toMatch(/^id_/);
    });
  });

  describe('formatDuration', () => {
    test('应该正确格式化时长', () => {
      expect(formatDuration(0)).toBe('0分钟');
      expect(formatDuration(30)).toBe('30分钟');
      expect(formatDuration(60)).toBe('1小时');
      expect(formatDuration(90)).toBe('1小时30分钟');
      expect(formatDuration(120)).toBe('2小时');
    });

    test('负数或无效值应返回0分钟', () => {
      expect(formatDuration(-10)).toBe('0分钟');
      expect(formatDuration(null)).toBe('0分钟');
      expect(formatDuration(undefined)).toBe('0分钟');
    });
  });

  describe('formatDate', () => {
    test('应该正确格式化日期', () => {
      const testDate = new Date('2023-01-15 14:30:00');

      expect(formatDate(testDate, 'date')).toContain('2023');
      expect(formatDate(testDate, 'time')).toContain('14:30');
      expect(formatDate(testDate, 'datetime')).toContain('2023');
    });

    test('无效日期应返回错误信息', () => {
      expect(formatDate('invalid-date')).toBe('无效日期');
      expect(formatDate(null)).toBe('无效日期');
    });
  });

  describe('validateUserId', () => {
    test('有效用户ID应返回true', () => {
      expect(validateUserId(123456)).toBe(true);
      expect(validateUserId(1)).toBe(true);
    });

    test('无效用户ID应返回false', () => {
      expect(validateUserId(0)).toBe(false);
      expect(validateUserId(-1)).toBe(false);
      expect(validateUserId('123')).toBe(false);
      expect(validateUserId(null)).toBe(false);
    });
  });

  describe('validateTaskDuration', () => {
    test('有效时长应返回true', () => {
      expect(validateTaskDuration(5)).toBe(true);
      expect(validateTaskDuration(25)).toBe(true);
      expect(validateTaskDuration(480)).toBe(true);
    });

    test('无效时长应返回false', () => {
      expect(validateTaskDuration(4)).toBe(false);
      expect(validateTaskDuration(481)).toBe(false);
      expect(validateTaskDuration('25')).toBe(false);
      expect(validateTaskDuration(null)).toBe(false);
    });
  });

  describe('parseTaskCommand', () => {
    test('应该正确解析任务命令', () => {
      expect(parseTaskCommand('学习编程 30')).toEqual({
        description: '学习编程',
        duration: 30
      });

      expect(parseTaskCommand('写作业')).toEqual({
        description: '写作业',
        duration: 25
      });

      expect(parseTaskCommand('阅读书籍 90')).toEqual({
        description: '阅读书籍',
        duration: 90
      });
    });

    test('无效输入应返回默认值', () => {
      expect(parseTaskCommand('')).toEqual({
        description: '专注任务',
        duration: 25
      });

      expect(parseTaskCommand(null)).toEqual({
        description: '专注任务',
        duration: 25
      });
    });

    test('无效时长应使用描述', () => {
      expect(parseTaskCommand('学习编程 abc')).toEqual({
        description: '学习编程 abc',
        duration: 25
      });

      expect(parseTaskCommand('学习编程 600')).toEqual({
        description: '学习编程 600',
        duration: 25
      });
    });
  });

  describe('isToday', () => {
    test('今天的日期应返回true', () => {
      expect(isToday(new Date())).toBe(true);
    });

    test('昨天的日期应返回false', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('getTodayBounds', () => {
    test('应该返回今天的开始和结束时间', () => {
      const bounds = getTodayBounds();

      expect(bounds.start).toBeInstanceOf(Date);
      expect(bounds.end).toBeInstanceOf(Date);
      expect(bounds.start.getHours()).toBe(0);
      expect(bounds.start.getMinutes()).toBe(0);
      expect(bounds.end.getHours()).toBe(23);
      expect(bounds.end.getMinutes()).toBe(59);
    });
  });
});
