'use client';

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { geminiService } from '@/app/services/gemini';
import { validator, ValidationError, DataRow } from '@/app/utils/validations';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  FileUp,
  Users,
  Briefcase,
  ClipboardList,
  X,
  Loader2,
  ChevronRight,
  Download,
  Sliders,
  Settings,
  Lightbulb,
} from 'lucide-react';
import RulesBuilder from '@/components/RulesBuilder';
import PrioritizationWeights from '@/components/PrioritizationWeight';
import { Rule, PrioritizationWeights as Weights, DEFAULT_WEIGHTS } from '@/app/utils/rules';

interface DataState {
  clients: DataRow[];
  workers: DataRow[];
  tasks: DataRow[];
}

interface ErrorState {
  clients: ValidationError[];
  workers: ValidationError[];
  tasks: ValidationError[];
}

interface SearchResults {
  clients: number[];
  workers: number[];
  tasks: number[];
}

interface FixSuggestion {
  errorIndex: number;
  fix: {
    description: string;
    field: string;
    oldValue: any;
    newValue: any;
  };
}

interface RuleRecommendation {
  type: string;
  title: string;
  description: string;
  confidence: number;
  ruleData: any;
}

type DataType = 'clients' | 'workers' | 'tasks';

const DataAlchemist: React.FC = () => {
  const [data, setData] = useState<DataState>({
    clients: [],
    workers: [],
    tasks: []
  });
  
  const [errors, setErrors] = useState<ErrorState>({
    clients: [],
    workers: [],
    tasks: []
  });

  const [activeTab, setActiveTab] = useState<DataType>('clients');
  const [isValidating, setIsValidating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({
    clients: [],
    workers: [],
    tasks: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [fixSuggestions, setFixSuggestions] = useState<Record<DataType, FixSuggestion[]>>({
    clients: [],
    workers: [],
    tasks: []
  });
  const [uploadingType, setUploadingType] = useState<DataType | null>(null);
  const [isGeneratingFixes, setIsGeneratingFixes] = useState(false);
  
  // Milestone 2 state
  const [activeSection, setActiveSection] = useState<'data' | 'rules' | 'weights'>('data');
  const [rules, setRules] = useState<Rule[]>([]);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [ruleErrors, setRuleErrors] = useState<ValidationError[]>([]);
  
  // AI Rule Recommendations (Milestone 3)
  const [ruleRecommendations, setRuleRecommendations] = useState<RuleRecommendation[]>([]);
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] = useState(false);

  // Update validator data whenever data changes
  useEffect(() => {
    validator.setData('clients', data.clients);
    validator.setData('workers', data.workers);
    validator.setData('tasks', data.tasks);
    validator.setRules(rules);
    
    // Generate AI rule recommendations when data changes
    if (data.clients.length > 0 && data.workers.length > 0 && data.tasks.length > 0) {
      generateRuleRecommendations();
    }
  }, [data]);

  // Validate rules whenever rules change
  useEffect(() => {
    validator.setRules(rules);
    const ruleValidationErrors = validator.validateRules(rules);
    setRuleErrors(ruleValidationErrors);
  }, [rules]);

  const generateRuleRecommendations = async () => {
    setIsGeneratingRecommendations(true);
    try {
      const recommendations = await geminiService.generateRuleRecommendations(data);
      setRuleRecommendations(recommendations);
    } catch (error) {
      console.error('Failed to generate rule recommendations:', error);
    } finally {
      setIsGeneratingRecommendations(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: DataType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingType(type);
    
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // AI-powered column mapping
          const headers = results.meta.fields || [];
          const columnMapping = await geminiService.mapColumns(headers, type);
          
          // Apply column mapping
          const mappedData = results.data.map((row: any) => {
            const mappedRow: DataRow = {};
            Object.entries(row).forEach(([key, value]) => {
              const mappedKey = columnMapping[key] || key;
              if (mappedKey && mappedKey !== 'null') {
                mappedRow[mappedKey] = value;
              }
            });
            return mappedRow;
          });
          
          // Update data
          setData(prev => ({
            ...prev,
            [type]: mappedData
          }));
          
          // Run validation
          await runValidation(type, mappedData);
        } catch (error) {
          console.error('Error processing file:', error);
          // Fallback to original data if AI mapping fails
          setData(prev => ({
            ...prev,
            [type]: results.data as DataRow[]
          }));
          await runValidation(type, results.data as DataRow[]);
        } finally {
          setUploadingType(null);
        }
      }
    });
  };

  const runValidation = async (type: DataType, dataToValidate: DataRow[]) => {
    setIsValidating(true);
    try {
      const validationErrors = validator.validateData(type, dataToValidate);
      setErrors(prev => ({
        ...prev,
        [type]: validationErrors
      }));
      
      // Generate fix suggestions if there are errors
      if (validationErrors.length > 0) {
        generateFixSuggestions(type, validationErrors, dataToValidate);
      }
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const generateFixSuggestions = async (type: DataType, validationErrors: ValidationError[], dataToValidate: DataRow[]) => {
    setIsGeneratingFixes(true);
    try {
      const suggestions = await geminiService.suggestFixes(
        validationErrors,
        dataToValidate,
        type
      );
      setFixSuggestions(prev => ({
        ...prev,
        [type]: suggestions
      }));
    } catch (error) {
      console.error('Error generating fix suggestions:', error);
    } finally {
      setIsGeneratingFixes(false);
    }
  };

  const handleCellEdit = (type: DataType, rowIndex: number, column: string, value: string) => {
    const newData = [...data[type]];
    newData[rowIndex] = {
      ...newData[rowIndex],
      [column]: value
    };
    
    setData(prev => ({
      ...prev,
      [type]: newData
    }));
    
    // Re-run validation after edit
    runValidation(type, newData);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults({ clients: [], workers: [], tasks: [] });
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await geminiService.searchData(searchQuery, data[activeTab], activeTab);
      setSearchResults(prev => ({
        ...prev,
        [activeTab]: results
      }));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const applyFix = (suggestion: FixSuggestion) => {
    const error = errors[activeTab][suggestion.errorIndex];
    if (error && error.row >= 0) {
      handleCellEdit(activeTab, error.row, suggestion.fix.field, suggestion.fix.newValue);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ clients: [], workers: [], tasks: [] });
  };

  const applyRuleRecommendation = (recommendation: RuleRecommendation) => {
    const newRule: Rule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: recommendation.title,
      enabled: true,
      priority: rules.length + 1,
      createdAt: new Date(),
      ...recommendation.ruleData
    };
    setRules([...rules, newRule]);
  };

  const dismissRecommendation = (index: number) => {
    setRuleRecommendations(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleExport = () => {
    // Check for rule validation errors before export
    if (ruleErrors.length > 0) {
      alert('Please fix rule validation errors before exporting.');
      return;
    }

    // Export cleaned data as CSV
    const exportData = (type: DataType) => {
      const csvData = data[type];
      if (csvData.length === 0) return;
      
      const headers = Object.keys(csvData[0]);
      const csv = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => {
            const value = row[header];
            // Escape values containing commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value ?? '';
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_cleaned.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
    
    // Export all data files
    (['clients', 'workers', 'tasks'] as DataType[]).forEach(type => {
      if (data[type].length > 0) {
        exportData(type);
      }
    });
    
    // Export rules configuration
    const rulesConfig = {
      rules: rules.filter(r => r.enabled).map(r => {
        const { id, createdAt, ...ruleData } = r;
        return ruleData;
      }),
      prioritization: weights,
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        totalRules: rules.filter(r => r.enabled).length,
        validationStatus: {
          dataErrors: Object.values(errors).flat().filter(e => e.type === 'error').length,
          dataWarnings: Object.values(errors).flat().filter(e => e.type === 'warning').length,
          ruleErrors: ruleErrors.length
        }
      }
    };
    
    const blob = new Blob([JSON.stringify(rulesConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rules.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasRowError = (type: DataType, rowIndex: number) => {
    return errors[type].some(err => err.row === rowIndex && err.type === 'error');
  };

  const hasRowWarning = (type: DataType, rowIndex: number) => {
    return errors[type].some(err => err.row === rowIndex && err.type === 'warning');
  };

  const isRowHighlighted = (type: DataType, rowIndex: number) => {
    return searchResults[type].includes(rowIndex);
  };

  const getRowClassName = (type: DataType, rowIndex: number) => {
    const classes = ['transition-all duration-200'];
    if (hasRowError(type, rowIndex)) classes.push('bg-red-50 hover:bg-red-100');
    else if (hasRowWarning(type, rowIndex)) classes.push('bg-amber-50 hover:bg-amber-100');
    else classes.push('hover:bg-gray-50');
    
    if (isRowHighlighted(type, rowIndex)) classes.push('ring-2 ring-blue-500 bg-blue-50');
    
    return classes.join(' ');
  };

  const tabIcons = {
    clients: <Users className="w-4 h-4" />,
    workers: <Briefcase className="w-4 h-4" />,
    tasks: <ClipboardList className="w-4 h-4" />
  };

  const tabLabels = {
    clients: 'Clients',
    workers: 'Workers',
    tasks: 'Tasks'
  };

  const columns: Record<DataType, string[]> = {
    clients: ['ClientID', 'ClientName', 'PriorityLevel', 'RequestedTaskIDs', 'GroupTag', 'AttributesJSON'],
    workers: ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase', 'WorkerGroup', 'QualificationLevel'],
    tasks: ['TaskID', 'TaskName', 'Category', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent']
  };

  // Get validation summary
  const getValidationSummary = (type: DataType) => {
    const typeErrors = errors[type];
    const errorCount = typeErrors.filter(e => e.type === 'error').length;
    const warningCount = typeErrors.filter(e => e.type === 'warning').length;
    
    return {
      totalErrors: errorCount,
      totalWarnings: warningCount,
      hasIssues: errorCount > 0 || warningCount > 0
    };
  };

  const getTotalValidationSummary = () => {
    const allErrors = Object.values(errors).flat().filter(e => e.type === 'error').length;
    const allWarnings = Object.values(errors).flat().filter(e => e.type === 'warning').length;
    const ruleErrorCount = ruleErrors.filter(e => e.type === 'error').length;
    
    return {
      totalErrors: allErrors + ruleErrorCount,
      totalWarnings: allWarnings,
      hasIssues: allErrors > 0 || allWarnings > 0 || ruleErrorCount > 0
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Data Alchemist
              </h1>
              <p className="text-gray-600 mt-1">AI-Powered Resource Allocation Configurator</p>
            </div>
          </div>
        </motion.div>

        {/* Section Navigation */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6 flex gap-2 p-1.5 bg-gray-100/50 rounded-xl"
        >
          <button
            onClick={() => setActiveSection('data')}
            className={`
              relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200
              ${activeSection === 'data'
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <FileUp className="w-4 h-4" />
            Data Management
            {Object.values(data).some(d => d.length > 0) && (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            )}
            {getTotalValidationSummary().hasIssues && (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </button>
          
          <button
            onClick={() => setActiveSection('rules')}
            className={`
              relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200
              ${activeSection === 'rules'
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <Settings className="w-4 h-4" />
            Rules Builder
            {rules.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {rules.filter(r => r.enabled).length}
              </span>
            )}
            {ruleErrors.length > 0 && (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </button>
          
          <button
            onClick={() => setActiveSection('weights')}
            className={`
              relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200
              ${activeSection === 'weights'
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <Sliders className="w-4 h-4" />
            Prioritization
          </button>
        </motion.div>

        {/* Content based on active section */}
        <AnimatePresence mode="wait">
          {activeSection === 'data' && (
            <motion.div
              key="data"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* AI Rule Recommendations */}
              {ruleRecommendations.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200/30 p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    
                    <h3 className="font-semibold text-gray-800">AI Rule Recommendations</h3>
                    {isGeneratingRecommendations && (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    {ruleRecommendations.slice(0, 3).map((rec, index) => (
                      <motion.div 
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="p-4 bg-white/70 rounded-xl border border-purple-200/30 flex items-start justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Lightbulb className="w-4 h-4 text-yellow-500" />
                            <h4 className="font-medium text-gray-800">{rec.title}</h4>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              {Math.round(rec.confidence * 100)}% confidence
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{rec.description}</p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => applyRuleRecommendation(rec)}
                            className="px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-200 text-xs font-medium"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => dismissRecommendation(index)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* File Upload Section */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {(['clients', 'workers', 'tasks'] as DataType[]).map((type, index) => (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    className="group relative overflow-hidden rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <div className="relative p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl">
                          {tabIcons[type]}
                        </div>
                        <h3 className="font-semibold text-gray-800">Upload {tabLabels[type]} CSV</h3>
                      </div>
                      
                      <label className="relative block">
                        <input 
                          type="file" 
                          accept=".csv,.xlsx"
                          onChange={(e) => handleFileUpload(e, type)}
                          className="sr-only"
                          disabled={uploadingType !== null}
                        />
                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl cursor-pointer hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-sm hover:shadow-md">
                          {uploadingType === type ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileUp className="w-4 h-4" />
                          )}
                          <span className="text-sm font-medium">
                            {uploadingType === type ? 'Processing...' : 'Choose File'}
                          </span>
                        </div>
                      </label>
                      
                      {data[type].length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 flex items-center gap-2 text-sm"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-green-700 font-medium">{data[type].length} records loaded</span>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Natural Language Search */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl">
                    <Search className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Natural Language Search</h3>
                </div>
                
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder='Try: "tasks longer than 2 phases" or "workers available in phase 3"'
                      className="w-full px-4 py-3 pr-10 border border-gray-200/50 rounded-xl bg-white/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={clearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm font-medium">Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span className="text-sm font-medium">Search</span>
                      </>
                    )}
                  </button>
                </div>
                
                <AnimatePresence>
                  {searchResults[activeTab].length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-3 flex items-center gap-2 text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      <span className="text-blue-700 font-medium">
                        Found {searchResults[activeTab].length} matching records
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Tabs */}
              <div className="mb-6">
                <div className="flex gap-2 p-1.5 bg-gray-100/50 rounded-xl">
                  {(['clients', 'workers', 'tasks'] as DataType[]).map((type) => {
                    const summary = getValidationSummary(type);
                    return (
                      <button
                        key={type}
                        onClick={() => setActiveTab(type)}
                        className={`
                          relative flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
                          ${activeTab === type 
                            ? 'bg-white text-gray-900 shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900'
                          }
                        `}
                      >
                        {tabIcons[type]}
                        {tabLabels[type]}
                        {data[type].length > 0 && (
                          <span className={`
                            px-2 py-0.5 text-xs rounded-full
                            ${activeTab === type 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-gray-200 text-gray-600'
                            }
                          `}>
                            {data[type].length}
                          </span>
                        )}
                        {summary.hasIssues && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Validation Summary */}
              <AnimatePresence mode="wait">
                {data[activeTab].length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mb-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-gray-800 mb-2">Validation Summary - {tabLabels[activeTab]}</h3>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5 text-sm">
                            <div className="w-2 h-2 bg-red-500 rounded-full" />
                            <span className="text-red-700 font-medium">
                              {getValidationSummary(activeTab).totalErrors} Errors
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 text-sm">
                            <div className="w-2 h-2 bg-amber-500 rounded-full" />
                            <span className="text-amber-700 font-medium">
                              {getValidationSummary(activeTab).totalWarnings} Warnings
                            </span>
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => runValidation(activeTab, data[activeTab])}
                        disabled={isValidating}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 text-sm font-medium"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Re-validate
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Errors and Fix Suggestions */}
              <AnimatePresence>
                {errors[activeTab].length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4"
                  >
                    {/* Validation Issues */}
                    <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <h3 className="font-semibold text-gray-800">Validation Issues</h3>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {errors[activeTab].slice(0, 10).map((err, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`
                              p-3 rounded-lg text-sm flex items-start gap-2
                              ${err.type === 'error' 
                                ? 'bg-red-50 text-red-700 border border-red-200/50' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200/50'
                              }
                            `}
                          >
                            {err.type === 'error' ? (
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            )}
                            <span>
                              {err.row >= 0 && <span className="font-medium">Row {err.row + 1}: </span>}
                              {err.message}
                            </span>
                          </motion.div>
                        ))}
                        {errors[activeTab].length > 10 && (
                          <p className="text-sm text-gray-500 italic text-center py-2">
                            ...and {errors[activeTab].length - 10} more issues
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* AI Suggestions */}
                    <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-gray-800">AI-Suggested Fixes</h3>
                        {isGeneratingFixes && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600 ml-auto" />
                        )}
                      </div>
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                        {fixSuggestions[activeTab].length > 0 ? (
                          fixSuggestions[activeTab].slice(0, 5).map((suggestion, idx) => (
                            <motion.div 
                              key={idx}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200/30"
                            >
                              <p className="text-sm text-gray-700 mb-2">{suggestion.fix.description}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-600">
                                  <span className="font-medium">{suggestion.fix.field}:</span>{' '}
                                  <span className="text-red-600 line-through">{suggestion.fix.oldValue}</span>{' '}
                                  <ChevronRight className="w-3 h-3 inline" />{' '}
                                  <span className="text-green-600">{suggestion.fix.newValue}</span>
                                </p>
                                <button
                                  onClick={() => applyFix(suggestion)}
                                  className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 text-xs font-medium shadow-sm hover:shadow-md"
                                >
                                  Apply Fix
                                </button>
                              </div>
                            </motion.div>
                          ))
                        ) : isGeneratingFixes ? (
                          <div className="text-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                            <p className="text-sm text-gray-600">Analyzing errors and generating fixes...</p>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <p className="text-sm">No fix suggestions available yet.</p>
                            <p className="text-xs mt-1">Suggestions will appear after validation.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Data Grid */}
              <AnimatePresence mode="wait">
                {data[activeTab].length > 0 ? (
                  <motion.div 
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden rounded-xl border border-gray-200/50 bg-white/50 backdrop-blur-sm"
                  >
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-gray-200/50 bg-gray-50/30">
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">#</th>
                            {columns[activeTab].map(col => (
                              <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/30">
                          {data[activeTab].map((row, rowIndex) => (
                            <tr 
                              key={rowIndex}
                              className={getRowClassName(activeTab, rowIndex)}
                            >
                              <td className="px-4 py-3 text-center text-sm text-gray-500">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{rowIndex + 1}</span>
                                  {hasRowError(activeTab, rowIndex) && <AlertCircle className="w-3 h-3 text-red-500" />}
                                  {!hasRowError(activeTab, rowIndex) && hasRowWarning(activeTab, rowIndex) && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                </div>
                              </td>
                              {columns[activeTab].map(col => (
                                <td key={col} className="px-6 py-3">
                                  <input
                                    type="text"
                                    value={row[col] || ''}
                                    onChange={(e) => handleCellEdit(activeTab, rowIndex, col, e.target.value)}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-200/50 rounded-lg bg-white/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16 rounded-2xl bg-white/30 backdrop-blur-sm border border-gray-200/30"
                  >
                    <div className="p-4 bg-gray-100/50 rounded-full w-fit mx-auto mb-4">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium mb-2">No data loaded</p>
                    <p className="text-gray-500 text-sm">Upload a CSV file to get started</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          
          {activeSection === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Rule Validation Errors */}
              {ruleErrors.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded-2xl bg-red-50/70 backdrop-blur-sm border border-red-200/50 shadow-sm p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h3 className="font-semibold text-red-800">Rule Validation Issues</h3>
                  </div>
                  <div className="space-y-2">
                    {ruleErrors.map((err, idx) => (
                      <div key={idx} className="p-3 bg-red-100/50 rounded-lg text-red-700 text-sm">
                        {err.message}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              
              <RulesBuilder 
                data={data}
                rules={rules}
                onRulesChange={setRules}
              />
            </motion.div>
          )}
          
          {activeSection === 'weights' && (
            <motion.div
              key="weights"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <PrioritizationWeights
                weights={weights}
                onWeightsChange={setWeights}
                onExport={handleExport}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DataAlchemist;