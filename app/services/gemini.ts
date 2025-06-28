// app/services/gemini.ts
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

interface RuleRecommendation {
  type: string;
  title: string;
  description: string;
  confidence: number;
  ruleData: any;
}

export class GeminiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data: GeminiResponse = await response.json();
      return data.candidates[0]?.content?.parts[0]?.text || '';
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  // Column mapping for misnamed/rearranged columns
  async mapColumns(headers: string[], entityType: 'clients' | 'workers' | 'tasks'): Promise<Record<string, string>> {
    const expectedColumns = {
      clients: ['ClientID', 'ClientName', 'PriorityLevel', 'RequestedTaskIDs', 'GroupTag', 'AttributesJSON'],
      workers: ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase', 'WorkerGroup', 'QualificationLevel'],
      tasks: ['TaskID', 'TaskName', 'Category', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent']
    };

    const prompt = `
    I have a CSV file with these headers: ${headers.join(', ')}
    
    This file contains ${entityType} data and should have these standard columns: ${expectedColumns[entityType].join(', ')}
    
    Please create a mapping from the actual headers to the expected column names. Consider variations like:
    - Different cases (clientid vs ClientID)
    - Abbreviations (ID vs Identifier)
    - Similar meanings (Name vs Title)
    - Common variations (RequestedTasks vs RequestedTaskIDs)
    
    Return ONLY a JSON object mapping actual headers to expected columns, like:
    {"actual_header": "expected_column", ...}
    
    If a header doesn't match any expected column, map it to null.
    `;

    const response = await this.generateContent(prompt);
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (error) {
      console.error('Failed to parse column mapping:', error);
      return {};
    }
  }

  // Natural language search
  async searchData(query: string, data: any[], entityType: string): Promise<number[]> {
    if (data.length === 0) return [];
    
    const sampleRow = JSON.stringify(data[0]);
    
    const contextByType = {
      clients: 'Clients have PriorityLevel (1-5), RequestedTaskIDs (comma-separated), GroupTag, etc.',
      workers: 'Workers have Skills (comma-separated), AvailableSlots (array of phase numbers like [1,2,3]), MaxLoadPerPhase, etc.',
      tasks: 'Tasks have Duration (number of phases), PreferredPhases (range like "1-3" or list like [1,2,3]), RequiredSkills (comma-separated), etc.'
    };
    
    const prompt = `
    I have ${entityType} data with this structure: ${sampleRow}
    
    Context: ${contextByType[entityType] || ''}
    
    User wants to search for: "${query}"
    
    Generate a JavaScript filter expression that would match rows based on this natural language query.
    The expression should use 'row' as the variable name.
    
    Important:
    - AvailableSlots and PreferredPhases contain phase numbers, not dates
    - Phase numbers are typically 1-10, not dates or months
    - For comma-separated fields, use .includes() or .split(',')
    - For array fields stored as strings, parse them first
    
    Examples:
    - Query: "tasks longer than 2 phases" → row.Duration > 2
    - Query: "workers available in phase 3" → row.AvailableSlots && row.AvailableSlots.toString().includes('3')
    - Query: "high priority clients" → row.PriorityLevel >= 4
    - Query: "tasks with python skill" → row.RequiredSkills && row.RequiredSkills.toLowerCase().includes('python')
    
    Return ONLY the JavaScript expression, nothing else.
    `;

    const response = await this.generateContent(prompt);
    try {
      const filterExpression = response.trim();
      const matchingIndices: number[] = [];
      
      data.forEach((row, index) => {
        try {
          // Safe evaluation using Function constructor
          const evalFunc = new Function('row', `
            try {
              return ${filterExpression};
            } catch (e) {
              return false;
            }
          `);
          if (evalFunc(row)) {
            matchingIndices.push(index);
          }
        } catch (e) {
          // Skip rows that cause errors
        }
      });
      
      return matchingIndices;
    } catch (error) {
      console.error('Failed to execute search:', error);
      return [];
    }
  }

  // Parse natural language rule request
  async parseNaturalLanguageRule(query: string, data: { clients: any[], workers: any[], tasks: any[] }): Promise<any> {
    const context = `
    Available data:
    - Task IDs: ${data.tasks.slice(0, 10).map(t => t.TaskID).join(', ')}${data.tasks.length > 10 ? '...' : ''}
    - Worker Groups: ${[...new Set(data.workers.map(w => w.WorkerGroup))].filter(Boolean).join(', ')}
    - Client Groups: ${[...new Set(data.clients.map(c => c.GroupTag))].filter(Boolean).join(', ')}
    `;

    const prompt = `
    Convert this natural language rule request into a structured rule:
    "${query}"
    
    ${context}
    
    Rule types available:
    - coRun: Tasks that must run together (e.g., "Tasks T1 and T2 must run together")
    - slotRestriction: Minimum common slots for a group (e.g., "Sales group needs at least 3 common slots")
    - loadLimit: Maximum slots per phase for workers (e.g., "Limit Marketing workers to 2 tasks per phase")
    - phaseWindow: Restrict task to specific phases (e.g., "Task T5 can only run in phases 1-3")
    - patternMatch: Apply rules based on regex patterns
    - precedence: Override priority rules
    
    Return a JSON object for the rule:
    {
      "type": "rule_type",
      "name": "Human-readable name",
      "enabled": true,
      "priority": 1,
      // ... other fields specific to the rule type
    }
    
    For coRun: include "tasks" array
    For slotRestriction: include "groupType", "groupName", "minCommonSlots"
    For loadLimit: include "workerGroup", "maxSlotsPerPhase"
    For phaseWindow: include "taskId", "allowedPhases"
    
    If the request doesn't match any rule type or references invalid data, return null.
    Only return the JSON object or null, no other text.
    `;

    const response = await this.generateContent(prompt);
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}|null/);
      if (jsonMatch) {
        const result = jsonMatch[0] === 'null' ? null : JSON.parse(jsonMatch[0]);
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to parse natural language rule:', error);
      return null;
    }
  }

  // AI Rule Recommendations (Milestone 3)
  async generateRuleRecommendations(data: { clients: any[], workers: any[], tasks: any[] }): Promise<RuleRecommendation[]> {
    if (data.clients.length === 0 || data.workers.length === 0 || data.tasks.length === 0) {
      return [];
    }

    const dataAnalysis = {
      totalClients: data.clients.length,
      totalWorkers: data.workers.length,
      totalTasks: data.tasks.length,
      clientPriorities: data.clients.map(c => c.PriorityLevel).filter(p => typeof p === 'number'),
      workerGroups: [...new Set(data.workers.map(w => w.WorkerGroup))].filter(Boolean),
      clientGroups: [...new Set(data.clients.map(c => c.GroupTag))].filter(Boolean),
      taskCategories: [...new Set(data.tasks.map(t => t.Category))].filter(Boolean),
      workerSkills: [...new Set(data.workers.flatMap(w => 
        w.Skills ? w.Skills.toString().split(',').map(s => s.trim()) : []
      ))].filter(Boolean),
      taskSkills: [...new Set(data.tasks.flatMap(t => 
        t.RequiredSkills ? t.RequiredSkills.toString().split(',').map(s => s.trim()) : []
      ))].filter(Boolean),
      averageTaskDuration: data.tasks.reduce((sum, t) => sum + (parseInt(t.Duration) || 0), 0) / data.tasks.length,
      // Sample task pairs for co-run analysis
      sampleTaskPairs: data.tasks.slice(0, 6).map(t => t.TaskID).filter(Boolean)
    };

    const prompt = `
    Analyze this resource allocation data and suggest intelligent business rules:
    
    Data Summary:
    - ${dataAnalysis.totalClients} clients, ${dataAnalysis.totalWorkers} workers, ${dataAnalysis.totalTasks} tasks
    - Worker groups: ${dataAnalysis.workerGroups.join(', ')}
    - Client groups: ${dataAnalysis.clientGroups.join(', ')}
    - Task categories: ${dataAnalysis.taskCategories.join(', ')}
    - Common skills: ${dataAnalysis.workerSkills.slice(0, 10).join(', ')}
    - Required skills: ${dataAnalysis.taskSkills.slice(0, 10).join(', ')}
    - Average task duration: ${dataAnalysis.averageTaskDuration.toFixed(1)} phases
    - Sample tasks: ${dataAnalysis.sampleTaskPairs.join(', ')}
    
    Client priority distribution: ${dataAnalysis.clientPriorities.join(', ')}
    
    Based on common resource allocation patterns, suggest up to 4 practical business rules:
    
    Rule types to consider:
    1. Co-run rules for tasks that work well together (same skills, complementary work)
    2. Load limits to prevent worker overload (especially for small teams)
    3. Slot restrictions for groups that need coordination
    4. Phase windows for time-sensitive or sequential tasks
    
    Return a JSON array of rule recommendations:
    [
      {
        "type": "coRun|loadLimit|slotRestriction|phaseWindow",
        "title": "Short descriptive title",
        "description": "Why this rule makes business sense",
        "confidence": 0.7-0.95,
        "ruleData": {
          // Rule-specific fields
          // For coRun: {"type": "coRun", "tasks": ["T1", "T2"]}
          // For loadLimit: {"type": "loadLimit", "workerGroup": "Development", "maxSlotsPerPhase": 2}
          // For slotRestriction: {"type": "slotRestriction", "groupType": "client", "groupName": "Enterprise", "minCommonSlots": 3}
          // For phaseWindow: {"type": "phaseWindow", "taskId": "T1", "allowedPhases": [1,2,3]}
        }
      }
    ]
    
    Focus on:
    - Realistic business scenarios (teams working together, preventing overload)
    - Rules that would actually improve allocation efficiency
    - High confidence recommendations based on data patterns
    
    Only return the JSON array, no other text.
    `;

    const response = await this.generateContent(prompt);
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const recommendations: RuleRecommendation[] = JSON.parse(jsonMatch[0]);
        
        // Validate and filter recommendations
        return recommendations.filter(rec => {
          // Basic validation
          if (!rec.type || !rec.title || !rec.description || !rec.ruleData) {
            return false;
          }
          
          // Confidence should be reasonable
          if (rec.confidence < 0.5 || rec.confidence > 1) {
            rec.confidence = Math.max(0.5, Math.min(1, rec.confidence || 0.7));
          }
          
          // Validate rule data based on type
          switch (rec.type) {
            case 'coRun':
              return rec.ruleData.tasks && Array.isArray(rec.ruleData.tasks) && rec.ruleData.tasks.length >= 2;
            case 'loadLimit':
              return rec.ruleData.workerGroup && typeof rec.ruleData.maxSlotsPerPhase === 'number';
            case 'slotRestriction':
              return rec.ruleData.groupName && rec.ruleData.groupType && typeof rec.ruleData.minCommonSlots === 'number';
            case 'phaseWindow':
              return rec.ruleData.taskId && Array.isArray(rec.ruleData.allowedPhases);
            default:
              return false;
          }
        }).slice(0, 4); // Limit to 4 recommendations
      }
      return [];
    } catch (error) {
      console.error('Failed to parse rule recommendations:', error);
      return [];
    }
  }

  // Suggest fixes for validation errors
  async suggestFixes(errors: any[], data: any[], entityType: string): Promise<any[]> {
    if (errors.length === 0) return [];
    
    const errorSummary = errors.slice(0, 10).map(e => ({
      message: e.message,
      field: e.field,
      row: e.row >= 0 ? data[e.row] : null
    }));
    
    const contextByType = {
      clients: `
        Context for client data:
        - PriorityLevel must be between 1 and 5 (integer)
        - RequestedTaskIDs should be comma-separated task IDs (e.g., "T1,T2,T3")
        - AttributesJSON must be valid JSON or empty
        - GroupTag is a text identifier`,
      workers: `
        Context for worker data:
        - AvailableSlots must be an array of phase numbers like [1,2,3,4,5]
        - Skills should be comma-separated text (e.g., "Python,JavaScript,React")
        - MaxLoadPerPhase must be a positive integer
        - QualificationLevel must be a positive integer
        - WorkerGroup is a text identifier`,
      tasks: `
        Context for task data:
        - Duration is the number of phases (must be >= 1)
        - PreferredPhases can be:
          * Range format: "1-3" (meaning phases 1 through 3)
          * List format: [1,2,3] or "1,2,3" (specific phase numbers)
        - RequiredSkills should be comma-separated text
        - MaxConcurrent must be a positive integer`
    };
    
    const prompt = `
    These validation errors were found in ${entityType} data:
    ${JSON.stringify(errorSummary, null, 2)}
    
    ${contextByType[entityType] || ''}
    
    For each error, suggest a specific fix that would resolve the validation error.
    Focus on these types of fixes:
    - For missing IDs, generate appropriate IDs (C1, C2 for clients; W1, W2 for workers; T1, T2 for tasks)
    - For out-of-range PriorityLevel, suggest nearest valid value (1-5)
    - For broken JSON, suggest empty object {}
    - For malformed lists, suggest proper format
    - For invalid Duration or MaxConcurrent, suggest 1
    - For PreferredPhases, suggest either "1-3" format or "[1,2,3]" format
    - For AvailableSlots, suggest array format like [1,2,3,4]
    
    Return a JSON array with this structure:
    [
      {
        "errorIndex": 0,
        "fix": {
          "description": "Clear explanation of what the fix does",
          "field": "field to update",
          "oldValue": "current value",
          "newValue": "suggested new value"
        }
      }
    ]
    
    Only suggest fixes for actual validation errors, not general improvements.
    Return only the JSON array, no other text.
    `;

    const response = await this.generateContent(prompt);
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const fixes = JSON.parse(jsonMatch[0]);
        return fixes.filter((fix: any) => fix.errorIndex < errors.length);
      }
      return [];
    } catch (error) {
      console.error('Failed to parse fix suggestions:', error);
      return [];
    }
  }
}

export const geminiService = new GeminiService();