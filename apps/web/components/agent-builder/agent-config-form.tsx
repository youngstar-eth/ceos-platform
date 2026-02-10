'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PersonaSelector, type PersonaData } from './persona-selector';
import { SkillPicker } from './skill-picker';
import { StrategyConfig, type Strategy } from './strategy-config';

export interface AgentConfig {
  persona: PersonaData;
  skills: string[];
  strategy: Strategy;
}

interface AgentConfigFormProps {
  config: AgentConfig;
  onChange: (config: AgentConfig) => void;
  step: number;
}

export function AgentConfigForm({
  config,
  onChange,
  step,
}: AgentConfigFormProps) {
  return (
    <div className="space-y-6">
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Persona</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonaSelector
              value={config.persona}
              onChange={(persona) => onChange({ ...config, persona })}
            />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillPicker
              selected={config.skills}
              onChange={(skills) => onChange({ ...config, skills })}
            />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Posting Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <StrategyConfig
              value={config.strategy}
              onChange={(strategy) => onChange({ ...config, strategy })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
