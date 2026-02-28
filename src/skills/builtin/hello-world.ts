// Hello World Skill - Example built-in skill for MaxClaw

import type { Skill, SkillContext, SkillManifest } from '../types.js';

const manifest: SkillManifest = {
  name: 'hello-world',
  version: '1.0.0',
  description: 'A simple greeting skill that demonstrates the MaxClaw Skills API',
  author: 'MaxClaw Team',
  commands: [
    {
      name: 'greet',
      description: 'Say hello to the user',
      args: [
        {
          name: 'name',
          description: "Name to greet (optional, defaults to 'World')",
          required: false,
        },
      ],
      options: [
        {
          name: 'uppercase',
          alias: 'u',
          description: 'Output in uppercase',
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      name: 'goodbye',
      description: 'Say goodbye to the user',
      args: [
        {
          name: 'name',
          description: 'Name to bid farewell (optional)',
          required: false,
        },
      ],
    },
  ],
  permissions: ['fs:read'],
};

let context: SkillContext | null = null;

const skill: Skill = {
  manifest,

  async activate(ctx: SkillContext): Promise<void> {
    context = ctx;
    context.logger.info('Hello World skill activated!');
  },

  async deactivate(): Promise<void> {
    context?.logger.info('Hello World skill deactivated!');
    context = null;
  },

  async execute(
    commandName: string,
    args: string[],
    options: Record<string, unknown>
  ): Promise<string> {
    if (!context) {
      throw new Error('Skill not activated');
    }

    const name = args[0] || 'World';

    switch (commandName) {
      case 'greet': {
        let message = `Hello, ${name}! Welcome to MaxClaw.`;
        if (options.uppercase) {
          message = message.toUpperCase();
        }
        context.logger.debug('Greeting executed for: %s', name);
        return message;
      }

      case 'goodbye': {
        const message = `Goodbye, ${name}! Thanks for using MaxClaw.`;
        context.logger.debug('Goodbye executed for: %s', name);
        return message;
      }

      default:
        throw new Error(`Unknown command: ${commandName}`);
    }
  },
};

export default skill;
