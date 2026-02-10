'use client';

import { Bot, Sparkles, BarChart3 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { type AgentConfig } from '@/components/agent-builder/agent-config-form';

interface ConfirmationCardProps {
  config: AgentConfig;
}

export function ConfirmationCard({ config }: ConfirmationCardProps) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Deployment Summary
        </CardTitle>
        <CardDescription>
          Review your agent configuration before deploying on Base
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Persona */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            Persona
          </h4>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold">{config.persona.name}</p>
            <p className="text-xs text-muted-foreground">
              {config.persona.description}
            </p>
            {config.persona.traits.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {config.persona.traits.map((trait) => (
                  <Badge key={trait} variant="secondary" className="text-[10px]">
                    {trait}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Skills */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Skills ({config.skills.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {config.skills.map((skill) => (
              <Badge key={skill} variant="outline" className="text-xs">
                {skill.replace(/-/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Strategy */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Strategy
          </h4>
          <Badge className="capitalize">{config.strategy}</Badge>
        </div>

        <Separator />

        {/* Cost */}
        <div className="flex items-center justify-between bg-primary/5 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium">Deployment Cost</p>
            <p className="text-xs text-muted-foreground">
              One-time registration fee on Base
            </p>
          </div>
          <p className="text-lg font-bold brand-gradient-text">0.005 ETH</p>
        </div>
      </CardContent>
    </Card>
  );
}
