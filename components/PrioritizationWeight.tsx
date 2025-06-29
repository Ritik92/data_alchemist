'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Sliders, 
  BarChart3, 
  Grid3x3, 
  Zap,
  Download,
  RefreshCw,
  Info,
  AlertCircle,
  Check
} from 'lucide-react';
import type { 
  PrioritizationWeights, 
  WeightProfile
} from '@/app/utils/rules';
import { 
  PRESET_PROFILES, 
  DEFAULT_WEIGHTS 
} from '@/app/utils/rules';

interface PrioritizationWeightsProps {
  weights: PrioritizationWeights;
  onWeightsChange: (weights: PrioritizationWeights) => void;
  onExport: () => void;
}

interface WeightSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  description?: string;
  color: string;
}

interface ComparisonValue {
  value: number;
  description: string;
}

const COMPARISON_SCALE: ComparisonValue[] = [
  { value: 1/9, description: 'Extremely less important' },
  { value: 1/7, description: 'Much less important' },
  { value: 1/5, description: 'Moderately less important' },
  { value: 1/3, description: 'Slightly less important' },
  { value: 1, description: 'Equal importance' },
  { value: 3, description: 'Slightly more important' },
  { value: 5, description: 'Moderately more important' },
  { value: 7, description: 'Much more important' },
  { value: 9, description: 'Extremely more important' }
];

const WeightSlider: React.FC<WeightSliderProps> = ({ label, value, onChange, description, color }) => {
  const percentage = Math.round(value * 100);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-sm font-semibold text-gray-900">{percentage}%</span>
      </div>
      <div className="relative">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${color}`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={percentage}
          onChange={(e) => onChange(parseInt(e.target.value) / 100)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
};

const PrioritizationWeights: React.FC<PrioritizationWeightsProps> = ({
  weights,
  onWeightsChange,
  onExport
}) => {
  const [activeTab, setActiveTab] = useState<'sliders' | 'matrix' | 'ranking'>('sliders');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [criteriaRanking, setCriteriaRanking] = useState<string[]>([
    'priorityLevel',
    'requestedTasksFulfillment',
    'fairnessConstraints',
    'workerUtilization',
    'skillMatching',
    'phaseBalance'
  ]);

  // AHP Comparison Matrix state
  const [comparisonMatrix, setComparisonMatrix] = useState<number[][]>([]);
  const [consistencyRatio, setConsistencyRatio] = useState<number>(0);
  const [isConsistent, setIsConsistent] = useState<boolean>(true);

  const criteriaLabels: Record<string, string> = {
    priorityLevel: 'Priority Level',
    requestedTasksFulfillment: 'Task Fulfillment',
    fairnessConstraints: 'Fairness',
    workerUtilization: 'Worker Utilization',
    skillMatching: 'Skill Matching',
    phaseBalance: 'Phase Balance'
  };

  const criteriaDescriptions: Record<string, string> = {
    priorityLevel: 'Importance of client priority levels',
    requestedTasksFulfillment: 'Completing requested tasks',
    fairnessConstraints: 'Equal distribution of work',
    workerUtilization: 'Efficient use of worker capacity',
    skillMatching: 'Matching skills to requirements',
    phaseBalance: 'Even distribution across phases'
  };

  const criteriaColors: Record<string, string> = {
    priorityLevel: 'bg-gradient-to-r from-red-500 to-red-600',
    requestedTasksFulfillment: 'bg-gradient-to-r from-blue-500 to-blue-600',
    fairnessConstraints: 'bg-gradient-to-r from-green-500 to-green-600',
    workerUtilization: 'bg-gradient-to-r from-purple-500 to-purple-600',
    skillMatching: 'bg-gradient-to-r from-orange-500 to-orange-600',
    phaseBalance: 'bg-gradient-to-r from-pink-500 to-pink-600'
  };

  const criteriaKeys = Object.keys(criteriaLabels) as (keyof PrioritizationWeights)[];

  // Initialize comparison matrix
  useEffect(() => {
    const n = criteriaKeys.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(1));
    
    // Try to derive initial matrix from current weights
    const weightArray = criteriaKeys.map(k => weights[k] as number);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && weightArray[i] > 0 && weightArray[j] > 0) {
          matrix[i][j] = Math.min(9, Math.max(1/9, weightArray[i] / weightArray[j]));
        }
      }
    }
    
    setComparisonMatrix(matrix);
  }, []);

  // Calculate weights from comparison matrix using AHP
  const calculateAHPWeights = (matrix: number[][]) => {
    const n = matrix.length;
    if (n === 0) return;

    // Normalize the matrix columns
    const columnSums = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        columnSums[j] += matrix[i][j];
      }
    }

    const normalizedMatrix = matrix.map((row, i) => 
      row.map((value, j) => value / columnSums[j])
    );

    // Calculate priority vector (average of normalized rows)
    const priorityVector = normalizedMatrix.map(row => 
      row.reduce((sum, val) => sum + val, 0) / n
    );

    // Calculate consistency
    const weightedSum = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        weightedSum[i] += matrix[i][j] * priorityVector[j];
      }
    }

    const lambda = weightedSum.map((ws, i) => 
      priorityVector[i] > 0 ? ws / priorityVector[i] : 0
    );
    const lambdaMax = lambda.reduce((sum, val) => sum + val, 0) / n;
    
    // Consistency Index (CI) and Consistency Ratio (CR)
    const CI = (lambdaMax - n) / (n - 1);
    const RI = [0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45][n] || 1.45; // Random Index
    const CR = CI / RI;

    setConsistencyRatio(CR);
    setIsConsistent(CR < 0.1); // Generally accepted threshold

    // Update weights
    const newWeights = { ...weights };
    criteriaKeys.forEach((key, i) => {
      (newWeights[key] as number) = priorityVector[i];
    });
    
    onWeightsChange(newWeights);
    setSelectedProfile(null);
  };

  const handleComparisonChange = (i: number, j: number, value: number) => {
    const newMatrix = comparisonMatrix.map(row => [...row]);
    newMatrix[i][j] = value;
    newMatrix[j][i] = 1 / value; // Reciprocal for consistency
    setComparisonMatrix(newMatrix);
    calculateAHPWeights(newMatrix);
  };

  const getComparisonValue = (i: number, j: number): number => {
    if (comparisonMatrix.length > i && comparisonMatrix[i].length > j) {
      return comparisonMatrix[i][j];
    }
    return 1;
  };

  const getComparisonDescription = (value: number): string => {
    const closest = COMPARISON_SCALE.reduce((prev, curr) => 
      Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev
    );
    return closest.description;
  };

  const formatComparisonValue = (value: number): string => {
    if (value < 1) {
      const reciprocal = 1 / value;
      return `1/${Math.round(reciprocal)}`;
    }
    return Math.round(value).toString();
  };

  const handleProfileSelect = (profileId: string) => {
    const profile = PRESET_PROFILES.find(p => p.id === profileId);
    if (profile) {
      onWeightsChange(profile.weights);
      setSelectedProfile(profileId);
    }
  };

  const handleSliderChange = (key: keyof PrioritizationWeights, value: number) => {
    const newWeights = { ...weights, [key]: value };
    
    // Normalize weights to sum to 1
    const keys = Object.keys(newWeights).filter(k => k !== 'customWeights') as (keyof PrioritizationWeights)[];
    const sum = keys.reduce((acc, k) => acc + (newWeights[k] as number), 0);
    
    if (sum > 0) {
      keys.forEach(k => {
        if (k !== 'customWeights') {
          (newWeights[k] as number) = (newWeights[k] as number) / sum;
        }
      });
    }
    
    onWeightsChange(newWeights);
    setSelectedProfile(null);
  };

  const handleRankingChange = (dragIndex: number, dropIndex: number) => {
    const newRanking = [...criteriaRanking];
    const [removed] = newRanking.splice(dragIndex, 1);
    newRanking.splice(dropIndex, 0, removed);
    setCriteriaRanking(newRanking);
    
    // Update weights based on ranking
    const newWeights = { ...weights };
    const totalCriteria = newRanking.length;
    newRanking.forEach((criterion, index) => {
      const weight = (totalCriteria - index) / ((totalCriteria * (totalCriteria + 1)) / 2);
      (newWeights as any)[criterion] = weight;
    });
    
    onWeightsChange(newWeights);
    setSelectedProfile(null);
  };

  const resetWeights = () => {
    onWeightsChange(DEFAULT_WEIGHTS);
    setSelectedProfile(null);
  };

  const resetComparisonMatrix = () => {
    const n = criteriaKeys.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(1));
    setComparisonMatrix(matrix);
    setConsistencyRatio(0);
    setIsConsistent(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with Profile Selection */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl">
            <Sliders className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-800">Prioritization Weights</h3>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={selectedProfile || ''}
            onChange={(e) => e.target.value && handleProfileSelect(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Select Profile...</option>
            {PRESET_PROFILES.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          
          <button
            onClick={resetWeights}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Reset to defaults"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-gray-100/50 rounded-xl">
        {[
          { id: 'sliders', label: 'Weight Sliders', icon: Sliders },
          { id: 'matrix', label: 'Comparison Matrix', icon: Grid3x3 },
          { id: 'ranking', label: 'Drag & Drop', icon: BarChart3 }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              relative flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200
              ${activeTab === tab.id 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/50 shadow-sm p-6"
      >
        {activeTab === 'sliders' && (
          <div className="space-y-6">
            {Object.entries(weights).map(([key, value]) => {
              if (key === 'customWeights') return null;
              return (
                <WeightSlider
                  key={key}
                  label={criteriaLabels[key]}
                  value={value as number}
                  onChange={(val) => handleSliderChange(key as keyof PrioritizationWeights, val)}
                  description={criteriaDescriptions[key]}
                  color={criteriaColors[key]}
                />
              );
            })}
            
            <div className="pt-4 border-t border-gray-200/50">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Info className="w-4 h-4" />
                <p>Weights are automatically normalized to sum to 100%</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Compare each criterion with every other criterion. Use the scale to indicate how much more important one is compared to the other.
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                    <span>1 = Equal</span>
                    <span>3 = Slightly more</span>
                    <span>5 = Moderately more</span>
                    <span>7 = Much more</span>
                    <span>9 = Extremely more</span>
                  </div>
                </div>
                <button
                  onClick={resetComparisonMatrix}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Reset Matrix
                </button>
              </div>

              {/* Consistency Indicator */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-4 rounded-xl border ${
                  isConsistent 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isConsistent ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      Consistency Ratio: {(consistencyRatio * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {isConsistent 
                        ? 'Your comparisons are consistent' 
                        : 'Consider reviewing your comparisons for better consistency (CR should be < 10%)'
                      }
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Comparison Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="p-2 text-xs font-medium text-gray-600"></th>
                      {criteriaKeys.map(key => (
                        <th key={key} className="p-2 text-xs font-medium text-gray-700 text-center">
                          <div className="writing-mode-vertical-lr transform rotate-180">
                            {criteriaLabels[key]}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaKeys.map((rowKey, i) => (
                      <tr key={rowKey}>
                        <td className="p-2 text-sm font-medium text-gray-700 whitespace-nowrap">
                          {criteriaLabels[rowKey]}
                        </td>
                        {criteriaKeys.map((colKey, j) => (
                          <td key={colKey} className="p-1">
                            {i === j ? (
                              <div className="w-20 h-10 bg-gray-100 rounded flex items-center justify-center">
                                <span className="text-sm text-gray-500">1</span>
                              </div>
                            ) : i < j ? (
                              <div className="relative group">
                                <select
                                  value={getComparisonValue(i, j)}
                                  onChange={(e) => handleComparisonChange(i, j, parseFloat(e.target.value))}
                                  className="w-20 h-10 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none text-center cursor-pointer"
                                >
                                  {COMPARISON_SCALE.map(comp => (
                                    <option key={comp.value} value={comp.value}>
                                      {formatComparisonValue(comp.value)}
                                    </option>
                                  ))}
                                </select>
                                <div className="absolute invisible group-hover:visible z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
                                  {getComparisonDescription(getComparisonValue(i, j))}
                                </div>
                              </div>
                            ) : (
                              <div className="w-20 h-10 bg-gray-50 rounded flex items-center justify-center">
                                <span className="text-sm text-gray-400">
                                  {formatComparisonValue(getComparisonValue(i, j))}
                                </span>
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <style jsx>{`
                .writing-mode-vertical-lr {
                  writing-mode: vertical-lr;
                  text-orientation: mixed;
                }
              `}</style>
            </div>
          </div>
        )}

{activeTab === 'ranking' && (
  <div className="space-y-4">
    <p className="text-sm text-gray-600 mb-4">
      Drag and drop criteria to rank them by importance (most important at top)
    </p>
    <div className="space-y-2">
      {criteriaRanking.map((criterion, index) => (
        <div
          key={criterion}
          draggable
          onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
            e.dataTransfer.setData('text/plain', index.toString());
          }}
          onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
          }}
          onDrop={(e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
            handleRankingChange(dragIndex, index);
          }}
          className="p-4 bg-white border border-gray-200 rounded-lg cursor-move hover:shadow-md hover:border-gray-300 transition-all duration-200 flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-gray-300">#{index + 1}</span>
            <div>
              <p className="font-medium text-gray-800">{criteriaLabels[criterion]}</p>
              <p className="text-xs text-gray-500">{criteriaDescriptions[criterion]}</p>
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
      </motion.div>

      {/* Weight Visualization */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200/30 p-6"
      >
        <h4 className="font-medium text-gray-800 mb-4">Current Weight Distribution</h4>
        <div className="flex gap-2 h-32">
          {Object.entries(weights).map(([key, value]) => {
            if (key === 'customWeights') return null;
            const percentage = Math.round((value as number) * 100);
            return (
              <div key={key} className="flex-1 flex flex-col items-center justify-end gap-2">
                <motion.div
                  className={`w-full ${criteriaColors[key]} rounded-t-lg`}
                  initial={{ height: 0 }}
                  animate={{ height: `${percentage}%` }}
                  transition={{ duration: 0.3 }}
                />
                <div className="text-center">
                  <p className="text-xs text-gray-600">{criteriaLabels[key].split(' ')[0]}</p>
                  <p className="text-sm font-semibold text-gray-800">{percentage}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          onClick={onExport}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span className="font-medium">Export Configuration</span>
        </button>
      </div>
    </div>
  );
};

export default PrioritizationWeights;