import { log } from "../deps.ts";

// set up console and file logging
// you can change format of output message using any keys in `LogRecord`.
log.setup({
  handlers: {
    console: new log.ConsoleHandler("DEBUG", {
      formatter: (record) => `${record.msg}`,
    }),

    file: new log.FileHandler("DEBUG", {
      filename: "./log.txt",
      formatter: (record) => `${record.datetime}: ${record.msg}`,
    }),
  },
  loggers: {
    // configure default logger available via short-hand methods above.
    default: {
      level: "DEBUG",
      handlers: ["console", "file"],
    },

    tasks: {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

export const logger = log.getLogger();
