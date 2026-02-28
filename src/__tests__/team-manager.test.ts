import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  createTeam,
  createTeamMember,
  createTeamSession,
  createTeamTask,
  createProject,
  getTeamMember,
  listTeamMembers,
  listTeamTasksForSession,
  updateTeamMember,
} from '../db.js';
import type { Team, TeamMember, TeamSession, TeamTask } from '../types.js';
import {
  createNewTeam,
  addMemberToTeam,
  suggestSmartTaskAssignment,
  suggestTaskAssignment,
  getTeamWorkloadDistribution,
  updateMemberExpertise,
  updateMemberCapacity,
  createTaskWithSmartAssignment,
  getTeamWithMembers,
} from '../team-manager.js';

describe('Team Manager - Smart Task Assignment', () => {
  let projectId: string;

  beforeEach(() => {
    _initTestDatabase();
    projectId = 'test-project-1';
    // Create a test project for the team
    createProject({
      id: projectId,
      name: 'Test Project',
      path: '/test/project',
      techStack: [],
      discoveredAt: new Date().toISOString(),
    });
  });

  // Helper function to create a test team with members
  async function createTestTeamWithMembers(): Promise<{
    team: Team;
    members: TeamMember[];
    session: TeamSession;
  }> {
    const team = await createNewTeam('test-team', projectId, 'Test Lead', {
      maxMembers: 5,
      coordinationMode: 'hierarchical',
      autoAssign: false,
    });

    // Add members with different expertise
    const member1 = addMemberToTeam(team.id, 'frontend-dev', 'developer', ['frontend', 'react']);
    const member2 = addMemberToTeam(team.id, 'backend-dev', 'developer', ['backend', 'api']);
    const member3 = addMemberToTeam(team.id, 'fullstack-dev', 'developer', ['frontend', 'backend', 'database']);
    const member4 = addMemberToTeam(team.id, 'ai-specialist', 'developer', ['ai', 'ml', 'python']);

    // Set expertise for members
    updateMemberExpertise(member1.id, ['frontend', 'react', 'typescript', 'css']);
    updateMemberExpertise(member2.id, ['backend', 'api', 'nodejs', 'database']);
    updateMemberExpertise(member3.id, ['frontend', 'backend', 'database', 'typescript', 'nodejs']);
    updateMemberExpertise(member4.id, ['ai', 'ml', 'python', 'tensorflow']);

    // Set different capacities
    updateMemberCapacity(member1.id, 3);
    updateMemberCapacity(member2.id, 5);
    updateMemberCapacity(member3.id, 4);
    updateMemberCapacity(member4.id, 2);

    // Re-read members from database to get updated values
    const members = listTeamMembers(team.id);

    // Create a session
    const session: TeamSession = {
      id: 'test-session-1',
      teamId: team.id,
      projectId,
      startedAt: new Date().toISOString(),
      status: 'active',
      tasks: [],
    };
    createTeamSession(session);

    return {
      team,
      members,
      session,
    };
  }

  describe('Skill Matching Algorithm', () => {
    it('should calculate skill match score correctly for exact matches', async () => {
      const { team } = await createTestTeamWithMembers();

      // Frontend task - should match frontend-dev and fullstack-dev
      const results = suggestSmartTaskAssignment(team.id, ['frontend', 'react']);

      expect(results.length).toBeGreaterThanOrEqual(4); // At least 4 members (may include team lead)

      // frontend-dev should have highest skill match (2/2 = 100%)
      const frontendDev = results.find((r) => r.member.name === 'frontend-dev');
      expect(frontendDev).toBeDefined();
      expect(frontendDev!.skillMatchScore).toBe(1);

      // fullstack-dev should have 50% match (has frontend but not react)
      const fullstackDev = results.find((r) => r.member.name === 'fullstack-dev');
      expect(fullstackDev).toBeDefined();
      expect(fullstackDev!.skillMatchScore).toBe(0.5);

      // backend-dev should have 0% match
      const backendDev = results.find((r) => r.member.name === 'backend-dev');
      expect(backendDev).toBeDefined();
      expect(backendDev!.skillMatchScore).toBe(0);
    });

    it('should calculate partial skill matches correctly', async () => {
      const { team } = await createTestTeamWithMembers();

      // Task requiring 3 skills
      const results = suggestSmartTaskAssignment(team.id, ['frontend', 'backend', 'database']);

      // fullstack-dev has all 3 skills (3/3 = 100%)
      const fullstackDev = results.find((r) => r.member.name === 'fullstack-dev');
      expect(fullstackDev!.skillMatchScore).toBe(1);

      // frontend-dev has 1/3 skills (frontend only)
      const frontendDev = results.find((r) => r.member.name === 'frontend-dev');
      expect(frontendDev!.skillMatchScore).toBeCloseTo(1 / 3);

      // backend-dev has 2/3 skills (backend, database)
      const backendDev = results.find((r) => r.member.name === 'backend-dev');
      expect(backendDev!.skillMatchScore).toBeCloseTo(2 / 3);

      // ai-specialist has 0/3 skills
      const aiSpecialist = results.find((r) => r.member.name === 'ai-specialist');
      expect(aiSpecialist!.skillMatchScore).toBe(0);
    });

    it('should treat no required skills as 100% match for everyone', async () => {
      const { team } = await createTestTeamWithMembers();

      const results = suggestSmartTaskAssignment(team.id, []);

      expect(results.length).toBeGreaterThanOrEqual(4); // 4 members (team lead may be included)
      for (const result of results) {
        expect(result.skillMatchScore).toBe(1);
      }
    });

    it('should be case-insensitive for skill matching', async () => {
      const { team } = await createTestTeamWithMembers();

      const results = suggestSmartTaskAssignment(team.id, ['FRONTEND', 'REACT']);

      const frontendDev = results.find((r) => r.member.name === 'frontend-dev');
      expect(frontendDev!.skillMatchScore).toBe(1);
    });
  });

  describe('Workload Factor Calculation', () => {
    it('should calculate workload factor correctly for idle members', async () => {
      const { team } = await createTestTeamWithMembers();

      const results = suggestSmartTaskAssignment(team.id, []);

      // All members have 0 tasks, so workload factor should be 1
      for (const result of results) {
        expect(result.currentTasks).toBe(0);
        expect(result.workloadFactor).toBe(1);
      }
    });

    it('should calculate workload factor correctly with active tasks', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const frontendDev = members.find((m) => m.name === 'frontend-dev')!;

      // Assign 2 tasks to frontend-dev (capacity = 3)
      createTeamTask({
        id: 'task-1',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDev.id,
        title: 'Task 1',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      createTeamTask({
        id: 'task-2',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDev.id,
        title: 'Task 2',
        status: 'pending',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      const results = suggestSmartTaskAssignment(team.id, []);

      const result = results.find((r) => r.member.name === 'frontend-dev');
      expect(result!.currentTasks).toBe(2);
      expect(result!.maxTasks).toBe(3);
      expect(result!.workloadFactor).toBeCloseTo(1 - 2 / 3);
    });

    it('should filter out members at full capacity', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const aiSpecialistMember = members.find((m) => m.name === 'ai-specialist')!;

      // ai-specialist has capacity of 2, assign 2 tasks
      createTeamTask({
        id: 'task-1',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: aiSpecialistMember.id,
        title: 'AI Task 1',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      createTeamTask({
        id: 'task-2',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: aiSpecialistMember.id,
        title: 'AI Task 2',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      const results = suggestSmartTaskAssignment(team.id, ['ai', 'ml']);

      // ai-specialist should be filtered out (at full capacity)
      const aiSpecialist = results.find((r) => r.member.name === 'ai-specialist');
      expect(aiSpecialist).toBeUndefined();

      // Team lead should also be filtered out (role='lead' is excluded)
      const lead = results.find((r) => r.member.role === 'lead');
      expect(lead).toBeUndefined();

      // Others should still be present (3 members)
      expect(results.length).toBe(3);
    });

    it('should not count completed tasks in workload', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const frontendDevMember = members.find((m) => m.name === 'frontend-dev')!;

      // Assign 1 completed and 1 active task to frontend-dev
      createTeamTask({
        id: 'task-1',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDevMember.id,
        title: 'Completed Task',
        status: 'completed',
        dependencies: [],
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        type: 'feature',
      });

      createTeamTask({
        id: 'task-2',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDevMember.id,
        title: 'Active Task',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      const results = suggestSmartTaskAssignment(team.id, []);

      const frontendDev = results.find((r) => r.member.name === 'frontend-dev');
      expect(frontendDev!.currentTasks).toBe(1); // Only active task counted
      expect(frontendDev!.workloadFactor).toBeCloseTo(1 - 1 / 3);
    });
  });

  describe('Overall Score Calculation', () => {
    it('should calculate overall score using correct weights', async () => {
      const { team } = await createTestTeamWithMembers();

      // All members idle, no required skills
      // Overall Score = (Skill Match * 0.6) + (Workload Factor * 0.4)
      // With no skills required, skill match = 1 for everyone
      // With no tasks, workload factor = 1 for everyone
      // So overall score = (1 * 0.6) + (1 * 0.4) = 1 for everyone

      const results = suggestSmartTaskAssignment(team.id, []);

      for (const result of results) {
        const expectedScore = result.skillMatchScore * 0.6 + result.workloadFactor * 0.4;
        expect(result.overallScore).toBeCloseTo(expectedScore);
        expect(result.overallScore).toBeCloseTo(1); // Since all factors are 1
      }
    });

    it('should sort results by overall score descending', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const frontendDevMember = members.find((m) => m.name === 'frontend-dev')!;
      const backendDevMember = members.find((m) => m.name === 'backend-dev')!;

      // Add a task to frontend-dev to lower their workload factor
      createTeamTask({
        id: 'task-1',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDevMember.id,
        title: 'Frontend Task',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      // Add a task to backend-dev as well
      createTeamTask({
        id: 'task-2',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: backendDevMember.id,
        title: 'Backend Task',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      // Search for skills that fullstack-dev fully matches
      const results = suggestSmartTaskAssignment(team.id, ['frontend', 'backend']);

      // fullstack-dev should have highest score (no tasks, full skill match)
      const fullstackDev = results.find((r) => r.member.name === 'fullstack-dev');
      expect(fullstackDev).toBeDefined();
      // skill=1 (has both frontend and backend), workload=1 -> score = 0.6 + 0.4 = 1.0
      expect(fullstackDev!.overallScore).toBeCloseTo(1.0);

      // frontend-dev should have lower score (has 1 task)
      const frontendDev = results.find((r) => r.member.name === 'frontend-dev');
      expect(frontendDev).toBeDefined();
      // skill=0.5 (only has frontend), workload=0.67 (2/3 capacity) -> score = 0.3 + 0.27 = 0.57
      expect(frontendDev!.overallScore).toBeCloseTo(0.57, 1);

      // backend-dev should also have lower score (has 1 task)
      const backendDev = results.find((r) => r.member.name === 'backend-dev');
      expect(backendDev).toBeDefined();
      // skill=0.5 (only has backend), workload=0.8 (4/5 capacity) -> score = 0.3 + 0.32 = 0.62
      expect(backendDev!.overallScore).toBeCloseTo(0.62, 1);

      // Verify fullstack-dev has highest score
      expect(fullstackDev!.overallScore).toBeGreaterThan(frontendDev!.overallScore);
      expect(fullstackDev!.overallScore).toBeGreaterThan(backendDev!.overallScore);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array when all members are at capacity', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      // Verify capacities are set correctly
      const frontendDevMember = members.find((m) => m.name === 'frontend-dev')!;
      const backendDevMember = members.find((m) => m.name === 'backend-dev')!;
      const fullstackDevMember = members.find((m) => m.name === 'fullstack-dev')!;
      const aiSpecialistMember = members.find((m) => m.name === 'ai-specialist')!;

      expect(frontendDevMember.maxConcurrentTasks).toBe(3);
      expect(backendDevMember.maxConcurrentTasks).toBe(5);
      expect(fullstackDevMember.maxConcurrentTasks).toBe(4);
      expect(aiSpecialistMember.maxConcurrentTasks).toBe(2);

      // Fill up all members to capacity
      const membersToFill = [
        { member: frontendDevMember, capacity: 3 },
        { member: backendDevMember, capacity: 5 },
        { member: fullstackDevMember, capacity: 4 },
        { member: aiSpecialistMember, capacity: 2 },
      ];

      let taskIndex = 0;
      for (const { member, capacity } of membersToFill) {
        for (let j = 0; j < capacity; j++) {
          createTeamTask({
            id: `task-${taskIndex}-${j}`,
            teamId: team.id,
            sessionId: session.id,
            assigneeId: member.id,
            title: `Task ${taskIndex}-${j}`,
            status: 'in_progress',
            dependencies: [],
            createdAt: new Date().toISOString(),
            type: 'feature',
          });
        }
        taskIndex++;
      }

      const results = suggestSmartTaskAssignment(team.id, []);
      expect(results.length).toBe(0);
    });

    it('should return empty array when team has no members', async () => {
      const team = await createNewTeam('empty-team', projectId, 'Solo Lead');

      const results = suggestSmartTaskAssignment(team.id, []);
      expect(results.length).toBe(0);
    });

    it('should filter out offline members', async () => {
      const { team, members } = await createTestTeamWithMembers();

      // Set frontend-dev to offline
      const frontendDevMember = members.find((m) => m.name === 'frontend-dev')!;
      updateTeamMember({ id: frontendDevMember.id, status: 'offline' });

      const results = suggestSmartTaskAssignment(team.id, []);

      expect(results.length).toBe(3);
      expect(results.find((r) => r.member.name === 'frontend-dev')).toBeUndefined();
    });

    it('should handle legacy members without expertise field', async () => {
      const { team, members } = await createTestTeamWithMembers();

      // Clear expertise from backend-dev to simulate legacy member
      // This tests the specialty fallback behavior
      const backendDevMember = members.find((m) => m.name === 'backend-dev')!;
      updateMemberExpertise(backendDevMember.id, []); // Clear expertise

      const results = suggestSmartTaskAssignment(team.id, ['backend']);

      // backend-dev should still match using specialty field (set in addMemberToTeam)
      const backendDev = results.find((r) => r.member.name === 'backend-dev');
      expect(backendDev).toBeDefined();
      // Specialty is ['backend', 'api'], so searching for ['backend'] should match
      expect(backendDev!.skillMatchScore).toBe(1);
    });
  });

  describe('Legacy suggestTaskAssignment', () => {
    it('should return top recommendation for backward compatibility', async () => {
      const { team } = await createTestTeamWithMembers();

      const member = suggestTaskAssignment(team.id);

      expect(member).not.toBeNull();
      expect(member!.name).toBeDefined();
    });

    it('should return null when no members available', async () => {
      const team = await createNewTeam('empty-team', projectId, 'Solo Lead');

      const member = suggestTaskAssignment(team.id);

      expect(member).toBeNull();
    });
  });

  describe('getTeamWorkloadDistribution', () => {
    it('should return correct workload for all members', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const frontendDevMember = members.find((m) => m.name === 'frontend-dev')!;
      const backendDevMember = members.find((m) => m.name === 'backend-dev')!;

      // Assign different number of tasks to each member
      // frontend-dev: 1 task (capacity 3)
      createTeamTask({
        id: 'task-1',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: frontendDevMember.id,
        title: 'Task 1',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      // backend-dev: 2 tasks (capacity 5)
      createTeamTask({
        id: 'task-2',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: backendDevMember.id,
        title: 'Task 2',
        status: 'in_progress',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });
      createTeamTask({
        id: 'task-3',
        teamId: team.id,
        sessionId: session.id,
        assigneeId: backendDevMember.id,
        title: 'Task 3',
        status: 'pending',
        dependencies: [],
        createdAt: new Date().toISOString(),
        type: 'feature',
      });

      const workload = getTeamWorkloadDistribution(team.id);

      // 4 regular members + team lead = 5 (but team lead is excluded from some calculations)
      expect(workload.length).toBeGreaterThanOrEqual(4);

      const frontendDev = workload.find((w) => w.member.name === 'frontend-dev');
      expect(frontendDev!.currentTasks).toBe(1);
      expect(frontendDev!.maxTasks).toBe(3);
      expect(frontendDev!.utilization).toBeCloseTo(1 / 3);

      const backendDev = workload.find((w) => w.member.name === 'backend-dev');
      expect(backendDev!.currentTasks).toBe(2);
      expect(backendDev!.maxTasks).toBe(5);
      expect(backendDev!.utilization).toBeCloseTo(2 / 5);
    });
  });

  describe('updateMemberExpertise', () => {
    it('should update member expertise correctly', async () => {
      const { team } = await createTestTeamWithMembers();
      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === 'frontend-dev')!;

      updateMemberExpertise(member.id, ['react', 'vue', 'angular']);

      const updated = getTeamMember(member.id);
      expect(updated!.expertise).toEqual(['react', 'vue', 'angular']);
    });

    it('should throw error for non-existent member', () => {
      expect(() => updateMemberExpertise('non-existent', ['skill'])).toThrow('Team member not found');
    });
  });

  describe('updateMemberCapacity', () => {
    it('should update member capacity correctly', async () => {
      const { team } = await createTestTeamWithMembers();
      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === 'frontend-dev')!;

      updateMemberCapacity(member.id, 7);

      const updated = getTeamMember(member.id);
      expect(updated!.maxConcurrentTasks).toBe(7);
    });

    it('should reject capacity less than 1', async () => {
      const { team } = await createTestTeamWithMembers();
      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === 'frontend-dev')!;

      expect(() => updateMemberCapacity(member.id, 0)).toThrow('Max concurrent tasks must be between 1 and 10');
    });

    it('should reject capacity greater than 10', async () => {
      const { team } = await createTestTeamWithMembers();
      const members = listTeamMembers(team.id);
      const member = members.find((m) => m.name === 'frontend-dev')!;

      expect(() => updateMemberCapacity(member.id, 11)).toThrow('Max concurrent tasks must be between 1 and 10');
    });
  });

  describe('createTaskWithSmartAssignment', () => {
    it('should create task with auto-assignment', async () => {
      const { team, session } = await createTestTeamWithMembers();

      const task = createTaskWithSmartAssignment(session.id, 'New Feature', {
        description: 'Implement new feature',
        type: 'feature',
        requiredSkills: ['frontend', 'react'],
        priority: 4,
        autoAssign: true,
      });

      expect(task.title).toBe('New Feature');
      expect(task.type).toBe('feature');
      expect(task.requiredSkills).toEqual(['frontend', 'react']);
      expect(task.priority).toBe(4);
      expect(task.assigneeId).toBeDefined();

      // Verify task was saved
      const tasks = listTeamTasksForSession(session.id);
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('New Feature');
    });

    it('should create task with specific assignee', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      const task = createTaskWithSmartAssignment(session.id, 'Backend API', {
        description: 'Create REST API',
        type: 'feature',
        assigneeId: members[1].id, // backend-dev
      });

      expect(task.assigneeId).toBe(members[1].id);

      const member = getTeamMember(members[1].id);
      expect(member!.currentTask).toBe(task.id);
      expect(member!.status).toBe('busy');
    });

    it('should throw error when no members available for auto-assign', async () => {
      const { team, members, session } = await createTestTeamWithMembers();

      // Get team lead
      const teamLead = getTeamMember(team.leadId)!;

      // Fill up all regular members
      for (const member of members) {
        const capacity = member.maxConcurrentTasks ?? 3;
        for (let i = 0; i < capacity; i++) {
          createTeamTask({
            id: `task-${member.id}-${i}`,
            teamId: team.id,
            sessionId: session.id,
            assigneeId: member.id,
            title: `Task ${i}`,
            status: 'in_progress',
            dependencies: [],
            createdAt: new Date().toISOString(),
            type: 'feature',
          });
        }
      }

      // Fill up team lead too (default capacity is 3)
      const leadCapacity = teamLead.maxConcurrentTasks ?? 3;
      for (let i = 0; i < leadCapacity; i++) {
        createTeamTask({
          id: `task-lead-${i}`,
          teamId: team.id,
          sessionId: session.id,
          assigneeId: teamLead.id,
          title: `Lead Task ${i}`,
          status: 'in_progress',
          dependencies: [],
          createdAt: new Date().toISOString(),
          type: 'feature',
        });
      }

      expect(() =>
        createTaskWithSmartAssignment(session.id, 'New Task', {
          autoAssign: true,
        })
      ).toThrow('No available team members for task assignment');
    });

    it('should throw error when session not found', () => {
      expect(() =>
        createTaskWithSmartAssignment('non-existent', 'Task', {
          autoAssign: true,
        })
      ).toThrow('Team session not found');
    });
  });
});
