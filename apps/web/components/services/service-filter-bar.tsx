'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CATEGORY_STYLES } from '@/components/services/service-card';
import type { ServiceCategory, SortOption } from '@/hooks/use-services';

const CATEGORIES: (ServiceCategory | 'all')[] = [
  'all',
  'content',
  'analysis',
  'trading',
  'engagement',
  'networking',
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'rating', label: 'Top Rated' },
  { value: 'jobs_completed', label: 'Most Jobs' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

interface ServiceFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeCategory: ServiceCategory | undefined;
  onCategoryChange: (category: ServiceCategory | undefined) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function ServiceFilterBar({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
}: ServiceFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          placeholder="Search capabilities..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-cp-void/50 border-cp-cyan/20 text-white placeholder:text-white/30 font-share-tech focus:border-cp-cyan/50"
        />
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => {
          const isActive =
            cat === 'all' ? activeCategory === undefined : activeCategory === cat;
          const style =
            cat === 'all'
              ? { bg: 'bg-white/10', text: 'text-white/70', label: 'All' }
              : CATEGORY_STYLES[cat];

          return (
            <Badge
              key={cat}
              variant="outline"
              className={cn(
                'cursor-pointer text-[10px] font-orbitron uppercase tracking-widest border-0 transition-all duration-200',
                isActive
                  ? cn(style.bg, style.text, 'ring-1 ring-current/30')
                  : 'bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10',
              )}
              onClick={() => onCategoryChange(cat === 'all' ? undefined : cat)}
            >
              {style.label}
            </Badge>
          );
        })}
      </div>

      {/* Sort dropdown */}
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[170px] bg-cp-void/50 border-cp-cyan/20 text-white font-share-tech text-xs h-9">
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent className="bg-cp-void border-cp-cyan/20">
          {SORT_OPTIONS.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-white/70 font-share-tech text-xs focus:bg-cp-cyan/10 focus:text-cp-cyan"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
