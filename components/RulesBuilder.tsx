'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitBranch, 
  Users, 
  Weight, 
  Calendar, 
  Code2, 
  Layers,
  Plus,
  Trash2,
  Settings,
  Sparkles,
  Check,
  X,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { 
  Rule, 
  generateRuleId, 
  CoRunRule, 
  SlotRestrictionRule, 
  LoadLimitRule,
  PhaseWindowRule,
  PatternMatchRule,
  PrecedenceRule 
} from '@/app/utils/rules';
import { geminiService } from '@/app/services/gemini';

interface RulesBuilderProps {
  data: {
    clients: any[];
    workers: any[];
    tasks: any[];
  };
  rules: Rule[];
  onRulesChange: (rules: Rule[]) => void;
}

const RulesBuilder: React.FC<RulesBuilderProps> = ({ data, rules, onRulesChange }) => {
  const [activeRuleType, setActiveRuleType] = useState<string | null>(null);
  const [nlQuery, setNlQuery] = useState('');
  const [isProcessingNL, setIsProcessingNL] = useState(false);
  
  // Rule creation states
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedGroupType, setSelectedGroupType] = useState<'client' | 'worker'>('client');
  const [minCommonSlots, setMinCommonSlots] = useState(1);
  const [maxSlotsPerPhase, setMaxSlotsPerPhase] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [allowedPhases, setAllowedPhases] = useState<number[]>([]);
  const [regexPattern, setRegexPattern] = useState('');
  const [patternTemplate, setPatternTemplate] = useState('');
  const [precedenceScope, setPrecedenceScope] = useState<'global' | 'specific'>('global');
  const [precedenceTarget, setPrecedenceTarget] = useState('');
  const [overridePriority, setOverridePriority] = useState(1);

  const handleNaturalLanguageRule = async () => {
    if (!nlQuery.trim() || isProcessingNL) return;
    
    setIsProcessingNL(true);
    try {
      const newRule = await geminiService.parseNaturalLanguageRule(nlQuery, data);
      if (newRule) {
        onRulesChange([...rules, { ...newRule, id: generateRuleId(), createdAt: new Date() }]);
        setNlQuery('');
      }
    } catch (error) {
      console.error('Failed to process natural language rule:', error);
    } finally {
      setIsProcessingNL(false);
    }
  };

  const createRule = () => {
    let newRule: Rule | null = null;
    const baseRule = {
      id: generateRuleId(),
      name: '',
      priority: rules.length + 1,
      enabled: true,
      createdAt: new Date()
    };

    switch (activeRuleType) {
      case 'coRun':
        if (selectedTasks.length >= 2) {
          newRule = {
            ...baseRule,
            type: 'coRun',
            name: `Co-run: ${selectedTasks.join(', ')}`,
            tasks: selectedTasks
          } as CoRunRule;
        }
        break;
      
      case 'slotRestriction':
        if (selectedGroup && minCommonSlots > 0) {
          newRule = {
            ...baseRule,
            type: 'slotRestriction',
            name: `Slot restriction: ${selectedGroup} (min ${minCommonSlots})`,
            groupType: selectedGroupType,
            groupName: selectedGroup,
            minCommonSlots
          } as SlotRestrictionRule;
        }
        break;
      
      case 'loadLimit':
        if (selectedGroup && maxSlotsPerPhase > 0) {
          newRule = {
            ...baseRule,
            type: 'loadLimit',
            name: `Load limit: ${selectedGroup} (max ${maxSlotsPerPhase}/phase)`,
            workerGroup: selectedGroup,
            maxSlotsPerPhase
          } as LoadLimitRule;
        }
        break;
      
      case 'phaseWindow':
        if (selectedTaskId && allowedPhases.length > 0) {
          newRule = {
            ...baseRule,
            type: 'phaseWindow',
            name: `Phase window: ${selectedTaskId} in phases ${allowedPhases.join(', ')}`,
            taskId: selectedTaskId,
            allowedPhases
          } as PhaseWindowRule;
        }
        break;
      
      case 'patternMatch':
        if (regexPattern && patternTemplate) {
          newRule = {
            ...baseRule,
            type: 'patternMatch',
            name: `Pattern: ${regexPattern}`,
            regex: regexPattern,
            template: patternTemplate,
            parameters: {}
          } as PatternMatchRule;
        }
        break;
      
      case 'precedence':
        newRule = {
          ...baseRule,
          type: 'precedence',
          name: precedenceScope === 'global' ? 'Global precedence' : `Precedence for ${precedenceTarget}`,
          scope: precedenceScope,
          specificTarget: precedenceScope === 'specific' ? precedenceTarget : undefined,
          overridePriority
        } as PrecedenceRule;
        break;
    }

    if (newRule) {
      onRulesChange([...rules, newRule]);
      resetForm();
    }
  };

  const resetForm = () => {
    setActiveRuleType(null);
    setSelectedTasks([]);
    setSelectedGroup('');
    setMinCommonSlots(1);
    setMaxSlotsPerPhase(1);
    setSelectedTaskId('');
    setAllowedPhases([]);
    setRegexPattern('');
    setPatternTemplate('');
    setPrecedenceScope('global');
    setPrecedenceTarget('');
    setOverridePriority(1);
  };

  const deleteRule = (ruleId: string) => {
    onRulesChange(rules.filter(r => r.id !== ruleId));
  };

  const toggleRule = (ruleId: string) => {
    onRulesChange(rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const ruleTypes = [
    { id: 'coRun', label: 'Co-run Tasks', icon: GitBranch, color: 'from-blue-500 to-cyan-500' },
    { id: 'slotRestriction', label: 'Slot Restriction', icon: Users, color: 'from-purple-500 to-pink-500' },
    { id: 'loadLimit', label: 'Load Limit', icon: Weight, color: 'from-green-500 to-emerald-500' },
    { id: 'phaseWindow', label: 'Phase Window', icon: Calendar, color: 'from-orange-500 to-red-500' },
    { id: 'patternMatch', label: 'Pattern Match', icon: Code2, color: 'from-indigo-500 to-purple-500' },
    { id: 'precedence', label: 'Precedence Override', icon: Layers, color: 'from-pink-500 to-rose-500' }
  ];

  const getUniqueGroups = () => {
    const clientGroups = [...new Set(data.clients.map(c => c.GroupTag).filter(Boolean))];
    const workerGroups = [...new Set(data.workers.map(w => w.WorkerGroup).filter(Boolean))];
    return { clientGroups, workerGroups };
  };

  const { clientGroups, workerGroups } = getUniqueGroups();

  return (
    <div className="space-y-6">
      {/* Natural Language Rule Input */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-800">Natural Language Rule Creator</h3>
        </div>
        
        <div className="flex gap-3">
          <input
            type="text"
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNaturalLanguageRule()}
            placeholder='Try: "Tasks T1 and T2 must run together" or "Limit Sales workers to 2 tasks per phase"'
            className="flex-1 px-4 py-3 border border-gray-200/50 rounded-xl bg-white/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-sm"
          />
          <button
            onClick={handleNaturalLanguageRule}
            disabled={isProcessingNL || !nlQuery.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
          >
            {isProcessingNL ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">Create Rule</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Rule Type Selection */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-3 gap-3"
      >
        {ruleTypes.map((type, index) => (
          <motion.button
            key={type.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * index }}
            onClick={() => setActiveRuleType(activeRuleType === type.id ? null : type.id)}
            className={`
              relative overflow-hidden rounded-xl p-4 transition-all duration-200
              ${activeRuleType === type.id 
                ? 'bg-white shadow-md border-2 border-blue-500/30' 
                : 'bg-white/50 hover:bg-white/70 border border-gray-200/50 hover:shadow-sm'
              }
            `}
          >
            <div className="absolute inset-0 opacity-10">
              <div className={`absolute inset-0 bg-gradient-to-br ${type.color}`} />
            </div>
            <div className="relative flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${type.color} text-white`}>
                <type.icon className="w-4 h-4" />
              </div>
              <span className="font-medium text-sm text-gray-800">{type.label}</span>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Rule Creation Form */}
      <AnimatePresence>
        {activeRuleType && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
          >
            {activeRuleType === 'coRun' && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-800">Select tasks to run together:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {data.tasks.map(task => (
                    <label key={task.TaskID} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.TaskID)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTasks([...selectedTasks, task.TaskID]);
                          } else {
                            setSelectedTasks(selectedTasks.filter(t => t !== task.TaskID));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{task.TaskID} - {task.TaskName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeRuleType === 'slotRestriction' && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedGroupType === 'client'}
                      onChange={() => setSelectedGroupType('client')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Client Group</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedGroupType === 'worker'}
                      onChange={() => setSelectedGroupType('worker')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Worker Group</span>
                  </label>
                </div>
                
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select a group...</option>
                  {(selectedGroupType === 'client' ? clientGroups : workerGroups).map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Common Slots
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minCommonSlots}
                    onChange={(e) => setMinCommonSlots(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            {activeRuleType === 'loadLimit' && (
              <div className="space-y-4">
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select a worker group...</option>
                  {workerGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Slots Per Phase
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxSlotsPerPhase}
                    onChange={(e) => setMaxSlotsPerPhase(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            {activeRuleType === 'phaseWindow' && (
              <div className="space-y-4">
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select a task...</option>
                  {data.tasks.map(task => (
                    <option key={task.TaskID} value={task.TaskID}>
                      {task.TaskID} - {task.TaskName}
                    </option>
                  ))}
                </select>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Allowed Phases
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(phase => (
                      <label key={phase} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={allowedPhases.includes(phase)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedPhases([...allowedPhases, phase].sort((a, b) => a - b));
                            } else {
                              setAllowedPhases(allowedPhases.filter(p => p !== phase));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm">{phase}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeRuleType === 'patternMatch' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    placeholder="e.g., ^T[0-9]+$"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Template
                  </label>
                  <input
                    type="text"
                    value={patternTemplate}
                    onChange={(e) => setPatternTemplate(e.target.value)}
                    placeholder="e.g., Priority tasks must be scheduled first"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            {activeRuleType === 'precedence' && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={precedenceScope === 'global'}
                      onChange={() => setPrecedenceScope('global')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Global Rule</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={precedenceScope === 'specific'}
                      onChange={() => setPrecedenceScope('specific')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Specific Target</span>
                  </label>
                </div>
                
                {precedenceScope === 'specific' && (
                  <input
                    type="text"
                    value={precedenceTarget}
                    onChange={(e) => setPrecedenceTarget(e.target.value)}
                    placeholder="Enter specific target (e.g., TaskID, GroupName)"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Override Priority
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={overridePriority}
                    onChange={(e) => setOverridePriority(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createRule}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Create Rule
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Created Rules */}
      {rules.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
        >
          <h3 className="font-semibold text-gray-800 mb-4">Active Rules ({rules.filter(r => r.enabled).length}/{rules.length})</h3>
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <motion.div 
                key={rule.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  p-3 rounded-lg border transition-all duration-200
                  ${rule.enabled 
                    ? 'bg-white border-gray-200 hover:shadow-sm' 
                    : 'bg-gray-50 border-gray-200/50 opacity-60'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`
                        p-1 rounded-md transition-colors
                        ${rule.enabled 
                          ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                          : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                        }
                      `}
                    >
                      {rule.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{rule.name}</p>
                      <p className="text-xs text-gray-500">Type: {rule.type} • Priority: {rule.priority}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default RulesBuilder;