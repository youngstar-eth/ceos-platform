'use client';

import { useState } from 'react';
import { Search, Lock, Unlock, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentButton } from '@/components/x402/payment-button';
import { USDCBalance } from '@/components/x402/usdc-balance';
import {
  AVAILABLE_SKILLS,
  type Skill,
} from '@/components/agent-builder/skill-picker';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'free' | 'premium';

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [purchasedSkills, setPurchasedSkills] = useState<Set<string>>(
    new Set()
  );

  const filteredSkills = AVAILABLE_SKILLS.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'free' && !skill.premium) ||
      (filter === 'premium' && skill.premium);
    return matchesSearch && matchesFilter;
  });

  const handlePurchase = (skillId: string) => {
    // Simulated purchase - in production this triggers x402 flow
    setPurchasedSkills((prev) => new Set([...prev, skillId]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground mt-1">
            Browse and unlock agent capabilities
          </p>
        </div>
        <USDCBalance />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as FilterMode)}
        >
          <TabsList>
            <TabsTrigger value="all">
              All ({AVAILABLE_SKILLS.length})
            </TabsTrigger>
            <TabsTrigger value="free">
              Free ({AVAILABLE_SKILLS.filter((s) => !s.premium).length})
            </TabsTrigger>
            <TabsTrigger value="premium">
              Premium ({AVAILABLE_SKILLS.filter((s) => s.premium).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            isPurchased={purchasedSkills.has(skill.id)}
            onPurchase={() => handlePurchase(skill.id)}
          />
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Skills Found</h3>
          <p className="text-sm text-muted-foreground">
            No skills match your search. Try different keywords.
          </p>
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  isPurchased,
  onPurchase,
}: {
  skill: Skill;
  isPurchased: boolean;
  onPurchase: () => void;
}) {
  const isLocked = skill.premium && !isPurchased;

  return (
    <Card
      className={cn(
        'transition-all',
        isLocked ? 'opacity-90' : '',
        isPurchased && skill.premium ? 'border-green-500/30' : ''
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center',
                skill.premium ? 'bg-yellow-500/10' : 'bg-primary/10'
              )}
            >
              <skill.icon
                className={cn(
                  'h-5 w-5',
                  skill.premium ? 'text-yellow-500' : 'text-primary'
                )}
              />
            </div>
            <div>
              <CardTitle className="text-sm">{skill.name}</CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {skill.premium ? (
              isPurchased ? (
                <Badge className="bg-green-600 text-white text-[10px]">
                  <Unlock className="h-3 w-3 mr-1" />
                  Unlocked
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  <Lock className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              )
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] text-green-500 border-green-500/30"
              >
                Free
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{skill.description}</p>

        {isLocked ? (
          <PaymentButton
            endpoint={`/api/skills/premium/${skill.id}`}
            onSuccess={() => onPurchase()}
          >
            Unlock — $0.99
          </PaymentButton>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            {skill.premium ? 'Unlocked' : 'Available'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
