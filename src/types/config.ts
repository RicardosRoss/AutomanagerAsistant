export type DeepPartial<T> =
  T extends Date | ((...args: never[]) => unknown) | string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>
        : { [K in keyof T]?: DeepPartial<T[K]> };

export interface AppConfig {
  app: {
    name: string;
    version: string;
    environment: string;
    port: number;
    debug: boolean;
  };
  telegram: {
    token?: string;
    webhookUrl?: string;
    polling: boolean;
    mockApi: boolean;
  };
  database: {
    uri?: string;
    testUri?: string;
    options: {
      maxPoolSize: number;
      serverSelectionTimeoutMS: number;
      socketTimeoutMS: number;
      [key: string]: unknown;
    };
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    retryDelayOnFailover?: number;
    maxRetriesPerRequest?: number;
    lazyConnect?: boolean;
    [key: string]: unknown;
  };
  logging: {
    level: string;
    file: string;
    format: string;
    datePattern: string;
    maxSize: string;
    maxFiles: string;
  };
  security: {
    jwtSecret?: string;
    encryptionKey?: string;
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
  };
  features: {
    progressReminders: boolean;
    weeklyReports: boolean;
    reservationSystem: boolean;
  };
  sacredSeat: {
    strictMode: boolean;
    autoChainBreak: boolean;
    resetOnFailure: boolean;
  };
  linearDelay: {
    defaultReservationDelay: number;
    reminderEnabled: boolean;
    maxDelayTime: number;
  };
  queues: {
    concurrency: number;
    maxConcurrentTasks: number;
    defaultJobOptions: {
      removeOnComplete: number;
      removeOnFail: number;
      attempts: number;
      backoff: {
        type: string;
        delay: number;
      };
    };
  };
  tasks: {
    defaultDuration: number;
    progressIntervals: number[];
    maxDuration: number;
    minDuration: number;
  };
  monitoring: {
    enabled: boolean;
    healthCheckInterval: number;
    metricsPath: string;
    healthPath: string;
  };
  testing: {
    timeout: number;
    mockExternalServices: boolean;
    resetDbBetweenTests: boolean;
  };
}
