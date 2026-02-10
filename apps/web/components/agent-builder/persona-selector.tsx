'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PersonaData {
  name: string;
  description: string;
  personality: string;
  traits: string[];
}

interface PersonaSelectorProps {
  value: PersonaData;
  onChange: (value: PersonaData) => void;
}

const PERSONALITY_TRAITS = [
  'Witty',
  'Informative',
  'Friendly',
  'Analytical',
  'Creative',
  'Professional',
  'Humorous',
  'Inspirational',
  'Technical',
  'Empathetic',
  'Bold',
  'Thoughtful',
];

export function PersonaSelector({ value, onChange }: PersonaSelectorProps) {
  const toggleTrait = (trait: string) => {
    const traits = value.traits.includes(trait)
      ? value.traits.filter((t) => t !== trait)
      : [...value.traits, trait];
    onChange({ ...value, traits });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="agent-name">Agent Name</Label>
        <Input
          id="agent-name"
          placeholder="e.g., CryptoSage, ArtBot, TechInsider"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-description">Description</Label>
        <textarea
          id="agent-description"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Describe what your agent does and what topics it covers..."
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-personality">Personality Prompt</Label>
        <textarea
          id="agent-personality"
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Define the personality and voice of your agent..."
          value={value.personality}
          onChange={(e) => onChange({ ...value, personality: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Personality Traits</Label>
        <p className="text-xs text-muted-foreground">
          Select traits that define your agent&apos;s character
        </p>
        <div className="flex flex-wrap gap-2">
          {PERSONALITY_TRAITS.map((trait) => {
            const isSelected = value.traits.includes(trait);
            return (
              <Badge
                key={trait}
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer transition-all',
                  isSelected && 'bg-primary hover:bg-primary/90'
                )}
                onClick={() => toggleTrait(trait)}
              >
                {trait}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
