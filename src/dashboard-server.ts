// MaxClaw Dashboard Server - Local web interface for project overview
// Pure Node.js, no external dependencies

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import type { Session, Project } from './types.js';
import {
  listProjects,
  listActiveSessions,
  listRecentActivities,
  getProject,
  listTeams,
  listTeamMembers,
  deleteProject,
  createProject,
} from './db.js';
import { loadConfig, saveConfig } from './config.js';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardConfig {
  port: number;
  host: string;
}

// Default dashboard HTML template - served as static file
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxClaw Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      line-height: 1.6;
    }

    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 20px 40px;
      border-bottom: 1px solid #333;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header h1 {
      font-size: 28px;
      background: linear-gradient(90deg, #00d4ff, #7b2cbf);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header p {
      color: #888;
      margin-top: 5px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 30px 40px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0f0f 100%);
      border: 1px solid #333;
      border-radius: 12px;
      padding: 24px;
      transition: transform 0.2s, border-color 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      border-color: #444;
    }

    .stat-card.active {
      border-color: #00d4ff;
      background: linear-gradient(135deg, #1a1a2e 0%, #0a2a3a 100%);
    }

    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }

    .stat-card.active .stat-value {
      color: #00d4ff;
    }

    .stat-label {
      color: #888;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .section {
      margin-bottom: 40px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 20px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-title::before {
      content: '';
      width: 4px;
      height: 24px;
      background: linear-gradient(180deg, #00d4ff, #7b2cbf);
      border-radius: 2px;
    }

    .refresh-btn {
      background: #1a1a2e;
      border: 1px solid #444;
      color: #888;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .refresh-btn:hover {
      background: #252545;
      color: #fff;
      border-color: #666;
    }

    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
    }

    .project-card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }

    .project-card:hover {
      border-color: #444;
      transform: translateY(-2px);
    }

    .project-card.active::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #00d4ff, #7b2cbf);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .project-name {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }

    .project-status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 500;
    }

    .status-active {
      background: rgba(0, 212, 255, 0.15);
      color: #00d4ff;
    }

    .status-idle {
      background: rgba(136, 136, 136, 0.15);
      color: #888;
    }

    .project-path {
      color: #666;
      font-size: 13px;
      font-family: 'Monaco', 'Menlo', monospace;
      margin-bottom: 12px;
      word-break: break-all;
    }

    .project-tech {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 15px;
    }

    .tech-tag {
      background: rgba(123, 44, 191, 0.2);
      color: #a855f7;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 12px;
    }

    .project-stats {
      display: flex;
      gap: 20px;
      padding-top: 15px;
      border-top: 1px solid #333;
    }

    .project-stat {
      display: flex;
      flex-direction: column;
    }

    .project-stat-value {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
    }

    .project-stat-label {
      font-size: 12px;
      color: #666;
    }

    .sessions-list {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 12px;
      overflow: hidden;
    }

    .session-item {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 150px 100px;
      gap: 15px;
      padding: 16px 20px;
      border-bottom: 1px solid #333;
      align-items: center;
      transition: background 0.2s;
    }

    .session-item:hover {
      background: #252545;
    }

    .session-item:last-child {
      border-bottom: none;
    }

    .session-project {
      font-weight: 500;
      color: #fff;
    }

    .session-time {
      color: #888;
      font-size: 14px;
    }

    .session-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-dot.active {
      background: #00d4ff;
      box-shadow: 0 0 8px #00d4ff;
      animation: blink 1.5s infinite;
    }

    .status-dot.completed {
      background: #22c55e;
    }

    .status-dot.interrupted {
      background: #ef4444;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .summary-badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 4px;
    }

    .summary-generated {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .summary-pending {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }

    .summary-failed {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    .summary-none {
      background: rgba(136, 136, 136, 0.15);
      color: #888;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .activity-timeline {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 20px;
    }

    .activity-item {
      display: flex;
      gap: 15px;
      padding: 12px 0;
      border-left: 2px solid #333;
      padding-left: 20px;
      margin-left: 10px;
      position: relative;
    }

    .activity-item::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 16px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #444;
    }

    .activity-item.session::before {
      background: #00d4ff;
    }

    .activity-item.command::before {
      background: #a855f7;
    }

    .activity-time {
      font-size: 13px;
      color: #666;
      min-width: 80px;
    }

    .activity-content {
      flex: 1;
    }

    .activity-type {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .activity-text {
      color: #e0e0e0;
    }

    .footer {
      text-align: center;
      padding: 40px;
      color: #666;
      border-top: 1px solid #333;
      margin-top: 40px;
    }

    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #333;
      border-top-color: #00d4ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .container {
        padding: 20px;
      }

      .session-item {
        grid-template-columns: 1fr;
        gap: 8px;
      }

      .project-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐾 MaxClaw Dashboard</h1>
    <p>Local Project Assistant Overview</p>
    <a href="/admin" style="color: #00d4ff; text-decoration: none; margin-top: 10px; display: inline-block;">⚙️ Admin Panel</a>
  </div>

  <div class="container">
    <!-- Stats Overview -->
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card active">
        <div class="stat-value" id="activeProjects">-</div>
        <div class="stat-label">Active Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="activeSessions">-</div>
        <div class="stat-label">Running Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalProjects">-</div>
        <div class="stat-label">Total Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalSessions">-</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="pendingSummaries">-</div>
        <div class="stat-label">Pending Summaries</div>
      </div>
    </div>

    <!-- Active Projects Section -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Active Projects</h2>
        <button class="refresh-btn" onclick="loadData()">🔄 Refresh</button>
      </div>
      <div class="project-grid" id="projectsGrid">
        <div class="empty-state">
          <div class="loading"></div>
          <p>Loading projects...</p>
        </div>
      </div>
    </div>

    <!-- Recent Sessions Section -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Recent Sessions</h2>
      </div>
      <div class="sessions-list" id="sessionsList">
        <div class="empty-state">
          <div class="loading"></div>
          <p>Loading sessions...</p>
        </div>
      </div>
    </div>

    <!-- Recent Activity Section -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Recent Activity</h2>
      </div>
      <div class="activity-timeline" id="activityTimeline">
        <div class="empty-state">
          <div class="loading"></div>
          <p>Loading activities...</p>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>MaxClaw Dashboard • Running locally on your machine</p>
    <p style="font-size: 12px; margin-top: 8px;">All data stays on your device</p>
  </div>

  <script>
    async function loadData() {
      try {
        const [projects, sessions, activities, stats] = await Promise.all([
          fetch('/api/projects').then(r => r.json()),
          fetch('/api/sessions').then(r => r.json()),
          fetch('/api/activities').then(r => r.json()),
          fetch('/api/stats').then(r => r.json())
        ]);

        renderStats(stats);
        renderProjects(projects, sessions);
        renderSessions(sessions);
        renderActivities(activities);
      } catch (error) {
        console.error('Failed to load data:', error);
        showError('Failed to load dashboard data. Is the server running?');
      }
    }

    function renderStats(stats) {
      document.getElementById('activeProjects').textContent = stats.activeProjects || 0;
      document.getElementById('activeSessions').textContent = stats.activeSessions || 0;
      document.getElementById('totalProjects').textContent = stats.totalProjects || 0;
      document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
      document.getElementById('pendingSummaries').textContent = stats.pendingSummaries || 0;
    }

    function renderProjects(projects, sessions) {
      const grid = document.getElementById('projectsGrid');

      if (projects.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-state-icon">📁</div><p>No projects registered yet</p><p style="font-size: 14px; margin-top: 8px;">Run "maxclaw discover" to find projects</p></div>';
        return;
      }

      // Sort by active sessions first, then by last accessed
      const projectSessions = new Map();
      sessions.forEach(s => {
        const count = projectSessions.get(s.projectId) || { active: 0, total: 0 };
        count.total++;
        if (s.status === 'active') count.active++;
        projectSessions.set(s.projectId, count);
      });

      const sortedProjects = [...projects].sort((a, b) => {
        const aActive = (projectSessions.get(a.id)?.active || 0) > 0;
        const bActive = (projectSessions.get(b.id)?.active || 0) > 0;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return new Date(b.lastAccessed || 0) - new Date(a.lastAccessed || 0);
      });

      grid.innerHTML = sortedProjects.map(project => {
        const sessions = projectSessions.get(project.id) || { active: 0, total: 0 };
        const isActive = sessions.active > 0;

        return '<div class="project-card ' + (isActive ? 'active' : '') + '">' +
          '<div class="project-header">' +
            '<div class="project-name">' + escapeHtml(project.name) + '</div>' +
            '<span class="project-status ' + (isActive ? 'status-active' : 'status-idle') + '">' +
              (isActive ? '● Active' : 'Idle') +
            '</span>' +
          '</div>' +
          '<div class="project-path">' + escapeHtml(project.path) + '</div>' +
          '<div class="project-tech">' +
            (project.techStack || []).slice(0, 5).map(t => '<span class="tech-tag">' + escapeHtml(t) + '</span>').join('') +
          '</div>' +
          '<div class="project-stats">' +
            '<div class="project-stat">' +
              '<span class="project-stat-value">' + sessions.active + '</span>' +
              '<span class="project-stat-label">Active Sessions</span>' +
            '</div>' +
            '<div class="project-stat">' +
              '<span class="project-stat-value">' + sessions.total + '</span>' +
              '<span class="project-stat-label">Total Sessions</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderSessions(sessions) {
      const list = document.getElementById('sessionsList');

      if (sessions.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>No sessions yet</p></div>';
        return;
      }

      // Sort by most recent first
      const sortedSessions = [...sessions].sort((a, b) =>
        new Date(b.startedAt) - new Date(a.startedAt)
      ).slice(0, 20);

      list.innerHTML = sortedSessions.map(session => {
        const duration = session.endedAt
          ? formatDuration(new Date(session.startedAt), new Date(session.endedAt))
          : formatDuration(new Date(session.startedAt), new Date());

        const summaryClass = session.summaryStatus === 'generated' ? 'summary-generated' :
                            session.summaryStatus === 'pending' ? 'summary-pending' :
                            session.summaryStatus === 'failed' ? 'summary-failed' : 'summary-none';

        const summaryText = session.summaryStatus === 'generated' ? 'Generated' :
                           session.summaryStatus === 'pending' ? 'Pending' :
                           session.summaryStatus === 'failed' ? 'Failed' : 'None';

        return '<div class="session-item">' +
          '<div class="session-project">' + escapeHtml(session.projectName || 'Unknown') + '</div>' +
          '<div class="session-time">' + formatDate(session.startedAt) + '</div>' +
          '<div class="session-status">' +
            '<span class="status-dot ' + session.status + '"></span>' +
            session.status +
          '</div>' +
          '<div class="session-time">' + duration + '</div>' +
          '<span class="summary-badge ' + summaryClass + '">' + summaryText + '</span>' +
        '</div>';
      }).join('');
    }

    function renderActivities(activities) {
      const timeline = document.getElementById('activityTimeline');

      if (activities.length === 0) {
        timeline.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No recent activity</p></div>';
        return;
      }

      timeline.innerHTML = activities.slice(0, 15).map(activity => {
        const typeClass = activity.type === 'start' || activity.type === 'complete' ? 'session' : 'command';
        return '<div class="activity-item ' + typeClass + '">' +
          '<div class="activity-time">' + formatTime(activity.timestamp) + '</div>' +
          '<div class="activity-content">' +
            '<div class="activity-type">' + activity.type + '</div>' +
            '<div class="activity-text">' + escapeHtml(activity.details || '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatTime(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDuration(start, end) {
      const diff = Math.floor((end - start) / 1000);
      const hours = Math.floor(diff / 3600);
      const mins = Math.floor((diff % 3600) / 60);

      if (hours > 0) return hours + 'h ' + mins + 'm';
      return mins + 'm';
    }

    function showError(message) {
      document.querySelectorAll('.empty-state').forEach(el => {
        el.innerHTML = '<div style="color: #ef4444;">❌ ' + escapeHtml(message) + '</div>';
      });
    }

    // Load data on page load
    loadData();

    // Auto-refresh every 30 seconds
    setInterval(loadData, 30000);
  </script>
</body>
</html>`;

export class DashboardServer {
  private server: http.Server | null = null;
  private config: DashboardConfig;

  constructor(config: Partial<DashboardConfig> = {}) {
    this.config = {
      port: config.port || 9876,
      host: config.host || '127.0.0.1',
    };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this));

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(
          'Dashboard server started at http://%s:%d',
          this.config.host,
          this.config.port
        );
        resolve();
      });

      this.server.on('error', (err) => {
        logger.error('Dashboard server error: %s', err);
        reject(err);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Dashboard server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';

    // Enable CORS for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route handling
    if (url === '/' || url === '/index.html') {
      this.serveDashboard(res);
    } else if (url === '/admin') {
      this.serveAdmin(res);
    } else if (url === '/api/stats') {
      this.serveStats(res);
    } else if (url === '/api/projects') {
      if (req.method === 'POST') {
        this.handleAddProject(req, res);
      } else if (req.method === 'DELETE') {
        this.handleDeleteProject(req, res);
      } else {
        this.serveProjects(res);
      }
    } else if (url === '/api/sessions') {
      this.serveSessions(res);
    } else if (url === '/api/activities') {
      this.serveActivities(res);
    } else if (url === '/api/config') {
      if (req.method === 'GET') {
        this.serveConfig(res);
      } else if (req.method === 'POST') {
        this.handleSaveConfig(req, res);
      }
    } else if (url === '/api/skills') {
      if (req.method === 'GET') {
        this.serveSkills(res);
      } else if (req.method === 'POST') {
        this.handleToggleSkill(req, res);
      }
    } else if (url === '/api/schedules') {
      this.serveSchedules(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private serveAdmin(res: http.ServerResponse): void {
    const adminHtml = fs.readFileSync(path.join(__dirname, 'dashboard-admin.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(adminHtml);
  }

  private serveDashboard(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD_HTML);
  }

  private serveStats(res: http.ServerResponse): void {
    try {
      const projects = listProjects();
      const sessions = listActiveSessions();
      const allSessions = listActiveSessions(); // Get all sessions through project queries
      const pendingSummaries = sessions.filter(
        (s: Session) => s.status === 'completed' && (!s.summaryStatus || s.summaryStatus === 'pending')
      );

      const stats = {
        totalProjects: projects.length,
        totalSessions: allSessions.length,
        activeProjects: new Set(sessions.map((s: Session) => s.projectId)).size,
        activeSessions: sessions.length,
        pendingSummaries: pendingSummaries.length,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (error) {
      logger.error('Error serving stats: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load stats' }));
    }
  }

  private serveProjects(res: http.ServerResponse): void {
    try {
      const projects = listProjects();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(projects));
    } catch (error) {
      logger.error('Error serving projects: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load projects' }));
    }
  }

  private serveSessions(res: http.ServerResponse): void {
    try {
      const projects = listProjects();
      const allSessions: Session[] = [];

      // Collect sessions from all projects
      for (const project of projects) {
        const sessions = listActiveSessions().filter((s: Session) => s.projectId === project.id);
        allSessions.push(...sessions);
      }

      const projectMap = new Map(projects.map((p: Project) => [p.id, p.name]));

      const enrichedSessions = allSessions.map((s: Session) => ({
        ...s,
        projectName: projectMap.get(s.projectId) || 'Unknown',
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(enrichedSessions));
    } catch (error) {
      logger.error('Error serving sessions: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load sessions' }));
    }
  }

  private serveActivities(res: http.ServerResponse): void {
    try {
      const activities = listRecentActivities(20);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(activities));
    } catch (error) {
      logger.error('Error serving activities: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load activities' }));
    }
  }

  private serveConfig(res: http.ServerResponse): void {
    try {
      const config = loadConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
    } catch (error) {
      logger.error('Error serving config: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load config' }));
    }
  }

  private handleSaveConfig(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body);
        const config = loadConfig();

        // Merge config
        if (newConfig.scanPaths !== undefined) config.scanPaths = newConfig.scanPaths;
        if (newConfig.ai) config.ai = { ...config.ai, ...newConfig.ai };
        if (newConfig.multiplex) config.multiplex = { ...config.multiplex, ...newConfig.multiplex };
        if (newConfig.tui) config.tui = { ...config.tui, ...newConfig.tui };

        saveConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        logger.error('Error saving config: %s', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save config' }));
      }
    });
  }

  private handleAddProject(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { name, path } = JSON.parse(body);
        if (!name || !path) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Name and path are required' }));
          return;
        }

        const project = {
          id: uuidv4(),
          name,
          path,
          description: '',
          techStack: [],
          discoveredAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
        };

        createProject(project);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, project }));
      } catch (error) {
        logger.error('Error adding project: %s', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to add project' }));
      }
    });
  }

  private handleDeleteProject(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project ID is required' }));
          return;
        }

        deleteProject(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        logger.error('Error deleting project: %s', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete project' }));
      }
    });
  }

  private serveSkills(res: http.ServerResponse): void {
    try {
      // Return mock skills data - will be implemented later
      const skills = [
        { id: '1', name: 'brainstorming', description: 'Brainstorming ideas into designs', enabled: true },
        { id: '2', name: 'test-driven-development', description: 'TDD workflow', enabled: false },
        { id: '3', name: 'writing-plans', description: 'Write implementation plans', enabled: true },
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(skills));
    } catch (error) {
      logger.error('Error serving skills: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load skills' }));
    }
  }

  private handleToggleSkill(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Mock implementation - will be implemented later
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }

  private serveSchedules(res: http.ServerResponse): void {
    try {
      // Return mock schedules data - will be implemented later
      const schedules = [
        { id: '1', name: 'Daily Backup', cronExpression: '0 2 * * *', enabled: true },
        { id: '2', name: 'Weekly Report', cronExpression: '0 9 * * 1', enabled: false },
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(schedules));
    } catch (error) {
      logger.error('Error serving schedules: %s', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load schedules' }));
    }
  }
}

let globalServer: DashboardServer | null = null;

export async function startDashboard(port?: number): Promise<string> {
  if (globalServer) {
    await globalServer.stop();
  }

  globalServer = new DashboardServer({ port });
  await globalServer.start();

  const url = `http://127.0.0.1:${port || 9876}`;

  // Try to open browser
  try {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} ${url}`, { stdio: 'ignore' });
  } catch {
    // Ignore errors opening browser
  }

  return url;
}

export async function stopDashboard(): Promise<void> {
  if (globalServer) {
    await globalServer.stop();
    globalServer = null;
  }
}
