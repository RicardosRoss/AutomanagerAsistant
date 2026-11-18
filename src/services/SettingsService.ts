import moment from 'moment-timezone';
import User from '../models/User.js';
import { MAX_TASK_DURATION_MINUTES, MIN_PRODUCTION_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';

class SettingsService {
  async update(userId: number, field: string, value: string) {
    const changes: Record<string, string | number | boolean> = {};
    if (field === 'duration') {
      const duration = Number(value);
      if (
        !/^\d+$/.test(value) ||
        duration < MIN_PRODUCTION_TASK_DURATION_MINUTES ||
        duration > MAX_TASK_DURATION_MINUTES
      ) {
        throw new Error(
          `任务时长必须为${MIN_PRODUCTION_TASK_DURATION_MINUTES}到${MAX_TASK_DURATION_MINUTES}分钟的整数`
        );
      }
      changes['settings.defaultDuration'] = duration;
    } else if (field === 'timezone') {
      const zone = moment.tz.zone(value);
      if (!zone) throw new Error('时区无效，例如 Asia/Shanghai 或 America/Los_Angeles');
      changes['settings.timezone'] = zone.name;
    } else if (field === 'reminders') {
      if (!['on', 'off'].includes(value)) throw new Error('过程提醒只能设置为 on 或 off');
      changes['settings.reminderEnabled'] = value === 'on';
      changes['preferences.progressReminders'] = value === 'on';
    } else {
      throw new Error('可设置 duration、timezone 或 reminders');
    }
    const user = await User.findOneAndUpdate({ userId }, { $set: changes }, { new: true, runValidators: true });
    if (!user) throw new Error('请先使用 /start 初始化账户');
    return user;
  }
}

export default SettingsService;
