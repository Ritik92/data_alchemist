// app/utils/validations.ts
import { Rule, CoRunRule, PhaseWindowRule } from './rules';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  row: number;
  field?: string;
}

export interface DataRow {
  [key: string]: any;
}

export class Validator {
  private clientData: DataRow[] = [];
  private workerData: DataRow[] = [];
  private taskData: DataRow[] = [];
  private rules: Rule[] = [];

  setData(type: 'clients' | 'workers' | 'tasks', data: DataRow[]) {
    switch (type) {
      case 'clients':
        this.clientData = data;
        break;
      case 'workers':
        this.workerData = data;
        break;
      case 'tasks':
        this.taskData = data;
        break;
    }
  }

  setRules(rules: Rule[]) {
    this.rules = rules;
  }

  validateData(type: 'clients' | 'workers' | 'tasks', data: DataRow[]): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Core validations as per assignment
    this.validateRequiredColumns(type, data, errors);
    this.validateDuplicateIds(type, data, errors);
    
    if (type === 'clients') {
      this.validateClientData(data, errors);
    } else if (type === 'workers') {
      this.validateWorkerData(data, errors);
    } else if (type === 'tasks') {
      this.validateTaskData(data, errors);
    }
    
    // Cross-reference validations
    this.validateCrossReferences(type, data, errors);
    
    return errors;
  }

  // NEW: Validate rules for circular dependencies and conflicts
  validateRules(rules: Rule[]): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Validation 7: Circular co-run groups
    this.validateCircularCoRuns(rules, errors);
    
    // Validation 8: Conflicting rules vs phase-window constraints
    this.validateRuleConflicts(rules, errors);
    
    return errors;
  }

  private validateCircularCoRuns(rules: Rule[], errors: ValidationError[]) {
    const coRunRules = rules.filter(r => r.type === 'coRun' && r.enabled) as CoRunRule[];
    if (coRunRules.length < 2) return;

    // Build adjacency graph
    const graph = new Map<string, Set<string>>();
    
    coRunRules.forEach(rule => {
      rule.tasks.forEach(task => {
        if (!graph.has(task)) {
          graph.set(task, new Set());
        }
        // Add all other tasks in the same co-run group
        rule.tasks.forEach(otherTask => {
          if (task !== otherTask) {
            graph.get(task)!.add(otherTask);
          }
        });
      });
    });

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor)) return true;
      }

      recStack.delete(node);
      return false;
    };

    for (const [node] of graph) {
      if (!visited.has(node)) {
        if (hasCycle(node)) {
          errors.push({
            type: 'error',
            message: `Circular co-run groups detected involving task ${node}. This creates impossible scheduling constraints.`,
            row: -1
          });
          break; // Only report one circular dependency
        }
      }
    }
  }

  private validateRuleConflicts(rules: Rule[], errors: ValidationError[]) {
    const coRunRules = rules.filter(r => r.type === 'coRun' && r.enabled) as CoRunRule[];
    const phaseWindowRules = rules.filter(r => r.type === 'phaseWindow' && r.enabled) as PhaseWindowRule[];

    // Check for conflicts between co-run and phase-window rules
    coRunRules.forEach(coRunRule => {
      const tasksInCoRun = coRunRule.tasks;
      
      // Find phase window constraints for tasks in this co-run group
      const phaseConstraints = new Map<string, number[]>();
      
      tasksInCoRun.forEach(taskId => {
        const phaseRule = phaseWindowRules.find(pr => pr.taskId === taskId);
        if (phaseRule) {
          phaseConstraints.set(taskId, phaseRule.allowedPhases);
        } else {
          // Get preferred phases from task data
          const taskData = this.taskData.find(t => t.TaskID === taskId);
          if (taskData && taskData.PreferredPhases) {
            const phases = this.parsePhases(taskData.PreferredPhases);
            if (phases.length > 0) {
              phaseConstraints.set(taskId, phases);
            }
          }
        }
      });

      // Check if there's any phase overlap for all tasks in co-run
      if (phaseConstraints.size > 1) {
        const phaseArrays = Array.from(phaseConstraints.values());
        const commonPhases = phaseArrays.reduce((common, phases) => 
          common.filter(phase => phases.includes(phase))
        );

        if (commonPhases.length === 0) {
          const taskDetails = Array.from(phaseConstraints.entries())
            .map(([task, phases]) => `${task} (phases: ${phases.join(',')})`)
            .join(', ');
          
          errors.push({
            type: 'error',
            message: `Conflicting rules: Co-run rule "${coRunRule.name}" has no common phases available. Tasks: ${taskDetails}`,
            row: -1
          });
        }
      }
    });
  }

  private parsePhases(phasesStr: string): number[] {
    try {
      const cleanStr = phasesStr.toString().trim();
      
      // Handle range format (e.g., "1-3")
      if (cleanStr.includes('-') && !cleanStr.startsWith('[')) {
        const [start, end] = cleanStr.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          const phases = [];
          for (let i = start; i <= end; i++) {
            phases.push(i);
          }
          return phases;
        }
      } 
      // Handle array format [1,2,3] or "1,2,3"
      else {
        let cleanedPhases = cleanStr;
        if (cleanStr.startsWith('[') && cleanStr.endsWith(']')) {
          cleanedPhases = cleanStr.slice(1, -1);
        }
        
        if (cleanedPhases) {
          return cleanedPhases.split(',')
            .map(p => parseInt(p.trim()))
            .filter(p => !isNaN(p));
        }
      }
    } catch (e) {
      // Return empty array for malformed phases
    }
    return [];
  }

  private validateRequiredColumns(type: string, data: DataRow[], errors: ValidationError[]) {
    if (data.length === 0) return;
    
    const requiredColumns: Record<string, string[]> = {
      clients: ['ClientID', 'ClientName', 'PriorityLevel', 'RequestedTaskIDs', 'GroupTag', 'AttributesJSON'],
      workers: ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase', 'WorkerGroup', 'QualificationLevel'],
      tasks: ['TaskID', 'TaskName', 'Category', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent']
    };
    
    const columns = Object.keys(data[0]);
    const missingColumns = requiredColumns[type].filter(col => !columns.includes(col));
    
    if (missingColumns.length > 0) {
      errors.push({
        type: 'error',
        message: `Missing required columns: ${missingColumns.join(', ')}`,
        row: -1
      });
    }
  }

  private validateDuplicateIds(type: string, data: DataRow[], errors: ValidationError[]) {
    const idField = type === 'clients' ? 'ClientID' : type === 'workers' ? 'WorkerID' : 'TaskID';
    const seenIds = new Map<string, number>();
    
    data.forEach((row, index) => {
      const id = row[idField];
      if (!id) {
        errors.push({
          type: 'error',
          message: `Missing ${idField}`,
          row: index,
          field: idField
        });
        return;
      }
      
      if (seenIds.has(id)) {
        errors.push({
          type: 'error',
          message: `Duplicate ${idField}: ${id} (also in row ${seenIds.get(id)! + 1})`,
          row: index,
          field: idField
        });
      } else {
        seenIds.set(id, index);
      }
    });
  }

  private validateClientData(data: DataRow[], errors: ValidationError[]) {
    data.forEach((row, index) => {
      // Priority level validation (1-5)
      const priority = parseInt(row.PriorityLevel);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        errors.push({
          type: 'error',
          message: `PriorityLevel must be between 1-5, got: ${row.PriorityLevel}`,
          row: index,
          field: 'PriorityLevel'
        });
      }
      
      // AttributesJSON validation
      if (row.AttributesJSON && row.AttributesJSON.trim() !== '') {
        try {
          JSON.parse(row.AttributesJSON);
        } catch (e) {
          errors.push({
            type: 'error',
            message: 'Broken JSON in AttributesJSON',
            row: index,
            field: 'AttributesJSON'
          });
        }
      }
    });
  }

  private validateWorkerData(data: DataRow[], errors: ValidationError[]) {
    data.forEach((row, index) => {
      // Available slots validation (malformed lists)
      if (!row.AvailableSlots) {
        errors.push({
          type: 'error',
          message: 'AvailableSlots is required',
          row: index,
          field: 'AvailableSlots'
        });
        return;
      }

      try {
        let slots: number[] = [];
        
        // Handle string that looks like an array
        if (typeof row.AvailableSlots === 'string') {
          const cleanedSlots = row.AvailableSlots.replace(/[\[\]]/g, '').trim();
          if (cleanedSlots) {
            slots = cleanedSlots.split(',').map((s: string) => {
              const num = parseInt(s.trim());
              if (isNaN(num)) {
                throw new Error('Non-numeric value');
              }
              return num;
            });
          }
        } else if (Array.isArray(row.AvailableSlots)) {
          slots = row.AvailableSlots.map(s => {
            const num = parseInt(s);
            if (isNaN(num)) {
              throw new Error('Non-numeric value');
            }
            return num;
          });
        }

        // Overloaded workers check
        const maxLoad = parseInt(row.MaxLoadPerPhase);
        if (!isNaN(maxLoad) && slots.length < maxLoad) {
          errors.push({
            type: 'warning',
            message: `Worker overloaded: ${slots.length} available slots < ${maxLoad} max load per phase`,
            row: index
          });
        }
      } catch (e) {
        errors.push({
          type: 'error',
          message: 'Malformed list in AvailableSlots - must contain only numeric values',
          row: index,
          field: 'AvailableSlots'
        });
      }
      
      // Max load validation
      const maxLoad = parseInt(row.MaxLoadPerPhase);
      if (isNaN(maxLoad) || maxLoad < 1) {
        errors.push({
          type: 'error',
          message: 'MaxLoadPerPhase must be >= 1',
          row: index,
          field: 'MaxLoadPerPhase'
        });
      }
    });
  }

  private validateTaskData(data: DataRow[], errors: ValidationError[]) {
    data.forEach((row, index) => {
      // Duration validation
      const duration = parseInt(row.Duration);
      if (isNaN(duration) || duration < 1) {
        errors.push({
          type: 'error',
          message: `Duration must be >= 1, got: ${row.Duration}`,
          row: index,
          field: 'Duration'
        });
      }
      
      // MaxConcurrent validation
      const maxConcurrent = parseInt(row.MaxConcurrent);
      if (isNaN(maxConcurrent) || maxConcurrent < 1) {
        errors.push({
          type: 'error',
          message: `MaxConcurrent must be >= 1, got: ${row.MaxConcurrent}`,
          row: index,
          field: 'MaxConcurrent'
        });
      }
      
      // PreferredPhases validation
      if (row.PreferredPhases) {
        const phasesStr = row.PreferredPhases.toString().trim();
        
        try {
          let phases: number[] = [];
          
          // Handle range format (e.g., "1-3")
          if (phasesStr.includes('-') && !phasesStr.startsWith('[')) {
            const parts = phasesStr.split('-');
            if (parts.length === 2) {
              const start = parseInt(parts[0].trim());
              const end = parseInt(parts[1].trim());
              
              if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
                throw new Error('Invalid range');
              }
            }
          } 
          // Handle array format [1,2,3] or 1,2,3
          else {
            let cleanedPhases = phasesStr;
            
            if (phasesStr.startsWith('[') && phasesStr.endsWith(']')) {
              cleanedPhases = phasesStr.slice(1, -1);
            }
            
            if (cleanedPhases) {
              cleanedPhases.split(',').forEach(p => {
                const num = parseInt(p.trim());
                if (isNaN(num)) {
                  throw new Error('Non-numeric value');
                }
              });
            }
          }
        } catch (e) {
          errors.push({
            type: 'error',
            message: 'Malformed list in PreferredPhases',
            row: index,
            field: 'PreferredPhases'
          });
        }
      }
    });
  }

  private validateCrossReferences(type: string, data: DataRow[], errors: ValidationError[]) {
    if (type === 'clients' && this.taskData.length > 0) {
      const validTaskIds = new Set(this.taskData.map(t => t.TaskID));
      
      data.forEach((row, index) => {
        if (row.RequestedTaskIDs) {
          const requestedTasks = row.RequestedTaskIDs.toString().split(',').map((t: string) => t.trim());
          const invalidTasks = requestedTasks.filter(t => t && !validTaskIds.has(t));
          
          if (invalidTasks.length > 0) {
            errors.push({
              type: 'error',
              message: `Unknown task references: ${invalidTasks.join(', ')}`,
              row: index,
              field: 'RequestedTaskIDs'
            });
          }
        }
      });
    }
    
    if (type === 'tasks' && this.workerData.length > 0) {
      // Skill coverage validation
      const allWorkerSkills = new Set<string>();
      this.workerData.forEach(w => {
        if (w.Skills) {
          w.Skills.toString().split(',').forEach((s: string) => 
            allWorkerSkills.add(s.trim().toLowerCase())
          );
        }
      });
      
      data.forEach((row, index) => {
        if (row.RequiredSkills) {
          const requiredSkills = row.RequiredSkills.toString().split(',').map((s: string) => s.trim());
          const unmatchedSkills = requiredSkills.filter(s => 
            s && !allWorkerSkills.has(s.toLowerCase())
          );
          
          if (unmatchedSkills.length > 0) {
            errors.push({
              type: 'error',
              message: `No workers have required skills: ${unmatchedSkills.join(', ')}`,
              row: index,
              field: 'RequiredSkills'
            });
          }
        }
        
        // Max concurrency feasibility
        if (row.MaxConcurrent && row.RequiredSkills) {
          const requiredSkillsArray = row.RequiredSkills.toString()
            .split(',')
            .map((s: string) => s.trim().toLowerCase());
          
          const qualifiedWorkers = this.workerData.filter(w => {
            if (!w.Skills) return false;
            const workerSkills = w.Skills.toString()
              .split(',')
              .map((s: string) => s.trim().toLowerCase());
            return requiredSkillsArray.every(skill => workerSkills.includes(skill));
          });
          
          const maxConcurrent = parseInt(row.MaxConcurrent);
          if (!isNaN(maxConcurrent) && qualifiedWorkers.length < maxConcurrent) {
            errors.push({
              type: 'warning',
              message: `MaxConcurrent (${maxConcurrent}) exceeds qualified workers (${qualifiedWorkers.length})`,
              row: index,
              field: 'MaxConcurrent'
            });
          }
        }
      });
    }
    
    // Phase-slot saturation validation
    if ((type === 'workers' || type === 'tasks') && this.taskData.length > 0 && this.workerData.length > 0) {
      this.validatePhaseSlotSaturation(errors);
    }
  }

  private validatePhaseSlotSaturation(errors: ValidationError[]) {
    const phaseCapacity = new Map<number, number>();
    const phaseDemand = new Map<number, number>();
    
    // Calculate total slots per phase
    this.workerData.forEach(worker => {
      try {
        let slots: number[] = [];
        
        if (typeof worker.AvailableSlots === 'string') {
          const cleanedSlots = worker.AvailableSlots.replace(/[\[\]]/g, '').trim();
          if (cleanedSlots) {
            slots = cleanedSlots.split(',').map((s: string) => parseInt(s.trim()));
          }
        } else if (Array.isArray(worker.AvailableSlots)) {
          slots = worker.AvailableSlots.map(s => parseInt(s));
        }
        
        slots.forEach(phase => {
          if (!isNaN(phase) && phase > 0) {
            phaseCapacity.set(phase, (phaseCapacity.get(phase) || 0) + 1);
          }
        });
      } catch (e) {
        // Skip invalid slots
      }
    });
    
    // Calculate demand per phase
    this.taskData.forEach(task => {
      const duration = parseInt(task.Duration) || 1;
      let phases: number[] = [];
      
      if (task.PreferredPhases) {
        phases = this.parsePhases(task.PreferredPhases);
      }
      
      phases.forEach(phase => {
        if (phase > 0) {
          phaseDemand.set(phase, (phaseDemand.get(phase) || 0) + duration);
        }
      });
    });
    
    // Check for saturation
    phaseDemand.forEach((demand, phase) => {
      const capacity = phaseCapacity.get(phase) || 0;
      if (demand > capacity) {
        errors.push({
          type: 'error',
          message: `Phase ${phase} saturation: ${demand} task duration > ${capacity} worker slots`,
          row: -1
        });
      }
    });
  }
}

export const validator = new Validator();