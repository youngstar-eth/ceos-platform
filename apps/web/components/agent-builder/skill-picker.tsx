'use client';

import {
  MessageSquare,
  Image,
  TrendingUp,
  Newspaper,
  Palette,
  Code,
  Music,
  Gamepad2,
  Heart,
  Globe,
  Zap,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  premium: boolean;
}

const AVAILABLE_SKILLS: Skill[] = [
  {
    id: 'text-generation',
    name: 'Text Generation',
    description: 'Generate engaging text content with 300+ LLM models',
    icon: MessageSquare,
    premium: false,
  },
  {
    id: 'image-generation',
    name: 'Image Generation',
    description: 'Create stunning images using Fal.ai models',
    icon: Image,
    premium: false,
  },
  {
    id: 'trend-analysis',
    name: 'Trend Analysis',
    description: 'Identify and ride trending topics on Farcaster',
    icon: TrendingUp,
    premium: false,
  },
  {
    id: 'news-curation',
    name: 'News Curation',
    description: 'Curate and share relevant news articles',
    icon: Newspaper,
    premium: false,
  },
  {
    id: 'art-creation',
    name: 'Art Creation',
    description: 'Generate and share digital artwork',
    icon: Palette,
    premium: false,
  },
  {
    id: 'code-sharing',
    name: 'Code Sharing',
    description: 'Share code snippets and tech insights',
    icon: Code,
    premium: false,
  },
  {
    id: 'music-discovery',
    name: 'Music Discovery',
    description: 'Discover and share music recommendations',
    icon: Music,
    premium: true,
  },
  {
    id: 'gaming-content',
    name: 'Gaming Content',
    description: 'Generate gaming-related content and reviews',
    icon: Gamepad2,
    premium: true,
  },
  {
    id: 'engagement-optimizer',
    name: 'Engagement Optimizer',
    description: 'AI-powered engagement timing and optimization',
    icon: Heart,
    premium: true,
  },
  {
    id: 'multi-language',
    name: 'Multi-Language',
    description: 'Post in multiple languages automatically',
    icon: Globe,
    premium: true,
  },
  {
    id: 'auto-reply',
    name: 'Auto Reply',
    description: 'Intelligent reply to mentions and comments',
    icon: Zap,
    premium: false,
  },
  {
    id: 'thread-creator',
    name: 'Thread Creator',
    description: 'Create engaging long-form threads',
    icon: BookOpen,
    premium: false,
  },
];

interface SkillPickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function SkillPicker({ selected, onChange }: SkillPickerProps) {
  const toggleSkill = (skillId: string) => {
    if (selected.includes(skillId)) {
      onChange(selected.filter((id) => id !== skillId));
    } else {
      onChange([...selected, skillId]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select the skills your agent should have. Premium skills require x402
        payment.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {AVAILABLE_SKILLS.map((skill) => {
          const isSelected = selected.includes(skill.id);

          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => toggleSkill(skill.id)}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all hover:shadow-md',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <skill.icon
                    className={cn(
                      'h-4 w-4',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <span className="text-sm font-medium">{skill.name}</span>
                </div>
                {skill.premium && (
                  <Badge variant="secondary" className="text-[10px]">
                    Premium
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {skill.description}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} skill{selected.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  );
}

export { AVAILABLE_SKILLS, type Skill };
