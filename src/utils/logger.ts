type LogContext = Record<string, unknown> | undefined;

function formatMessage(message: string, context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return message;
  }
  return `${message} ${JSON.stringify(context)}`;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (__DEV__) {
      console.debug(formatMessage(message, context));
    }
  },
  info(message: string, context?: LogContext) {
    if (__DEV__) {
      console.info(formatMessage(message, context));
    }
  },
  warn(message: string, context?: LogContext) {
    console.warn(formatMessage(message, context));
  },
  error(message: string, context?: LogContext) {
    console.error(formatMessage(message, context));
  },
};
