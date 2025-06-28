'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sliders, 
  BarChart3, 
  Grid3x3, 
  Zap,
  Download,
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  PrioritizationWeights, 
  WeightProfile, 
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
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Compare criteria pairwise. Coming soon...
            </p>
            <div className="text-center py-8 text-gray-400">
              <Grid3x3 className="w-12 h-12 mx-auto mb-2" />
              <p>Pairwise comparison matrix functionality will be available soon</p>
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
                <motion.div
                  key={criterion}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', index.toString())}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    handleRankingChange(dragIndex, index);
                  }}
                  className="p-4 bg-white border border-gray-200 rounded-lg cursor-move hover:shadow-sm transition-shadow flex items-center justify-between group"
                  whileHover={{ scale: 1.02 }}
                  whileDrag={{ scale: 1.05, opacity: 0.8 }}
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
                </motion.div>
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