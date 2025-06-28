// app/utils/rules.ts
export interface BaseRule {
  id: string;
  name: string;
  type: string;
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

export interface CoRunRule extends BaseRule {
  type: 'coRun';
  tasks: string[];
}

export interface SlotRestrictionRule extends BaseRule {
  type: 'slotRestriction';
  groupType: 'client' | 'worker';
  groupName: string;
  minCommonSlots: number;
}

export interface LoadLimitRule extends BaseRule {
  type: 'loadLimit';
  workerGroup: string;
  maxSlotsPerPhase: number;
}

export interface PhaseWindowRule extends BaseRule {
  type: 'phaseWindow';
  taskId: string;
  allowedPhases: number[];
}

export interface PatternMatchRule extends BaseRule {
  type: 'patternMatch';
  regex: string;
  template: string;
  parameters: Record<string, any>;
}

export interface PrecedenceRule extends BaseRule {
  type: 'precedence';
  scope: 'global' | 'specific';
  specificTarget?: string;
  overridePriority: number;
}

export type Rule = CoRunRule | SlotRestrictionRule | LoadLimitRule | PhaseWindowRule | PatternMatchRule | PrecedenceRule;

export interface PrioritizationWeights {
  priorityLevel: number;
  requestedTasksFulfillment: number;
  fairnessConstraints: number;
  workerUtilization: number;
  skillMatching: number;
  phaseBalance: number;
  customWeights: Record<string, number>;
}

export interface WeightProfile {
  id: string;
  name: string;
  description: string;
  weights: PrioritizationWeights;
}

export const DEFAULT_WEIGHTS: PrioritizationWeights = {
  priorityLevel: 0.3,
  requestedTasksFulfillment: 0.25,
  fairnessConstraints: 0.15,
  workerUtilization: 0.15,
  skillMatching: 0.1,
  phaseBalance: 0.05,
  customWeights: {}
};

export const PRESET_PROFILES: WeightProfile[] = [
  {
    id: 'maximize-fulfillment',
    name: 'Maximize Fulfillment',
    description: 'Prioritizes completing as many requested tasks as possible',
    weights: {
      ...DEFAULT_WEIGHTS,
      requestedTasksFulfillment: 0.5,
      priorityLevel: 0.2,
      fairnessConstraints: 0.1,
      workerUtilization: 0.1,
      skillMatching: 0.05,
      phaseBalance: 0.05
    }
  },
  {
    id: 'fair-distribution',
    name: 'Fair Distribution',
    description: 'Ensures balanced workload across all workers',
    weights: {
      ...DEFAULT_WEIGHTS,
      fairnessConstraints: 0.4,
      workerUtilization: 0.25,
      requestedTasksFulfillment: 0.15,
      priorityLevel: 0.1,
      skillMatching: 0.05,
      phaseBalance: 0.05
    }
  },
  {
    id: 'minimize-workload',
    name: 'Minimize Workload',
    description: 'Reduces overall worker load while meeting essential requirements',
    weights: {
      ...DEFAULT_WEIGHTS,
      workerUtilization: 0.4,
      fairnessConstraints: 0.2,
      priorityLevel: 0.2,
      requestedTasksFulfillment: 0.1,
      skillMatching: 0.05,
      phaseBalance: 0.05
    }
  }
];

export function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}