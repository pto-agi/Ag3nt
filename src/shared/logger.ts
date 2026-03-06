import pino from 'pino';
import { randomUUID } from 'crypto';

let currentRunId = '';

export function setRunId(runId: string) {
    currentRunId = runId;
}

export function generateRunId(): string {
    return `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

const transport = pino.transport({
    targets: [
        {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            level: 'trace',
        },
    ],
});

export const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
        mixin() {
            return currentRunId ? { runId: currentRunId } : {};
        },
    },
    transport,
);

export function createStepLogger(step: string) {
    return logger.child({ step });
}
