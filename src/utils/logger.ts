import chalk from 'chalk';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(chalk.red('✗'), message, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(chalk.yellow('⚠'), message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(chalk.blue('ℹ'), message, ...args);
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(chalk.green('✓'), message, ...args);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log(chalk.gray('⋯'), message, ...args);
    }
  }

  // Plain log without prefix (for structured output)
  plain(message: string, ...args: unknown[]): void {
    console.log(message, ...args);
  }
}

export const logger = new Logger();
