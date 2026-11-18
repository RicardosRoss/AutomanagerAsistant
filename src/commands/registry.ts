export interface CommandDefinition {
  handler: string;
  requiresPrivateChat: true;
  acceptsArguments: boolean;
  recoveryCommand: string;
}

export const COMMAND_REGISTRY = {
  schedule: { handler: 'schedule', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'schedule' },
  start: { handler: 'start', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'start' },
  help: { handler: 'help', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'help' },
  task: { handler: 'task', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'status' },
  reserve: { handler: 'reserve', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'reserve_status' },
  status: { handler: 'status', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'status' },
  stats: { handler: 'stats', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'stats' },
  week: { handler: 'week', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'week' },
  settings: { handler: 'settings', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'settings' },
  patterns: { handler: 'patterns', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'patterns' },
  precedents: {
    handler: 'precedents', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'precedents'
  },
  violation: { handler: 'violation', requiresPrivateChat: true, acceptsArguments: true, recoveryCommand: 'violation' },
  reserve_status: {
    handler: 'reserve_status', requiresPrivateChat: true, acceptsArguments: false, recoveryCommand: 'reserve_status'
  }
} as const satisfies Record<string, CommandDefinition>;

export type RegisteredCommand = keyof typeof COMMAND_REGISTRY;
export type CommandHandler = () => Promise<void>;

export function getCommandDefinition(command: string): CommandDefinition | undefined {
  return COMMAND_REGISTRY[command as RegisteredCommand];
}

export async function dispatchCommand(
  command: string,
  handlers: Partial<Record<RegisteredCommand, CommandHandler>>
): Promise<boolean> {
  const definition = getCommandDefinition(command);
  if (!definition) return false;
  const handler = handlers[definition.handler as RegisteredCommand];
  if (!handler) throw new Error(`命令处理器未注册: ${command}`);
  await handler();
  return true;
}
