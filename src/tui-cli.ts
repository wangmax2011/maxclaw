#!/usr/bin/env node

// EPIC-008: TUI CLI Entry Point

import React from 'react';
import { render } from 'ink';
import { App } from './tui/app.js';

// Render the application
const { waitUntilExit } = render(React.createElement(App), {
  exitOnCtrlC: false,
});

// Wait for exit
waitUntilExit();
