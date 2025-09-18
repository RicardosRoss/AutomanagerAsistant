// 简单的系统验证测试
import { generateId, formatDuration, parseTaskCommand } from '../../src/utils/helpers.js';

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
    expect(result2.duration).toBe(25);
  });

  test('神圣座位原理常量验证', async () => {
    const constants = await import('../../src/utils/constants.js');
    expect(constants.SACRED_SEAT_PRINCIPLE.RESET_ON_FAILURE).toBe(true);
    expect(constants.LINEAR_DELAY_PRINCIPLE.DEFAULT_DELAY_MINUTES).toBe(15);
  });
});